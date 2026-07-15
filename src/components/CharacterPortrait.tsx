// Simple, flat-illustration character busts — hand-drawn SVG shapes (same
// technique as KnightBadge/the board's piece set), not a photorealistic or
// AI-generated likeness of a real person. Each variant is a distinct,
// recognizable "game character" silhouette (hair, simple face, collar) —
// enough personality to not read as "a circle with initials", while staying
// clearly a stylized illustration, not a portrait of anyone real.
export type PortraitVariant = "judit-child" | "zsofia" | "laszlo";

const VARIANTS: Record<PortraitVariant, {
  skin: string; hair: string; hairStyle: "bob" | "ponytail" | "short-side";
  collar: string; accessory?: "mustache" | "glasses";
}> = {
  "judit-child": { skin: "#f0c8a0", hair: "#3b2415", hairStyle: "bob", collar: "#d6524a" },
  "zsofia":      { skin: "#f0c8a0", hair: "#5a3820", hairStyle: "ponytail", collar: "#4a7fb5" },
  "laszlo":      { skin: "#e8b890", hair: "#2b2b2b", hairStyle: "short-side", collar: "#5a5a5a", accessory: "mustache" },
};

export function CharacterPortrait({
  variant, bgColor, size = 44,
}: {
  variant: PortraitVariant;
  bgColor: string;
  size?: number;
}) {
  const v = VARIANTS[variant];
  return (
    <div
      className="relative flex items-center justify-center rounded-full shrink-0 overflow-hidden"
      style={{
        width: size, height: size,
        background: bgColor,
        boxShadow: "inset 0 1px 1.5px rgba(255,255,255,.3), inset 0 -4px 8px rgba(0,0,0,.25), 0 3px 10px rgba(0,0,0,.2)",
      }}
    >
      <svg viewBox="0 0 64 64" width={size * 0.86} height={size * 0.86} aria-hidden>
        {/* collar / shoulders */}
        <path d="M6 62 Q32 46 58 62 L58 66 L6 66 Z" fill={v.collar} />
        {/* neck */}
        <rect x="26" y="40" width="12" height="12" rx="4" fill={v.skin} />
        {/* hair behind the face (for ponytail/side-parted styles) */}
        {v.hairStyle === "ponytail" && <path d="M46 22 Q56 30 50 46 L44 44 Q48 30 40 22 Z" fill={v.hair} />}
        {/* face */}
        <ellipse cx="32" cy="28" rx="16" ry="17" fill={v.skin} />
        {/* hair front */}
        {v.hairStyle === "bob" && (
          <path d="M14 28 Q13 8 32 8 Q51 8 50 28 Q50 16 32 16 Q14 16 14 28 Z M14 27 Q13 34 16 40 L20 38 Q16 32 17 25 Z M50 27 Q51 34 48 40 L44 38 Q48 32 47 25 Z" fill={v.hair} />
        )}
        {v.hairStyle === "ponytail" && (
          <path d="M14 26 Q13 7 32 7 Q51 7 50 26 Q49 14 32 14 Q15 14 14 26 Z" fill={v.hair} />
        )}
        {v.hairStyle === "short-side" && (
          <path d="M14 26 Q13 8 32 8 Q51 8 50 26 L47 26 Q46 14 32 14 Q18 14 17 26 Z" fill={v.hair} />
        )}
        {/* eyes */}
        <circle cx="25" cy="29" r="2.4" fill="#2b2b2b" />
        <circle cx="39" cy="29" r="2.4" fill="#2b2b2b" />
        {/* mustache (László) */}
        {v.accessory === "mustache" && <path d="M24 37 Q32 41 40 37 Q32 40 24 37 Z" fill={v.hair} />}
        {/* smile */}
        <path d="M25 36 Q32 41 39 36" stroke="#8a4a3a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}
