import "server-only";

export const config = {
  baseUrl: (process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, ""),
  // LLM_API_KEY for any OpenAI-compatible server; GROQ_API_KEY kept for the default.
  apiKey: process.env.LLM_API_KEY || process.env.GROQ_API_KEY || "",
  textModel: process.env.TEXT_MODEL || "openai/gpt-oss-120b",
  visionModel: process.env.VISION_MODEL || "qwen/qwen3.8-27b",
  sttModel: process.env.STT_MODEL || "whisper-large-v3",
  rateLimit: Number(process.env.RATE_LIMIT || 30),
  // Non-reasoning models served by Ollama/vLLM reject `reasoning_effort`. Set LLM_REASONING=off for those.
  sendReasoning: process.env.LLM_REASONING !== "off",
  // Local GPUs are slower than Groq; raise this for self-hosted models.
  timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 60_000),
};

export const isConfigured = () => Boolean(config.apiKey);
