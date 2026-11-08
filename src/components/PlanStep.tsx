"use client";

import { useEffect, useState } from "react";
import type { PlanResponse } from "@/lib/client";
import type { LangCode, Plan } from "@/lib/schemas";
import { Icon } from "./icons";
import { Banner, Spinner } from "./ui";

const T: Record<LangCode, Record<string, string>> = {
  te: {
    plan: "మీ ఆరోగ్య ప్రణాళిక",
    meds: "మీ మందులు",
    morning: "ఉదయం",
    afternoon: "మధ్యాహ్నం",
    night: "రాత్రి",
    steps: "రోజూ చేయవలసిన 3 చిన్న పనులు",
    danger: "ఇవి కనిపిస్తే వెంటనే రండి",
    follow: "మళ్ళీ ఎప్పుడు రావాలి",
    before_food: "భోజనానికి ముందు",
    after_food: "భోజనం తర్వాత",
    with_food: "భోజనంతో",
    any_time: "ఎప్పుడైనా",
    not_specified: "సిబ్బందిని అడగండి",
  },
  hi: {
    plan: "आपकी सेहत की योजना",
    meds: "आपकी दवाइयाँ",
    morning: "सुबह",
    afternoon: "दोपहर",
    night: "रात",
    steps: "रोज़ के 3 छोटे कदम",
    danger: "ये दिखें तो तुरंत आएँ",
    follow: "फिर कब आना है",
    before_food: "खाने से पहले",
    after_food: "खाने के बाद",
    with_food: "खाने के साथ",
    any_time: "कभी भी",
    not_specified: "स्टाफ़ से पूछें",
  },
  en: {
    plan: "Your health plan",
    meds: "Your medicines",
    morning: "Morning",
    afternoon: "Afternoon",
    night: "Night",
    steps: "3 small steps every day",
    danger: "Come back immediately if",
    follow: "Next visit",
    before_food: "Before food",
    after_food: "After food",
    with_food: "With food",
    any_time: "Any time",
    not_specified: "Ask the staff",
  },
};
const LANG_NAME: Record<LangCode, string> = { te: "Telugu", hi: "Hindi", en: "English" };
const BCP47: Record<LangCode, string> = { te: "te-IN", hi: "hi-IN", en: "en-IN" };

function plainText(plan: Plan, lang: LangCode): string {
  const t = T[lang];
  const when = (m: Plan["medicines"][number]) => [m.morning && t.morning, m.afternoon && t.afternoon, m.night && t.night].filter(Boolean).join(" · ");
  return [
    plan.summary_local,
    "",
    `${t.meds}:`,
    ...plan.medicines.map((m) => `• ${m.name}: ${when(m) || t.not_specified}, ${t[m.food]}, ${m.duration_local}. ${m.how_to_take_local}`),
    "",
    `${t.steps}:`,
    ...plan.daily_steps.map((s, i) => `${i + 1}. ${s.title_local}: ${s.detail_local}`),
    "",
    `${t.danger}:`,
    ...plan.return_immediately_if_local.map((s) => `! ${s}`),
    "",
    `${t.follow}: ${plan.follow_up_local}`,
  ].join("\n");
}

