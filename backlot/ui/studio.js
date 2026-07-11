import { el, getJSON } from "/ui/lib.js";

// ---------------------------------------------------------------- theme
const THEME_KEY = "backlot.theme";
let theme = localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
function applyTheme(t) {
  theme = t === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
}
function themeToggle() {
  const next = theme === "light" ? "dark" : "light";
  return el("button", {
    class: "theme-toggle", type: "button", title: `Switch to ${next} theme`,
    onclick: () => { applyTheme(next); document.querySelector(".theme-toggle").replaceWith(themeToggle()); },
  }, el("span", { class: "theme-toggle-icon", "aria-hidden": "true" }, theme === "light" ? "☾" : "☀"));
}
applyTheme(theme);
document.getElementById("liveBadge").before(themeToggle());

// ---------------------------------------------------------------- state
const state = {
  session: null,
  caps: null,
  title: "",
  format: "9:16",
  duration: 30,
  runtime: "auto",
  motion: "ken-burns",
  media: [],           // {name, kind}
  segments: [],        // see addSegment
  voiceover: { source: "none", file: "", script: "", voice_id: "", provider: "" },
  music: { source: "none", file: "", track: "", prompt: "", volume: 0.14, provider: "" },
  captions: { enabled: true },
  products: [],        // media names
  activeCase: null,
  job: null,
};

const MOTIONS = ["ken-burns", "parallax", "zoom-in", "zoom-out", "pan-left", "pan-right", "static"];
const RUNTIMES = ["auto", "remotion", "hyperframes", "ffmpeg"];

// Pre-configured use-case recipes. Applied via the strip or ?case=<key>.
const USECASES = {
  ugc: {
    label: "UGC Ad", icon: "◉",
    blurb: "Creator talks to camera about your product, mixed with real shots + b-roll.",
    keys: "HeyGen (avatar) · ElevenLabs (voice) · FAL (b-roll)",
    apply: {
      title: "UGC Ad — my product", format: "9:16", duration: 45, motion: "ken-burns",
      captions: { enabled: true },
      voiceover: { source: "none", file: "", script: "", voice_id: "", provider: "" },
      music: { source: "generate", prompt: "subtle upbeat, modern, no vocals", volume: 0.1, file: "", track: "", provider: "" },
      segments: [
        { type: "avatar", script: "Okay, real talk — I did NOT expect this to actually work. Let me show you.", image: "", voice_id: "", caption: "WAIT FOR IT 👀", duration: 0 },
        { type: "ai_video", prompt: "Handheld UGC shot: a creator holds the product up to camera in natural window light, authentic, talking, slight camera shake", image: "", caption: "day 1", duration: 0 },
        { type: "media", file: "", motion: "zoom-in", caption: "look at this", duration: 0 },
        { type: "ai_video", prompt: "Close-up product demo, hands using the product, satisfying detail, shallow depth of field", image: "", caption: "the result →", duration: 0 },
        { type: "avatar", script: "Honestly? Obsessed. The link is right there — go grab yours before it's gone.", image: "", voice_id: "", caption: "LINK IN BIO", duration: 0 },
      ],
    },
  },
  reels: {
    label: "Viral Reel", icon: "✦",
    blurb: "Fast, punchy, scroll-stopping short for TikTok / Reels / FB. Watched on mute.",
    keys: "FAL (hook clip) · ElevenLabs (voice) · Suno (beat)",
    apply: {
      title: "Viral Reel", format: "9:16", duration: 22, motion: "zoom-in",
      captions: { enabled: true },
      voiceover: { source: "none", file: "", script: "", voice_id: "", provider: "" },
      music: { source: "generate", prompt: "energetic trending beat, punchy, driving, no vocals", volume: 0.18, file: "", track: "", provider: "" },
      segments: [
        { type: "ai_video", prompt: "Scroll-stopping opening shot, bold dynamic motion, high energy, cinematic", image: "", caption: "STOP scrolling", duration: 0 },
        { type: "media", file: "", motion: "zoom-in", caption: "point 1", duration: 0 },
        { type: "media", file: "", motion: "pan-left", caption: "point 2", duration: 0 },
        { type: "ai_image", prompt: "Bold vibrant background with space for big text, trendy", motion: "zoom-in", caption: "the secret", duration: 0 },
        { type: "media", file: "", motion: "parallax", caption: "FOLLOW for more", duration: 0 },
      ],
    },
  },
  promo: {
    label: "Product Promo", icon: "◆",
    blurb: "Polished branded promo from your product images/screenshots — clean motion + VO + music.",
    keys: "ElevenLabs or Google (voice) · Suno or library (music)",
    apply: {
      title: "Product Promo", format: "9:16", duration: 30, motion: "parallax",
      captions: { enabled: true },
      voiceover: { source: "tts", file: "", script: "Meet the app that runs your whole business — quotes, invoices, projects, all in one place.", voice_id: "", provider: "" },
      music: { source: "generate", prompt: "clean modern corporate, uplifting, no vocals", volume: 0.12, file: "", track: "", provider: "" },
      segments: [
        { type: "ai_image", prompt: "Hero product shot, studio lighting, premium, clean gradient background", motion: "zoom-in", caption: "", duration: 0 },
        { type: "media", file: "", motion: "parallax", caption: "feature one", duration: 0 },
        { type: "media", file: "", motion: "ken-burns", caption: "feature two", duration: 0 },
        { type: "media", file: "", motion: "parallax", caption: "feature three", duration: 0 },
        { type: "ai_image", prompt: "Call-to-action end card, brand colors, download badges", motion: "static", caption: "Get it now", duration: 0 },
      ],
    },
  },
};

