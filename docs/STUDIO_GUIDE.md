# OpenMontage Studio — Creator Guide

Everything you need to make **UGC ads, viral reels, and product promos** with the
Studio (`/studio`). Pick a use case below, add the recommended API keys, drop your
assets, and hit **Generate**.

> **How the Studio works:** you build a **timeline** of segments — each segment is
> a *Media* clip, an *AI Image*, an *AI Video*, or an *Avatar/UGC* shot. On top you
> add a **voiceover** (upload or text‑to‑speech), **music**, **captions**, and
> **product‑placement** images. The Studio calls the real generators for each
> segment, then composes everything into one finished video that lands in your
> Library.

### ⏱️ How duration works (important)

The **Target duration** is the *total* length. It is **split across your
segments**: every segment left on **"auto"** gets an equal share, and any segment
where you type a specific **Duration** keeps exactly that. So 4 auto segments at a
30s target = ~7.5s each.

**Empty segments are skipped** — a *Media* segment with no file chosen, or an AI
segment with no prompt, is dropped (you'll get a warning). The remaining segments
then split the full target between them, so the final video still matches your
target. If your video came out shorter than expected, it's almost always because
some segments were empty and skipped — fill them in or remove them.

---

## 🔑 API keys — the fast track

You already have a **Google/Gemini key** (images, voice, and Gemini/Veo video).
Add the keys below in your `.env` file to unlock better results. **Restart the
board after editing `.env`** (`python -m backlot open`).

| You want… | Best key to add | Get it | Unlocks |
|---|---|---|---|
| **Talking‑head UGC creators** | `HEYGEN_API_KEY` | heygen.com | Realistic avatars/creators that speak your script (the core of UGC) |
| **Natural voiceover** | `ELEVENLABS_API_KEY` | elevenlabs.io | Best‑in‑class TTS voices + voice cloning + music/SFX |
| **Cinematic AI video clips** | `FAL_KEY` | fal.ai | Veo, Kling, Seedance, MiniMax, Luma — one key, many models |
| **Premium AI images** | `FAL_KEY` (FLUX) | fal.ai | FLUX images + Recraft (great for text/logos) |
| **Full songs / jingles** | `SUNO_API_KEY` | suno.com | Full background tracks in any genre |
| **Free stock footage** | `PEXELS_API_KEY` / `PIXABAY_API_KEY` | pexels.com / pixabay.com | Free b‑roll and images |
| **Runway Gen‑4 video** | `RUNWAY_API_KEY` | runwayml.com | Direct Runway video generation |

**Minimum viable setups:**

- **Cheapest (what you have now):** Google key → Imagen images, Google TTS voice,
  Gemini/Veo video, FFmpeg/Remotion composition. Enough to ship.
- **Recommended creator kit:** `HEYGEN_API_KEY` + `ELEVENLABS_API_KEY` + `FAL_KEY`.
  This covers avatars, natural voice, and cinematic clips — the trifecta for UGC + reels.
- **Add for music:** `SUNO_API_KEY` (or ElevenLabs music).

---

## 🎬 Use case 1 — UGC video (up to 2 min)

*Authentic, creator‑style ad: a person talks to camera about your product, mixed
with real product shots and b‑roll. Great for TikTok / Reels ads.*

**What you need**

- **`HEYGEN_API_KEY`** — for the talking creator (Avatar/UGC segments). *Required for a real face.*
- **`ELEVENLABS_API_KEY`** — natural voice for the creator/voiceover.
- A **product image** (drop it in Media, then add it under *Product placement*).
- Optional **`FAL_KEY`** — for cinematic b‑roll clips between the talking parts.

**Steps**

1. Open **`/ugc`** (loads the UGC preset).
2. Drop your **product image(s)** in *Media*; add them to *Product placement*.
3. In the **timeline**, write the creator's lines in each *Avatar/UGC* segment
   (hook → demo → result → CTA). Keep it conversational: "Okay, real talk…".
4. Set **Voiceover → script → tts** if you want a separate narrator, or let the
   avatar speak.
5. **Duration:** 30–120s. UGC does well at 40–90s.
6. Keep **Captions ON** — most UGC is watched on mute.
7. **Generate.**

**Pro tips**

- Hook in the **first 2 seconds** ("Wait for it…", "I did NOT expect this").
- Alternate **avatar talking** ↔ **product/b‑roll** every 3–5s to keep energy.
- Use the product image as the **reference** on AI Video segments for real placement.

---

## 🔥 Use case 2 — Viral reels (FB / Instagram / TikTok)

*Fast, punchy, scroll‑stopping short videos designed to be watched on mute and
shared.*

**What you need**

- **`FAL_KEY`** — dynamic AI video for the opening hook (Kling/Seedance/Veo).
- **`ELEVENLABS_API_KEY`** — energetic voiceover (optional but recommended).
- **`SUNO_API_KEY`** or a track in `music_library/` — trending‑style beat.
- Your own clips/images help authenticity — drop them in *Media*.

**Steps**

1. Open **`/reels`** (loads the Viral Reel preset).
2. **Format 9:16**, **duration 15–30s** (sweet spot for TikTok/Reels).
3. First segment = the **hook** (bold motion / a surprising line). Caption:
   "STOP scrolling".
4. Add 3–5 quick segments (media or AI) — one idea each, **≤4s**.
5. **Music → generate** ("energetic trending beat, no vocals") or pick a library track.
6. **Captions ON**, big and punchy.
7. End with a **follow / CTA** caption.
8. **Generate.**

**Platform notes**

- **All three platforms**: vertical **9:16**, captions burned in, loud first frame.
- **TikTok**: rawer/authentic wins — lean on real Media + avatar over polished AI.
- **Instagram Reels**: cleaner visuals; AI images/video look great here.
- **Facebook**: same 9:16 export works; slightly older audience → clearer captions.

---

## 🛍️ Use case 3 — Product promo

*Polished, branded promo from your product images/screenshots — clean motion,
voiceover, music. (This is exactly how the Khedma Flow promo was made.)*

**What you need**

- **Product images / screenshots** (drop in *Media*). No AI needed.
- **`ELEVENLABS_API_KEY`** *(or Google TTS you already have)* — voiceover.
- **`SUNO_API_KEY`** *(or a `music_library/` track)* — background music.
- Optional **`FAL_KEY`** — a hero AI shot for the open/close.

**Steps**

1. Open **`/promo`** (loads the Product Promo preset).
2. Drop your **product screenshots** in *Media*; add a *Media* segment for each,
   with a short **caption** per feature ("Devis & Factures", "100% Offline"…).
3. **Voiceover:** upload your own recording, or *script → tts*.
4. **Music:** generate or pick a library track (kept low under the voice).
5. **Motion:** `ken-burns` or `parallax` so it never feels like a static slideshow.
6. **Format 9:16** for social, **1:1** for feed, **16:9** for web/YouTube.
7. **Generate.**

**Pro tips**

- One clear **message per screen**; don't crowd captions.
- Match caption **language to your voiceover** (Latin text renders everywhere;
  Arabic needs a shaping font installed).
- End on a **CTA card** (store badges, website, "Get it now").

---

## 🎛️ Reference — every feature in the Studio

| Feature | What it does | Needs |
|---|---|---|
| **Media** | Upload images / video / audio and use them directly | nothing |
| **AI Image** | Generate a still from a prompt | Google (have) / `FAL_KEY` / `OPENAI_API_KEY` |
| **AI Video** | Generate a motion clip from a prompt (+ product reference) | Google (have) / `FAL_KEY` / `RUNWAY_API_KEY` |
| **Avatar / UGC** | A creator/avatar speaks your script | `HEYGEN_API_KEY` |
| **Voiceover** | Upload audio, or text → speech | `ELEVENLABS_API_KEY` / Google (have) |
| **Music** | Upload, pick from library, or generate | `SUNO_API_KEY` / Google (have) / `music_library/` |
| **Captions** | Burned‑in on‑screen text | nothing |
| **Product placement** | Use product images as references in AI shots | nothing |
| **Formats** | 9:16, 1:1, 16:9, 4:5 | nothing |
| **Runtimes** | Remotion, HyperFrames, FFmpeg | Node ≥ 22 for HyperFrames (you have it) |

The **Your Capabilities** panel (right side of the Studio) always shows what's
configured right now — green = ready, and it tells you the exact env var to add
for anything that's missing.
