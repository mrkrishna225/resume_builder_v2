# ResumeForge — Client-Only Build Plan

Everything runs in the browser: no server functions, no backend, no database. One note up front: with no server there's no place to hide a provider key, so AI calls use a **user-supplied API key** entered in the app and kept in `localStorage` only (never committed, never bundled). Users who don't enter a key can still use the deterministic scorer, the Typst editor, and PDF compilation.

## Screens
1. `/` — Landing: what it does, before/after sample, CTA into the builder.
2. `/builder` — the two-pane workspace.
   - Left: JD textarea, resume textarea, model picker, API-key field (masked, collapsible), Generate/Cancel, live terminal-style run log.
   - Right: tabs — PDF Preview / Code Perspective (Monaco) / ATS Report.
   - Mobile: stacked single column with a tab switcher.
3. `/history` — locally saved runs, revisit or duplicate (stored in IndexedDB/localStorage).

## Pipeline (all in-browser)
Per iteration: sanitize inputs → LLM rewrite to Typst → **one** WASM compile → extract text → deterministic scorer → LLM qualitative feedback → loop or stop (score ≥ 85 or 5 iterations). Fully cancelable with `AbortController`; every state transition streamed into the log panel.

- **Sanitizer**: strips instruction-like phrasing from JD/resume and wraps user content in explicit data delimiters, so a pasted JD can't hijack the prompt.
- **Deterministic scorer** (pure TS module, no LLM): tokenize the JD, strip stopwords, small skills taxonomy plus n-gram phrase matching, coverage-weighted percentage, matched/missing keyword lists. Same input always yields the same score.
- **LLM feedback**: 3–6 concrete suggestions, parsed through a Zod schema (structured output, no regex scraping). Advisory only — it never sets the score.
- **Compile failures**: error banner with **Auto-fix with AI** (one attempt), then manual editing.
- **Rate limits**: provider `429` handled with a live countdown and automatic resume; a local per-minute call cap prevents runaway loops.
- Score badges: green ≥85, amber 70–84, red <70.

## AI calls
A single client module wraps `fetch` to the provider's chat-completions endpoint with the user's key: `rewriteToTypst`, `getFeedback`, `fixSyntax`. All responses Zod-validated. The module is provider-agnostic so a second provider can be dropped in behind the same interface.

## Model picker
Three honestly-labeled tiers — a balanced default for structured long-form rewriting, a fast/cheap option, and a reasoning-heavy option for thorough passes. No code-completion or synthetic-data models.

## Typst compiler
`@myriaddreamin/typst.ts` + `typst-ts-web-compiler` at pinned versions, WASM served from `public/wasm/`, dynamically imported after hydration so it never enters the SSR bundle. Compiled PDF shown in a sandboxed `<iframe>` via a blob URL that's revoked on unmount and on every recompile. Download button exports the PDF.

## Editor
Monaco, lazy-loaded behind a dynamic import with a skeleton. Manual **Recompile** button; hand edits never re-trigger the AI loop.

## Persistence
Local only: runs (JD, resume, final Typst source, score, model, iterations) saved to IndexedDB, listed on `/history`, duplicable back into the builder. Clear-all control included.

## Design language
Grayscale "Premium Classic": neutral borders, soft shadows, generous whitespace, no gradients. One restrained accent for primary actions and score badges. All colors as semantic tokens in `src/styles.css`; a distinctive non-default type pairing rather than Inter/Poppins.

## Non-functional
- Error boundaries around the compiler, the editor, and each pipeline stage — one failure never blank-screens the app.
- Loading skeletons for PDF preview and Monaco.
- Accessible labels, keyboard-navigable tabs, focus-visible states.
- Per-route SEO metadata. No secrets in the bundle — the only key is the one the user types.

## Build order
1. Design system, landing page, app shell and routing.
2. Typst WASM module + sandboxed PDF preview (manual compile working end to end).
3. Deterministic scorer + ATS report panel.
4. AI client module (rewrite / feedback / syntax-fix) with sanitizer, Zod schemas, key storage UI.
5. Orchestrated iteration loop with live log, cancel, and 429 countdown.
6. Monaco Code Perspective, manual recompile, PDF download.
7. Local history: save, revisit, duplicate, clear.
8. Verification pass in the preview browser: real compile + run, console/network check.

## Technical notes
Typst WASM and Monaco stay strictly client-only (dynamic import after hydration, never statically imported from an SSR route). Scoring lives in a pure module so it's deterministic and testable. Route files remain thin; no `createServerFn` anywhere in this build.