function applyUsecase(key) {
  const uc = USECASES[key];
  if (!uc) return;
  const a = JSON.parse(JSON.stringify(uc.apply));
  Object.assign(state, {
    title: a.title, format: a.format, duration: a.duration, motion: a.motion,
    captions: a.captions, voiceover: a.voiceover, music: a.music,
    segments: a.segments, activeCase: key,
  });
  renderBuilder();
}

// ---------------------------------------------------------------- helpers
function field(labelText, control, hint) {
  return el("label", { class: "fld" },
    el("span", { class: "lab" }, labelText),
    control,
    hint ? el("span", { class: "phead sub", style: "margin-top:4px;display:block" }, hint) : null);
}
function select(options, value, onChange) {
  const s = el("select", { onchange: (e) => onChange(e.target.value) });
  for (const o of options) {
    const val = typeof o === "string" ? o : o.value;
    const lab = typeof o === "string" ? o : o.label;
    s.append(el("option", { value: val, ...(val === value ? { selected: "selected" } : {}) }, lab));
  }
  s.value = value;
  return s;
}
function segChips(options, value, onPick) {
  const wrap = el("div", { class: "seg" });
  for (const o of options) {
    wrap.append(el("button", { type: "button", class: value === o ? "on" : "",
      onclick: () => onPick(o) }, o));
  }
  return wrap;
}
function mediaOptions(kinds) {
  const opts = [{ value: "", label: "— choose —" }];
  for (const m of state.media) {
    if (!kinds || kinds.includes(m.kind)) opts.push({ value: m.name, label: `${m.name} (${m.kind})` });
  }
  return opts;
}

// ---------------------------------------------------------------- session + uploads
async function ensureSession() {
  if (state.session) return state.session;
  const r = await fetch("/api/studio/session", { method: "POST" });
  state.session = (await r.json()).session;
  return state.session;
}
async function uploadFile(file) {
  await ensureSession();
  const url = `/api/studio/upload?session=${encodeURIComponent(state.session)}&name=${encodeURIComponent(file.name)}`;
  const r = await fetch(url, { method: "POST", body: file });
  if (!r.ok) throw new Error(`upload failed: ${r.status}`);
  const info = await r.json();
  state.media.push({ name: info.name, kind: info.kind });
  return info;
}
// ---------------------------------------------------------------- segments
function addSegment(type) {
  const base = { type, caption: "", duration: 0, motion: state.motion };
  if (type === "media") base.file = "";
  if (type === "ai_image") base.prompt = "";
  if (type === "ai_video") { base.prompt = ""; base.image = ""; }
  if (type === "avatar") { base.script = ""; base.image = ""; base.voice_id = ""; }
  state.segments.push(base);
  renderBuilder();
}
function moveSeg(i, d) {
  const j = i + d;
  if (j < 0 || j >= state.segments.length) return;
  [state.segments[i], state.segments[j]] = [state.segments[j], state.segments[i]];
  renderBuilder();
}
function removeSeg(i) { state.segments.splice(i, 1); renderBuilder(); }

