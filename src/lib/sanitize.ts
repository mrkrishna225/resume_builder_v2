/**
 * Prompt-injection hardening for user-pasted text.
 *
 * Everything a user pastes (job description, resume) is DATA, never
 * instructions. We strip the common instruction-override phrasings and wrap
 * the remainder in explicit delimiters that the system prompt declares inert.
 */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|any\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/gi,
  /disregard\s+(all\s+|any\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/gi,
  /forget\s+(everything|all)\s+(you|above)[^.\n]*/gi,
  /you\s+are\s+now\s+(a|an)\s+[^.\n]*/gi,
  /(new|updated)\s+(system\s+)?(instructions?|prompt)\s*:/gi,
  /^\s*(system|assistant|developer)\s*:/gim,
  /<\/?\s*(system|assistant|user|instructions?)\s*>/gi,
  /\bprompt\s+injection\b/gi,
  /reveal\s+(your|the)\s+(system\s+)?(prompt|instructions?)/gi,
  /do\s+not\s+follow\s+(the\s+)?(user|previous)[^.\n]*/gi,
];

const DELIMITER_LEAKS = /(\[\[\/?(?:JOB_DESCRIPTION|RESUME|END)[^\]]*\]\])/gi;

export const MAX_INPUT_CHARS = 20000;

export interface SanitizeResult {
  text: string;
  removed: number;
  truncated: boolean;
}

export function sanitizeUserText(input: string): SanitizeResult {
  let removed = 0;
  let text = (input ?? "").replace(/\u0000/g, "");

  const truncated = text.length > MAX_INPUT_CHARS;
  if (truncated) text = text.slice(0, MAX_INPUT_CHARS);

  text = text.replace(DELIMITER_LEAKS, () => {
    removed += 1;
    return "[redacted]";
  });

  for (const pattern of INJECTION_PATTERNS) {
    text = text.replace(pattern, () => {
      removed += 1;
      return "[redacted]";
    });
  }

  return { text: text.trim(), removed, truncated };
}

/** Wraps sanitized content in a labelled, inert data block. */
export function asDataBlock(label: "JOB_DESCRIPTION" | "RESUME" | "TYPST_SOURCE", body: string) {
  return `[[${label}]]\n${body}\n[[END_${label}]]`;
}
