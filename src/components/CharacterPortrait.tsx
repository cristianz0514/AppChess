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
  "judit-child": "/campeones/judit.png",
  "judit-teen": "/campeones/judit-teen.png",
  "judit-adulta": "/campeones/judit-adulta.png",
  "judit-victoria": "/campeones/judit-victoria.png",
  "judit-derrota": "/campeones/judit-derrota.png",
  "zsofia": "/campeones/zsofia.png",
  "zsofia-guino": "/campeones/zsofia-guino.png",
  "zsofia-sorpresa": "/campeones/zsofia-sorpresa.png",
  "laszlo": "/campeones/laszlo.png",
  "laszlo-orgulloso": "/campeones/laszlo-orgulloso.png",
  "laszlo-pensativo": "/campeones/laszlo-pensativo.png",
  "karoly": "/campeones/karoly.png",
  "karoly-sorpresa": "/campeones/karoly-sorpresa.png",
  "karoly-satisfecho": "/campeones/karoly-satisfecho.png",
  "eszter": "/campeones/eszter.png",
  "eszter-sorpresa": "/campeones/eszter-sorpresa.png",
  "eszter-satisfecho": "/campeones/eszter-satisfecho.png",
  "nagy": "/campeones/nagy.png",
  "nagy-sorpresa": "/campeones/nagy-sorpresa.png",
  "nagy-satisfecho": "/campeones/nagy-satisfecho.png",
  "maestro": "/campeones/maestro.png",
  "maestro-sorpresa": "/campeones/maestro-sorpresa.png",
  "maestro-satisfecho": "/campeones/maestro-satisfecho.png",
  "rival-internacional": "/campeones/rival-internacional.png",
  "rival-internacional-sorpresa": "/campeones/rival-internacional-sorpresa.png",
  "rival-internacional-satisfecho": "/campeones/rival-internacional-satisfecho.png",
  "drimer": "/campeones/drimer.png",
  "drimer-sorpresa": "/campeones/drimer-sorpresa.png",
  "drimer-satisfecho": "/campeones/drimer-satisfecho.png",
  "larisa": "/campeones/larisa.png",
  "larisa-sorpresa": "/campeones/larisa-sorpresa.png",
  "larisa-satisfecho": "/campeones/larisa-satisfecho.png",
  "varga": "/campeones/varga.png",
  "varga-sorpresa": "/campeones/varga-sorpresa.png",
  "varga-satisfecho": "/campeones/varga-satisfecho.png",
  "suarez": "/campeones/suarez.png",
  "suarez-sorpresa": "/campeones/suarez-sorpresa.png",
  "suarez-satisfecho": "/campeones/suarez-satisfecho.png",
  "petrov": "/campeones/petrov.png",
  "petrov-sorpresa": "/campeones/petrov-sorpresa.png",
  "petrov-satisfecho": "/campeones/petrov-satisfecho.png",
  "halasz": "/campeones/halasz.png",
  "halasz-sorpresa": "/campeones/halasz-sorpresa.png",
  "halasz-satisfecho": "/campeones/halasz-satisfecho.png",
  "ivanov": "/campeones/ivanov.png",
  "karpov": "/campeones/karpov.png",
  "kasparov": "/campeones/kasparov.png",
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
