// Illustrated character portraits (real images generated via Stitch, background
// removed with rembg — see public/campeones/) — deliberately stylized digital
// illustration, not a photorealistic likeness of a real person. Falls back to
// nothing gracefully if an image is ever missing since the browser just shows
// the colored circle behind it.
export type PortraitVariant =
  | "judit-child" | "judit-teen" | "judit-adulta" | "judit-victoria" | "judit-derrota"
  | "zsofia" | "zsofia-guino" | "zsofia-sorpresa"
  | "laszlo" | "laszlo-orgulloso" | "laszlo-pensativo"
  | "karoly" | "karoly-sorpresa" | "karoly-satisfecho"
  | "eszter" | "eszter-sorpresa" | "eszter-satisfecho"
  | "nagy" | "nagy-sorpresa" | "nagy-satisfecho"
  | "maestro" | "maestro-sorpresa" | "maestro-satisfecho"
  | "rival-internacional" | "rival-internacional-sorpresa" | "rival-internacional-satisfecho"
  | "drimer" | "drimer-sorpresa" | "drimer-satisfecho"
  | "larisa" | "larisa-sorpresa" | "larisa-satisfecho"
  | "varga" | "varga-sorpresa" | "varga-satisfecho"
  | "suarez" | "suarez-sorpresa" | "suarez-satisfecho"
  | "petrov" | "petrov-sorpresa" | "petrov-satisfecho"
  | "halasz" | "halasz-sorpresa" | "halasz-satisfecho"
  | "ivanov"
  | "karpov" | "kasparov";

const IMAGE_SRC: Record<PortraitVariant, string> = {
  "judit-child": "/campeones/judit.webp",
  "judit-teen": "/campeones/judit-teen.webp",
  "judit-adulta": "/campeones/judit-adulta.webp",
  "judit-victoria": "/campeones/judit-victoria.webp",
  "judit-derrota": "/campeones/judit-derrota.webp",
  "zsofia": "/campeones/zsofia.webp",
  "zsofia-guino": "/campeones/zsofia-guino.webp",
  "zsofia-sorpresa": "/campeones/zsofia-sorpresa.webp",
  "laszlo": "/campeones/laszlo.webp",
  "laszlo-orgulloso": "/campeones/laszlo-orgulloso.webp",
  "laszlo-pensativo": "/campeones/laszlo-pensativo.webp",
  "karoly": "/campeones/karoly.webp",
  "karoly-sorpresa": "/campeones/karoly-sorpresa.webp",
  "karoly-satisfecho": "/campeones/karoly-satisfecho.webp",
  "eszter": "/campeones/eszter.webp",
  "eszter-sorpresa": "/campeones/eszter-sorpresa.webp",
  "eszter-satisfecho": "/campeones/eszter-satisfecho.webp",
  "nagy": "/campeones/nagy.webp",
  "nagy-sorpresa": "/campeones/nagy-sorpresa.webp",
  "nagy-satisfecho": "/campeones/nagy-satisfecho.webp",
  "maestro": "/campeones/maestro.webp",
  "maestro-sorpresa": "/campeones/maestro-sorpresa.webp",
  "maestro-satisfecho": "/campeones/maestro-satisfecho.webp",
  "rival-internacional": "/campeones/rival-internacional.webp",
  "rival-internacional-sorpresa": "/campeones/rival-internacional-sorpresa.webp",
  "rival-internacional-satisfecho": "/campeones/rival-internacional-satisfecho.webp",
  "drimer": "/campeones/drimer.webp",
  "drimer-sorpresa": "/campeones/drimer-sorpresa.webp",
  "drimer-satisfecho": "/campeones/drimer-satisfecho.webp",
  "larisa": "/campeones/larisa.webp",
  "larisa-sorpresa": "/campeones/larisa-sorpresa.webp",
  "larisa-satisfecho": "/campeones/larisa-satisfecho.webp",
  "varga": "/campeones/varga.webp",
  "varga-sorpresa": "/campeones/varga-sorpresa.webp",
  "varga-satisfecho": "/campeones/varga-satisfecho.webp",
  "suarez": "/campeones/suarez.webp",
  "suarez-sorpresa": "/campeones/suarez-sorpresa.webp",
  "suarez-satisfecho": "/campeones/suarez-satisfecho.webp",
  "petrov": "/campeones/petrov.webp",
  "petrov-sorpresa": "/campeones/petrov-sorpresa.webp",
  "petrov-satisfecho": "/campeones/petrov-satisfecho.webp",
  "halasz": "/campeones/halasz.webp",
  "halasz-sorpresa": "/campeones/halasz-sorpresa.webp",
  "halasz-satisfecho": "/campeones/halasz-satisfecho.webp",
  "ivanov": "/campeones/ivanov.webp",
  "karpov": "/campeones/karpov.webp",
  "kasparov": "/campeones/kasparov.webp",
};

