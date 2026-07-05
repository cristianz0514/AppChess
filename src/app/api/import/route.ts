import { NextRequest, NextResponse } from "next/server";
import { importGames } from "@/services/gameImport";

export async function POST(req: NextRequest) {
  try {
    const { username } = await req.json();

    if (!username || typeof username !== "string") {
      return NextResponse.json({ error: "Escribe tu usuario de Chess.com" }, { status: 400 });
    }

    const result = await importGames(username.trim());
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo importar. Inténtalo de nuevo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
