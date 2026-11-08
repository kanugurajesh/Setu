import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icons";
import { Footer, TopBar } from "@/components/TopBar";

export const metadata: Metadata = { title: "How Setu is built" };

const GUARDRAILS = [
  {
    icon: "lock",
    t: "Names never leave the tablet",
    d: "The patient's name is replaced with [PATIENT] in the browser before any request. The server then strips Aadhaar, ABHA, phone and email again as a second layer. The panel \"What leaves this device\" shows exactly what is sent.",
  },
  {
    icon: "shield",
    t: "A deterministic safety floor",
    d: "SpO₂, BP, pulse, temperature, glucose and spoken danger signs in Telugu, Hindi and English are checked by plain code, aware of negation and questions. The model can raise urgency but never lower it below the rules.",
  },
  {
    icon: "clipboard",
    t: "Strict structured output",
    d: "gpt-oss-120b runs with Groq's strict JSON Schema mode (constrained decoding), generated from the same zod schema that validates the response. A repair pass and a bigger token budget handle the rare miss.",
  },
  {
    icon: "quote",
    t: "Every fact carries its quote",
    d: "The model must attach a verbatim quote from the conversation to each symptom, medicine and red flag. Code checks each quote. Anything not found is shown in red as \"Not found in conversation\" and never looks like a verified fact.",
  },
  {
    icon: "medicine",
    t: "The AI cannot prescribe",
    d: "Every medicine in the take-home plan must trace back to the doctor's own words, or it is removed and the removal reported. On the follow-up call, a suggested message that changes a dose or stops a medicine is withheld: only the doctor changes treatment.",
  },
  {
    icon: "eye",
    t: "Humans sign off the language",
    d: "Like VitaInspire Learn's educator-review drafts, every Telugu or Hindi plan is marked as a draft with an English version beside it, so a staff member can check it before it is handed over.",
  },
];

const ROWS: [string, string, string][] = [
  ["Data storage", "None. State lives in the browser tab; the server is stateless.", "Encrypted longitudinal record inside DigiArogyaSaarathi, with consent capture, retention policy and ABDM-compatible IDs."],
  ["Hosting the model", "Groq API serving open-weight gpt-oss-120b, Qwen 3.8 and Whisper.", "Same code, with LLM_BASE_URL pointed at gpt-oss-120b on vLLM inside an Indian region, for data residency. Groq stays as a fallback after its data-retention terms are reviewed with the partner."],
  ["Safety thresholds", "Illustrative defaults, unit-tested.", "Owned and signed off by the partner's clinicians, versioned, and every change audited."],
  ["Rate limiting", "In-memory sliding window per instance.", "Redis/Upstash, per-clinic quotas, spend alerts on the Groq project."],
  ["Auth & audit", "None (public demo).", "Coordinator and doctor login, role-based views, and an append-only audit log of every AI suggestion and the human decision taken on it."],
  ["Evaluation", "Unit tests + npm run eval over synthetic cases (urgency agreement, red-flag recall, grounding rate, medicine hallucinations, latency).", "A clinician-labelled set from real (consented, de-identified) visits; regression-gated before each model or prompt change."],
  ["Follow-up", "The coordinator calls, records or types the call, and Setu reads it against the plan. Nothing is scheduled or stored.", "A daily call list per coordinator, voice notes over WhatsApp or IVR in the patient's language, escalation when a call is missed, and loss to follow-up tracked as a headline metric."],
  ["Offline", "Safety rules work offline; requests fail gracefully and keep the form.", "Queue-and-sync for intake on 2G, with on-device Whisper (small) as a fallback."],
];

