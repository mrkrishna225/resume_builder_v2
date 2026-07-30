# Resume Architect

# ResumeForge — Lovable Rebuild Prompt (v2)

Paste everything below into Lovable as your initial project prompt. It rebuilds ResumeForge from
scratch, keeping the parts of the original architecture that worked and fixing the structural
flaws (listed at the bottom, for your own reference — you don't need to paste that section).

---

## PROMPT START

Build **ResumeForge**, a premium AI-powered ATS resume builder. Users paste a job description
and their current resume, an AI pipeline rewrites the resume into an ATS-optimized Typst
document, compiles it to a live PDF in the browser, and iterates automatically until it clears a
quality bar — with a transparent, editable "code perspective" the whole time.

### 1. Tech Stack
- **Frontend:** React + Vite, TanStack Router for routing, TanStack Query for async state.
- **Server:** Nitro server functions (or Supabase Edge Functions if using Lovable+Supabase)
  acting as a **strict proxy layer** — the client never talks to any LLM provider directly and
  never sees an API key.
- **Compiler:** `@myriaddreamin/typst-ts-web-compiler` + `@myriaddreamin/typst.ts`, loaded
  client-side via WASM from a pinned CDN version (not `@latest`).
- **Editor:** Monaco Editor, lazy-loaded behind a dynamic import so it never blocks first paint.
- **Validation:** Zod on every request/response boundary, both client and server.
- **Persistence:** Supabase (Postgres + Auth) for resume versions and generation history. Auth is
  optional-but-supported — anonymous users get a session-scoped draft, signed-in users get saved
  history.

### 2. Design Language — "Premium Classic"
Grayscale-first, high-contrast, minimalist SaaS aesthetic:
- Neutral borders (`border-neutral-200` / `dark:border-neutral-800`), soft shadows, generous
  whitespace, no gradients or gimmicks.
- Two-pane desktop layout: **left** = inputs (JD, resume, model picker, generate button, run log);
  **right** = tabbed output (PDF Preview / Code Perspective / ATS Report).
- Collapses to a stacked single-column layout with a tab switcher on mobile.
- One accent color used sparingly for primary actions and score badges (green ≥85, amber 70–84,
  red <70) — everything else stays grayscale.

### 3. Core Pipeline (revised — see rationale below)

```
User Input (JD) ─┐
User Input (Resume) ─┼─▶ [1] Sanitize & Build Prompt ─▶ [2] LLM: Rewrite → Typst source
Model Selection ─┘

[2] output ─▶ [3] Compile Typst → PDF (client, WASM)
                  │
                  ▼ (only if compile succeeds)
[4] Deterministic ATS Scorer (keyword/skill overlap, no LLM) → base score + gaps
                  │
                  ▼
[5] LLM: Qualitative Feedback (given JD, resume, base score, gaps) → structured suggestions
                  │
                  ▼
         score ≥ 85 OR iteration == 5?
           │no                │yes
           ▼                  ▼
   feed suggestions      [6] Display final PDF + ATS Report
   back into [1],        + Code Perspective (editable Typst)
   loop (max 5x)
```

Key differences from the old flow: the Typst source is **compiled exactly once per iteration**
(not twice), and the ATS score comes from a **deterministic scorer first**, with the LLM only
asked for qualitative feedback layered on top of that number — never asked to invent the score
itself.

#### Step-by-step behavior
1. **Sanitize & Build Prompt:** Strip/escape any text in the JD or resume that looks like an
   instruction to the model (e.g. "ignore previous instructions"). Wrap user content in explicit
   delimiters and tell the model those blocks are *data*, never instructions.
2. **Rewrite step:** Server calls the LLM provider with `REWRITE_PROMPT` + sanitized JD + resume +
   (on retries) previous score/feedback. Returns raw Typst source only — no prose, no markdown
   fences. Validate the shape with Zod before returning to the client.
3. **Compile:** Client-side WASM compile of the Typst source. On failure, surface the error banner
   with an **Auto-fix with AI** button (sends broken source + compiler log to a dedicated
   `SYNTAX_FIX_PROMPT` endpoint, one attempt only, then falls back to manual edit).
4. **Deterministic ATS scorer:** Runs entirely in code (no LLM call): extract keywords/skills from
   the JD (simple NLP: tokenize, stopword-strip, optionally TF-IDF or a small skills taxonomy),
   check coverage against the resume text, compute a repeatable percentage score plus a list of
   missing/weak keywords. This is the number the user sees and the number the loop exits on.
5. **LLM feedback step:** Given the JD, current resume, and the deterministic score/gap list, ask
   the model for 3–6 concrete rewrite suggestions (structured JSON via Zod schema, not
   regex-parsed free text). This is advisory only — it does not change the score.
6. **Loop control:** If score ≥ 85 or 5 iterations reached, stop. Every iteration is visible in a
   live terminal-style log panel (not simulated — real state transitions), and the whole loop is
   cancelable via `AbortController` at any stage.
7. **Rate limiting:** Two layers — (a) server-side per-session/IP rate limiting independent of the
   provider, so abuse is capped even if the provider doesn't 429 you, and (b) client-side handling
   of provider `429`s with a live countdown and automatic resume.

### 4. Model Selection (curated, not padded)
Only list models actually suited to structured long-form rewriting/reasoning, and label them
honestly:
- **Default reasoning/rewrite model** (best structured-text quality available on your provider).
- **Fast/cheap alternative** (for users who want quicker iterations at slightly lower quality).
- **One reasoning-heavy alternative** for users who want more thorough optimization at the cost of
  latency.

Do not include pure code-completion models (e.g. StarCoder-class models) or models explicitly
marketed for unrelated tasks like synthetic-data generation — they add no value here and confuse
the choice. If you want multi-provider resilience, add a fallback provider behind the same server
proxy interface rather than hardcoding one vendor.

### 5. Server API Contract
- `POST /api/generate` — body: `{ jobDescription, resume, model, previousScore?, previousFeedback?, iteration }`,
  validated with Zod. Returns `{ typstSource }`.
- `POST /api/evaluate` — body: `{ jobDescription, resumeText }`. Runs the deterministic scorer
  server-side (keep scoring logic server-side so it can't be tampered with client-side), returns
  `{ score, matchedKeywords, missingKeywords }`.
- `POST /api/feedback` — body: `{ jobDescription, resumeText, score, missingKeywords }`. LLM call
  for qualitative suggestions only. Returns Zod-validated `{ suggestions: string[] }`.
- `POST /api/fix-syntax` — body: `{ typstSource, compilerError }`. One-shot syntax repair.
- All routes: server-only secret access (no `NVIDIA_API_KEY` fallback baked into source — the
  server should throw a clear startup error if the env var is missing, never silently use a
  default key), request size caps, and per-IP rate limiting.

### 6. Editor & Preview
- PDF renders in a **sandboxed** `<iframe>` (`sandbox="allow-scripts"` only as needed) using a
  blob URL that's revoked on unmount/recompile to avoid leaking memory.
- Monaco-based Code Perspective lets users hand-edit the Typst source and hit **Recompile**
  manually; edits here don't re-trigger the AI loop.
- Download button exports the compiled PDF.

### 7. Persistence & History (new)
- Signed-in users: every generation run (JD, resume, final Typst source, final score) is saved as
  a version they can revisit or duplicate.
- Anonymous users: session-only draft, with a prompt to sign in to save it.

### 8. Non-functional requirements
- Error boundaries around the compiler, the editor, and each pipeline stage — a failure in one
  never blank-screens the whole app.
- Loading skeletons for PDF preview and Monaco while lazy-loading.
- Accessible labels on all inputs, keyboard-navigable tab switcher, focus-visible states.
- No secrets, ever, in client bundles — audit before shipping.

## PROMPT END

---

## Why the rebuild deviates from the handover doc (for your reference, not for Lovable)

1. **LLM-graded ATS score → deterministic scorer + LLM feedback.** The old loop asked the same
   model family to both write and grade the resume, which produces scores that aren't reproducible
   and can drift or be gamed. Splitting scoring (deterministic) from feedback (LLM) fixes that.
2. **Double compile → single compile per iteration.** The diagram compiles the Typst source once
   to "grab keywords/text" and again at the end — same source, no code change in between. That's
   wasted WASM work; compile once and reuse the extracted text for scoring.
3. **Hardcoded fallback API key → hard-fail on missing env var.** A fallback key committed to
   `generate.ts` is a live secret in source control. The rebuild fails loudly instead.
4. **Model roster mismatch.** `StarCoder2` and `Nemotron-4 340B` are listed as options for a
   long-form structured-writing task despite being marketed for code completion and synthetic
   data respectively. Curated down to models actually suited to the job.
5. **No persistence/auth.** The original app has no history — every generation is disposable. The
   rebuild adds optional save/version history.
6. **No prompt-injection handling.** JD/resume text was passed straight into the prompt with no
   sanitization; a malicious JD paste could hijack the system prompt. Rebuild adds delimiter
   wrapping and instruction stripping.
7. **JSON parsing of LLM output via regex/ad hoc parsing → schema-validated structured output.**
   More reliable, fails predictably instead of silently.
8. **Unsandboxed iframe PDF preview → sandboxed + blob URL cleanup.**

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b5866919-274d-42c8-bf64-c8261196978d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