export function PlanStep(p: {
  data: PlanResponse;
  patientName: string;
  stale: boolean;
  regenerating: boolean;
  onRegenerate: () => void;
  onNew: () => void;
  onFollowUp: () => void;
  back: () => void;
}) {
  const { plan, warnings, language: lang } = p.data;
  const t = T[lang];
  const [showEnglish, setShowEnglish] = useState(lang !== "en");
  const [speaking, setSpeaking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function speak() {
    const synth = window.speechSynthesis;
    if (!synth) return setNote("This browser cannot read aloud.");
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(plainText(plan, lang).replace(/[•!]/g, ""));
    u.lang = BCP47[lang];
    u.rate = 0.88;
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
    if (voice) u.voice = voice;
    else setNote(`No ${LANG_NAME[lang]} voice is installed on this device, so read-aloud may not work. Android tablets usually include one under Text-to-speech settings.`);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(plainText(plan, lang));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setNote("Copy was blocked by the browser.");
    }
  }

  const today = new Date().toLocaleDateString(lang === "en" ? "en-IN" : BCP47[lang], { day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      {p.stale && (
        <Banner kind="warn">
          The doctor&apos;s advice or language changed after this plan was written.{" "}
          <button type="button" className="linkbtn" onClick={p.onRegenerate} disabled={p.regenerating}>
            {p.regenerating ? "Rewriting…" : "Rewrite plan"}
          </button>
        </Banner>
      )}
      {warnings.length > 0 && (
        <Banner kind="warn">
          <b>Check before handing over:</b>
          <ul style={{ margin: ".3rem 0 0", paddingLeft: "1.1rem" }}>
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Banner>
      )}

      <div className="row no-print">
        <button type="button" className="btn btn-ghost" onClick={p.back}>
          <Icon name="back" /> Brief
        </button>
        <span className="spacer" />
        <button type="button" className="btn btn-ghost" onClick={speak}>
          <Icon name={speaking ? "stop" : "speaker"} /> {speaking ? "Stop" : "Read aloud"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={copy}>
          <Icon name={copied ? "check" : "copy"} /> {copied ? "Copied" : "Copy text"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
          <Icon name="print" /> Print
        </button>
      </div>
      {note && <Banner kind="info">{note}</Banner>}

      <article className="sheet" lang={lang}>
        <header className="sheet-h">
          <div style={{ flex: 1 }}>
            <p>{today}</p>
            <h2>
              {t.plan}
              {p.patientName ? `: ${p.patientName}` : ""}
            </h2>
          </div>
          {lang !== "en" && (
            <span className="draft no-print">
              <Icon name="alert" size={15} /> Draft: a staff member who reads {LANG_NAME[lang]} must check this before it is handed over
            </span>
          )}
        </header>

        <div className="sheet-b">
          <p className="local">{plan.summary_local}</p>

          <section>
            <div className="sec-t">
              <Icon name="medicine" /> {t.meds}
            </div>
            {plan.medicines.length === 0 ? (
              <p className="empty">No medicines in the doctor&apos;s advice.</p>
            ) : (
              <div className="meds">
                {plan.medicines.map((m, i) => (
                  <div key={i} className="med">
                    <div className="stack" style={{ gap: ".25rem" }}>
                      <div className="row">
                        <b>{m.name}</b>
                        <span className="food">{t[m.food]}</span>
                      </div>
                      <div className="local">{m.purpose_local}</div>
                      <div className="small muted">
                        {m.duration_local} · {m.how_to_take_local}
                      </div>
                    </div>
                    <div className="slots" aria-label="When to take">
                      <span className={`slot${m.morning ? " on" : ""}`}>
                        <Icon name="sunrise" size={24} />
                        {t.morning}
                      </span>
                      <span className={`slot${m.afternoon ? " on" : ""}`}>
                        <Icon name="sun" size={24} />
                        {t.afternoon}
                      </span>
                      <span className={`slot night${m.night ? " on" : ""}`}>
                        <Icon name="moon" size={24} />
                        {t.night}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="sec-t">
              <Icon name="heart" /> {t.steps}
            </div>
            <div className="habits">
              {plan.daily_steps.map((s, i) => (
                <div key={i} className="habit">
                  <div className="hi">
                    <Icon name={s.icon} size={26} />
                  </div>
                  <b>{s.title_local}</b>
                  <p>{s.detail_local}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="danger">
            <div className="sec-t" style={{ color: "#7a1a12" }}>
              <Icon name="alert" /> {t.danger}
            </div>
            <ul>
              {plan.return_immediately_if_local.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>

          <div className="followup">
            <Icon name="refresh" size={26} />
            <div>
              <b>{t.follow}: </b>
              {plan.follow_up_local}
            </div>
          </div>

          {lang !== "en" && (
            <div className="english">
              <button type="button" className="linkbtn small no-print" onClick={() => setShowEnglish((v) => !v)}>
                {showEnglish ? "Hide" : "Show"} English version for staff check
              </button>
              {showEnglish && (
                <div style={{ marginTop: ".6rem" }}>
                  <p>{plan.english.summary}</p>
                  <b>Medicines</b>
                  <ul>
                    {plan.english.medicines.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                  <b>Daily steps</b>
                  <ul>
                    {plan.english.daily_steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                  <b>Return immediately if</b>
                  <ul>
                    {plan.english.return_immediately_if.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                  <p>
                    <b>Follow-up:</b> {plan.english.follow_up}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </article>

      <div className="cta-bar no-print">
        <p className="small muted" style={{ flex: "1 1 300px" }}>
          The plan carries no clinical record, only what the patient needs at home. That keeps to VitaInspire&apos;s rule: <i>connected is not the same as shared</i>.
        </p>
        <div className="row">
          {p.regenerating && <Spinner />}
          <button type="button" className="btn btn-ghost" onClick={p.onNew}>
            <Icon name="refresh" /> Next patient
          </button>
          <button type="button" className="btn btn-primary" onClick={p.onFollowUp}>
            <Icon name="phone" /> Check-in call <Icon name="arrow" />
          </button>
        </div>
      </div>
    </>
  );
}
