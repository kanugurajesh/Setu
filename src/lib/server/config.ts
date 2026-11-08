import "server-only";

const count = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const config = {
  baseUrl: (process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, ""),
  // LLM_API_KEY for any OpenAI-compatible server; GROQ_API_KEY kept for the default.
  apiKey: process.env.LLM_API_KEY || process.env.GROQ_API_KEY || "",
  textModel: process.env.TEXT_MODEL || "openai/gpt-oss-120b",
  visionModel: process.env.VISION_MODEL || "qwen/qwen3.8-27b",
  sttModel: process.env.STT_MODEL || "whisper-large-v3",
  rateLimit: count(process.env.RATE_LIMIT, 30),
  // How many proxies in front of the app append to x-forwarded-for. 1 suits Vercel
  // and most hosts. Use 0 when the app is exposed directly: the header is then
  // entirely client-supplied, so all traffic shares one limit.
  trustedProxyHops: count(process.env.TRUSTED_PROXY_HOPS, 1),
  // Non-reasoning models served by Ollama/vLLM reject `reasoning_effort`. Set LLM_REASONING=off for those.
  sendReasoning: process.env.LLM_REASONING !== "off",
  // Total budget for one AI step, retries included. It sits under the routes' 60 s
  // maxDuration so the user gets our message, not a platform 504. Local GPUs are
  // slower than Groq; raise this for self-hosted models.
  timeoutMs: count(process.env.LLM_TIMEOUT_MS, 55_000),
};

export const isConfigured = () => Boolean(config.apiKey);
