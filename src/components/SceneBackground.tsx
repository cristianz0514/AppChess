// Illustrated backdrop (real image generated via Stitch — see
// public/campeones/, cropped to remove a baked-in mockup caption that
// would've clashed with our own dialogue UI) so the story feels like it's
// happening somewhere, not floating on a blank card.
export type SceneVariant =
  | "living-room" | "club" | "torneo-infantil" | "torneo-internacional"
  | "olimpiada" | "premiacion" | "exhibicion-mundial";

const IMAGE_SRC: Record<SceneVariant, string> = {
  "living-room": "/campeones/sala.jpg",
  "club": "/campeones/club.jpg",
  "torneo-infantil": "/campeones/torneo-infantil.jpg",
  "torneo-internacional": "/campeones/torneo-internacional.jpg",
  "olimpiada": "/campeones/olimpiada.jpg",
  "premiacion": "/campeones/premiacion.jpg",
  "exhibicion-mundial": "/campeones/exhibicion-mundial.jpg",
  // sala-elite (cap. 13/14) todavía no se ha generado — ver
  // docs/campeones-stitch-prompts/checklist-completo.md.
};

export function SceneBackground({ variant }: { variant: SceneVariant }) {
  return (
    <div className="absolute inset-0 w-full h-full" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- small, fixed local asset; next/image's overhead isn't worth it here */}
      <img
        src={IMAGE_SRC[variant]}
        alt=""
        className="w-full h-full object-cover"
      />
      {/* Darkening scrim so the dialogue/UI on top stays legible over any part
          of the scene, not just where it happens to be dark already. Measured
          a real 2.45:1 contrast failure (needs 4.5:1) for the white header
          text over a bright scene at the old .25-.55 range — raised it. */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,.5), rgba(0,0,0,.75))" }} />
    </div>
  );
}
