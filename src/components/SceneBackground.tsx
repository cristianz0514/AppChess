// A simple flat-illustration backdrop so the story feels like it's happening
// somewhere, not floating on a blank card. Deliberately muted/low-contrast
// (behind a translucent scrim) so foreground dialogue text stays the clear
// focus — decoration, not competition.
export type SceneVariant = "living-room";

export function SceneBackground({ variant }: { variant: SceneVariant }) {
  if (variant !== "living-room") return null;
  return (
    <svg
      viewBox="0 0 400 220"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 w-full h-full"
      aria-hidden
    >
      {/* wall */}
      <rect width="400" height="220" fill="oklch(0.32 0.03 60)" />
      {/* floor */}
      <rect y="170" width="400" height="50" fill="oklch(0.24 0.03 50)" />
      {/* window */}
      <rect x="30" y="30" width="90" height="110" rx="4" fill="oklch(0.5 0.08 230 / 0.55)" stroke="oklch(0.45 0.02 60)" strokeWidth="6" />
      <line x1="75" y1="30" x2="75" y2="140" stroke="oklch(0.45 0.02 60)" strokeWidth="4" />
      <line x1="30" y1="85" x2="120" y2="85" stroke="oklch(0.45 0.02 60)" strokeWidth="4" />
      {/* bookshelf */}
      <rect x="300" y="60" width="80" height="110" rx="2" fill="oklch(0.28 0.04 50)" stroke="oklch(0.22 0.03 50)" strokeWidth="2" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <line x1="300" y1={90 + i * 27} x2="380" y2={90 + i * 27} stroke="oklch(0.22 0.03 50)" strokeWidth="2" />
          <rect x={306 + i * 3} y={65 + i * 27} width="9" height="22" fill="oklch(0.55 0.12 40)" />
          <rect x={318 + i * 2} y={68 + i * 27} width="8" height="19" fill="oklch(0.5 0.14 20)" />
          <rect x={330} y={66 + i * 27} width="9" height="21" fill="oklch(0.6 0.1 90)" />
        </g>
      ))}
      {/* table with chessboard */}
      <rect x="150" y="150" width="110" height="8" rx="2" fill="oklch(0.4 0.06 50)" />
      <rect x="160" y="158" width="8" height="30" fill="oklch(0.35 0.05 50)" />
      <rect x="242" y="158" width="8" height="30" fill="oklch(0.35 0.05 50)" />
      <g transform="translate(170,120)">
        <rect width="70" height="30" rx="2" fill="oklch(0.9 0.01 90)" />
        {Array.from({ length: 8 }).map((_, i) => (
          <rect key={i} x={(i % 4) * 17.5} y={i < 4 ? 0 : 15} width="17.5" height="15"
            fill={(i + Math.floor(i / 4)) % 2 === 0 ? "oklch(0.9 0.01 90)" : "oklch(0.4 0.02 60)"} />
        ))}
      </g>
      {/* warm lamp glow */}
      <ellipse cx="200" cy="60" rx="140" ry="70" fill="oklch(0.75 0.1 70 / 0.12)" />
    </svg>
  );
}
