import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import type { ProviderSettings } from "./models";
import {
  FEEDBACK_SYSTEM,
  REWRITE_SYSTEM,
  SYNTAX_FIX_SYSTEM,
  buildFeedbackPrompt,
  buildRewritePrompt,
  buildSyntaxFixPrompt,
} from "./prompts";
import { sanitizeUserText } from "@/lib/sanitize";

export class RateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(`Rate limited. Retry in ${retryAfterSeconds}s.`);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class MissingKeyError extends Error {
  constructor() {
    super("No API key configured. Add your provider key in Settings to run the AI pipeline.");
    this.name = "MissingKeyError";
  }
}

const ChatCompletion = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable().optional() }).optional(),
      }),
    )
    .min(1),
});

const FeedbackSchema = z.object({
  suggestions: z.array(z.string().min(4).max(400)).min(1).max(8),
});

/* ---------- local (client-side) call budget, prevents runaway loops ---------- */

const CALL_WINDOW_MS = 60_000;
const MAX_CALLS_PER_WINDOW = 25;
let callTimestamps: number[] = [];

function assertLocalBudget() {
  const now = Date.now();
  callTimestamps = callTimestamps.filter((t) => now - t < CALL_WINDOW_MS);
  if (callTimestamps.length >= MAX_CALLS_PER_WINDOW) {
    const oldest = callTimestamps[0];
    throw new RateLimitError(Math.ceil((CALL_WINDOW_MS - (now - oldest)) / 1000));
  }
  callTimestamps.push(now);
}

/* ---------------------------- core provider call ---------------------------- */

interface ChatArgs {
  settings: ProviderSettings;
  model: string;
  system: string;
  user: string;
  signal?: AbortSignal;
  json?: boolean;
  maxTokens?: number;
}

export const proxyChatFn = createServerFn({ method: "POST" })
  .validator((data: { baseUrl: string; apiKey: string; bodyString: string }) => data)
  .handler(async (ctx) => {
    const { baseUrl, apiKey, bodyString } = ctx.data;
    
    let attempts = 0;
    const maxAttempts = 3;
    let delay = 1500; // Start with 1.5s delay
    
    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey.trim()}`,
          },
          body: bodyString,
        });

        if (response.status === 429) {
          const header = response.headers.get("retry-after");
          const seconds = header ? Number.parseInt(header, 10) : 20;
          throw new Error(`RATELIMIT:${Number.isFinite(seconds) && seconds > 0 ? seconds : 20}`);
        }

        // Retry on transient server errors (500 Internal Error, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout)
        if ([500, 502, 503, 504].includes(response.status) && attempts < maxAttempts - 1) {
          attempts++;
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2; // Exponential backoff
          continue;
        }

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          throw new Error(
            `PROVIDER_ERROR:${response.status}:${detail.slice(0, 300) || "Check your key, base URL and model id."}`
          );
        }

        return await response.json();
      } catch (err: any) {
        // If it's a network/fetch failure (not our custom errors), retry
        if (attempts < maxAttempts - 1 && !err.message?.startsWith("PROVIDER_ERROR:") && !err.message?.startsWith("RATELIMIT:")) {
          attempts++;
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }
        throw err;
      }
    }
  });

async function chat({ settings, model, system, user, signal, json, maxTokens }: ChatArgs): Promise<string> {
  if (!settings.apiKey.trim()) throw new MissingKeyError();
  assertLocalBudget();

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: maxTokens ?? 4000,
  };
  if (json) body.response_format = { type: "json_object" };

  // Removed reasoning_effort and enable_thinking flags to prevent 504 Gateway Timeouts
  // from models taking longer than 5 minutes to generate a response.

  let jsonResp: unknown;
  try {
    jsonResp = await proxyChatFn({
      data: {
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        bodyString: JSON.stringify(body),
      },
    });
  } catch (err: any) {
    if (err.message?.startsWith("RATELIMIT:")) {
      const sec = Number.parseInt(err.message.split(":")[1] || "20", 10);
      throw new RateLimitError(sec);
    }
    if (err.message?.startsWith("PROVIDER_ERROR:")) {
      const parts = err.message.split(":");
      throw new Error(`Provider returned ${parts[1]}. ${parts.slice(2).join(":")}`);
    }
    throw err;
  }

  const parsed = ChatCompletion.safeParse(jsonResp);
  if (!parsed.success) throw new Error("Provider response did not match the expected shape.");

  const content = parsed.data.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("Provider returned an empty completion.");
  return content;
}

function stripFences(raw: string): string {
  const fenced = raw.match(/```(?:typst|typ|text)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : raw).trim();
  return body.replace(/^\uFEFF/, "");
}

const TypstSource = z
  .string()
  .min(40, "Model returned too little Typst source to be a resume.")
  .refine((s) => s.includes("#") || s.includes("="), {
    message: "Response does not look like Typst source.",
  });

/* ------------------------------ public API ------------------------------ */

export async function rewriteToTypst(args: {
  settings: ProviderSettings;
  model: string;
  jobDescription: string;
  resume: string;
  iteration: number;
  previousScore?: number;
  previousSuggestions?: string[];
  previousSource?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const jd = sanitizeUserText(args.jobDescription).text;
  const resume = sanitizeUserText(args.resume).text;

  const raw = await chat({
    settings: args.settings,
    model: args.model,
    system: REWRITE_SYSTEM,
    user: buildRewritePrompt({
      jobDescription: jd,
      resume,
      iteration: args.iteration,
      previousScore: args.previousScore,
      previousSuggestions: args.previousSuggestions,
      previousSource: args.previousSource,
    }),
    signal: args.signal,
    maxTokens: 6000,
  });

  return TypstSource.parse(stripFences(raw));
}

export async function getFeedback(args: {
  settings: ProviderSettings;
  model: string;
  jobDescription: string;
  resumeText: string;
  score: number;
  missingKeywords: string[];
  signal?: AbortSignal;
}): Promise<string[]> {
  const raw = await chat({
    settings: args.settings,
    model: args.model,
    system: FEEDBACK_SYSTEM,
    user: buildFeedbackPrompt({
      jobDescription: sanitizeUserText(args.jobDescription).text,
      resumeText: sanitizeUserText(args.resumeText).text,
      score: args.score,
      missingKeywords: args.missingKeywords,
    }),
    signal: args.signal,
    json: true,
    maxTokens: 1200,
  });

  let json: unknown;
  try {
    json = JSON.parse(stripFences(raw).replace(/^[^{]*/, "").replace(/[^}]*$/, ""));
  } catch {
    throw new Error("Feedback response was not valid JSON.");
  }
  return FeedbackSchema.parse(json).suggestions.slice(0, 6);
}

export async function fixTypstSyntax(args: {
  settings: ProviderSettings;
  model: string;
  typstSource: string;
  compilerError: string;
  signal?: AbortSignal;
}): Promise<string> {
  const raw = await chat({
    settings: args.settings,
    model: args.model,
    system: SYNTAX_FIX_SYSTEM,
    user: buildSyntaxFixPrompt({
      typstSource: args.typstSource,
      compilerError: args.compilerError,
    }),
    signal: args.signal,
    maxTokens: 6000,
  });

  return TypstSource.parse(stripFences(raw));
}
