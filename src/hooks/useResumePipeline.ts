import { useCallback, useEffect, useRef, useState } from "react";
import { MissingKeyError, RateLimitError, fixTypstSyntax, getFeedback, rewriteToTypst } from "@/lib/ai/client";
import type { ProviderSettings } from "@/lib/ai/models";
import { MAX_ITERATIONS, TARGET_SCORE, scoreResume, type AtsResult } from "@/lib/ats/scorer";
import { extractPlainText } from "@/lib/typst/text";

export type LogLevel = "info" | "success" | "warn" | "error";

export interface LogEntry {
  id: number;
  at: number;
  level: LogLevel;
  message: string;
}

export interface IterationRecord {
  iteration: number;
  score: number;
  missingKeywords: string[];
  suggestions: string[];
}

export type Stage =
  | "idle"
  | "rewriting"
  | "compiling"
  | "scoring"
  | "feedback"
  | "waiting"
  | "done"
  | "error";

export interface PipelineState {
  stage: Stage;
  running: boolean;
  logs: LogEntry[];
  iteration: number;
  iterations: IterationRecord[];
  typstSource: string;
  pdf: Uint8Array | null;
  ats: AtsResult | null;
  suggestions: string[];
  compileError: string | null;
  error: string | null;
  retryIn: number;
}

const initialState: PipelineState = {
  stage: "idle",
  running: false,
  logs: [],
  iteration: 0,
  iterations: [],
  typstSource: "",
  pdf: null,
  ats: null,
  suggestions: [],
  compileError: null,
  error: null,
  retryIn: 0,
};

export interface RunInput {
  jobDescription: string;
  resume: string;
  model: string;
  settings: ProviderSettings;
}

