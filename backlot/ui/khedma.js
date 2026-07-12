import { el, getJSON } from "/ui/lib.js";

// ---- theme ----
const THEME_KEY = "backlot.theme";
let theme = localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
function applyTheme(t) { theme = t === "light" ? "light" : "dark"; document.documentElement.dataset.theme = theme; localStorage.setItem(THEME_KEY, theme); }
function themeToggle() {
  const next = theme === "light" ? "dark" : "light";
  return el("button", { class: "theme-toggle", type: "button", title: `Switch to ${next} theme`,
    onclick: () => { applyTheme(next); document.querySelector(".theme-toggle").replaceWith(themeToggle()); } },
    el("span", { class: "theme-toggle-icon" }, theme === "light" ? "☾" : "☀"));
}
applyTheme(theme);
document.getElementById("liveBadge").before(themeToggle());

const state = {
  session: null, title: "Khedma Flow — Reel",
  images: [],           // {name}
  voice: "",            // uploaded audio name
  script: "",
  duration: 16,
  avatar: true,
};

async function ensureSession() {
  if (state.session) return state.session;
  state.session = (await (await fetch("/api/studio/session", { method: "POST" })).json()).session;
  return state.session;
}
async function upload(file) {
  await ensureSession();
  const r = await fetch(`/api/studio/upload?session=${encodeURIComponent(state.session)}&name=${encodeURIComponent(file.name)}`, { method: "POST", body: file });
  if (!r.ok) throw new Error("upload failed");
  return (await r.json()).name;
}
const field = (lab, ctrl, hint) => el("label", { class: "fld" }, el("span", { class: "lab" }, lab), ctrl, hint ? el("span", { class: "help" }, hint) : null);
const note = (t) => el("p", { class: "panel-note" }, t);

function render() {
  const root = document.getElementById("builder");
  root.innerHTML = "";

  // 1. screenshots
  const p1 = el("div", { class: "panel" });
  p1.append(el("div", { class: "phead" }, el("span", { class: "num" }, "1"), el("h2", {}, "App screenshots"),
    el("span", { class: "phead sub" }, "your real screens, in order")));
  p1.append(note("Drop clean screenshots of your Khedma Flow app. Each one becomes a realistic “person using the app” shot (POV, finger tapping). Order = the order you drop them."));
  const dz = el("div", { class: "dropzone" }, el("div", { class: "big" }, "⇪  DROP SCREENSHOTS"), el("div", { class: "small" }, "PNG / JPG — or click to browse"));
  const input = el("input", { type: "file", multiple: "multiple", accept: "image/*", style: "display:none" });
  dz.onclick = () => input.click();
  input.onchange = () => addImgs([...input.files]);
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add("drag"); };
  dz.ondragleave = () => dz.classList.remove("drag");
  dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove("drag"); addImgs([...e.dataTransfer.files]); };
  p1.append(dz, input);
  const tray = el("div", { class: "tray" });
  state.images.forEach((m, i) => {
    const chip = el("div", { class: "media-chip image" },
      el("img", { src: `/api/studio/preview?session=${encodeURIComponent(state.session)}&name=${encodeURIComponent(m.name)}`, onerror: (e) => e.target.remove() }),
      el("span", { class: "kind" }, `#${i + 1}`),
      el("span", { class: "fn", title: m.name }, m.name));
    tray.append(chip);
  });
  p1.append(tray);
  root.append(p1);

  // 2. voice
  const p2 = el("div", { class: "panel" });
  p2.append(el("div", { class: "phead" }, el("span", { class: "num" }, "2"), el("h2", {}, "Voice"),
    el("span", { class: "phead sub" }, "the narration")));
  p2.append(note("Upload your voiceover recording (Darija/Arabic/any language). It becomes the audio of the reel and sets the pacing. Script→auto-voice needs an ElevenLabs key — add it later to skip recording."));
  const vin = el("input", { type: "file", accept: "audio/*", style: "display:none" });
  const vbtn = el("button", { class: "pill-btn", onclick: () => vin.click() }, state.voice ? `♪ ${state.voice}` : "＋ Upload voice (.mp3/.wav)");
  vin.onchange = async () => { if (vin.files[0]) { state.voice = await upload(vin.files[0]); render(); } };
  p2.append(vbtn, vin);
  p2.append(field("Script (optional — for reference / future auto-voice)", el("textarea", { placeholder: "Habes, habes! Mazal masiyitch Khedma Flow?…", oninput: (e) => { state.script = e.target.value; } }, state.script),
    "Stored with the project. Auto-generates the voice once an ElevenLabs key is added."));
  root.append(p2);

  // 3. settings
  const p3 = el("div", { class: "panel" });
  p3.append(el("div", { class: "phead" }, el("span", { class: "num" }, "3"), el("h2", {}, "Settings")));
  p3.append(el("div", { class: "row" },
    field("Title", el("input", { type: "text", value: state.title, oninput: (e) => { state.title = e.target.value; } })),
    field("Duration (seconds)", el("input", { type: "number", min: "6", max: "60", value: state.duration, oninput: (e) => { state.duration = parseInt(e.target.value) || 16; } }),
      "Total length. Split evenly across the presenter + your screenshots."),
  ));
  p3.append(field("Presenter hook", el("div", { class: "seg" },
    el("button", { type: "button", class: state.avatar ? "on" : "", onclick: () => { state.avatar = true; render(); } }, "on"),
    el("button", { type: "button", class: !state.avatar ? "on" : "", onclick: () => { state.avatar = false; render(); } }, "off")),
    "Adds a realistic presenter talking to camera as the opening hook, then cuts to the app demo. (Lips won't perfectly match Darija without a HeyGen key.)"));
  root.append(p3);

  // generate
  const g = el("div", { class: "gen-bar" });
  g.append(note("Generating runs Veo for the presenter + one shot per screenshot (~1–2 min each, ~$0.10/sec), then edits it to your duration with your voice. No subtitles."));
  const btn = el("button", { class: "btn-generate", id: "genBtn", onclick: onGenerate }, "◉  Generate Reel");
  const prog = el("div", { class: "progress", id: "prog" }, el("div", { class: "bar" }, el("i", { id: "progBar" })), el("div", { class: "msg", id: "progMsg" }), el("div", { class: "warns", id: "progWarns" }));
  const res = el("div", { class: "result", id: "result" });
  g.append(btn, prog, res);
  root.append(g);
  syncBtn();
}
async function addImgs(files) { for (const f of files) { try { const n = await upload(f); state.images.push({ name: n }); } catch (e) {} } render(); }
function syncBtn() { const b = document.getElementById("genBtn"); if (b) b.disabled = !(state.images.length && state.voice); }