function segCard(seg, i) {
  const head = el("div", { class: "schead" },
    el("span", { class: `seg-badge ${seg.type}` }, seg.type.replace("_", " ")),
    el("span", { class: "idx" }, `#${i + 1}`),
    el("div", { class: "spacer" }),
    el("button", { class: "icon-btn", title: "Move up", onclick: () => moveSeg(i, -1) }, "↑"),
    el("button", { class: "icon-btn", title: "Move down", onclick: () => moveSeg(i, 1) }, "↓"),
    el("button", { class: "icon-btn danger", title: "Remove", onclick: () => removeSeg(i) }, "✕"),
  );

  const body = el("div", {});
  if (seg.type === "media") {
    body.append(field("Source file", select(mediaOptions(["image", "video"]), seg.file,
      (v) => { seg.file = v; })));
  }
  if (seg.type === "ai_image") {
    body.append(field("Image prompt", textareaFor(seg, "prompt", "A cinematic close-up of the product on a marble table, soft light…")));
  }
  if (seg.type === "ai_video") {
    body.append(field("Video prompt", textareaFor(seg, "prompt", "Handheld UGC clip: a creator holds the product, smiling, talking to camera…")));
    body.append(field("Product / reference image (optional)", select(mediaOptions(["image"]), seg.image, (v) => { seg.image = v; }),
      "Used as the first frame / product placement reference."));
  }
  if (seg.type === "avatar") {
    body.append(field("Avatar script (what they say)", textareaFor(seg, "script", "Okay so I've been using this for a week and honestly…")));
    body.append(el("div", { class: "row" },
      field("Voice id (optional)", inputFor(seg, "voice_id", "elevenlabs / heygen voice id")),
      field("Product image (optional)", select(mediaOptions(["image"]), seg.image, (v) => { seg.image = v; })),
    ));
  }

  // shared: motion (image only), caption, duration
  const shared = el("div", { class: "row" });
  if (seg.type === "media" || seg.type === "ai_image") {
    shared.append(field("Motion", select(MOTIONS, seg.motion || state.motion, (v) => { seg.motion = v; })));
  }
  shared.append(field("Duration (s)", numberFor(seg, "duration", "auto")));
  body.append(shared);
  body.append(field("On-screen caption (optional)", inputFor(seg, "caption", "short keyword or hook…")));

  return el("div", { class: "seg-card" }, head, body);
}

function inputFor(obj, key, ph) {
  return el("input", { type: "text", value: obj[key] || "", placeholder: ph || "",
    oninput: (e) => { obj[key] = e.target.value; } });
}
function numberFor(obj, key, ph) {
  return el("input", { type: "number", min: "0", step: "0.5", value: obj[key] || "", placeholder: ph || "",
    oninput: (e) => { obj[key] = parseFloat(e.target.value) || 0; } });
}
function textareaFor(obj, key, ph) {
  return el("textarea", { placeholder: ph || "", oninput: (e) => { obj[key] = e.target.value; } }, obj[key] || "");
}

