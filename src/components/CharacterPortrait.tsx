// Illustrated character portraits (real images generated via Stitch, background
// removed with rembg — see public/campeones/) — deliberately stylized digital
// illustration, not a photorealistic likeness of a real person. Falls back to
// nothing gracefully if an image is ever missing since the browser just shows
// the colored circle behind it.
export type PortraitVariant =
  | "judit-child" | "zsofia" | "laszlo" | "karoly"
  | "eszter" | "nagy" | "rival-internacional" | "drimer"
  | "larisa" | "varga" | "suarez" | "petrov" | "halasz" | "ivanov";

const IMAGE_SRC: Record<PortraitVariant, string> = {
  "judit-child": "/campeones/judit.png",
  "zsofia": "/campeones/zsofia.png",
  "laszlo": "/campeones/laszlo.png",
  "karoly": "/campeones/karoly.png",
  "eszter": "/campeones/eszter.png",
  "nagy": "/campeones/nagy.png",
  "rival-internacional": "/campeones/rival-internacional.png",
  "drimer": "/campeones/drimer.png",
  "larisa": "/campeones/larisa.png",
  "varga": "/campeones/varga.png",
  "suarez": "/campeones/suarez.png",
  "petrov": "/campeones/petrov.png",
  "halasz": "/campeones/halasz.png",
  "ivanov": "/campeones/ivanov.png",
};

const ALT_TEXT: Record<PortraitVariant, string> = {
  "judit-child": "Judit de niña",
  "zsofia": "Zsófia",
  "laszlo": "László",
  "karoly": "Károly",
  "eszter": "Eszter",
  "nagy": "Sr. Nagy",
  "rival-internacional": "Rival internacional",
  "drimer": "GM Dolfi Drimer",
  "larisa": "Larisa",
  "varga": "GM Varga",
  "suarez": "GM Suárez",
  "petrov": "GM Petrov",
  "halasz": "GM Halász",
  "ivanov": "GM Ivanov",
};

export function CharacterPortrait({
  variant, bgColor, size = 44, idle = false,
}: {
  variant: PortraitVariant;
  bgColor: string;
  size?: number;
  // A slow, subtle breathing loop — the difference between a character and
  // a static sticker. Off by default (e.g. the roster/select screens want a
  // still badge); the dialogue box turns it on for whoever's talking.
  idle?: boolean;
}) {
  return (
    <div
      className={`relative flex items-center justify-center rounded-full shrink-0 overflow-hidden ${idle ? "bv-portrait-idle" : ""}`}
      style={{
        width: size, height: size,
        background: bgColor,
        boxShadow: "inset 0 1px 1.5px rgba(255,255,255,.3), inset 0 -4px 8px rgba(0,0,0,.25), 0 3px 10px rgba(0,0,0,.2)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- small, fixed local asset; next/image's overhead isn't worth it here */}
      <img
        src={IMAGE_SRC[variant]}
        alt={ALT_TEXT[variant]}
        width={size}
        height={size}
        className="w-full h-full object-cover"
        style={{ objectPosition: "center 30%" }}
      />
    </div>
  );
}
