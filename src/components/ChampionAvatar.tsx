// Stylized/iconic avatar for "Nacimiento de un Campeón" — deliberately NOT a
// realistic portrait of a real person (initials + color + a chess glyph,
// same "game token" register as KnightBadge), since generating a lifelike
// likeness of a real, living public figure is a different, more sensitive
// thing than an abstract badge.
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
      className="relative flex items-center justify-center rounded-full shrink-0 select-none"
      style={{
        width: size, height: size,
        background: locked ? "oklch(0.5 0.01 265)" : color,
        boxShadow: "inset 0 1px 1.5px rgba(255,255,255,.3), inset 0 -4px 8px rgba(0,0,0,.3), 0 4px 14px rgba(0,0,0,.25)",
        opacity: locked ? 0.6 : 1,
      }}
    >
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: size * 0.6, height: size * 0.32, top: size * 0.1, left: size * 0.2,
          background: "linear-gradient(180deg, rgba(255,255,255,.4), rgba(255,255,255,0))",
          filter: "blur(0.5px)",
        }}
      />
      <span className="font-display font-bold" style={{ fontSize: size * 0.32, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.3)" }}>
        {initials}
      </span>
    </div>
  );
}
