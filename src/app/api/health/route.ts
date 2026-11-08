import { NextResponse } from "next/server";
import { config, isConfigured } from "@/lib/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      configured: isConfigured(),
      provider: new URL(config.baseUrl).hostname,
      models: { text: config.textModel, vision: config.visionModel, speech: config.sttModel },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
