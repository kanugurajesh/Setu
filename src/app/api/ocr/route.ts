import { handle } from "@/lib/server/http";
import { readDocument } from "@/lib/server/pipeline";
import { OcrRequest } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(req, "ocr", async () => {
    const { image } = OcrRequest.parse(await req.json().catch(() => ({})));
    return readDocument(image);
  });
}
