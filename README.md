# ResumeForge

AI-powered ATS resume builder. Paste a job description and your resume, and it rewrites + compiles
to PDF in the browser using Typst compiled to WASM. Scores the result with a deterministic ATS
keyword matcher (not LLM-scored), and loops until it hits 85% or 5 iterations.

## How it works

1. You paste a JD and your current resume
2. Server-side LLM rewrites the resume into Typst markup
3. Client-side WASM compiler turns Typst into a live PDF preview
4. A deterministic scorer checks keyword/skill overlap against the JD
5. If score < 85%, feedback goes back into the prompt and it tries again (max 5x)
6. You get the final PDF + an editable code view (Monaco editor)

## Stack

- **Frontend:** React + Vite + TypeScript, TanStack Router/Query
- **Compiler:** `@myriaddreamin/typst.ts` — Typst compiled to WASM, runs client-side
- **Editor:** Monaco Editor, lazy-loaded
- **Backend:** Nitro server functions as an LLM proxy (client never touches API keys)
- **DB:** Supabase (Postgres + Auth) for resume versions and history
- **Validation:** Zod on every request/response boundary

## Project structure

```
src/
  components/
    AtsReport.tsx        # ATS score breakdown display
    CodePerspective.tsx  # Editable Typst source view
    MonacoTypst.tsx      # Monaco editor configured for Typst
    PdfPreview.tsx       # Live PDF rendering from WASM output
    RunLog.tsx           # Iteration history log
    ScoreBadge.tsx       # Visual score indicator
  hooks/                 # Custom React hooks
  routes/                # TanStack Router file-based routes
  server.ts              # Nitro server entry
```

## Run locally

```bash
git clone https://github.com/mrkrishna225/resume_builder_v2.git
cd resume_builder_v2
npm install
npm run dev
```
