"""Backlot Studio — interactive generation backend.

This turns the read-only board into a self-serve studio: discover every
capability the machine has, accept uploaded media, and run a real generation
job (AI voice / image / video / avatar-UGC + motion composition) that lands a
finished video in ``projects/`` where the Library picks it up automatically.

Design notes
------------
* No new pip deps: uploads arrive as raw request bodies (``python-multipart``
  is not installed), one file per POST.
* Jobs run on a background thread and report progress into an in-memory
  registry the UI polls. Each job also writes checkpoints/artifacts into the
  project workspace so the live board reflects it.
* Every generator is resolved from the tool registry at runtime — adding a
  provider key (ElevenLabs, HeyGen, …) makes it selectable with no code change.
"""
from __future__ import annotations

import json
import re
import threading
import time
import traceback
import uuid
from pathlib import Path
from typing import Any, Optional

from lib.paths import REPO_ROOT

UPLOADS_DIR = REPO_ROOT / ".backlot" / "studio_uploads"
PUBLIC_DIR = REPO_ROOT / "remotion-composer" / "public" / "studio"
MUSIC_LIBRARY_DIR = REPO_ROOT / "music_library"

IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tiff"}
VIDEO_EXT = {".mp4", ".mov", ".webm", ".avi", ".mkv", ".m4v"}
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac"}

FORMATS = {
    "9:16": (1080, 1920),
    "1:1": (1080, 1080),
    "16:9": (1920, 1080),
    "4:5": (1080, 1350),
}

# --------------------------------------------------------------------------
# Capability discovery (cached)
# --------------------------------------------------------------------------

_caps_cache: dict[str, Any] = {"ts": 0.0, "data": None}
_CAPS_TTL = 30.0


