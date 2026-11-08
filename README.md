# Setu: from a ten-minute consultation to the weeks after it

**Setu** (సేతు, "bridge") is a working prototype built for [VitaInspire](https://www.vitainspire.ai/). It sits beside **VitaInspire Care**'s coordinator → remote doctor → patient workflow and hands off to **VitaInspire Thrive**. It is built on the gap VitaInspire names on its own site:

> "A consultation may last minutes, but health is shaped by the days and weeks between consultations… Thrive helps turn healthcare guidance into achievable everyday actions."

| Step | Who | What Setu does |
|---|---|---|
| **1 · Intake** | Coordinator | Records the conversation in **Telugu, Hindi or English** (Whisper large-v3) and flags segments Whisper was unsure about. Checks vitals **on the device** as they are typed. Reads a photo of an old prescription (vision model → structured JSON). |
| **2 · Doctor brief** | Remote doctor | A 30-second brief from **gpt-oss-120b** under strict JSON Schema. Every symptom, medicine and red flag carries a **verbatim quote**, and code checks each quote against the transcript. Shows the urgency, the reason for it, the questions to ask first, and "considerations" that are explicitly not a diagnosis. |
| **3 · Take-home plan** | Patient & family | A morning, afternoon and night medicine chart, **three small daily steps** fitted to the patient's real life (Thrive), and warning signs, in the patient's language. Printable and read-aloud. **Medicines can only come from the doctor's words.** |
| **4 · Check-in call** | Coordinator, days later | The coordinator calls the patient and records the call (any of the 3 languages). Setu reads it **against the plan the patient went home with**: each medicine is marked taking, missed, stopped or not discussed (with a verified quote), plus warning signs, barriers (cost, distance, side effects) and habits. It gives **one next action**: on track · fix a barrier and call again · doctor review today · come in now. The same safety floor applies: the model can escalate but never de-escalate. |

### Why step 4 matters

Patients are mostly lost **after** the consultation, not during it. An ICMR study of ASHA-supported telemedicine in Barmer, Rajasthan found that only about [36% of patients had follow-up visits with continuity of care](https://niirncd.icmr.org.in/uploads/policybriefs/1782386587_1.PolicyBrief_Telemedicine.pdf). VitaInspire lists *"follow-up and treatment ownership"* and *"medication visibility"* as Care features. The three sample calls are the common failure modes:

| Sample call | What happened | Setu's action |
|---|---|---|
| Telugu, day 3 | Antibiotic stopped on day 2 because of loose motions. Says *"ఆయాసం ఇప్పుడు లేదు"* (no breathlessness now) | Doctor review today. The denied breathlessness does **not** escalate |
| English, day 7 | BP tablets ran out and the shop is in town, so two days missed. *"No chest pain, no blurred vision"* | Fix the barrier (refill) and call again |
| Hindi, day 1 | The referral for suspected pre-eclampsia **never happened**; *"सिर में अभी भी बहुत दर्द है"* (still a bad headache) | Come in now / 108. The rule floor forces this whatever the model says |

All three models are **open-weight**, served by **Groq**. Change `LLM_BASE_URL` and the same code runs against a self-hosted server (vLLM, Ollama) for data residency. This is tested: see [Self-hosted models](#self-hosted-open-weight-models).

---

## What makes it production-minded, not just a demo

| Guardrail | Where |
|---|---|
| **Names never leave the device.** Replaced with `[PATIENT]` in the browser, in every script entered. The server then redacts Aadhaar, ABHA, phone and email again. A preview shows exactly what is sent. | `src/lib/redact.ts` |
| **Deterministic safety floor.** Vitals thresholds plus spoken danger signs in 3 languages, **negation-aware** ("no chest pain", "నొప్పి లేదు", "दर्द नहीं") and **question-aware** ("ఛాతీ నొప్పి ఉందా?"). Final urgency = `max(model, rules)`, so the model can raise urgency but never lower it. | `src/lib/safety-rules.ts` |
| **Strict structured output.** Zod schema → strict JSON Schema (constrained decoding on gpt-oss), then zod validation. A repair pass sends the validation errors back to the model, and the token budget doubles on truncation. | `src/lib/schemas.ts`, `src/lib/server/llm.ts` |
| **Evidence verification.** Each quote is classed as quoted, near quote, vitals, document, or **not found**. Not-found facts render in red. | `src/lib/grounding.ts` |
| **The AI cannot prescribe.** Any medicine in the plan that doesn't trace to the doctor's advice is removed and reported. Staff are warned if the advice mentions more medicines than the plan shows, or if a timing is unclear. | `src/lib/plan-guard.ts` |
| **Follow-up floor.** On the check-in call: a danger sign heard → come in now; a medicine stopped or the patient getting worse → doctor review; missed doses, or a call that never covered the medicines → call again. Final action = `max(model, floor)`. Medicines the model names that aren't in the plan are dropped, and claims without a matching quote are flagged. A suggested message that changes a dose ("stop the antibiotic", "take 500 mg") is **withheld**. | `src/lib/followup-guard.ts` |
| **No PHI in logs.** Upstream error bodies (which can echo patient text) are never logged or returned. Logs carry only route, status, error code and latency. | `src/lib/server/http.ts` |
| **Abuse and failure handling.** Per-IP rate limit, input size caps, a 55 s budget per AI step (retries included), retry with backoff on 429/5xx, typed errors mapped to plain-language messages, offline detection that keeps the form. | `src/lib/server/*`, `src/lib/client.ts` |
| **Browser hardening.** Strict CSP (`connect-src 'self'`; the API key and model endpoints never reach the browser), frame-ancestors none, mic/camera self-only. | `next.config.mjs` |
| **Field realities.** 24 kbps Opus audio (~540 KB for 3 min), photos shrunk on the device to ~200 KB, °F auto-converted, self-hosted fonts, no login on a shared tablet, nothing persisted. | `Recorder.tsx`, `client.ts`, `vitals.ts` |

The "How it's built" page in the app has an architecture diagram and an honest table comparing this prototype with production.

## Run it

```bash
cp .env.example .env.local      # add GROQ_API_KEY from https://console.groq.com/keys
npm install
npm run dev                     # http://localhost:3000
```

Pick a synthetic case (Telugu pneumonia, English hypertension with negations, Hindi pre-eclampsia), or record your own.

## Test & evaluate

```bash
npm test          # 126 unit tests: redaction, safety rules (3 languages), grounding, plan guard, follow-up floor, LLM client retries/repair
npm run eval      # live eval on 7 synthetic cases + 3 check-in calls → eval/results.md
```

`npm run eval` measures what matters clinically: urgency in the expected band, **how often the model alone would have under-triaged**, red-flag recall, denied symptoms wrongly listed, share of evidence verified, invented medicines removed, check-in action in the expected band, per-medicine adherence read correctly, and latency. It runs cases one at a time and waits out 429s, so it works on Groq's free tier.

<!-- EVAL_RESULTS -->

## Self-hosted open-weight models

`src/lib/server/llm.ts` talks to any OpenAI-compatible server and uses strict JSON Schema (constrained decoding), which both vLLM and Ollama support. To run the whole eval against a model on your own GPU:

```bash
ollama pull qwen2.5:3b
LLM_BASE_URL=http://localhost:11434/v1 LLM_API_KEY=ollama TEXT_MODEL=qwen2.5:3b LLM_REASONING=off EVAL_OUT=eval/results-local-qwen2.5-3b.md npm run eval
```

<!-- LOCAL_RESULTS -->

## Deploy

**Vercel (recommended):** import the repo, set `GROQ_API_KEY`, deploy. API routes run on the Node runtime with `maxDuration = 60`.

**Docker / Render / a partner VM:**

```bash
docker build -t setu . && docker run -p 3000:3000 -e GROQ_API_KEY=... setu
```

| Env var | Default |
|---|---|
| `GROQ_API_KEY` | required (or `LLM_API_KEY` for another server) |
| `LLM_BASE_URL` | `https://api.groq.com/openai/v1` (any OpenAI-compatible server) |
| `LLM_REASONING` | `on`. Set `off` for models that reject `reasoning_effort` (e.g. qwen2.5 on Ollama) |
| `TEXT_MODEL` | `openai/gpt-oss-120b` |
| `VISION_MODEL` | `qwen/qwen3.8-27b` |
| `STT_MODEL` | `whisper-large-v3` |
| `RATE_LIMIT` | `30` requests / 5 min / IP / endpoint |
| `TRUSTED_PROXY_HOPS` | `1`. Proxies that append to `x-forwarded-for`. Set `0` if the app is exposed directly |
| `LLM_TIMEOUT_MS` | `55000`, total for one AI step including retries. Raise for slow local GPUs |
| `NEXT_PUBLIC_AUTHOR_NAME`, `NEXT_PUBLIC_AUTHOR_URL`, `NEXT_PUBLIC_REPO_URL` | footer credits |

## Layout

```
src/lib/            pure, shared by browser + server (redact, safety-rules, grounding, plan-guard, followup-guard, schemas)
src/lib/server/     server-only: Groq client, prompts, pipeline, HTTP wrapper
src/app/api/        transcribe · ocr · brief · plan · followup · health
src/components/     Intake / Brief / Plan / Check-in steps, recorder, document capture, trace panel
tests/              vitest unit tests
eval/               live evaluation harness
```

## Known limits

- A name spoken in a different script from the one typed is not caught. Addresses and village names are not redacted. Audio and photos reach the speech and vision models unredacted.
- Keyword danger signs are a floor, not a classifier. The model's own red flags sit beside them.
- Telugu and Hindi output is marked as a **draft** for a staff member to check, with English beside it.
- Thresholds are illustrative. In production they belong to the partner's clinicians.

---

Independent prototype. Not affiliated with or endorsed by VitaInspire or Digiswasthya. Not a medical device. All sample patients are synthetic.