function spec() {
  return {
    session: state.session, title: state.title, format: "9:16", duration: state.duration,
    mode: "khedma_real", avatar: state.avatar, script: state.script,
    voiceover: { source: "upload", file: state.voice },
    segments: state.images.map((m) => ({ type: "media", file: m.name })),
  };
}

async function onGenerate() {
  const btn = document.getElementById("genBtn"); btn.disabled = true;
  const prog = document.getElementById("prog"), bar = document.getElementById("progBar"), msg = document.getElementById("progMsg"), warns = document.getElementById("progWarns"), result = document.getElementById("result");
  result.className = "result"; result.innerHTML = ""; warns.innerHTML = "";
  prog.className = "progress show"; msg.className = "msg"; msg.textContent = "Submitting…"; bar.style.width = "3%";
  try {
    const r = await fetch("/api/studio/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(spec()) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || "failed");
    poll(data.job_id, data.project_id, { bar, msg, warns, result, btn });
  } catch (e) { msg.className = "msg err"; msg.textContent = "✕ " + e.message; btn.disabled = false; }
}
function poll(jobId, projectId, ui) {
  const tick = async () => {
    let j; try { j = await getJSON(`/api/studio/job/${jobId}`); } catch { setTimeout(tick, 1600); return; }
    ui.bar.style.width = `${j.progress || 0}%`;
    ui.msg.className = "msg"; ui.msg.textContent = `${j.message || j.status}${j.progress ? " · " + j.progress + "%" : ""}`;
    ui.warns.innerHTML = ""; (j.log || []).filter((l) => l.startsWith("⚠")).forEach((l) => ui.warns.append(el("div", { class: "warn-line" }, l)));
    if (j.status === "done") {
      ui.msg.className = "msg ok"; ui.msg.textContent = "✓ Done";
      ui.result.className = "result show";
      ui.result.append(el("video", { src: j.output_url, controls: "controls", playsinline: "playsinline" }),
        el("div", { style: "margin-top:10px" }, el("a", { class: "nav-link", href: `/p/${projectId}` }, "Open on the board ▸")));
      ui.btn.disabled = false; return;
    }
    if (j.status === "error") { ui.msg.className = "msg err"; ui.msg.textContent = "✕ " + (j.error || "failed"); ui.btn.disabled = false; return; }
    setTimeout(tick, 1600);
  };
  tick();
}

function howto() {
  const box = document.getElementById("howto");
  const steps = [
    ["1", "Drop your app screenshots", "Real screens only — they stay faithful."],
    ["2", "Upload your voiceover", "Your recording sets the language + pacing."],
    ["3", "Set the duration", "e.g. 16s. Split across the shots."],
    ["4", "Generate", "Presenter hook + POV finger-tapping app demo, edited to your voice, no subtitles."],
  ];
  box.innerHTML = "";
  for (const [n, t, d] of steps) {
    box.append(el("div", { class: "cap-row" }, el("div", { class: "top" }, el("span", { class: "name" }, `${n} · ${t}`)), el("div", { class: "help" }, d)));
  }
  box.append(el("div", { class: "setup-note" }, "Best results: add ELEVENLABS_API_KEY (script→voice) and HEYGEN_API_KEY (lip-synced avatar)."));
}

async function init() { await ensureSession(); render(); howto(); }
init();
