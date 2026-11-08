import { handle } from "@/lib/server/http";
import { buildBrief } from "@/lib/server/pipeline";
import { StructureRequest } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(req, "brief", async () => buildBrief(StructureRequest.parse(await req.json().catch(() => ({})))));
}
