"use client";

import { useMemo, useState } from "react";
import type { FollowUpResponse, PlanResponse, TranscriptResult } from "@/lib/client";
import type { CallGrounding } from "@/lib/followup-guard";
import { redact } from "@/lib/redact";
import { evaluateRules } from "@/lib/safety-rules";
import type { SampleCase } from "@/lib/samples";
import type { FollowAction, Patient } from "@/lib/schemas";
import { Icon } from "./icons";
import { Recorder } from "./Recorder";
import { Banner, Evidence, Spinner, UrgencyBadge } from "./ui";

const ACTION: Record<FollowAction, { label: string; tone: "routine" | "soon" | "urgent" | "emergency"; who: string }> = {
  on_track: { label: "On track", tone: "routine", who: "Encourage, and call again as planned." },
  call_again: { label: "Fix a barrier, call again", tone: "soon", who: "The coordinator can sort this out. No doctor needed yet." },
  doctor_review: { label: "Doctor review today", tone: "urgent", who: "Send this summary to the remote doctor today." },
  come_in_now: { label: "Come in now", tone: "emergency", who: "Arrange transport or 108 now. Call back tomorrow to confirm they reached." },
};

const MED_STATUS: Record<string, { label: string; cls: string }> = {
  taking_as_prescribed: { label: "Taking as prescribed", cls: "good" },
  missed_some: { label: "Missed doses", cls: "warn" },
  stopped: { label: "Stopped", cls: "bad" },
  not_mentioned: { label: "Not discussed: ask", cls: "" },
};

const HABIT: Record<string, string> = { yes: "Doing it", partly: "Partly", no: "Not yet", not_stated: "Not discussed" };

export function ActionBadge({ a, lg }: { a: FollowAction; lg?: boolean }) {
  const t = ACTION[a];
  return (
    <span className={`urg ${t.tone}${lg ? " lg" : ""}`}>
      {a === "come_in_now" || a === "doctor_review" ? <Icon name="alert" size={lg ? 18 : 14} /> : <Icon name="phone" size={lg ? 18 : 14} />}
      {t.label}
    </span>
  );
}

function Ev({ g, quote }: { g: CallGrounding; quote: string }) {
  if (g === "none") return null;
  return <Evidence g={g} quote={quote} />;
}

