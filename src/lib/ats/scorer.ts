/**
 * Deterministic ATS scorer — pure functions, no LLM, no network.
 * The same (jobDescription, resumeText) pair always produces the same score.
 */

const STOPWORDS = new Set(
  `a an the and or but if then than that this these those with without within into onto from for to of in on at by as is are was were be been being am do does did doing have has had having will would shall should can could may might must not no nor so such very more most other others our your their its his her they them we you i he she it who whom whose which what when where why how all any both each few many some own same only just also about above below over under again further once during before after between out off up down there here their you're we're it's don't
  we us who’s per via etc eg ie job role position candidate candidates work working works company team teams year years experience experiences requirement requirements responsibility responsibilities ability able strong good great excellent plus preferred required must include includes including new using use used help helps looking join opportunity benefits salary apply application please ideal successful across well highly across e.g i.e`
    .split(/\s+/)
    .filter(Boolean),
);

/** Small curated skills taxonomy: canonical term -> accepted surface forms. */
const SKILL_ALIASES: Record<string, string[]> = {
  javascript: ["js", "ecmascript"],
  typescript: ["ts"],
  python: ["py"],
  "node.js": ["node", "nodejs"],
  react: ["react.js", "reactjs"],
  "next.js": ["next", "nextjs"],
  postgresql: ["postgres", "psql"],
  kubernetes: ["k8s"],
  "ci/cd": ["cicd", "continuous integration", "continuous delivery"],
  "machine learning": ["ml"],
  "amazon web services": ["aws"],
  "google cloud platform": ["gcp"],
  "rest api": ["rest", "restful", "restful api"],
  graphql: ["gql"],
  "user experience": ["ux"],
  "user interface": ["ui"],
  "search engine optimization": ["seo"],
  "project management": ["pm"],
  "quality assurance": ["qa"],
  "test driven development": ["tdd"],
  sql: ["t-sql", "mysql", "sqlite"],
  docker: ["containerization", "containers"],
  agile: ["scrum", "kanban"],
};

const ALIAS_LOOKUP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    map[canonical] = canonical;
    for (const alias of aliases) map[alias] = canonical;
  }
  return map;
})();

export interface KeywordHit {
  keyword: string;
  weight: number;
  occurrences: number;
}

export interface AtsResult {
  score: number;
  matchedKeywords: KeywordHit[];
  missingKeywords: KeywordHit[];
  totalKeywords: number;
  coverage: number;
  sectionScore: number;
  formatNotes: string[];
}

const SECTION_HINTS = [
  { label: "Experience section", pattern: /\b(experience|employment|work history)\b/i },
  { label: "Education section", pattern: /\b(education|degree|bachelor|master|university)\b/i },
  { label: "Skills section", pattern: /\b(skills|technologies|technical)\b/i },
  { label: "Contact details", pattern: /(@[a-z0-9.-]+\.[a-z]{2,}|\+?\d[\d\s().-]{7,})/i },
  { label: "Quantified achievements", pattern: /\d+\s?(%|percent|x\b|k\b|m\b|users|clients|hours)/i },
];

export function normalize(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9+#./' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .map((t) => t.replace(/^[-'.]+|[-'.]+$/g, ""))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function canonicalize(term: string): string {
  return ALIAS_LOOKUP[term] ?? term;
}

/** Extract weighted keywords + 2-word phrases from the job description. */
export function extractKeywords(jobDescription: string): KeywordHit[] {
  const tokens = tokenize(jobDescription);
  const counts = new Map<string, number>();

  for (const token of tokens) {
    const key = canonicalize(token);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  for (let i = 0; i < tokens.length - 1; i += 1) {
    const phrase = `${tokens[i]} ${tokens[i + 1]}`;
    const key = canonicalize(phrase);
    if (ALIAS_LOOKUP[phrase] || ALIAS_LOOKUP[key] || SKILL_ALIASES[phrase]) {
      counts.set(key, (counts.get(key) ?? 0) + 2);
    }
  }

  const entries = [...counts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 40);

  return entries.map(([keyword, occurrences]) => ({
    keyword,
    occurrences,
    // Frequency-weighted, but capped so one repeated word can't dominate.
    weight: Math.min(3, 1 + Math.log2(occurrences)),
  }));
}

function containsKeyword(haystack: string, keyword: string): boolean {
  const forms = new Set<string>([keyword, ...(SKILL_ALIASES[keyword] ?? [])]);
  for (const form of forms) {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack)) return true;
  }
  return false;
}

export function scoreResume(jobDescription: string, resumeText: string): AtsResult {
  const keywords = extractKeywords(jobDescription);
  const haystack = normalize(resumeText);

  const matched: KeywordHit[] = [];
  const missing: KeywordHit[] = [];

  for (const hit of keywords) {
    if (containsKeyword(haystack, hit.keyword)) matched.push(hit);
    else missing.push(hit);
  }

  const totalWeight = keywords.reduce((sum, k) => sum + k.weight, 0);
  const matchedWeight = matched.reduce((sum, k) => sum + k.weight, 0);
  const coverage = totalWeight === 0 ? 0 : matchedWeight / totalWeight;

  const formatNotes: string[] = [];
  let sectionPoints = 0;
  for (const hint of SECTION_HINTS) {
    if (hint.pattern.test(resumeText)) sectionPoints += 1;
    else formatNotes.push(`Missing or unclear: ${hint.label.toLowerCase()}`);
  }
  const sectionScore = SECTION_HINTS.length === 0 ? 0 : sectionPoints / SECTION_HINTS.length;

  const wordCount = tokenize(resumeText).length;
  let lengthFactor = 1;
  if (wordCount < 120) {
    lengthFactor = 0.75;
    formatNotes.push("Resume is very short for ATS parsing (under ~120 meaningful words)");
  } else if (wordCount > 1200) {
    lengthFactor = 0.92;
    formatNotes.push("Resume is long; consider trimming to keep it scannable");
  }

  // 80% keyword coverage + 20% structural completeness, scaled by length sanity.
  const raw = (coverage * 0.8 + sectionScore * 0.2) * lengthFactor * 100;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    score,
    matchedKeywords: matched,
    missingKeywords: missing,
    totalKeywords: keywords.length,
    coverage: Math.round(coverage * 100),
    sectionScore: Math.round(sectionScore * 100),
    formatNotes,
  };
}

export const TARGET_SCORE = 98;
export const MAX_ITERATIONS = 2;

export function scoreTone(score: number): "good" | "mid" | "bad" {
  if (score >= TARGET_SCORE) return "good";
  if (score >= 70) return "mid";
  return "bad";
}