export default function HowItWorks() {
  return (
    <>
      <TopBar />
      <main className="shell" id="main">
        <div className="hero">
          <h1>Demo-level is easy. This is a sketch of production-grade.</h1>
          <p>
            Setu is a working prototype for the gap VitaInspire describes in its own words: <i>“A consultation may last minutes, but health is shaped by the days and weeks between consultations.”</i> It sits beside Care&apos;s coordinator → doctor → patient workflow and hands off to Thrive.
          </p>
        </div>

        <section className="section" style={{ marginTop: "1rem" }}>
          <h2>The loop</h2>
          <div className="cards2">
            <div className="gcard">
              <div className="ic">
                <Icon name="mic" />
              </div>
              <h3>1 · Intake, by the coordinator</h3>
              <p>Voice in Telugu, Hindi or English through Whisper large-v3, with low-confidence segments flagged. Vitals are checked on the device as they are typed. An old prescription photo is read by a vision model.</p>
            </div>
            <div className="gcard">
              <div className="ic" style={{ color: "var(--ink)" }}>
                <Icon name="stethoscope" />
              </div>
              <h3>2 · Brief, for the remote doctor</h3>
              <p>A 30-second read: urgency with its reasons, red flags, symptoms, medicines and adherence, home situation, and the questions to ask first. Every line can be expanded to show the quote it came from.</p>
            </div>
            <div className="gcard">
              <div className="ic" style={{ color: "var(--marigold-text)" }}>
                <Icon name="heart" />
              </div>
              <h3>3 · Plan, for the patient</h3>
              <p>A morning, afternoon and night medicine chart, three small daily steps fitted to their real life, and clear signs for when to come back. In their language, printable, and read aloud for patients who cannot read.</p>
            </div>
            <div className="gcard">
              <div className="ic" style={{ color: "var(--marigold-text)" }}>
                <Icon name="phone" />
              </div>
              <h3>4 · Check-in, in the days after</h3>
              <p>
                This is where patients are usually lost: the antibiotic stopped on day 2, the refill that ran out, the referral that never happened. The coordinator&apos;s call is read against the plan, one medicine at a time, and Setu says what to do next: on track, fix a barrier, doctor review today, or come in now. The safety rules set the floor here too.
              </p>
            </div>
          </div>
        </section>

        <section className="section">
          <h2>Architecture</h2>
          <div className="diagram">
            <svg viewBox="0 0 1000 430" role="img" aria-label="Architecture: the tablet sends redacted text, a small image and compressed audio to a stateless Next.js server, which calls three open-weight models on Groq and returns verified JSON.">
              <defs>
                <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0L10 5L0 10z" fill="#566474" />
                </marker>
              </defs>
              <g fontFamily="inherit" fontSize="13">
                <rect x="10" y="20" width="290" height="390" rx="18" fill="#e8f0f8" />
                <text x="30" y="50" fontSize="15" fontWeight="600" fill="#10263d">Clinic tablet (browser)</text>
                {["Recorder · 24 kbps Opus", "Photo shrunk to ~200 KB", "Name → [PATIENT]", "Safety rules (offline)", "Nothing persisted"].map((t, i) => (
                  <g key={t}>
                    <rect x="30" y={72 + i * 64} width="250" height="46" rx="11" fill="#fff" stroke="#c9d8e8" />
                    <text x="46" y={100 + i * 64} fill="#2c3b4b">{t}</text>
                  </g>
                ))}

                <rect x="360" y="20" width="300" height="390" rx="18" fill="#eef1f5" />
                <text x="380" y="50" fontSize="15" fontWeight="600" fill="#10263d">Next.js API · stateless</text>
                {["Rate limit · zod validation", "Redact Aadhaar / ABHA / phone", "Prompt + strict JSON Schema", "Verify every evidence quote", "Urgency / action = max(model, rules)", "Medicine guard: plan and call"].map((t, i) => (
                  <g key={t}>
                    <rect x="380" y={68 + i * 55} width="260" height="40" rx="10" fill="#fff" stroke="#d2dae3" />
                    <text x="396" y={93 + i * 55} fill="#2c3b4b">{t}</text>
                  </g>
                ))}

                <rect x="720" y="20" width="270" height="390" rx="18" fill="#fdf0e4" />
                <text x="740" y="50" fontSize="15" fontWeight="600" fill="#10263d">Groq · open-weight models</text>
                {[
                  ["whisper-large-v3", "speech → text"],
                  ["qwen/qwen3.8-27b", "document photo → JSON"],
                  ["openai/gpt-oss-120b", "brief · plan · check-in"],
                ].map(([m, d], i) => (
                  <g key={m}>
                    <rect x="740" y={80 + i * 92} width="230" height="66" rx="12" fill="#fff" stroke="#f0cfae" />
                    <text x="756" y={108 + i * 92} fontWeight="600" fill="#a9500f" className="mono">{m}</text>
                    <text x="756" y={130 + i * 92} fill="#566474">{d}</text>
                  </g>
                ))}
                <text x="740" y="378" fill="#566474" fontSize="12">LLM_BASE_URL can point at a self-</text>
                <text x="740" y="395" fill="#566474" fontSize="12">hosted vLLM running the same weights.</text>

                <line x1="300" y1="190" x2="356" y2="190" stroke="#566474" strokeWidth="2" markerEnd="url(#ah)" />
                <line x1="356" y1="250" x2="304" y2="250" stroke="#566474" strokeWidth="2" markerEnd="url(#ah)" />
                <text x="306" y="180" fontSize="11" fill="#566474">HTTPS</text>
                <text x="306" y="268" fontSize="11" fill="#566474">JSON</text>

                <line x1="660" y1="113" x2="736" y2="113" stroke="#566474" strokeWidth="2" markerEnd="url(#ah)" />
                <line x1="660" y1="205" x2="736" y2="205" stroke="#566474" strokeWidth="2" markerEnd="url(#ah)" />
                <line x1="660" y1="297" x2="736" y2="297" stroke="#566474" strokeWidth="2" markerEnd="url(#ah)" />
              </g>
            </svg>
          </div>
        </section>

        <section className="section">
          <h2>Six guardrails</h2>
          <div className="cards3">
            {GUARDRAILS.map((g) => (
              <div className="gcard" key={g.t}>
                <div className="ic">
                  <Icon name={g.icon} />
                </div>
                <h3>{g.t}</h3>
                <p>{g.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <h2>Built for the field, not the city</h2>
          <div className="cards2">
            <div className="gcard">
              <h3>Low connectivity</h3>
              <p>Audio is recorded at 24 kbps (about 540 KB for 3 minutes), photos are shrunk on the device, fonts are self-hosted, and the browser only ever calls its own origin. When the network drops, the form is kept and the safety check still runs.</p>
            </div>
            <div className="gcard">
              <h3>Shared devices, varying literacy</h3>
              <p>No login is needed and nothing is saved, so the next patient starts clean. The plan uses sun and moon icons for timing, large type and short sentences, and can be read aloud through the device&apos;s own speech engine.</p>
            </div>
            <div className="gcard">
              <h3>Many languages</h3>
              <p>Danger-sign rules are written in Telugu, Hindi and English, including negations like “నొప్పి లేదు” and “दर्द नहीं”. Evidence quotes stay in their original script, so the doctor sees exactly what the patient said.</p>
            </div>
            <div className="gcard">
              <h3>Connected is not the same as shared</h3>
              <p>The doctor sees the clinical brief. The patient&apos;s sheet carries only what they need at home. Neither view leaks into the other, following the principle VitaInspire sets for its ecosystem.</p>
            </div>
          </div>
        </section>

        <section className="section">
          <h2>What this prototype is, and what production needs</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="vs">
              <thead>
                <tr>
                  <th>Concern</th>
                  <th>This prototype</th>
                  <th>Production in DigiArogyaSaarathi</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map(([a, b, c]) => (
                  <tr key={a}>
                    <td>{a}</td>
                    <td>{b}</td>
                    <td>{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section">
          <h2>Known limits, stated plainly</h2>
          <div className="prose">
            <p>• A name spoken in a different script from the one typed is not caught. Village names and addresses are not redacted. Audio and document photos reach the speech and vision models unredacted.</p>
            <p>• Keyword danger signs are a floor, not a classifier. They will miss phrasings nobody has written a rule for, which is why the model&apos;s own red flags sit beside them.</p>
            <p>• Telugu and Hindi output from gpt-oss-120b is good but not perfect. That is why the plan is marked as a draft and shows the English beside it.</p>
            <p>• The grounding check proves a quote exists in the conversation. It does not prove the model interpreted it correctly. The doctor still reads the brief.</p>
            <p>• The check-in reads the plan from the open browser tab, because nothing is stored. In production the call would be matched to the patient&apos;s record in Care.</p>
          </div>
        </section>

        <div className="section">
          <Link href="/" className="btn btn-primary btn-lg" style={{ justifySelf: "start" }}>
            Try it with a sample case <Icon name="arrow" />
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
