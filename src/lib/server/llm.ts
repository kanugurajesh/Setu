import "server-only";
import { z } from "zod";
import { config } from "./config";
import { toStrictJsonSchema } from "../schemas";

/**
 * Thin OpenAI-compatible client for Groq (or any self-hosted vLLM/TGI server
 * serving the same open-weight models). No SDK: we control timeouts, retries,
 * and, importantly, what gets logged. Upstream error bodies can echo patient
 * text (e.g. `failed_generation`), so they are never logged or returned.
 */

export type LLMErrorCode = "not_configured" | "rate_limited" | "timeout" | "upstream" | "invalid_output" | "bad_input";

export class LLMError extends Error {
  constructor(
    public code: LLMErrorCode,
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export interface CallMeta {
  step: string;
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  attempts: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function requireKey() {
  if (!config.apiKey) throw new LLMError("not_configured", "The server has no GROQ_API_KEY (or LLM_API_KEY) configured.", 503);
}

const timedOut = () => new LLMError("timeout", "The AI service took too long to respond.", 504);

/** `deadline` is absolute and shared by every attempt, so retries can't outlive the route. */
async function request(path: string, init: RequestInit, deadline: number, retries = 2): Promise<{ res: Response; attempts: number }> {
  const hasTimeFor = (waitMs: number) => Date.now() + waitMs + 2000 < deadline;
  for (let attempt = 1; ; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw timedOut();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), remaining);
    try {
      const res = await fetch(`${config.baseUrl}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${config.apiKey}`, ...(init.headers ?? {}) },
        signal: ctrl.signal,
      });
      if ((res.status === 429 || res.status >= 500) && attempt <= retries) {
        const ra = Number(res.headers.get("retry-after"));
        // A per-minute token limit (Groq free tier: 8k TPM on gpt-oss-120b) usually
        // clears within ~20 s. Waiting it out once inside the 60 s route budget beats
        // showing "busy" to a coordinator mid-consultation. 5xx stays short.
        const cap = res.status === 429 && attempt === 1 ? 20_000 : 4000;
        const wait = Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 500 * 2 ** (attempt - 1), cap);
        if (hasTimeFor(wait)) {
          await sleep(wait);
          continue;
        }
      }
      return { res, attempts: attempt };
    } catch (err) {
      if ((err as Error).name === "AbortError") throw timedOut();
      const wait = 500 * 2 ** (attempt - 1);
      if (attempt <= retries && hasTimeFor(wait)) {
        await sleep(wait);
        continue;
      }
      throw new LLMError("upstream", "Could not reach the AI service.", 502);
    } finally {
      clearTimeout(timer);
    }
  }
}

async function failFromResponse(res: Response, step: string): Promise<never> {
  let code = "";
  try {
    const body = (await res.json()) as { error?: { code?: string; type?: string } };
    code = body.error?.code || body.error?.type || "";
  } catch {
    /* ignore */
  }
  // Log status + error code only. Never the body.
  console.error(JSON.stringify({ evt: "llm_error", step, status: res.status, code }));
  if (res.status === 401 || res.status === 403) throw new LLMError("not_configured", "The AI service rejected the server's API key.", 503);
  if (res.status === 429) throw new LLMError("rate_limited", "The AI service is busy. Please try again in a minute.", 429);
  if (res.status === 413) throw new LLMError("bad_input", "That input is too large.", 413);
  if (code === "json_validate_failed") throw new LLMError("invalid_output", "The AI returned an incomplete answer.", 502);
  throw new LLMError("upstream", "The AI service returned an error.", 502);
}

type Message =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "user"; content: ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] };

