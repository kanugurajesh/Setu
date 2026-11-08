import type { Grounding } from "@/lib/grounding";
import type { Urgency } from "@/lib/schemas";
import { Icon } from "./icons";

export const URGENCY_LABEL: Record<Urgency, string> = {
  routine: "Routine",
  soon: "See soon",
  urgent: "Urgent · today",
  emergency: "Emergency",
};

export function UrgencyBadge({ u, lg }: { u: Urgency; lg?: boolean }) {
  return (
    <span className={`urg ${u}${lg ? " lg" : ""}`}>
      {u === "emergency" || u === "urgent" ? <Icon name="alert" size={lg ? 18 : 14} /> : null}
      {URGENCY_LABEL[u]}
    </span>
  );
}

const G_LABEL: Record<Grounding, string> = {
  quoted: "Quoted",
  close: "Near quote",
  vitals: "From vitals",
  document: "From document",
  not_found: "Not found in conversation",
};

export function Evidence({ g, quote }: { g: Grounding; quote: string }) {
  const icon = g === "not_found" ? "alert" : g === "vitals" || g === "document" ? "clipboard" : "check";
  const showQuote = g === "quoted" || g === "close" || g === "not_found";
  return (
    <details className={`ev ${g}`}>
      <summary title="Show the evidence">
        <Icon name={icon} size={13} />
        {G_LABEL[g]}
      </summary>
      {showQuote ? (
        <blockquote>
          {quote}
          {g === "not_found" ? <div className="tiny muted">The model gave this quote, but it is not in the conversation. Verify before relying on it.</div> : null}
        </blockquote>
      ) : null}
    </details>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="row" role="status">
      <span className="spin" aria-hidden />
      {label ? <span>{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}

export function Banner({ kind, children }: { kind: "warn" | "err" | "info"; children: React.ReactNode }) {
  return (
    <div className={`banner ${kind}`} role={kind === "err" ? "alert" : undefined}>
      <Icon name={kind === "info" ? "shield" : "alert"} size={18} />
      <div>{children}</div>
    </div>
  );
}

/** Highlights [PATIENT], [PHONE_1] etc. in redacted text. */
export function Redacted({ text }: { text: string }) {
  const parts = text.split(/(\[(?:PATIENT|NAME|PHONE|AADHAAR|ABHA|EMAIL)(?:_\d+)?\])/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\[[A-Z]+(?:_\d+)?\]$/.test(p) ? (
          <span key={i} className="tok">
            {p.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
