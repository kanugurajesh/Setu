import { handle } from "@/lib/server/http";
import { checkIn } from "@/lib/server/pipeline";
import { FollowUpRequest } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(req, "followup", async () => checkIn(FollowUpRequest.parse(await req.json().catch(() => ({})))));
}
