import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { LLMError } from "./llm";
import { config } from "./config";

/**
 * Best-effort sliding-window rate limit, per serverless instance. Enough to
 * stop a single tab from burning the API key. For multi-instance production,
 * swap the Map for Redis / Upstash with the same interface.
 */
const hits = new Map<string, number[]>();
const WINDOW_MS = 5 * 60_000;

export function rateLimit(key: string, limit = config.rateLimit): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterSec: Math.ceil((WINDOW_MS - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear(); // memory guard
  return { ok: true, retryAfterSec: 0 };
}

/**
 * Proxies append to x-forwarded-for, so only the entries they added can be
 * trusted. The first entry is whatever the client chose to send.
 */
export function clientIp(req: Request, hops = config.trustedProxyHops): string {
  if (hops <= 0) return "local";
  const chain = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return chain[Math.max(0, chain.length - hops)] || req.headers.get("x-real-ip") || "local";
}

export function errorJson(code: string, message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/** Wraps a route: rate limit, typed error mapping, PHI-free structured logs. */
export async function handle(req: Request, route: string, fn: () => Promise<unknown>) {
  const started = Date.now();
  const rl = rateLimit(`${route}:${clientIp(req)}`);
  if (!rl.ok) return errorJson("rate_limited", "Too many requests from this device. Please wait a few minutes.", 429, { "Retry-After": String(rl.retryAfterSec) });

  let status = 200;
  let code = "ok";
  try {
    const data = await fn();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ZodError) {
      status = 400;
      code = "bad_input";
      return errorJson(code, err.issues[0]?.message ?? "Invalid input.", status);
    }
    if (err instanceof LLMError) {
      status = err.status;
      code = err.code;
      return errorJson(code, err.message, status);
    }
    status = 500;
    code = "internal";
    console.error(JSON.stringify({ evt: "unhandled", route, name: (err as Error)?.name }));
    return errorJson(code, "Something went wrong on our side.", status);
  } finally {
    console.log(JSON.stringify({ evt: "request", route, status, code, ms: Date.now() - started }));
  }
}