const ALT_TEXT: Record<PortraitVariant, string> = {
  "judit-child": "Judit de niña",
  "judit-teen": "Judit adolescente",
  "judit-adulta": "Judit adulta, Gran Maestra",
  "judit-victoria": "Judit celebrando la victoria",
  "judit-derrota": "Judit frustrada tras la derrota",
  "zsofia": "Zsófia",
  "zsofia-guino": "Zsófia, guiño confiado",
  "zsofia-sorpresa": "Zsófia, sorprendida",
  "laszlo": "László",
  "laszlo-orgulloso": "László, orgulloso",
  "laszlo-pensativo": "László, pensativo",
  "karoly": "Károly",
  "karoly-sorpresa": "Károly, sorprendido tras perder",
  "karoly-satisfecho": "Károly, satisfecho tras ganar",
  "eszter": "Eszter",
  "eszter-sorpresa": "Eszter, sorprendida tras perder",
  "eszter-satisfecho": "Eszter, satisfecha tras ganar",
  "nagy": "Nagy",
  "nagy-sorpresa": "Nagy, sorprendido tras perder",
  "nagy-satisfecho": "Nagy, satisfecho tras ganar",
  "maestro": "Maestro de club",
  "maestro-sorpresa": "El Maestro, sorprendido tras perder",
  "maestro-satisfecho": "El Maestro, satisfecho tras ganar",
  "rival-internacional": "Rival internacional",
  "rival-internacional-sorpresa": "Rival internacional, sorprendido tras perder",
  "rival-internacional-satisfecho": "Rival internacional, satisfecho tras ganar",
  "drimer": "GM Dolfi Drimer",
  "drimer-sorpresa": "GM Drimer, sorprendido tras perder",
  "drimer-satisfecho": "GM Drimer, satisfecho tras ganar",
  "larisa": "Larisa",
  "larisa-sorpresa": "Larisa, sorprendida tras perder",
  "larisa-satisfecho": "Larisa, satisfecha tras ganar",
  "varga": "GM Varga",
  "varga-sorpresa": "GM Varga, sorprendido tras perder",
  "varga-satisfecho": "GM Varga, satisfecho tras ganar",
  "suarez": "GM Suárez",
  "suarez-sorpresa": "GM Suárez, sorprendido tras perder",
  "suarez-satisfecho": "GM Suárez, satisfecho tras ganar",
  "petrov": "GM Petrov",
  "petrov-sorpresa": "GM Petrov, sorprendido tras perder",
  "petrov-satisfecho": "GM Petrov, satisfecho tras ganar",
  "halasz": "GM Halász",
  "halasz-sorpresa": "GM Halász, sorprendido tras perder",
  "halasz-satisfecho": "GM Halász, satisfecho tras ganar",
  "ivanov": "GM Ivanov",
  "karpov": "Anatoli Kárpov",
  "kasparov": "Garry Kaspárov",
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
