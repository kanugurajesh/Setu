import { handle } from "@/lib/server/http";
import { buildPlan } from "@/lib/server/pipeline";
import { PlanRequest } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(req, "plan", async () => buildPlan(PlanRequest.parse(await req.json().catch(() => ({})))));
}
