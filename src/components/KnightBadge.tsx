// A bespoke "game token" badge for the Practica el Mate entry point — NOT the
// board piece set (that's designed for light/dark squares, with a heavy dark
// outline for contrast; on a solid color button that reads as "pasted on").
// This is a flat, single-color knight silhouette on a lacquered, domed token —
// closer to a boardgame counter or app glyph than an in-game piece.
export function KnightBadge({ active = false }: { active?: boolean }) {
  const size = 60;
  return (
    <div
      className="relative flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle at 32% 28%, oklch(0.56 0.24 288), oklch(0.42 0.20 288) 78%)",
        boxShadow: active
          ? "0 5px 18px oklch(0.42 0.20 288 / 0.55), inset 0 1px 1.5px rgba(255,255,255,.35), inset 0 -3px 6px rgba(0,0,0,.28)"
          : "0 4px 14px oklch(0.42 0.20 288 / 0.4), inset 0 1px 1.5px rgba(255,255,255,.3), inset 0 -3px 6px rgba(0,0,0,.25)",
      }}
    >
      {/* Gloss highlight — reads as a domed, lacquered token rather than a flat sticker. */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: size * 0.62, height: size * 0.34, top: size * 0.1, left: size * 0.19,
          background: "linear-gradient(180deg, rgba(255,255,255,.42), rgba(255,255,255,0))",
          filter: "blur(0.5px)",
        }}
      />
      <svg viewBox="0 0 45 45" width={size * 0.52} height={size * 0.52} style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,.3))" }} aria-hidden>
        <g fill="#fff">
          <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
          <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" />
        </g>
        <path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z" fill="oklch(0.42 0.20 288)" opacity=".55" />
      </svg>
      {active && (
        <span className="absolute -bottom-1 w-1.5 h-1.5 rounded-full" style={{ background: "#fff" }} />
      )}
    </div>
  );
}