def kind_of(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext in IMAGE_EXT:
        return "image"
    if ext in VIDEO_EXT:
        return "video"
    if ext in AUDIO_EXT:
        return "audio"
    return "other"


def discover_capabilities(force: bool = False) -> dict:
    """Full capability envelope for the Studio UI (cached ~30s)."""
    now = time.time()
    if not force and _caps_cache["data"] is not None and now - _caps_cache["ts"] < _CAPS_TTL:
        return _caps_cache["data"]

    from tools.tool_registry import registry

    registry.discover()
    summary = registry.provider_menu_summary()

    # Per-tool availability so the UI can enable/disable specific actions.
    def cap_tools(cap: str) -> list[dict]:
        out = []
        for t in registry.get_by_capability(cap):
            try:
                info = t.get_info()
            except Exception:
                continue
            out.append({
                "name": info.get("name"),
                "provider": info.get("provider"),
                "available": _tool_available(t, info),
                "runtime": info.get("runtime"),
                "best_for": (info.get("best_for") or [])[:3],
            })
        return out

    caps = {
        "runtimes": summary.get("composition_runtimes", {}),
        "capabilities": summary.get("capabilities", []),
        "setup_offers": summary.get("setup_offers", []),
        "warnings": summary.get("runtime_warnings", []),
        "tools": {
            "tts": cap_tools("tts"),
            "image_generation": cap_tools("image_generation"),
            "video_generation": cap_tools("video_generation"),
            "music_generation": cap_tools("music_generation"),
            "avatar": cap_tools("avatar"),
        },
        "music_library": _list_music_library(),
        "formats": list(FORMATS.keys()),
    }
    _caps_cache.update(ts=now, data=caps)
    return caps


def _tool_available(tool, info: dict) -> bool:
    for attr in ("is_available", "available"):
        v = getattr(tool, attr, None)
        if callable(v):
            try:
                return bool(v())
            except Exception:
                pass
        elif isinstance(v, bool):
            return v
    return str(info.get("status", "")).lower() == "available"


def _list_music_library() -> list[str]:
    if not MUSIC_LIBRARY_DIR.is_dir():
        return []
    return sorted(
        p.name for p in MUSIC_LIBRARY_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in AUDIO_EXT
    )


# --------------------------------------------------------------------------
# Sessions & uploads
# --------------------------------------------------------------------------

def new_session() -> str:
    sid = uuid.uuid4().hex[:12]
    (UPLOADS_DIR / sid).mkdir(parents=True, exist_ok=True)
    return sid


def _safe_name(name: str) -> str:
    name = Path(name).name
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    return name or f"file_{uuid.uuid4().hex[:6]}"


def save_upload(session: str, filename: str, data: bytes) -> dict:
    session = _safe_name(session)
    sess_dir = UPLOADS_DIR / session
    sess_dir.mkdir(parents=True, exist_ok=True)
    fname = _safe_name(filename)
    # De-dupe collisions
    dest = sess_dir / fname
    i = 1
    while dest.exists():
        dest = sess_dir / f"{dest.stem}_{i}{dest.suffix}"
        i += 1
    dest.write_bytes(data)
    return {"ok": True, "name": dest.name, "kind": kind_of(dest.name), "size": len(data)}


def upload_path(session: str, name: str) -> Optional[Path]:
    p = UPLOADS_DIR / _safe_name(session) / _safe_name(name)
    return p if p.is_file() else None


# --------------------------------------------------------------------------
# Jobs
# --------------------------------------------------------------------------

JOBS: dict[str, dict] = {}
_JOBS_LOCK = threading.Lock()


def _slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")
    return slug or f"studio-{uuid.uuid4().hex[:6]}"


def start_job(spec: dict) -> dict:
    """Validate + kick off a generation job. Returns {job_id, project_id}."""
    title = spec.get("title") or "Untitled Studio Video"
    base = _slugify(title)
    from lib.paths import PROJECTS_DIR
    project_id = base
    n = 1
    while (PROJECTS_DIR / project_id).exists():
        n += 1
        project_id = f"{base}-{n}"

    job_id = uuid.uuid4().hex[:12]
    job = {
        "job_id": job_id,
        "project_id": project_id,
        "status": "queued",
        "progress": 0,
        "message": "Queued",
        "log": [],
        "output_url": None,
        "error": None,
        "created_at": time.time(),
    }
    with _JOBS_LOCK:
        JOBS[job_id] = job

    t = threading.Thread(target=_run_job, args=(job_id, spec), daemon=True)
    t.start()
    return {"job_id": job_id, "project_id": project_id}


def get_job(job_id: str) -> Optional[dict]:
    with _JOBS_LOCK:
        j = JOBS.get(job_id)
        return dict(j) if j else None


def _update(job_id: str, **kw) -> None:
    with _JOBS_LOCK:
        j = JOBS.get(job_id)
        if not j:
            return
        if "log_line" in kw:
            j["log"].append(kw.pop("log_line"))
        j.update(kw)


def _extract_path(data: Any, exts: set[str]) -> Optional[str]:
    """Best-effort: pull a produced media file path out of a ToolResult.data."""
    if not isinstance(data, dict):
        return None
    for key in ("output_path", "path", "video_path", "image_path", "audio_path", "file", "filepath"):
        v = data.get(key)
        if isinstance(v, str) and Path(v).suffix.lower() in exts and Path(v).exists():
            return v
    for key in ("images", "files", "outputs", "paths", "clips"):
        v = data.get(key)
        if isinstance(v, list) and v:
            first = v[0]
            if isinstance(first, dict):
                first = first.get("path") or first.get("url") or first.get("output_path")
            if isinstance(first, str) and Path(first).exists():
                return first
    return None


def _run_job(job_id: str, spec: dict) -> None:
    from lib.checkpoint import init_project
    from lib.paths import PROJECTS_DIR
    from tools.tool_registry import registry
    from tools.video.video_compose import VideoCompose

    job = get_job(job_id)
    project_id = job["project_id"]
    try:
        _update(job_id, status="running", progress=3, message="Initializing project…",
                log_line=f"project {project_id}")
        registry.discover()

        proj_dir = PROJECTS_DIR / project_id
        init_project(project_id, title=spec.get("title") or project_id,
                     pipeline_type="studio")

        assets_dir = proj_dir / "assets"
        for sub in ("images", "video", "audio", "music"):
            (assets_dir / sub).mkdir(parents=True, exist_ok=True)
        pub = PUBLIC_DIR / project_id
        pub.mkdir(parents=True, exist_ok=True)

        session = spec.get("session")
        fmt = spec.get("format", "9:16")
        W, H = FORMATS.get(fmt, FORMATS["9:16"])
        aspect = fmt
        runtime = (spec.get("runtime") or "remotion").lower()
        if runtime == "auto":
            runtime = "remotion"

        # ---- helper to copy a file into public/ and return relative src ----
        def publish_asset(src_path: Path, subname: str) -> str:
            dest = pub / subname
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(Path(src_path).read_bytes())
            return f"studio/{project_id}/{subname}"

        def resolve_upload(name: str) -> Optional[Path]:
            return upload_path(session, name) if name else None

        # ---- 1. Global voiceover -----------------------------------------
        narration_src = None
        vo = spec.get("voiceover") or {}
        vo_source = vo.get("source", "none")
        if vo_source == "upload" and vo.get("file"):
            up = resolve_upload(vo["file"])
            if up:
                narration_src = publish_asset(up, f"narration{up.suffix.lower()}")
                _update(job_id, log_line=f"voiceover: uploaded {up.name}")
        elif vo_source == "tts" and (vo.get("script") or "").strip():
            _update(job_id, progress=12, message="Generating voiceover (TTS)…")
            tts = _pick_tool(registry, "tts", vo.get("provider"))
            if tts is None:
                raise RuntimeError("No TTS provider is configured. Add a key "
                                   "(e.g. ELEVENLABS_API_KEY) or use Google TTS.")
            out = assets_dir / "audio" / "narration.mp3"
            params = {"text": vo["script"], "output_path": str(out)}
            if vo.get("voice_id"):
                params["voice_id"] = vo["voice_id"]
            r = tts.execute(params)
            if not r.success:
                raise RuntimeError(f"TTS failed: {r.error}")
            got = _extract_path(r.data, AUDIO_EXT) or str(out)
            narration_src = publish_asset(Path(got), "narration.mp3")
            _update(job_id, log_line=f"voiceover: TTS via {getattr(tts,'name','tts')}")

        # ---- 2. Music ----------------------------------------------------
        music_src = None
        music = spec.get("music") or {}
        m_source = music.get("source", "none")
        if m_source == "upload" and music.get("file"):
            up = resolve_upload(music["file"])
            if up:
                music_src = publish_asset(up, f"music{up.suffix.lower()}")
        elif m_source == "library" and music.get("track"):
            lib_file = MUSIC_LIBRARY_DIR / _safe_name(music["track"])
            if lib_file.is_file():
                music_src = publish_asset(lib_file, f"music{lib_file.suffix.lower()}")
        elif m_source == "generate" and (music.get("prompt") or "").strip():
            _update(job_id, progress=20, message="Generating music…")
            mtool = _pick_tool(registry, "music_generation", music.get("provider"))
            if mtool is None:
                raise RuntimeError("No music provider configured.")
            out = assets_dir / "music" / "bg.mp3"
            r = mtool.execute({"prompt": music["prompt"],
                               "duration_seconds": int(spec.get("duration") or 30),
                               "output_path": str(out)})
            if not r.success:
                raise RuntimeError(f"Music generation failed: {r.error}")
            got = _extract_path(r.data, AUDIO_EXT) or str(out)
            music_src = publish_asset(Path(got), "bg.mp3")

        # ---- 3. Segments → visual cuts -----------------------------------
        segments = spec.get("segments") or []
        if not segments:
            raise RuntimeError("Add at least one segment (media, AI image/video, or avatar).")

        cuts: list[dict] = []
        captions: list[dict] = []
        default_motion = spec.get("motion") or "ken-burns"
        t_cursor = 0.0
        n_seg = len(segments)
        product_ref = None
        products = spec.get("products") or []
        if products:
            up = resolve_upload(products[0])
            if up:
                product_ref = up  # local path used as reference image

        for idx, seg in enumerate(segments):
            seg_prog = 25 + int(60 * idx / max(1, n_seg))
            stype = seg.get("type")
            dur = float(seg.get("duration") or 0) or _auto_seg_dur(spec, n_seg)
            src_rel = None
            is_video = False

            if stype == "media":
                up = resolve_upload(seg.get("file"))
                if not up:
                    continue
                is_video = kind_of(up.name) == "video"
                src_rel = publish_asset(up, f"seg{idx}{up.suffix.lower()}")

            elif stype == "ai_image":
                _update(job_id, progress=seg_prog, message=f"Generating image {idx+1}/{n_seg}…")
                itool = _pick_tool(registry, "image_generation", seg.get("provider"))
                if itool is None:
                    raise RuntimeError("No image provider configured.")
                out = assets_dir / "images" / f"seg{idx}.png"
                r = itool.execute({"prompt": seg["prompt"], "width": W, "height": H,
                                   "aspect_ratio": aspect, "output_path": str(out)})
                if not r.success:
                    raise RuntimeError(f"Image gen failed: {r.error}")
                got = _extract_path(r.data, IMAGE_EXT) or str(out)
                src_rel = publish_asset(Path(got), f"seg{idx}.png")

            elif stype == "ai_video":
                _update(job_id, progress=seg_prog, message=f"Generating video clip {idx+1}/{n_seg}…")
                vtool = _pick_tool(registry, "video_generation", seg.get("provider"), exclude={"video_selector"}) \
                    or registry._tools.get("video_selector")
                if vtool is None:
                    raise RuntimeError("No video provider configured.")
                out = assets_dir / "video" / f"seg{idx}.mp4"
                params = {"prompt": seg["prompt"], "aspect_ratio": aspect,
                          "duration": int(dur), "output_path": str(out)}
                ref = resolve_upload(seg.get("image")) or product_ref
                if ref:
                    params["reference_image_path"] = str(ref)
                r = vtool.execute(params)
                if not r.success:
                    raise RuntimeError(f"Video gen failed: {r.error}")
                got = _extract_path(r.data, VIDEO_EXT) or str(out)
                src_rel = publish_asset(Path(got), f"seg{idx}.mp4")
                is_video = True

            elif stype == "avatar":
                _update(job_id, progress=seg_prog, message=f"Generating UGC avatar {idx+1}/{n_seg}…")
                atool = _pick_avatar_tool(registry)
                if atool is None:
                    raise RuntimeError(
                        "UGC avatar needs an avatar provider. Add HEYGEN_API_KEY for "
                        "cloud talking-head UGC, or a local SadTalker/Wav2Lip install.")
                out = assets_dir / "video" / f"seg{idx}.mp4"
                params = {"script": seg.get("script", ""), "text": seg.get("script", ""),
                          "aspect_ratio": aspect, "output_path": str(out)}
                if seg.get("avatar_id"):
                    params["avatar_id"] = seg["avatar_id"]
                if seg.get("voice_id"):
                    params["voice_id"] = seg["voice_id"]
                ref = resolve_upload(seg.get("image")) or product_ref
                if ref:
                    params["reference_image_path"] = str(ref)
                    params["image_path"] = str(ref)
                r = atool.execute(params)
                if not r.success:
                    raise RuntimeError(f"Avatar/UGC generation failed: {r.error}")
                got = _extract_path(r.data, VIDEO_EXT) or str(out)
                src_rel = publish_asset(Path(got), f"seg{idx}.mp4")
                is_video = True

            else:
                continue

            cut = {"source": src_rel, "in_seconds": round(t_cursor, 2),
                   "out_seconds": round(t_cursor + dur, 2)}
            if not is_video:
                cut["animation"] = seg.get("motion") or default_motion
            cuts.append(cut)

            # captions for this segment
            cap_text = (seg.get("caption") or "").strip()
            if cap_text and (spec.get("captions") or {}).get("enabled", True):
                captions.extend(_words_for(cap_text, t_cursor, t_cursor + dur))
            t_cursor += dur

        if not cuts:
            raise RuntimeError("No usable segments produced a visual.")

        # ---- 4. Build composition ---------------------------------------
        audio: dict = {}
        if narration_src:
            audio["narration"] = {"src": narration_src, "volume": 1.0}
        if music_src:
            audio["music"] = {"src": music_src, "volume": float(music.get("volume", 0.14)),
                              "fadeInSeconds": 1.0, "fadeOutSeconds": 2.5, "loop": True}

        composition = {
            "renderer_family": "explainer-data",
            "render_runtime": runtime,
            "width": W, "height": H,
            "cuts": cuts,
            "audio": audio,
        }
        if captions:
            composition["captions"] = captions

        (proj_dir / "artifacts").mkdir(exist_ok=True)
        (proj_dir / "artifacts" / "edit_decisions.json").write_text(json.dumps(composition, indent=2))

        # ---- 5. Render ---------------------------------------------------
        _update(job_id, progress=88, message="Composing final video…")
        out_path = proj_dir / "renders" / "final.mp4"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        vc = VideoCompose()
        if runtime == "remotion":
            r = vc.execute({"operation": "remotion_render",
                            "edit_decisions": composition,
                            "output_path": str(out_path),
                            "remotion_timeout_ms": 180000})
        else:
            asset_manifest = {"assets": [{"id": c["source"], "path": c["source"]} for c in cuts]}
            r = vc.execute({"operation": "render", "edit_decisions": composition,
                            "asset_manifest": asset_manifest, "output_path": str(out_path)})
        if not r.success:
            raise RuntimeError(f"Compose failed: {r.error}")

        (proj_dir / "artifacts" / "render_report.json").write_text(json.dumps({
            "output_path": f"projects/{project_id}/renders/final.mp4",
            "runtime": runtime, "resolution": f"{W}x{H}",
            "segments": len(cuts),
        }, indent=2))

        _update(job_id, status="done", progress=100, message="Done",
                output_url=f"/media/{project_id}/renders/final.mp4",
                log_line=f"render OK → {out_path}")
    except Exception as e:
        _update(job_id, status="error", error=str(e), message="Failed",
                log_line="ERROR: " + str(e))
        traceback.print_exc()


def _auto_seg_dur(spec: dict, n_seg: int) -> float:
    total = float(spec.get("duration") or 0)
    if total > 0 and n_seg > 0:
        return max(1.5, total / n_seg)
    return 3.5


def _words_for(text: str, start: float, end: float) -> list[dict]:
    words = [w for w in re.split(r"\s+", text.strip()) if w]
    if not words:
        return []
    span = max(0.4, end - start)
    per = span / len(words)
    out = []
    for i, w in enumerate(words):
        s = start + i * per
        out.append({"word": w, "startMs": int(s * 1000), "endMs": int((s + per) * 1000)})
    return out


def _pick_tool(registry, capability: str, provider: Optional[str] = None,
               exclude: Optional[set] = None):
    """Pick an available tool for a capability, honoring a provider preference."""
    exclude = exclude or set()
    tools = [t for t in registry.get_by_capability(capability)
             if getattr(t, "name", None) not in exclude]
    avail = []
    for t in tools:
        try:
            info = t.get_info()
        except Exception:
            continue
        if _tool_available(t, info):
            avail.append((t, info))
    if provider:
        for t, info in avail:
            if provider in (info.get("provider"), info.get("name")):
                return t
    return avail[0][0] if avail else None


def _pick_avatar_tool(registry):
    # Prefer a configured HeyGen video/avatar tool, then local avatar tools.
    for name in ("heygen_video",):
        t = registry._tools.get(name)
        if t:
            try:
                if _tool_available(t, t.get_info()):
                    return t
            except Exception:
                pass
    return _pick_tool(registry, "avatar")