// ---------------------------------------------------------------- panels
function usecaseStrip() {
  const p = el("div", { class: "panel usecase-strip" });
  p.append(el("div", { class: "phead" }, el("span", { class: "num" }, "★"),
    el("h2", {}, "Use case"), el("span", { class: "phead sub" }, "start from a recipe — or blank"),
    el("div", { class: "spacer" }),
    el("a", { class: "nav-link", href: "/guide", target: "_blank" }, "📖 Guide")));
  const grid = el("div", { class: "uc-grid" });
  grid.append(ucCard("blank", { label: "Blank", icon: "＋", blurb: "Start from scratch — full control.", keys: "" }));
  for (const [k, uc] of Object.entries(USECASES)) grid.append(ucCard(k, uc));
  p.append(grid);
  return p;
}
function ucCard(key, uc) {
  const on = state.activeCase === key || (key === "blank" && !state.activeCase);
  return el("button", { class: `uc-card${on ? " on" : ""}`, type: "button",
    onclick: () => {
      if (key === "blank") { state.activeCase = null; renderBuilder(); }
      else applyUsecase(key);
    } },
    el("div", { class: "uc-top" }, el("span", { class: "uc-icon" }, uc.icon), el("span", { class: "uc-label" }, uc.label)),
    el("div", { class: "uc-blurb" }, uc.blurb),
    uc.keys ? el("div", { class: "uc-keys" }, uc.keys) : null);
}

function basicsPanel() {
  const p = el("div", { class: "panel" });
  p.append(el("div", { class: "phead" }, el("span", { class: "num" }, "1"),
    el("h2", {}, "Project"), el("span", { class: "phead sub" })));
  p.append(field("Title", el("input", { type: "text", value: state.title, placeholder: "My UGC ad — product X",
    oninput: (e) => { state.title = e.target.value; syncGenerateEnabled(); } })));
  p.append(el("div", { class: "row" },
    field("Format", segChips(state.caps ? state.caps.formats : ["9:16", "1:1", "16:9"], state.format, (v) => { state.format = v; renderBuilder(); })),
  ));
  p.append(el("div", { class: "row" },
    field("Target duration (s) — up to 120+ for UGC", el("input", { type: "number", min: "3", max: "600", value: state.duration,
      oninput: (e) => { state.duration = parseInt(e.target.value) || 30; } })),
    field("Render runtime", select(RUNTIMES.map(r => ({ value: r, label: runtimeLabel(r) })), state.runtime, (v) => { state.runtime = v; })),
    field("Default motion", select(MOTIONS, state.motion, (v) => { state.motion = v; })),
  ));
  return p;
}
function runtimeLabel(r) {
  const rt = state.caps ? state.caps.runtimes : {};
  const map = { auto: "Auto", remotion: "Remotion", hyperframes: "HyperFrames", ffmpeg: "FFmpeg" };
  if (r === "auto") return "Auto (recommended)";
  const ok = rt[r];
  return `${map[r]}${ok === false ? " — unavailable" : ""}`;
}

function mediaPanel() {
  const p = el("div", { class: "panel" });
  p.append(el("div", { class: "phead" }, el("span", { class: "num" }, "2"),
    el("h2", {}, "Media"), el("span", { class: "phead sub" }, "drop images · video · audio")));
  const dz = el("div", { class: "dropzone", tabindex: "0" },
    el("div", { class: "big" }, "⇪  DROP FILES HERE"),
    el("div", { class: "small" }, "images, video clips, voiceover & music — or click to browse"));
  const input = el("input", { type: "file", multiple: "multiple", accept: "image/*,video/*,audio/*", style: "display:none" });
  dz.onclick = () => input.click();
  input.onchange = () => handleFiles([...input.files]);
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add("drag"); };
  dz.ondragleave = () => dz.classList.remove("drag");
  dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove("drag"); handleFiles([...e.dataTransfer.files]); };
  p.append(dz, input);

  const tray = el("div", { class: "tray", id: "tray" });
  for (const m of state.media) tray.append(mediaChip(m));
  p.append(tray);
  return p;
}
function mediaChip(m) {
  const chip = el("div", { class: `media-chip ${m.kind}` }, el("span", { class: "kind" }, m.kind));
  if (m.kind === "image") {
    // preview straight from the uploads store
    chip.prepend(el("img", { src: `/api/studio/preview?session=${encodeURIComponent(state.session)}&name=${encodeURIComponent(m.name)}`, alt: "", loading: "lazy",
      onerror: (e) => { e.target.remove(); } }));
  } else {
    chip.append(el("span", {}, m.kind === "video" ? "▶" : m.kind === "audio" ? "♪" : "◈"));
  }
  chip.append(el("span", { class: "fn", title: m.name }, m.name));
  return chip;
}
async function handleFiles(files) {
  for (const f of files) {
    try { await uploadFile(f); } catch (err) { console.error(err); }
  }
  renderBuilder();
}

