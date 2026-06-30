import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({
    fetchType: typeof fetch,
    fetchStr: String(fetch).slice(0, 100),
    globalFetch: typeof globalThis.fetch,
  });
}
