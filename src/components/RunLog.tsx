import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { LogEntry, Stage } from "@/hooks/useResumePipeline";

const levelClass: Record<LogEntry["level"], string> = {
  info: "text-muted-foreground",
  success: "text-score-good",
  warn: "text-score-mid",
  error: "text-score-bad",
};

const stageLabel: Record<Stage, string> = {
  idle: "Idle",
  rewriting: "Rewriting",
  compiling: "Compiling",
  scoring: "Scoring",
  feedback: "Feedback",
  waiting: "Rate limited",
  done: "Complete",
  error: "Error",
};

function time(at: number) {
  return new Date(at).toLocaleTimeString([], { hour12: false });
}

export function RunLog({
  logs,
  stage,
  retryIn,
}: {
  logs: LogEntry[];
  stage: Stage;
  retryIn: number;
}) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [logs.length, retryIn]);

  return (
    <section aria-label="Run log" className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          Run log
        </h3>
        <span className="font-mono text-[11px] text-muted-foreground">
          {stageLabel[stage]}
          {stage === "waiting" && retryIn > 0 ? ` · resuming in ${retryIn}s` : ""}
        </span>
      </header>
      <div className="max-h-56 overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed">
        {logs.length === 0 ? (
          <p className="text-muted-foreground">Waiting to start. Every pipeline step appears here.</p>
        ) : (
          <ul className="space-y-1">
            {logs.map((entry) => (
              <li key={entry.id} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground/60">{time(entry.at)}</span>
                <span className={cn("break-words", levelClass[entry.level])}>{entry.message}</span>
              </li>
            ))}
          </ul>
        )}
        <div ref={endRef} />
      </div>
    </section>
  );
}
