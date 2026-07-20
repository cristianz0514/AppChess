// Champion token for "Nacimiento de un Campeón" — a FLAT geometric badge
// (solid fill, condensed initials), matching the rest of the app's flat
// neofuturism. Was a glossy 3D domed token with radial gradients + inset
// shadows, which read as a different visual world from the flat coach-tool
// pages; that gloss is gone now so the mode sits in one system with everything
// else. Deliberately NOT a realistic portrait of a real person — initials +
// color, an abstract badge.
export function ChampionAvatar({
  initials, color, size = 72, locked = false,
}: {
  initials: string;
  color: string;
  size?: number;
  locked?: boolean;
}) {
  return (
    <div
      className="relative flex items-center justify-center shrink-0 select-none rounded-full"
      style={{
        width: size,
        height: size,
        background: locked ? "oklch(0.62 0.01 265)" : color,
        opacity: locked ? 0.6 : 1,
      }}
    >
      <span
        className="font-deco leading-none"
        style={{ fontSize: size * 0.36, color: "#fff" }}
      >
        {initials}
      </span>
    </div>
  );
}
