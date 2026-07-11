import { redirect } from "next/navigation";

// Estadísticas duplicaba casi todo lo que ya muestra el Dashboard (rating,
// resultados, precisión, aperturas). Se retiró de la navegación en favor de
// Aperturas; este redirect evita 404s en enlaces/marcadores antiguos.
export default function StatsPage() {
  redirect("/openings");
}