function timelinePanel() {
  const p = el("div", { class: "panel" });
  p.append(el("div", { class: "phead" }, el("span", { class: "num" }, "3"),
    el("h2", {}, "Timeline"), el("span", { class: "phead sub" }, "build a real edit, not a slideshow")));
  const add = el("div", { class: "add-seg" },
    el("button", { class: "pill-btn", onclick: () => addSegment("media") }, "＋ Media"),
    el("button", { class: "pill-btn", onclick: () => addSegment("ai_image") }, "＋ AI Image"),
    el("button", { class: "pill-btn", onclick: () => addSegment("ai_video") }, "＋ AI Video"),
    el("button", { class: "pill-btn", onclick: () => addSegment("avatar") }, "＋ Avatar / UGC"),
  );
  p.append(add);
  const list = el("div", { class: "seg-list" });
  if (!state.segments.length) list.append(el("p", { class: "empty-note" }, "No segments yet. Add media or an AI shot above. Mix them freely — e.g. an avatar hook, an AI b-roll clip, then your product screenshots."));
  state.segments.forEach((s, i) => list.append(segCard(s, i)));
  p.append(list);
  return p;
}

function voiceoverPanel() {
  const p = el("div", { class: "panel" });
  p.append(el("div", { class: "phead" }, el("span", { class: "num" }, "4"),
    el("h2", {}, "Voiceover")));
  p.append(field("Source", segChips(["none", "upload", "tts"].map(labelSource), sourceLabel(state.voiceover.source, "vo"),
    (v) => { state.voiceover.source = unlabelSource(v); renderBuilder(); })));
  if (state.voiceover.source === "upload") {
    p.append(field("Audio file", select(mediaOptions(["audio"]), state.voiceover.file, (v) => { state.voiceover.file = v; })));
  } else if (state.voiceover.source === "tts") {
    p.append(field("Script", textareaFor(state.voiceover, "script", "Write exactly what the voice should say…")));
    const ttsProvs = ttsProviderOptions();
    p.append(el("div", { class: "row" },
      field("Voice", ttsProvs.length ? select(ttsProvs, state.voiceover.provider, (v) => { state.voiceover.provider = v; })
        : el("span", { class: "setup-note" }, "No TTS key yet — add ELEVENLABS_API_KEY (or use Google TTS).")),
      field("Voice id (optional)", inputFor(state.voiceover, "voice_id", "e.g. Rachel / a HeyGen voice")),
    ));
  }
  return p;
}
function ttsProviderOptions() {
  const t = (state.caps && state.caps.tools.tts) || [];
  return t.filter(x => x.available).map(x => ({ value: x.provider, label: x.provider }));
}

function musicPanel() {
  const p = el("div", { class: "panel" });
  p.append(el("div", { class: "phead" }, el("span", { class: "num" }, "5"),
    el("h2", {}, "Music")));
  p.append(field("Source", segChips(["none", "upload", "library", "generate"], state.music.source,
    (v) => { state.music.source = v; renderBuilder(); })));
  if (state.music.source === "upload") {
    p.append(field("Audio file", select(mediaOptions(["audio"]), state.music.file, (v) => { state.music.file = v; })));
  } else if (state.music.source === "library") {
    const lib = (state.caps && state.caps.music_library) || [];
    p.append(field("Library track", lib.length ? select([{ value: "", label: "— choose —" }, ...lib], state.music.track, (v) => { state.music.track = v; })
      : el("span", { class: "setup-note" }, "music_library/ is empty — drop .mp3 files there.")));
  } else if (state.music.source === "generate") {
    p.append(field("Music prompt", inputFor(state.music, "prompt", "soft upbeat modern, no vocals")));
  }
  if (state.music.source !== "none") {
    p.append(field("Music volume (0–1)", el("input", { type: "number", min: "0", max: "1", step: "0.02", value: state.music.volume,
      oninput: (e) => { state.music.volume = parseFloat(e.target.value); } })));
  }
  return p;
}

