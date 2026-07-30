export interface ModelTier {
  id: string;
  label: string;
  blurb: string;
  defaultModel: string;
}

/**
 * Curated tiers only. No code-completion or synthetic-data models — they add
 * nothing to structured long-form rewriting.
 */
export const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
export const DEFAULT_API_KEY = "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";

export const MODEL_TIERS: ModelTier[] = [
  {
    id: "balanced",
    label: "Balanced (recommended)",
    blurb: "Best all-round quality for structured resume rewriting.",
    defaultModel: "mistralai/mistral-medium-3.5-128b",
  },
  {
    id: "fast",
    label: "Fast & cheap",
    blurb: "Quicker iterations, slightly lower writing quality.",
    defaultModel: "minimaxai/minimax-m3",
  },
  {
    id: "deep",
    label: "Reasoning-heavy",
    blurb: "More thorough optimisation, noticeably slower.",
    defaultModel: "google/gemma-4-31b-it",
  },
];

export interface ProviderSettings {
  baseUrl: string;
  apiKey: string;
  tierModels: Record<string, string>;
}

const STORAGE_KEY = "resumeforge.provider.v1";

export function defaultSettings(): ProviderSettings {
  return {
    baseUrl: DEFAULT_BASE_URL,
    apiKey: DEFAULT_API_KEY,
    tierModels: Object.fromEntries(MODEL_TIERS.map((t) => [t.id, t.defaultModel])),
  };
}

/** Browser-only. Call from effects/handlers, never during render or SSR. */
export function loadSettings(): ProviderSettings {
  if (typeof window === "undefined") return defaultSettings();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<ProviderSettings>;
    return {
      ...defaultSettings(),
      ...parsed,
      tierModels: { ...defaultSettings().tierModels, ...(parsed.tierModels ?? {}) },
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: ProviderSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearSettings() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
