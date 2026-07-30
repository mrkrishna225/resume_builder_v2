import { z } from "zod";

export const SavedRunSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  title: z.string(),
  jobDescription: z.string(),
  resume: z.string(),
  typstSource: z.string(),
  score: z.number(),
  model: z.string(),
  iterations: z.number(),
  matchedKeywords: z.array(z.string()).default([]),
  missingKeywords: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
});

export type SavedRun = z.infer<typeof SavedRunSchema>;

const KEY = "resumeforge.runs.v1";
const DRAFT_KEY = "resumeforge.draft.v1";
const MAX_RUNS = 30;

function read(): SavedRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = z.array(SavedRunSchema).safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.sort((a, b) => b.createdAt - a.createdAt) : [];
  } catch {
    return [];
  }
}

function write(runs: SavedRun[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
}

export function listRuns(): SavedRun[] {
  return read();
}

export function getRun(id: string): SavedRun | undefined {
  return read().find((r) => r.id === id);
}

export function saveRun(run: Omit<SavedRun, "id" | "createdAt">): SavedRun {
  const entry: SavedRun = {
    ...run,
    id: `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  write([entry, ...read()]);
  return entry;
}

export function deleteRun(id: string) {
  write(read().filter((r) => r.id !== id));
}

export function clearRuns() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

/* ------------------------------- session draft ------------------------------- */

export interface Draft {
  jobDescription: string;
  resume: string;
  tier: string;
  typstSource?: string;
}

export function loadDraft(): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* storage full or blocked — drafts are best-effort */
  }
}