export function FollowUpStep(p: {
  plan: PlanResponse;
  patient: Patient;
  names: string[];
  sample?: SampleCase;
  transcript: string;
  setTranscript: (s: string) => void;
  days: number;
  setDays: (n: number) => void;
  data: FollowUpResponse | null;
  stale: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
  onTranscript: (r: TranscriptResult, bytes: number) => void;
  onNew: () => void;
  back: () => void;
}) {
  const [micErr, setMicErr] = useState<string | null>(null);
  const [sttLang, setSttLang] = useState<"te" | "hi" | "en" | "auto">(p.sample?.checkIn.sttLanguage ?? p.plan.language);
  const redacted = useMemo(() => redact(p.transcript, { names: p.names }), [p.transcript, p.names]);
  const live = useMemo(() => evaluateRules({ text: redacted.text, vitals: {}, patient: p.patient }), [redacted.text, p.patient]);
  const canSubmit = redacted.text.trim().length >= 15 && !p.busy;
  const d = p.data;
  const next = d ? new Date(Date.now() + d.followUp.next_check_in_days * 86_400_000).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : "";

  return (
    <>
      <div className="card thrive">
        <div className="card-h">
          <div className="ic">
            <Icon name="phone" />
          </div>
          <div>
            <h3>Check-in call</h3>
            <p>Patients are usually lost here: in the days after the visit, not during it. Call, record or type the call, and Setu checks it against the plan this patient went home with.</p>
          </div>
        </div>
        <div className="stack">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
            <Recorder
              language={sttLang}
              onResult={(r, b) => {
                setMicErr(null);
                p.onTranscript(r, b);
              }}
              onError={setMicErr}
            />
            <div className="row" style={{ alignItems: "flex-end" }}>
              <label className="field" style={{ width: 120 }}>
                <span>Days since visit</span>
                <input className="input" type="number" inputMode="numeric" min={0} max={120} value={p.days} onChange={(e) => p.setDays(Math.max(0, Math.min(120, Math.round(Number(e.target.value) || 0))))} />
              </label>
              <label className="field" style={{ minWidth: 150 }}>
                <span>Spoken language</span>
                <select className="select" value={sttLang} onChange={(e) => setSttLang(e.target.value as typeof sttLang)}>
                  <option value="te">తెలుగు Telugu</option>
                  <option value="hi">हिन्दी Hindi</option>
                  <option value="en">English</option>
                  <option value="auto">Detect automatically</option>
                </select>
              </label>
            </div>
          </div>
          {micErr && <Banner kind="err">{micErr}</Banner>}
          {p.sample && (
            <div className="row">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  p.setTranscript(p.sample!.checkIn.transcript);
                  p.setDays(p.sample!.checkIn.daysSinceVisit);
                  setSttLang(p.sample!.checkIn.sttLanguage);
                }}
              >
                <Icon name="doc" size={16} /> Use the sample day-{p.sample.checkIn.daysSinceVisit} call
              </button>
              <span className="tiny muted">Synthetic, like every sample here.</span>
            </div>
          )}
          <label className="field">
            <span className="sr-only">Call text</span>
            <textarea className="textarea" value={p.transcript} onChange={(e) => p.setTranscript(e.target.value)} placeholder={"Coordinator: ఇప్పుడు ఎలా ఉంది? మాత్రలు వేసుకుంటున్నారా?\nPatient: …"} />
          </label>
        </div>
      </div>

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
                <span key={f.id} className={`pill ${f.urgency === "soon" ? "warn" : "bad"}`} title={f.detail}>
                  {f.label}
                </span>
              ))}
            </div>
          ) : (
            <span className="tiny muted">No danger signs heard yet. &ldquo;No breathlessness&rdquo; and questions like &ldquo;ఆయాసం ఉందా?&rdquo; are not counted.</span>
          )}
        </div>
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={p.back}>
            <Icon name="back" /> Plan
          </button>
          <button type="button" className="btn btn-primary btn-lg" onClick={p.onSubmit} disabled={!canSubmit}>
            {p.busy ? <Spinner label="Checking…" /> : <>Check against the plan <Icon name="arrow" /></>}
          </button>
        </div>
      </div>
      {p.error && <Banner kind="err">{p.error}</Banner>}

      {d && (
        <>
          {p.stale && <Banner kind="warn">The call changed after this check. Run it again before acting on it.</Banner>}

          <section className={`brief-top ${ACTION[d.action.final].tone}`} aria-label="What to do now">
            <div className="row">
              <ActionBadge a={d.action.final} lg />
              <span className="urg-math">
                AI said <b>{ACTION[d.action.model].label.toLowerCase()}</b> · rules said <b>{ACTION[d.action.rules].label.toLowerCase()}</b>
                {d.action.raisedByRules && <span className="pill bad">raised by safety rules</span>}
              </span>
            </div>
            <p className="summary">{ACTION[d.action.final].who}</p>
            <p className="small">
              <b>Why: </b>
              {d.followUp.action_reason}
            </p>
            {d.floor.length > 0 && (
              <ul className="small" style={{ margin: 0, paddingLeft: "1.1rem" }}>
                {d.floor.map((f, i) => (
                  <li key={i}>
                    {f.reason} <span className="muted">→ at least {ACTION[f.action].label.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="row small">
              <Icon name="quote" size={16} />
              <b>
                {d.grounding.verified} of {d.grounding.total}
              </b>{" "}
              claims verified against the call
              {d.grounding.notFound > 0 && <span className="pill bad">{d.grounding.notFound} not found, check them</span>}
            </div>
          </section>

          {d.warnings.length > 0 && (
            <Banner kind="warn">
              <b>Check before acting:</b>
              <ul style={{ margin: ".3rem 0 0", paddingLeft: "1.1rem" }}>
                {d.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Banner>
          )}

          <div className="card navy">
            <div className="card-h">
              <div className="ic">
                <Icon name="medicine" size={18} />
              </div>
              <h3>Medicines, against the plan</h3>
            </div>
            <div className="facts">
              {d.followUp.medicines.map((m, i) => (
                <div key={i} className={`fact${m.grounding === "not_found" ? " unverified" : ""}`}>
                  <div>
                    <div className="row">
                      <span className="what">{m.name}</span>
                      <span className={`pill ${MED_STATUS[m.status].cls}`}>{MED_STATUS[m.status].label}</span>
                    </div>
                    {m.reason && m.reason !== "not stated" && <div className="meta">{m.reason}</div>}
                  </div>
                  <div className="ev">
                    <Ev g={m.grounding} quote={m.evidence} />
                  </div>
                </div>
              ))}
              {d.followUp.medicines.length === 0 && <p className="empty">The plan had no medicines.</p>}
            </div>
          </div>

          <div className="grid2">
            <div className="card navy">
              <div className="card-h">
                <div className="ic">
                  <Icon name="alert" size={18} />
                </div>
                <h3>Warning signs now</h3>
              </div>
              {d.followUp.warning_signs_reported.length ? (
                <div className="facts">
                  {d.followUp.warning_signs_reported.map((w, i) => (
                    <div key={i} className={`fact${w.grounding === "not_found" ? " unverified" : ""}`}>
                      <span className="what">{w.sign}</span>
                      <div className="ev">
                        <Ev g={w.grounding} quote={w.evidence} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty">None reported on this call.</p>
              )}
              <p className="small" style={{ marginTop: ".8rem" }}>
                <b>Overall: </b>
                {d.followUp.overall_trend.replace("_", " ")}
              </p>
              <Ev g={d.followUp.trend_grounding} quote={d.followUp.trend_evidence} />
            </div>
            <div className="card navy">
              <div className="card-h">
                <div className="ic">
                  <Icon name="family" size={18} />
                </div>
                <h3>What is getting in the way</h3>
              </div>
              {d.followUp.barriers.length ? (
                <div className="facts">
                  {d.followUp.barriers.map((b, i) => (
                    <div key={i} className={`fact${b.grounding === "not_found" ? " unverified" : ""}`}>
                      <div>
                        <span className="what">{b.barrier}</span>
                        <div className="meta">{b.kind.replace("_", " ")}</div>
                      </div>
                      <div className="ev">
                        <Ev g={b.grounding} quote={b.evidence} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty">No barriers mentioned.</p>
              )}
              {d.followUp.habits.length > 0 && (
                <>
                  <p className="small" style={{ margin: ".9rem 0 .3rem" }}>
                    <b>Daily steps</b>
                  </p>
                  <ul className="small" style={{ margin: 0, paddingLeft: "1.1rem" }}>
                    {d.followUp.habits.map((h, i) => (
                      <li key={i}>
                        {h.step}: <span className="muted">{HABIT[h.doing]}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>

          <div className="card thrive">
            <div className="card-h">
              <div className="ic">
                <Icon name="heart" size={18} />
              </div>
              <div>
                <h3>Say this to the patient</h3>
                <p>Encouragement and the barrier, in their language. It never changes a medicine: that is the doctor&apos;s call.</p>
              </div>
            </div>
            {d.followUp.message_local ? (
              <div className="stack" style={{ gap: ".5rem" }}>
                <p className="local" lang={d.language}>
                  {d.followUp.message_local}
                </p>
                {d.language !== "en" && <p className="small muted">{d.followUp.message_english}</p>}
              </div>
            ) : (
              <p className="empty">Message withheld by the guard. Use the plan&apos;s own words.</p>
            )}
          </div>

          <div className="card">
            <div className="card-h">
              <div className="ic">
                <Icon name="clipboard" size={18} />
              </div>
              <h3>Coordinator, next</h3>
            </div>
            <ol className="small" style={{ margin: 0, paddingLeft: "1.2rem", display: "grid", gap: ".35rem" }}>
              {d.followUp.staff_next_steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
              <li>
                Next call in <b>{d.followUp.next_check_in_days}</b> day{d.followUp.next_check_in_days === 1 ? "" : "s"} ({next}).
              </li>
            </ol>
          </div>

          <div className="cta-bar no-print">
            <p className="small muted" style={{ flex: "1 1 300px" }}>
              Consultation, plan, and now the follow-up: the loop that VitaInspire Care calls <i>follow-up and treatment ownership</i>.
            </p>
            <button type="button" className="btn btn-primary" onClick={p.onNew}>
              <Icon name="refresh" /> Next patient
            </button>
          </div>
        </>
      )}
    </>
  );
}