function extrasPanel() {
  const p = el("div", { class: "panel" });
  p.append(el("div", { class: "phead" }, el("span", { class: "num" }, "6"),
    el("h2", {}, "Captions & Product")));
  p.append(field("Captions", segChips(["on", "off"], state.captions.enabled ? "on" : "off",
    (v) => { state.captions.enabled = v === "on"; })));
  p.append(field("Product placement assets", multiPick(state.products,
    mediaOptions(["image", "video"]).slice(1), (arr) => { state.products = arr; }),
    "Attach product images used as references for AI shots / UGC."));
  return p;
}
function multiPick(current, options, onChange) {
  const wrap = el("div", { class: "seg" });
  for (const o of options) {
    const on = current.includes(o.value);
    wrap.append(el("button", { type: "button", class: on ? "on" : "", onclick: () => {
      const idx = current.indexOf(o.value);
      if (idx >= 0) current.splice(idx, 1); else current.push(o.value);
      onChange([...current]);
      wrap.replaceWith(multiPick(current, options, onChange));
    } }, o.label));
  }
  if (!options.length) wrap.append(el("span", { class: "empty-note" }, "upload product images first"));
  return wrap;
}

// source label helpers (voiceover uses none/upload/tts)
function labelSource(s) { return s === "tts" ? "script → tts" : s; }
function sourceLabel(v) { return v === "tts" ? "script → tts" : v; }
function unlabelSource(v) { return v === "script → tts" ? "tts" : v; }

// ---------------------------------------------------------------- generate
function generatePanel() {
  const p = el("div", { class: "gen-bar" });
  const btn = el("button", { class: "btn-generate", id: "genBtn",
    onclick: onGenerate }, "◉  Generate Video");
  const prog = el("div", { class: "progress", id: "prog" },
    el("div", { class: "bar" }, el("i", { id: "progBar" })),
    el("div", { class: "msg", id: "progMsg" }, ""));
  const res = el("div", { class: "result", id: "result" });
  p.append(btn, prog, res);
  return p;
}
function syncGenerateEnabled() {
  const btn = document.getElementById("genBtn");
  if (btn) btn.disabled = !(state.title.trim() && state.segments.length);
}

function buildSpec() {
  return {
    session: state.session,
    title: state.title,
    format: state.format,
    duration: state.duration,
    runtime: state.runtime,
    motion: state.motion,
    segments: state.segments,
    voiceover: state.voiceover,
    music: state.music,
    captions: state.captions,
    products: state.products,
  };
}

