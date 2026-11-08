import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

process.env.GROQ_API_KEY = "test-key";
const { chatJSON, LLMError } = await import("@/lib/server/llm");

const Schema = z.object({ answer: z.string() });
const ok = (content: string, finish = "stop") =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), { status: 200 });
const call = () => chatJSON({ step: "t", schema: Schema, schemaName: "t", messages: [{ role: "user", content: "hi" }] });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("chatJSON", () => {
  it("sends strict json_schema to gpt-oss-120b and parses the result", async () => {
    fetchMock.mockResolvedValueOnce(ok('{"answer":"yes"}'));
    const r = await call();
    expect(r.data).toEqual({ answer: "yes" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer test-key");
  });

  it("retries on 429 with backoff, then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(ok('{"answer":"ok"}'));
    const r = await call();
    expect(r.meta.attempts).toBe(2);
  });

  it("runs a repair pass when output does not match the schema", async () => {
    fetchMock.mockResolvedValueOnce(ok('{"wrong":1}')).mockResolvedValueOnce(ok('{"answer":"fixed"}'));
    const r = await call();
    expect(r.data.answer).toBe("fixed");
    const repairMsgs = JSON.parse(fetchMock.mock.calls[1][1].body).messages;
    expect(repairMsgs.at(-1).content).toMatch(/did not match the schema/);
  });

  it("doubles the token budget when the answer is truncated", async () => {
    fetchMock.mockResolvedValueOnce(ok('{"ans', "length")).mockResolvedValueOnce(ok('{"answer":"full"}'));
    await call();
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).max_completion_tokens).toBe(12000);
  });

  it("maps auth failures without leaking the upstream body", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "secret patient text", code: "invalid_api_key" } }), { status: 401 }));
    const err = await call().catch((e) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect(err.code).toBe("not_configured");
    expect(err.message).not.toMatch(/patient/);
  });

  it("does not wait out a retry that would overrun the time budget", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 429, headers: { "retry-after": "30" } }));
    const started = Date.now();
    const err = await chatJSON({ step: "t", schema: Schema, schemaName: "t", messages: [{ role: "user", content: "hi" }], timeoutMs: 5000 }).catch((e) => e);
    expect(err.code).toBe("rate_limited");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("gives up after two bad passes", async () => {
    fetchMock.mockImplementation(async () => ok("not json"));
    await expect(call()).rejects.toMatchObject({ code: "invalid_output" });
  });
});
