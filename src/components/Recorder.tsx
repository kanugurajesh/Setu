"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, kb, postForm, type TranscriptResult } from "@/lib/client";
import { Icon } from "./icons";
import { Spinner } from "./ui";

const MAX_SEC = 180;
const MIME = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/**
 * Records at 24 kbps mono Opus: 3 minutes is about 540 KB, small enough to
 * upload over a weak rural connection. Upload is also offered for testing on
 * machines without a microphone.
 */
export function Recorder({
  language,
  onResult,
  onError,
}: {
  language: string;
  onResult: (r: TranscriptResult, bytes: number) => void;
  onError: (msg: string) => void;
}) {
  const [state, setState] = useState<"idle" | "rec" | "upload">("idle");
  const [sec, setSec] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => stopTracks(), []);

  function stopTracks() {
    if (timer.current) clearInterval(timer.current);
    rec.current?.stream.getTracks().forEach((t) => t.stop());
  }

  async function send(blob: Blob) {
    setState("upload");
    try {
      const fd = new FormData();
      fd.append("audio", blob, "recording");
      if (language !== "auto") fd.append("language", language);
      const r = await postForm<TranscriptResult>("/api/transcribe", fd);
      if (!r.text) onError("No speech was recognised. Try again closer to the speaker.");
      else onResult(r, blob.size);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Transcription failed.");
    } finally {
      setState("idle");
    }
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onError("This browser cannot record audio. Type the notes or upload an audio file instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const mimeType = MIME.find((m) => MediaRecorder.isTypeSupported(m));
      const mr = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 24_000 });
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => {
        stopTracks();
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        if (blob.size < 2000) {
          setState("idle");
          onError("The recording was too short.");
          return;
        }
        void send(blob);
      };
      rec.current = mr;
      mr.start(1000);
      setSec(0);
      setState("rec");
      let elapsed = 0;
      timer.current = setInterval(() => {
        elapsed += 1;
        setSec(elapsed);
        if (elapsed >= MAX_SEC && mr.state === "recording") mr.stop();
      }, 1000);
    } catch (e) {
      const name = (e as Error).name;
      onError(name === "NotAllowedError" ? "Microphone permission was denied. Allow it in the browser, or type the notes." : "Could not start the microphone.");
    }
  }

  function stop() {
    if (rec.current?.state === "recording") rec.current.stop();
  }

  const mm = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  return (
    <div className="rec">
      <button
        type="button"
        className={`rec-btn${state === "rec" ? " on" : ""}`}
        onClick={state === "rec" ? stop : start}
        disabled={state === "upload"}
        aria-label={state === "rec" ? "Stop recording" : "Start recording"}
      >
        <Icon name={state === "rec" ? "stop" : "mic"} size={24} />
      </button>
      <div className="small">
        {state === "idle" && (
          <>
            <b>Record the conversation</b>
            <div className="muted tiny">
              Up to 3 min · Telugu, Hindi or English ·{" "}
              <button type="button" className="linkbtn" onClick={() => fileRef.current?.click()}>
                or upload audio
              </button>
            </div>
          </>
        )}
        {state === "rec" && (
          <>
            <b className="timer">Recording {mm}</b>
            <div className="muted tiny">Tap to stop · ≈{kb(sec * 3000)} so far</div>
          </>
        )}
        {state === "upload" && <Spinner label="Transcribing with Whisper…" />}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (f.size > 4 * 1024 * 1024) return onError("That file is over 4 MB. Use a shorter clip.");
          void send(f);
        }}
      />
    </div>
  );
}
