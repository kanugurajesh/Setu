import { handle } from "@/lib/server/http";
import { LLMError, transcribe } from "@/lib/server/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel caps request bodies at ~4.5 MB; ~3 min of Opus audio is well under 2 MB.
const MAX_BYTES = 4 * 1024 * 1024;
const LANGS = new Set(["te", "hi", "en"]);
const TYPES = /^audio\/(webm|ogg|mp4|mpeg|mp3|m4a|wav|x-wav|flac|x-m4a|aac)/;

export async function POST(req: Request) {
  return handle(req, "transcribe", async () => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("audio");
    if (!(file instanceof Blob) || file.size === 0) throw new LLMError("bad_input", "No audio was received.", 400);
    if (file.size > MAX_BYTES) throw new LLMError("bad_input", "Recording is too long. Keep it under 3 minutes.", 413);
    const type = file.type.split(";")[0];
    if (type && !TYPES.test(type)) throw new LLMError("bad_input", "Unsupported audio format.", 415);
    const lang = String(form?.get("language") ?? "");
    const ext = type.includes("mp4") || type.includes("m4a") ? "m4a" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : type.includes("mpeg") || type.includes("mp3") ? "mp3" : "webm";
    return transcribe(file, `recording.${ext}`, LANGS.has(lang) ? lang : undefined);
  });
}
