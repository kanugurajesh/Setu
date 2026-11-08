"use client";

import { Icon } from "./icons";

export interface TraceEntry {
  id: number;
  step: string;
  model?: string;
  latencyMs?: number;
  tokens?: { in?: number; out?: number };
  attempts?: number;
  notes: string[];
  ok: boolean;
  at: string;
}

export function TracePanel({ entries, onClear }: { entries: TraceEntry[]; onClear: () => void }) {
  return (
    <section className="card trace" aria-label="System trace">
      <div className="row">
        <h3>
          <Icon name="bolt" size={18} /> System trace
        </h3>
        <span className="spacer" />
        {entries.length > 0 && (
          <button type="button" className="linkbtn tiny" onClick={onClear}>
            clear
          </button>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="small muted" style={{ marginTop: ".6rem" }}>
          Every AI call shows up here: which open-weight model ran, how long it took, how many tokens it used, and what the guardrails did with the answer.
        </p>
      ) : (
        <ol>
          {entries
            .slice()
            .reverse()
            .map((e) => (
              <li key={e.id} className={e.ok ? "" : "fail"}>
                <div className="tt">
                  <span>{e.step}</span>
                  {e.latencyMs !== undefined && <span className="speed">{(e.latencyMs / 1000).toFixed(1)} s</span>}
                </div>
                <div className="tm mono">
                  {e.model ?? (e.ok ? "on device" : "request failed")}
                  {e.tokens?.in ? ` · ${e.tokens.in}→${e.tokens.out} tok` : ""}
                  {e.attempts && e.attempts > 1 ? ` · ${e.attempts} attempts` : ""} · {e.at}
                </div>
                {e.notes.length > 0 && (
                  <ul className="notes">
                    {e.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
        </ol>
      )}
      <p className="privacy" style={{ marginTop: ".9rem" }}>
        <Icon name="lock" size={16} />
        <span>Nothing is stored on the server. Patient names never leave this device. Close the tab and the session is gone.</span>
      </p>
    </section>
  );
}
