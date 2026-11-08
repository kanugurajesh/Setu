"use client";

import { useState } from "react";
import type { OcrResponse, TranscriptResult } from "@/lib/client";
import type { RedactionResult } from "@/lib/redact";
import type { RuleResult } from "@/lib/safety-rules";
import type { SampleCase } from "@/lib/samples";
import { VITAL_FIELDS, parseAge, type parseVitals } from "@/lib/vitals";
import { DocCapture } from "./DocCapture";
import { Icon } from "./icons";
import { Recorder } from "./Recorder";
import { Banner, Redacted, Spinner, UrgencyBadge } from "./ui";
import type { IntakeState } from "./Workspace";

export function IntakeStep(p: {
  intake: IntakeState;
  patch: (x: Partial<IntakeState>) => void;
  samples: SampleCase[];
  onSample: (s: SampleCase) => void;
  redacted: RedactionResult;
  parsed: ReturnType<typeof parseVitals>;
  live: RuleResult;
  onTranscript: (r: TranscriptResult, bytes: number) => void;
  onOcr: (r: OcrResponse, bytes: number) => void;
  onDoc: (doc: IntakeState["doc"]) => void;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
  hasBrief: boolean;
  briefFresh: boolean;
  goBrief: () => void;
}) {
  const { intake, patch, parsed, live, redacted } = p;
  const [micErr, setMicErr] = useState<string | null>(null);
  const vitalErrors = Object.keys(parsed.errors).length;
  const tooShort = intake.transcript.trim().length < 15;
  const ageError = parseAge(intake.ageYears).error;
  const canSubmit = !p.busy && !tooShort && vitalErrors === 0 && !ageError;

  return (
    <>
      <div className="card">
        <div className="samples">
          <span className="small muted">Try a synthetic case:</span>
          {p.samples.map((s) => (
            <button key={s.id} type="button" className="sample" aria-pressed={intake.sampleId === s.id} onClick={() => p.onSample(s)}>
              {s.label} <i>{s.language}</i>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div className="ic">
            <Icon name="clipboard" />
          </div>
          <div>
            <h3>Patient</h3>
            <p>Registration details. Only what changes the medical picture is sent.</p>
          </div>
        </div>
        <div className="fields">
          <label className="field" style={{ gridColumn: "span 2" }}>
            <span>
              Name <Icon name="lock" size={14} /> <em>stays on this device</em>
            </span>
            <input className="input" value={intake.name} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g. Lakshmamma, లక్ష్మమ్మ" autoComplete="off" />
            <span className="hint">Add the name in every script it might be spoken in, separated by commas. It is replaced with [PATIENT] before anything is sent.</span>
          </label>
          <label className="field">
            <span>Age (years)</span>
            <input className={`input${ageError ? " bad" : ""}`} value={intake.ageYears} onChange={(e) => patch({ ageYears: e.target.value })} placeholder="45, or 2 months" aria-invalid={Boolean(ageError)} />
            {ageError && <span className="hint bad">{ageError}</span>}
          </label>
          <label className="field">
            <span>Sex</span>
            <select className="select" value={intake.sex} onChange={(e) => patch({ sex: e.target.value as IntakeState["sex"], pregnant: e.target.value === "female" ? intake.pregnant : false })}>
              <option value="">Not recorded</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </label>
          {intake.sex === "female" && (
            <label className="check">
              <input type="checkbox" checked={intake.pregnant} onChange={(e) => patch({ pregnant: e.target.checked })} />
              Pregnant
            </label>
          )}
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span>Known conditions</span>
            <input className="input" maxLength={300} value={intake.knownConditions} onChange={(e) => patch({ knownConditions: e.target.value })} placeholder="e.g. Type 2 diabetes for 5 years" />
          </label>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div className="ic">
            <Icon name="heart" />
          </div>
          <div>
            <h3>Vitals</h3>
            <p>Checked on this device against safety thresholds as you type. Works offline.</p>
          </div>
        </div>
        <div className="fields">
          {VITAL_FIELDS.map((f) => (
            <label key={f.key} className="field">
              <span>
                {f.label} <em>{f.unit}</em>
              </span>
              <input
                className={`input${parsed.errors[f.key] ? " bad" : ""}`}
                inputMode="decimal"
                value={intake.vitals[f.key]}
                placeholder={f.ph}
                onChange={(e) => patch({ vitals: { ...intake.vitals, [f.key]: e.target.value } })}
                aria-invalid={Boolean(parsed.errors[f.key])}
              />
              {parsed.errors[f.key] ? <span className="hint bad">Expected {parsed.errors[f.key]}</span> : f.key === "temp" && parsed.tempNote ? <span className="hint">{parsed.tempNote}</span> : null}
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <div className="ic">
            <Icon name="mic" />
          </div>
          <div>
            <h3>Conversation</h3>
            <p>Record it, or type it the way it was said. Mixed languages are fine.</p>
          </div>
        </div>
        <div className="stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <Recorder
              language={intake.sttLanguage}
              onResult={(r, b) => {
                setMicErr(null);
                p.onTranscript(r, b);
              }}
              onError={setMicErr}
            />
            <label className="field" style={{ minWidth: 170 }}>
              <span>Spoken language</span>
              <select className="select" value={intake.sttLanguage} onChange={(e) => patch({ sttLanguage: e.target.value as IntakeState["sttLanguage"] })}>
                <option value="te">తెలుగు Telugu</option>
                <option value="hi">हिन्दी Hindi</option>
                <option value="en">English</option>
                <option value="auto">Detect automatically</option>
              </select>
            </label>
          </div>
          {micErr && <Banner kind="err">{micErr}</Banner>}
          {intake.lowConfidence.length > 0 && (
            <Banner kind="warn">
              <b>Whisper was unsure about these parts. Please check them in the text:</b>
              <ul style={{ margin: ".3rem 0 0", paddingLeft: "1.1rem" }}>
                {intake.lowConfidence.map((t, i) => (
                  <li key={i}>“{t}”</li>
                ))}
              </ul>
            </Banner>
          )}
          <label className="field">
            <span className="sr-only">Conversation text</span>
            <textarea
              className="textarea"
              value={intake.transcript}
              onChange={(e) => patch({ transcript: e.target.value })}
              placeholder={"Patient: నాలుగు రోజుల నుంచి జ్వరం వస్తోంది…\nCoordinator: …"}
            />
          </label>
          <details>
            <summary className="disclose">
              <Icon name="eye" size={16} /> What leaves this device
              {redacted.total > 0 && <span className="pill good">{redacted.total} detail(s) redacted</span>}
            </summary>
            <div className="preview" style={{ marginTop: ".6rem" }}>
              {redacted.text ? <Redacted text={redacted.text} /> : <span className="muted">Nothing yet.</span>}
            </div>
            <p className="tiny muted" style={{ marginTop: ".4rem" }}>
              On the device: the patient&apos;s name. On the server, again: phone, Aadhaar, ABHA and email. Audio sent for transcription is not redacted, so avoid reading out ID numbers while recording.
            </p>
          </details>
        </div>
      </div>

      <DocCapture doc={intake.doc} onDoc={p.onDoc} onTrace={p.onOcr} />

      <div className="cta-bar">
        <div className="stack" style={{ gap: ".45rem", flex: "1 1 320px" }}>
          <div className="row">
            <Icon name="shield" size={18} />
            <b className="small">On-device safety check</b>
            <UrgencyBadge u={live.urgency} />
          </div>
          {live.flags.length > 0 ? (
            <div className="row" style={{ gap: ".35rem" }}>
              {live.flags.map((f) => (
                <span key={f.id} className={`pill ${f.urgency === "routine" ? "" : f.urgency === "soon" ? "warn" : "bad"}`} title={f.detail}>
                  {f.label}
                </span>
              ))}
            </div>
          ) : (
            <span className="tiny muted">No danger signs detected yet. These rules are a safety floor: the AI can raise urgency, never lower it.</span>
          )}
        </div>
        <div className="row">
          {p.hasBrief && p.briefFresh && (
            <button type="button" className="btn btn-ghost" onClick={p.goBrief}>
              View brief
            </button>
          )}
          <button type="button" className="btn btn-primary btn-lg" onClick={p.onSubmit} disabled={!canSubmit}>
            {p.busy ? <Spinner label="Preparing brief…" /> : <>Prepare doctor brief <Icon name="arrow" /></>}
          </button>
        </div>
      </div>
      {p.error && <Banner kind="err">{p.error}</Banner>}
      {tooShort && intake.transcript.length > 0 && <p className="tiny muted">Add a little more of the conversation first.</p>}
    </>
  );
}