export function useResumePipeline() {
  const [state, setState] = useState<PipelineState>(initialState);
  const abortRef = useRef<AbortController | null>(null);
  const logId = useRef(0);
  const countdown = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (countdown.current) clearInterval(countdown.current);
    },
    [],
  );

  const log = useCallback((level: LogLevel, message: string) => {
    logId.current += 1;
    const entry: LogEntry = { id: logId.current, at: Date.now(), level, message };
    setState((prev) => ({ ...prev, logs: [...prev.logs, entry] }));
  }, []);

  const waitWithCountdown = useCallback(
    async (seconds: number, signal: AbortSignal) => {
      setState((prev) => ({ ...prev, stage: "waiting", retryIn: seconds }));
      if (countdown.current) clearInterval(countdown.current);
      countdown.current = setInterval(() => {
        setState((prev) => ({ ...prev, retryIn: Math.max(0, prev.retryIn - 1) }));
      }, 1000);

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, seconds * 1000);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        });
      }).finally(() => {
        if (countdown.current) clearInterval(countdown.current);
        countdown.current = null;
        setState((prev) => ({ ...prev, retryIn: 0 }));
      });
    },
    [],
  );

  /** Compile with one automatic rate-limit retry. */
  const compile = useCallback(
    async (source: string, signal: AbortSignal) => {
      const { compileTypst } = await import("@/lib/typst/compile");
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      return compileTypst(source);
    },
    [],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (countdown.current) clearInterval(countdown.current);
    setState((prev) => ({ ...prev, running: false, stage: "idle", retryIn: 0 }));
    logId.current += 1;
    setState((prev) => ({
      ...prev,
      logs: [...prev.logs, { id: logId.current, at: Date.now(), level: "warn", message: "Run cancelled." }],
    }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    logId.current = 0;
    setState(initialState);
  }, []);

  const setSource = useCallback((typstSource: string) => {
    setState((prev) => ({ ...prev, typstSource }));
  }, []);

  const applyCompiled = useCallback(
    (pdf: Uint8Array, source: string, jobDescription: string) => {
      const ats = scoreResume(jobDescription, extractPlainText(source));
      setState((prev) => ({ ...prev, pdf, ats, compileError: null }));
      return ats;
    },
    [],
  );

  /** Manual recompile from the editor — never re-triggers the AI loop. */
  const recompile = useCallback(
    async (source: string, jobDescription: string) => {
      const controller = new AbortController();
      setState((prev) => ({ ...prev, stage: "compiling", compileError: null, error: null }));
      log("info", "Recompiling edited Typst source…");
      try {
        const { pdf } = await compile(source, controller.signal);
        applyCompiled(pdf, source, jobDescription);
        setState((prev) => ({ ...prev, stage: "done" }));
        log("success", "Recompile succeeded.");
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const detail = (error as { log?: string })?.log ?? message;
        setState((prev) => ({ ...prev, stage: "error", compileError: detail }));
        log("error", `Compile failed: ${detail.slice(0, 300)}`);
        return false;
      }
    },
    [applyCompiled, compile, log],
  );

  /** One-shot AI syntax repair for a broken document. */
  const autoFix = useCallback(
    async (input: { settings: ProviderSettings; model: string; jobDescription: string }) => {
      const source = state.typstSource;
      const compilerError = state.compileError ?? "unknown error";
      const controller = new AbortController();
      abortRef.current = controller;
      setState((prev) => ({ ...prev, running: true, stage: "rewriting", error: null }));
      log("info", "Asking the model to repair the Typst syntax (one attempt)…");
      try {
        const fixed = await fixTypstSyntax({
          settings: input.settings,
          model: input.model,
          typstSource: source,
          compilerError,
          signal: controller.signal,
        });
        setState((prev) => ({ ...prev, typstSource: fixed, stage: "compiling" }));
        const { pdf } = await compile(fixed, controller.signal);
        applyCompiled(pdf, fixed, input.jobDescription);
        setState((prev) => ({ ...prev, running: false, stage: "done" }));
        log("success", "Auto-fix compiled successfully.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setState((prev) => ({ ...prev, running: false, stage: "error", error: message }));
        log("error", `Auto-fix failed: ${message.slice(0, 300)}. Edit the source manually to continue.`);
      } finally {
        abortRef.current = null;
      }
    },
    [applyCompiled, compile, log, state.compileError, state.typstSource],
  );

  const run = useCallback(
    async (input: RunInput) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const { signal } = controller;

      logId.current = 0;
      setState({ ...initialState, running: true, stage: "rewriting" });

      const pushLog = (level: LogLevel, message: string) => {
        logId.current += 1;
        setState((prev) => ({
          ...prev,
          logs: [...prev.logs, { id: logId.current, at: Date.now(), level, message }],
        }));
      };

      let source = "";
      let suggestions: string[] = [];
      let lastScore = 0;
      const records: IterationRecord[] = [];

      try {
        for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
          setState((prev) => ({ ...prev, iteration, stage: "rewriting" }));
          pushLog("info", `Iteration ${iteration}/${MAX_ITERATIONS} — rewriting resume into Typst…`);

          const rewrite = () =>
            rewriteToTypst({
              settings: input.settings,
              model: input.model,
              jobDescription: input.jobDescription,
              resume: input.resume,
              iteration,
              previousScore: iteration > 1 ? lastScore : undefined,
              previousSuggestions: iteration > 1 ? suggestions : undefined,
              previousSource: iteration > 1 ? source : undefined,
              signal,
            });

          try {
            source = await rewrite();
          } catch (error) {
            if (error instanceof RateLimitError) {
              pushLog("warn", `Provider rate limit hit. Waiting ${error.retryAfterSeconds}s, then resuming…`);
              await waitWithCountdown(error.retryAfterSeconds, signal);
              setState((prev) => ({ ...prev, stage: "rewriting" }));
              source = await rewrite();
            } else {
              throw error;
            }
          }

          setState((prev) => ({ ...prev, typstSource: source, stage: "compiling" }));
          pushLog("success", `Received ${source.length} chars of Typst source.`);
          pushLog("info", "Compiling to PDF (single WASM compile per iteration)…");

          let pdf: Uint8Array;
          try {
            pdf = (await compile(source, signal)).pdf;
          } catch (error) {
            const detail = (error as { log?: string })?.log ?? (error as Error).message;
            setState((prev) => ({ ...prev, stage: "error", running: false, compileError: detail }));
            pushLog("error", `Compile failed: ${String(detail).slice(0, 300)}`);
            pushLog("warn", "Loop stopped. Use Auto-fix with AI or edit the source manually.");
            return;
          }

          setState((prev) => ({ ...prev, stage: "scoring" }));
          const ats = applyCompiled(pdf, source, input.jobDescription);
          lastScore = ats.score;
          pushLog(
            ats.score >= TARGET_SCORE ? "success" : "info",
            `Deterministic ATS score: ${ats.score}/100 (${ats.matchedKeywords.length}/${ats.totalKeywords} keywords matched).`,
          );

          const missing = ats.missingKeywords.map((k) => k.keyword);

          if (ats.score >= TARGET_SCORE || iteration === MAX_ITERATIONS) {
            records.push({ iteration, score: ats.score, missingKeywords: missing, suggestions });
            setState((prev) => ({
              ...prev,
              iterations: records,
              stage: "done",
              running: false,
            }));
            pushLog(
              "success",
              ats.score >= TARGET_SCORE
                ? `Target of ${TARGET_SCORE} reached in ${iteration} iteration(s). Done.`
                : `Reached the ${MAX_ITERATIONS}-iteration cap at ${ats.score}/100. Done.`,
            );
            return;
          }

          setState((prev) => ({ ...prev, stage: "feedback" }));
          pushLog("info", "Requesting qualitative feedback (advisory only — it never sets the score)…");
          try {
            suggestions = await getFeedback({
              settings: input.settings,
              model: input.model,
              jobDescription: input.jobDescription,
              resumeText: extractPlainText(source),
              score: ats.score,
              missingKeywords: missing.slice(0, 20),
              signal,
            });
            pushLog("success", `${suggestions.length} suggestion(s) received; feeding them back in.`);
          } catch (error) {
            if (error instanceof RateLimitError) {
              pushLog("warn", `Rate limited during feedback. Waiting ${error.retryAfterSeconds}s…`);
              await waitWithCountdown(error.retryAfterSeconds, signal);
              suggestions = [];
            } else {
              suggestions = [];
              pushLog("warn", `Feedback step failed (${(error as Error).message}); continuing without it.`);
            }
          }

          records.push({ iteration, score: ats.score, missingKeywords: missing, suggestions });
          setState((prev) => ({ ...prev, iterations: [...records], suggestions }));

          if (iteration < MAX_ITERATIONS) {
            pushLog("info", "Waiting 60 seconds before the next iteration to prevent provider timeouts...");
            await waitWithCountdown(60, signal);
          }
        }
      } catch (error) {
        if ((error as Error)?.name === "AbortError") {
          setState((prev) => ({ ...prev, running: false, stage: "idle" }));
          return;
        }
        const message =
          error instanceof MissingKeyError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error);
        setState((prev) => ({ ...prev, running: false, stage: "error", error: message }));
        pushLog("error", message.slice(0, 400));
      } finally {
        abortRef.current = null;
      }
    },
    [applyCompiled, compile, waitWithCountdown],
  );

  return { state, run, cancel, reset, recompile, autoFix, setSource, log };
}
