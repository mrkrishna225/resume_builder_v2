# ResumeForge

AI-powered ATS resume builder. Paste a job description and your resume, and it rewrites + compiles
to PDF in the browser using Typst compiled to WASM. Scores the result with a deterministic ATS
keyword matcher (not LLM-scored), and loops until it hits 85% or 5 iterations.

## How it works

1. You paste a JD and your current resume
2. Server-side LLM rewrites the resume into Typst markup
3. Client-side WASM compiler turns Typst into a live PDF preview
4. Deterministic scorer checks keyword/skill overlap against the JD
5. If score < 85%, feedback goes back into the prompt and it tries again (max 5x)
6. You get the final PDF + an editable Typst code view

## Stack

- React + Vite + TypeScript
- Typst WASM compiler (`@myriaddreamin/typst.ts`)
- Monaco Editor (lazy-loaded)
- Supabase for persistence
- Zod for validation on every boundary
- Nitro server functions as LLM proxy (client never sees API keys)

## Run locally

```bash
git clone https://github.com/mrkrishna225/resume_builder_v2.git
cd resume_builder_v2
npm install
npm run dev
```
