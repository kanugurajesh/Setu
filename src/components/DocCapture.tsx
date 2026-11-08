"use client";

import { useRef, useState } from "react";
import { ApiError, compressImage, kb, postJSON, type OcrResponse } from "@/lib/client";
import type { DocumentExtract } from "@/lib/schemas";
import { Icon } from "./icons";
import { Banner, Spinner } from "./ui";

export interface CapturedDoc {
  extract: DocumentExtract;
  previewUrl: string;
  bytes: number;
}

export function DocCapture({
  doc,
  onDoc,
  onTrace,
}: {
  doc: CapturedDoc | null;
  onDoc: (d: CapturedDoc | null) => void;
  onTrace: (r: OcrResponse, bytes: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function read(src: Blob | string) {
    setBusy(true);
    setErr(null);
    try {
      const { dataUrl, bytes } = await compressImage(src);
      const r = await postJSON<OcrResponse>("/api/ocr", { image: dataUrl });
      onTrace(r, bytes);
      if (r.document.document_type === "unreadable") setErr("The photo could not be read. Retake it in good light, flat, filling the frame.");
      onDoc({ extract: r.document, previewUrl: dataUrl, bytes });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Could not read that image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="card-h">
        <div className="ic">
          <Icon name="doc" />
        </div>
        <div>
          <h3>Earlier prescription or report</h3>
          <p>Optional. A photo is read by an open-weight vision model, then shrunk on this device before upload.</p>
        </div>
      </div>

      {!doc && (
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Icon name="camera" /> Take or choose photo
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => read("/samples/old-prescription.svg")} disabled={busy}>
            <Icon name="doc" /> Use sample prescription
          </button>
          {busy && <Spinner label="Reading document…" />}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void read(f);
        }}
      />
      {err && (
        <div style={{ marginTop: ".8rem" }}>
          <Banner kind="err">{err}</Banner>
        </div>
      )}

      {doc && (
        <div className="stack">
          <div className="row">
            <span className="pill">{doc.extract.document_type.replace("_", " ")}</span>
            <span className={`pill ${doc.extract.legibility === "good" ? "good" : doc.extract.legibility === "partial" ? "warn" : "bad"}`}>
              legibility: {doc.extract.legibility}
            </span>
            {doc.extract.date_on_document && <span className="pill">dated {doc.extract.date_on_document}</span>}
            <span className="pill">uploaded {kb(doc.bytes)}</span>
            <span className="spacer" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDoc(null)}>
              <Icon name="x" size={16} /> Remove
            </button>
          </div>
          <div className="grid2">
            <img src={doc.previewUrl} alt="Uploaded document" style={{ width: "100%", maxHeight: 260, objectFit: "contain", background: "var(--mist)", borderRadius: 12 }} />
            <div className="stack" style={{ gap: ".6rem" }}>
              {doc.extract.medications.length > 0 && (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Medicine</th>
                      <th>Dose</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.extract.medications.map((m, i) => (
                      <tr key={i}>
                        <td>
                          <b>{m.name}</b>
                        </td>
                        <td>{m.dose}</td>
                        <td>
                          {m.frequency} {m.duration && <span className="muted">· {m.duration}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {doc.extract.lab_values.length > 0 && (
                <div className="row">
                  {doc.extract.lab_values.map((l, i) => (
                    <span key={i} className="pill">
                      {l.test}: {l.value} {l.unit}
                    </span>
                  ))}
                </div>
              )}
              {doc.extract.reader_notes && <p className="small muted">Reader notes: {doc.extract.reader_notes}</p>}
              <details>
                <summary className="disclose">
                  <Icon name="eye" size={16} /> Full transcription
                </summary>
                <div className="preview" style={{ marginTop: ".5rem" }}>
                  {doc.extract.full_text}
                </div>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
