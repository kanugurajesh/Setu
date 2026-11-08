"use client";

import type { BriefResponse } from "@/lib/client";
import type { Grounding } from "@/lib/grounding";
import { LANGUAGES, type LangCode } from "@/lib/schemas";
import { Icon } from "./icons";
import { Banner, Evidence, Redacted, Spinner, UrgencyBadge } from "./ui";

type Item = { evidence: string; grounding: Grounding };

function Facts<T extends Item>({ items, render, empty }: { items: T[]; render: (i: T) => React.ReactNode; empty: string }) {
  if (!items.length) return <p className="empty">{empty}</p>;
  return (
    <div className="facts">
      {items.map((it, i) => (
        <div key={i} className={`fact${it.grounding === "not_found" ? " unverified" : ""}`}>
          {render(it)}
          <div className="ev">
            <Evidence g={it.grounding} quote={it.evidence} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({ title, icon, children, count }: { title: string; icon: string; children: React.ReactNode; count?: number }) {
  return (
    <div className="card navy">
      <div className="card-h">
        <div className="ic">
          <Icon name={icon} size={18} />
        </div>
        <h3>
          {title} {count ? <span className="pill">{count}</span> : null}
        </h3>
      </div>
      {children}
    </div>
  );
}

export function BriefStep(p: {
  data: BriefResponse;
  stale: boolean;
  regenerating: boolean;
  onRegenerate: () => void;
  advice: string;
  setAdvice: (s: string) => void;
  sampleAdvice?: string;
  planLang: LangCode;
  setPlanLang: (l: LangCode) => void;
  onPlan: () => void;
  busy: boolean;
  error: string | null;
  briefError: string | null;
  back: () => void;
}) {
  const { brief: b, grounding: g, urgency: u, rules } = p.data;
  const pct = (n: number) => `${g.total ? (n / g.total) * 100 : 0}%`;

  return (
    <>
      {p.stale && (
        <Banner kind="warn">
          The intake changed after this brief was written.{" "}
          <button type="button" className="linkbtn" onClick={p.onRegenerate} disabled={p.regenerating}>
            {p.regenerating ? "Regenerating…" : "Regenerate brief"}
          </button>
        </Banner>
      )}
      {p.briefError && <Banner kind="err">{p.briefError}</Banner>}

      <section className={`brief-top ${u.final}`} aria-label="Summary">
        <div className="row">
          <UrgencyBadge u={u.final} lg />
          <span className="urg-math">
            AI said <b>{u.model}</b> · safety rules said <b>{u.rules}</b>
            {u.raisedByRules && <span className="pill bad">raised by safety rules</span>}
          </span>
        </div>
        <p className="summary">{b.one_line_summary}</p>
        <p className="small">
          <b>Why: </b>
          {b.urgency_reason}
        </p>
        <div className="stack" style={{ gap: ".35rem" }}>
          <div className="row small">
            <Icon name="quote" size={16} />
            <b>
              {g.total - g.notFound} of {g.total}
            </b>{" "}
            facts verified against the conversation
            {g.notFound > 0 && <span className="pill bad">{g.notFound} not found, check them</span>}
          </div>
          <div className="meter" aria-hidden>
            <span style={{ width: pct(g.quoted), background: "var(--learn)" }} />
            <span style={{ width: pct(g.close), background: "#8fb35b" }} />
            <span style={{ width: pct(g.structured), background: "var(--care)" }} />
            <span style={{ width: pct(g.notFound), background: "var(--u-emergency)" }} />
          </div>
          <div className="legend">
            <span>
              <i style={{ background: "var(--learn)" }} />
              quoted {g.quoted}
            </span>
            <span>
              <i style={{ background: "#8fb35b" }} />
              near quote {g.close}
            </span>
            <span>
              <i style={{ background: "var(--care)" }} />
              vitals / document {g.structured}
            </span>
            <span>
              <i style={{ background: "var(--u-emergency)" }} />
              not found {g.notFound}
            </span>
          </div>
        </div>
      </section>

      {(b.red_flags.length > 0 || rules.flags.length > 0) && (
        <Section title="Red flags" icon="alert" count={b.red_flags.length + rules.flags.length}>
          {rules.flags.length > 0 && (
            <div className="flags" style={{ marginBottom: ".8rem" }}>
              {rules.flags.map((f) => (
                <div key={f.id} className={`flag ${f.urgency}`}>
                  <span className="dot" />
                  <div>
                    <b>{f.label}</b> <span className="pill">safety rule · {f.source}</span>
                    <small>{f.detail}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Facts
            items={b.red_flags}
            empty="The model raised no additional red flags."
            render={(f) => (
              <>
                <div>
                  <div className="what">{f.flag}</div>
                  <div className="meta">{f.why_it_matters}</div>
                </div>
                <span className="pill">AI</span>
              </>
            )}
          />
        </Section>
      )}

      <div className="grid2">
        <Section title="Symptoms" icon="stethoscope" count={b.symptoms.length}>
          <p className="small" style={{ marginBottom: ".4rem" }}>
            <b>Chief complaint:</b> {b.chief_complaint}
          </p>
          <Facts
            items={b.symptoms}
            empty="None recorded."
            render={(s) => (
              <>
                <div>
                  <div className="what">{s.name}</div>
                  {s.duration && s.duration !== "not_stated" && <div className="meta">{s.duration}</div>}
                </div>
                {s.severity !== "not_stated" && <span className={`pill ${s.severity === "severe" ? "bad" : s.severity === "moderate" ? "warn" : ""}`}>{s.severity}</span>}
              </>
            )}
          />
          {b.pertinent_negatives.length > 0 && (
            <>
              <h4 className="small muted" style={{ margin: ".8rem 0 .2rem" }}>
                Denied
              </h4>
              <Facts items={b.pertinent_negatives} empty="" render={(n) => <div className="what">No {n.item.replace(/^no\s+/i, "")}</div>} />
            </>
          )}
        </Section>

        <Section title="Medicines now" icon="medicine" count={b.current_medications.length}>
          <Facts
            items={b.current_medications}
            empty="No current medicines mentioned."
            render={(m) => (
              <>
                <div>
                  <div className="what">{m.name}</div>
                  <div className="meta">{m.how_taken}</div>
                </div>
                {m.adherence !== "not_stated" && <span className={`pill ${m.adherence === "regular" ? "good" : "bad"}`}>{m.adherence}</span>}
              </>
            )}
          />
          {b.allergies.length > 0 && (
            <>
              <h4 className="small muted" style={{ margin: ".8rem 0 .2rem" }}>
                Allergies
              </h4>
              <Facts items={b.allergies} empty="" render={(a) => <div className="what">{a.item}</div>} />
            </>
          )}
        </Section>

        <Section title="History" icon="doc" count={b.history.length}>
          <Facts items={b.history} empty="No history mentioned." render={(h) => <div className="what">{h.item}</div>} />
        </Section>

        <Section title="Life at home" icon="family" count={b.social_context.length}>
          <Facts items={b.social_context} empty="Nothing recorded about living situation." render={(s) => <div className="what">{s.item}</div>} />
          <p className="tiny muted" style={{ marginTop: ".5rem" }}>
            Used to fit the take-home plan to the patient&apos;s real day.
          </p>
        </Section>
      </div>

      {b.questions_before_doctor.length > 0 && (
        <Section title="Ask before the doctor joins" icon="clipboard">
          <ul className="qs">
            {b.questions_before_doctor.map((q, i) => (
              <li key={i}>
                <input type="checkbox" id={`q${i}`} />
                <label htmlFor={`q${i}`}>{q}</label>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {b.considerations.length > 0 && (
        <div className="consider">
          <b className="small">For the doctor to consider: AI suggestions, not a diagnosis</b>
          <ul>
            {b.considerations.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      <details className="card">
        <summary className="disclose">
          <Icon name="eye" size={16} /> Exactly what the model saw ({b.transcript_language})
        </summary>
        <div className="preview" style={{ marginTop: ".6rem" }}>
          <Redacted text={p.data.redaction.sentText} />
        </div>
      </details>

      <div className="card thrive">
        <div className="card-h">
          <div className="ic">
            <Icon name="stethoscope" />
          </div>
          <div>
            <h3>Doctor&apos;s advice &amp; prescription</h3>
            <p>Typed by the doctor. This is the only source the take-home plan may use for treatment.</p>
          </div>
        </div>
        <div className="stack">
          <textarea className="textarea" style={{ minHeight: 160 }} value={p.advice} onChange={(e) => p.setAdvice(e.target.value)} placeholder="Impression… Tab … mg, once daily after food, for 5 days. Review in 3 days." />
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="row">
              {p.sampleAdvice && !p.advice && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => p.setAdvice(p.sampleAdvice!)}>
                  Fill sample doctor advice
                </button>
              )}
              <label className="field" style={{ minWidth: 170 }}>
                <span>Patient&apos;s language</span>
                <select className="select" value={p.planLang} onChange={(e) => p.setPlanLang(e.target.value as LangCode)}>
                  {(Object.keys(LANGUAGES) as LangCode[]).map((k) => (
                    <option key={k} value={k}>
                      {k === "te" ? "తెలుగు" : k === "hi" ? "हिन्दी" : "English"} · {LANGUAGES[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="row">
              <button type="button" className="btn btn-ghost" onClick={p.back}>
                <Icon name="back" /> Intake
              </button>
              <button type="button" className="btn btn-thrive btn-lg" onClick={p.onPlan} disabled={p.busy || p.advice.trim().length < 10}>
                {p.busy ? <Spinner label="Writing plan…" /> : <>Write take-home plan <Icon name="arrow" /></>}
              </button>
            </div>
          </div>
          {p.error && <Banner kind="err">{p.error}</Banner>}
        </div>
      </div>
    </>
  );
}
