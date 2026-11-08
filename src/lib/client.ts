"use client";

import type { BriefResponse, buildPlan, checkIn, readDocument } from "./server/pipeline";
import type { TranscriptResult } from "./server/llm";

export type { BriefResponse, TranscriptResult };
export type PlanResponse = Awaited<ReturnType<typeof buildPlan>>;
export type OcrResponse = Awaited<ReturnType<typeof readDocument>>;
export type FollowUpResponse = Awaited<ReturnType<typeof checkIn>>;

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

const OFFLINE = new ApiError("offline", "You are offline. Everything you entered is still on this screen. Try again when the network is back.");

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(e?.code ?? "http_" + res.status, e?.message ?? `Request failed (${res.status}).`, res.status);
  }
  return data as T;
}

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw OFFLINE;
  try {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return await parse<T>(res);
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("network", "Could not reach the server. Check the connection and try again.");
  }
}

export async function postForm<T>(path: string, form: FormData): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw OFFLINE;
  try {
    return await parse<T>(await fetch(path, { method: "POST", body: form }));
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("network", "Could not reach the server. Check the connection and try again.");
  }
}

/**
 * Downscale a photo on the device before upload: a 4 MB phone photo becomes
 * ~150-300 KB, which matters on a 2G/3G clinic connection.
 */
export async function compressImage(src: Blob | string, maxDim = 1600, quality = 0.82): Promise<{ dataUrl: string; bytes: number }> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || 900;
    const h = img.naturalHeight || 1200;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    return { dataUrl, bytes: Math.round((dataUrl.length - 23) * 0.75) };
  } finally {
    if (typeof src !== "string") URL.revokeObjectURL(url);
  }
}

export const kb = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