export async function chatJSON<T>(opts: {
  step: string;
  schema: z.ZodType<T>;
  schemaName: string;
  messages: Message[];
  model?: string;
  strict?: boolean;
  reasoningEffort?: "none" | "low" | "medium" | "high";
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<{ data: T; meta: CallMeta }> {
  requireKey();
  const model = opts.model ?? config.textModel;
  const strict = opts.strict ?? true;
  const jsonSchema = toStrictJsonSchema(opts.schema);
  const started = Date.now();
  const deadline = started + (opts.timeoutMs ?? config.timeoutMs);
  let attempts = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let messages = opts.messages;
  let maxTokens = opts.maxTokens ?? 6000;

  // Up to 2 passes: the second is a repair pass that shows the model its validation errors.
  for (let pass = 1; pass <= 2; pass++) {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_completion_tokens: maxTokens,
      response_format: { type: "json_schema", json_schema: { name: opts.schemaName, strict, schema: jsonSchema } },
    };
    if (opts.reasoningEffort && config.sendReasoning) body.reasoning_effort = opts.reasoningEffort;

    const { res, attempts: a } = await request(
      "/chat/completions",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      deadline,
    );
    attempts += a;
    if (!res.ok) {
      if (pass === 1 && res.status === 400) {
        // best-effort schema failures surface as 400 json_validate_failed; retry once
        const clone = res.clone();
        const code = await clone.json().then((b: { error?: { code?: string } }) => b.error?.code).catch(() => "");
        if (code === "json_validate_failed") continue;
      }
      await failFromResponse(res, opts.step);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string; refusal?: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    promptTokens += json.usage?.prompt_tokens ?? 0;
    completionTokens += json.usage?.completion_tokens ?? 0;
    const choice = json.choices?.[0];
    if (choice?.message?.refusal) throw new LLMError("invalid_output", "The AI declined to answer this input.", 422);
    if (choice?.finish_reason === "length") {
      // reasoning tokens count against the budget; give the retry more room
      if (pass === 1) {
        maxTokens = Math.min(maxTokens * 2, 16000);
        continue;
      }
      throw new LLMError("invalid_output", "The AI answer was cut off. Try a shorter input.", 502);
    }

    const content = choice?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = undefined;
    }
    const result = opts.schema.safeParse(parsed);
    if (result.success) {
      return {
        data: result.data,
        meta: { step: opts.step, model, latencyMs: Date.now() - started, promptTokens, completionTokens, attempts },
      };
    }
    console.error(JSON.stringify({ evt: "llm_schema_mismatch", step: opts.step, pass, issues: result.error.issues.length }));
    messages = [
      ...opts.messages,
      { role: "assistant", content: content.slice(0, 12000) },
      {
        role: "user",
        content: `That JSON did not match the schema: ${result.error.issues
          .slice(0, 8)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}. Return the corrected JSON only.`,
      },
    ];
  }
  throw new LLMError("invalid_output", "The AI returned an answer in the wrong shape.", 502);
}

export interface TranscriptResult {
  text: string;
  language: string;
  durationSec: number;
  /** segments Whisper itself was unsure about, for the coordinator to re-check */
  lowConfidence: { text: string; start: number; end: number }[];
  meta: CallMeta;
}

export async function transcribe(file: Blob, filename: string, language?: string): Promise<TranscriptResult> {
  requireKey();
  const started = Date.now();
  const fd = new FormData();
  fd.append("file", file, filename);
  fd.append("model", config.sttModel);
  fd.append("response_format", "verbose_json");
  fd.append("temperature", "0");
  if (language) fd.append("language", language);
  // A vocabulary hint helps spelling, but in Whisper a prompt can also pull
  // output toward its language, so only use it for English.
  if (language === "en") fd.append("prompt", "Rural health centre consultation. BP, sugar, SpO2, fever, cough, metformin, paracetamol, amlodipine.");

  const { res, attempts } = await request("/audio/transcriptions", { method: "POST", body: fd }, started + config.timeoutMs);
  if (!res.ok) await failFromResponse(res, "transcribe");
  const json = (await res.json()) as {
    text?: string;
    language?: string;
    duration?: number;
    segments?: { text: string; start: number; end: number; avg_logprob?: number; no_speech_prob?: number }[];
  };
  const lowConfidence = (json.segments ?? [])
    .filter((s) => (s.avg_logprob ?? 0) < -0.8 || (s.no_speech_prob ?? 0) > 0.5)
    .map((s) => ({ text: s.text.trim(), start: s.start, end: s.end }))
    .filter((s) => s.text.length > 0);
  return {
    text: (json.text ?? "").trim(),
    language: json.language ?? language ?? "unknown",
    durationSec: json.duration ?? 0,
    lowConfidence,
    meta: { step: "transcribe", model: config.sttModel, latencyMs: Date.now() - started, attempts },
  };
}
