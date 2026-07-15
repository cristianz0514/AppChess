// Illustrated backdrop (real image generated via Stitch — see
// public/campeones/, cropped to remove a baked-in mockup caption that
// would've clashed with our own dialogue UI) so the story feels like it's
// happening somewhere, not floating on a blank card.
export type SceneVariant = "living-room";

const IMAGE_SRC: Record<SceneVariant, string> = {
  "living-room": "/campeones/sala.jpg",
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
          of the scene, not just where it happens to be dark already. */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,.25), rgba(0,0,0,.55))" }} />
    </div>
  );
}
