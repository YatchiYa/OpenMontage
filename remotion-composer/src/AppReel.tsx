import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// A fluid "app manipulation" reel: a phone frame whose screen navigates
// between REAL app screenshots with spring push-transitions, in-screen
// scrolling, and tap ripples — so it reads like someone actually using the
// app, not a slideshow. Only the supplied screens are ever shown.

function resolveAsset(src: string): string {
  if (/^(https?:|data:|file:)/.test(src)) return src.replace(/^file:\/\/\/?/, (m) => (m.length > 7 ? "file:///" : "file://"));
  const clean = src.replace(/^\/+/, "");
  if (src.startsWith("/")) return `file://${src}`;
  return staticFile(clean);
}

export interface AppReelSegment {
  src: string;
  in_seconds: number;
  out_seconds: number;
  caption?: string;
  sub?: string;
  tab?: number;        // 0..4 which bottom-nav tab the "tap" lands on
  accent?: string;     // caption accent color
}
export interface AppReelProps {
  [key: string]: unknown;
  segments: AppReelSegment[];
  narration?: string;
  music?: string;
  brand?: string;
}

const VIOLET = "#a78bfa";
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

export const AppReel: React.FC<AppReelProps> = (props) => {
  const segments = props.segments || [];
  const brand = props.brand || "KHEDMA FLOW";
  const { fps, width, height } = useVideoConfig();
  const frame = useCurrentFrame();
  const t = frame / fps;

  // ---- phone geometry ----
  const screenW = 590;
  const screenH = 1226;
  const bezel = 15;
  const chinTop = 20;
  const chinBottom = 30;
  const phoneW = screenW + bezel * 2;
  const phoneH = screenH + chinTop + chinBottom;
  const phoneX = (width - phoneW) / 2;
  const phoneY = 236;
  const screenX = phoneX + bezel;
  const screenY = phoneY + chinTop;

  const TRANS = 0.55; // seconds of push transition at each beat start

  // continuous carousel index
  let idx = 0;
  for (let k = 0; k < segments.length; k++) {
    const s = segments[k];
    if (t >= s.in_seconds) {
      const p = Math.min(1, Math.max(0, (t - s.in_seconds) / TRANS));
      idx = k === 0 ? 0 : (k - 1) + easeInOut(p);
    }
  }

  // active beat (for caption + tap)
  let active = 0;
  for (let k = 0; k < segments.length; k++) if (t >= segments[k].in_seconds) active = k;
  const cur = segments[active];

  // ---- background ----
  const bg = (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(180deg,#3a1e72 0%,#241150 45%,#160a30 100%)" }} />
      <AbsoluteFill style={{
        background: "radial-gradient(760px 620px at 50% 34%, rgba(124,58,217,.55), transparent 70%)",
      }} />
    </AbsoluteFill>
  );

  // ---- brand wordmark (top) ----
  const brandOpacity = interpolate(t, [0, 0.6], [0, 1], { extrapolateRight: "clamp" });
  const brandEl = (
    <div style={{
      position: "absolute", top: 116, left: 0, width, textAlign: "center",
      opacity: brandOpacity, display: "flex", justifyContent: "center", alignItems: "center", gap: 14,
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14, background: "#7c3ad9",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontFamily: "Space Grotesk, Inter, sans-serif", fontWeight: 700, fontSize: 30,
      }}>K</div>
      <span style={{
        color: "#e9e0ff", fontFamily: "Space Grotesk, Inter, sans-serif",
        fontWeight: 700, letterSpacing: 4, fontSize: 26,
      }}>{brand}</span>
    </div>
  );

  // ---- screens (clipped INSIDE the phone so transitions read as in-app navigation) ----
  const screenInner = segments.map((s, j) => {
    const dx = (j - idx) * screenW;               // slide within the clip
    if (Math.abs(j - idx) > 1.05) return null;

    // in-screen scroll + zoom based on how long this screen has been active
    const local = interpolate(t, [s.in_seconds, s.out_seconds], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const zoom = 1.05 + easeInOut(local) * 0.10;
    const scroll = interpolate(easeInOut(local), [0, 1], [80, -110]);

    return (
      <div key={j} style={{
        position: "absolute", left: 0, top: 0, width: screenW, height: screenH,
        overflow: "hidden", transform: `translateX(${dx}px)`, background: "#0f0a1e",
      }}>
        <Img src={resolveAsset(s.src)} style={{
          position: "absolute", left: "50%", top: "50%", width: screenW,
          transform: `translate(-50%,-50%) translateY(${scroll}px) scale(${zoom})`,
          willChange: "transform",
        }} />
      </div>
    );
  });
  const screens = (
    <div style={{
      position: "absolute", left: screenX, top: screenY, width: screenW, height: screenH,
      overflow: "hidden", borderRadius: 32,
      boxShadow: "inset 0 40px 60px -46px rgba(0,0,0,.4), inset 0 -60px 70px -46px rgba(0,0,0,.45)",
    }}>
      {screenInner}
    </div>
  );

  // ---- tap ripple at each transition ----
  const ripples = segments.map((s, k) => {
    if (k === 0) return null;
    const dt = t - s.in_seconds;
    if (dt < -0.15 || dt > 0.6) return null;
    const p = interpolate(dt, [-0.05, 0.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const tab = s.tab ?? (k % 5);
    const cx = screenX + screenW * (0.5 + (tab - 2) * 0.2);
    const cy = screenY + screenH * 0.945;
    const r = 8 + p * 46;
    const op = (1 - p) * 0.7;
    return (
      <div key={"r" + k}>
        <div style={{
          position: "absolute", left: cx - r, top: cy - r, width: r * 2, height: r * 2,
          borderRadius: "50%", border: "3px solid rgba(255,255,255,.9)", opacity: op,
        }} />
        <div style={{
          position: "absolute", left: cx - 9, top: cy - 9, width: 18, height: 18,
          borderRadius: "50%", background: "rgba(255,255,255,.92)",
          opacity: interpolate(dt, [-0.05, 0.15, 0.45], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }} />
      </div>
    );
  });

  // ---- caption chip (below phone) ----
  const capStart = cur.in_seconds;
  const capSpring = spring({ frame: (t - capStart) * fps, fps, config: { damping: 16, stiffness: 130 } });
  const accent = cur.accent || VIOLET;
  const caption = cur.caption ? (
    <div style={{
      position: "absolute", top: phoneY + phoneH + 42, left: 0, width, textAlign: "center",
      opacity: Math.max(0, capSpring), transform: `translateY(${interpolate(capSpring, [0, 1], [24, 0])}px)`,
    }}>
      <div style={{ width: 54, height: 5, borderRadius: 3, background: accent, margin: "0 auto 18px" }} />
      <div style={{
        color: "#fff", fontFamily: "Space Grotesk, Inter, sans-serif", fontWeight: 700,
        fontSize: cur.caption.length > 15 ? 60 : 74, lineHeight: 1.05, letterSpacing: -0.5,
      }}>{cur.caption}</div>
      {cur.sub ? (
        <div style={{ color: "#c9bff0", fontFamily: "Inter, sans-serif", fontSize: 34, marginTop: 12 }}>{cur.sub}</div>
      ) : null}
    </div>
  ) : null;

  // phone bezel
  const phone = (
    <div style={{
      position: "absolute", left: phoneX, top: phoneY, width: phoneW, height: phoneH,
      borderRadius: 52, background: "linear-gradient(160deg,#2a2440,#0d0a18)",
      boxShadow: "0 40px 90px -30px rgba(0,0,0,.75), inset 0 0 0 2px rgba(255,255,255,.06)",
    }}>
      <div style={{
        position: "absolute", left: bezel, top: chinTop, width: screenW, height: screenH,
        borderRadius: 32, overflow: "hidden", background: "#0f0a1e",
      }} />
      {/* speaker notch */}
      <div style={{
        position: "absolute", left: "50%", top: 9, width: 96, height: 7, borderRadius: 5,
        transform: "translateX(-50%)", background: "rgba(255,255,255,.12)",
      }} />
    </div>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#160a30" }}>
      {bg}
      {brandEl}
      {phone}
      {screens}
      {ripples}
      {caption}
      {props.narration ? <Audio src={resolveAsset(props.narration)} /> : null}
      {props.music ? <Audio src={resolveAsset(props.music)} volume={0.12} /> : null}
    </AbsoluteFill>
  );
};