async function onGenerate() {
  const btn = document.getElementById("genBtn");
  btn.disabled = true;
  const prog = document.getElementById("prog");
  const bar = document.getElementById("progBar");
  const msg = document.getElementById("progMsg");
  const result = document.getElementById("result");
  result.className = "result"; result.innerHTML = "";
  prog.className = "progress show";
  msg.className = "msg"; msg.textContent = "Submitting…"; bar.style.width = "3%";
  try {
    const r = await fetch("/api/studio/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSpec()),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || "generate failed");
    state.job = data.job_id;
    pollJob(data.job_id, data.project_id, { bar, msg, result, btn });
  } catch (e) {
    msg.className = "msg err"; msg.textContent = "✕ " + e.message;
    btn.disabled = false;
  }
}

function pollJob(jobId, projectId, ui) {
  const tick = async () => {
    let j;
    try { j = await getJSON(`/api/studio/job/${jobId}`); }
    catch { setTimeout(tick, 1500); return; }
    ui.bar.style.width = `${j.progress || 0}%`;
    ui.msg.className = "msg";
    ui.msg.textContent = `${j.message || j.status}${j.progress ? " · " + j.progress + "%" : ""}`;
    if (j.status === "done") {
      ui.msg.className = "msg ok"; ui.msg.textContent = "✓ Done";
      ui.result.className = "result show";
      ui.result.append(
        el("video", { src: j.output_url, controls: "controls", playsinline: "playsinline" }),
        el("div", { style: "margin-top:10px" },
          el("a", { class: "nav-link", href: `/p/${projectId}` }, "Open on the board ▸")));
      ui.btn.disabled = false;
      return;
    }
    if (j.status === "error") {
      ui.msg.className = "msg err";
      ui.msg.textContent = "✕ " + (j.error || "failed");
      ui.btn.disabled = false;
      return;
    }
    setTimeout(tick, 1500);
  };
  tick();
}

// ---------------------------------------------------------------- capabilities rail
function renderCaps() {
  const box = document.getElementById("caps");
  if (!box) return;
  const c = state.caps;
  box.innerHTML = "";
  // runtimes
  const rts = el("div", { class: "runtimes" });
  for (const [k, v] of Object.entries(c.runtimes || {})) {
    rts.append(el("span", { class: `rt ${v ? "on" : ""}` }, el("span", { class: "dot" }), k));
  }
  box.append(rts);
  // capability rows
  const offersByCap = {};
  for (const o of c.setup_offers || []) {
    (offersByCap[o.capability] = offersByCap[o.capability] || []).push(o);
  }
  const order = ["video_generation", "image_generation", "tts", "music_generation", "avatar",
    "enhancement", "analysis", "audio_processing"];
  const rows = [...(c.capabilities || [])].sort((a, b) => {
    const ia = order.indexOf(a.capability), ib = order.indexOf(b.capability);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  for (const cap of rows) {
    const row = el("div", { class: "cap-row" });
    row.append(el("div", { class: "top" },
      el("span", { class: "name" }, cap.capability.replace(/_/g, " ")),
      el("span", { class: "ratio" }, el("b", {}, String(cap.configured)), ` / ${cap.total}`)));
    const provs = el("div", { class: "provs" });
    for (const pName of cap.available_providers || []) provs.append(el("span", { class: "prov on" }, pName));
    for (const pName of (cap.unavailable_providers || []).slice(0, 6)) provs.append(el("span", { class: "prov" }, pName));
    row.append(provs);
    if (cap.configured === 0 && offersByCap[cap.capability]) {
      const envs = [...new Set(offersByCap[cap.capability].map(o => o.env_var).filter(Boolean))];
      if (envs.length) row.append(el("div", { class: "setup-note" }, `➜ add ${envs.slice(0, 3).join(" / ")} to unlock`));
    }
    box.append(row);
  }
  for (const w of c.warnings || []) box.append(el("div", { class: "warn-note" }, "⚠ " + w));
}

// ---------------------------------------------------------------- render
function renderBuilder() {
  const root = document.getElementById("builder");
  root.innerHTML = "";
  root.append(
    usecaseStrip(),
    basicsPanel(),
    mediaPanel(),
    timelinePanel(),
    voiceoverPanel(),
    musicPanel(),
    extrasPanel(),
    generatePanel(),
  );
  // fix image previews (need session)
  syncGenerateEnabled();
}

async function init() {
  await ensureSession();
  const caseParam = new URLSearchParams(location.search).get("case");
  if (caseParam && USECASES[caseParam]) applyUsecase(caseParam);
  renderBuilder();
  try {
    state.caps = await getJSON("/api/studio/capabilities");
    renderCaps();
    // sensible runtime default label refresh
    renderBuilder();
  } catch (e) {
    document.getElementById("caps").innerHTML = "";
    document.getElementById("caps").append(el("p", { class: "warn-note" }, "Could not load capabilities: " + e.message));
  }
}
init();
