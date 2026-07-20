// The training-mode FAB in the bottom nav — a FLAT navy token with the knight
// glyph, matching the app's flat neofuturism. Was a glossy, lacquered dome
// (radial gradient + gloss highlight + inset shadows); that 3D treatment was
// the last glossy holdout in the chrome, so it's gone now. Keeps one soft
// drop shadow ONLY because this button genuinely floats above the nav bar
// (it's pulled up with -mt-5) and needs that separation to read as elevated —
// elevation is real here, it isn't decorative depth.
export function KnightBadge({ active = false }: { active?: boolean }) {
  const size = 60;
  return (
    <div
      className="relative flex items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: "var(--bv-purple)",
        boxShadow: active
          ? "0 6px 16px oklch(0.30 0.09 264 / 0.45)"
          : "0 4px 12px oklch(0.30 0.09 264 / 0.32)",
      }}
    >
      <svg viewBox="0 0 45 45" width={size * 0.52} height={size * 0.52} aria-hidden>
        <g fill="#fff">
          <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
          <path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" />
        </g>
        <path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0z" fill="var(--bv-purple)" opacity=".55" />
      </svg>
      {active && (
        <span className="absolute -bottom-1 w-1.5 h-1.5 rounded-full" style={{ background: "#fff" }} />
      )}
    </div>
  );
}
