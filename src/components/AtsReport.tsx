import { CheckCircle2, CircleSlash, Info } from "lucide-react";
import type { AtsResult } from "@/lib/ats/scorer";
import { TARGET_SCORE } from "@/lib/ats/scorer";
import { ScoreBadge } from "@/components/ScoreBadge";
import type { IterationRecord } from "@/hooks/useResumePipeline";

function KeywordList({
  title,
  icon,
  keywords,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  keywords: string[];
  tone: "good" | "bad";
}) {
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        {icon}
        {title}
        <span className="text-muted-foreground">({keywords.length})</span>
      </h4>
      {keywords.length === 0 ? (
        <p className="text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {keywords.map((keyword) => (
            <li
              key={keyword}
              className={
                tone === "good"
                  ? "rounded border border-score-good/25 bg-score-good/10 px-2 py-0.5 font-mono text-xs text-score-good"
                  : "rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground"
              }
            >
              {keyword}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AtsReport({
  ats,
  suggestions,
  iterations,
}: {
  ats: AtsResult | null;
  suggestions: string[];
  iterations: IterationRecord[];
}) {
  if (!ats) {
    return (
      <div className="flex h-full min-h-96 flex-col items-center justify-center gap-3 p-10 text-center">
        <Info className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">No report yet</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          The score is computed in code from keyword coverage — the model never grades itself.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Deterministic ATS score
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Target is {TARGET_SCORE}. Same input always yields the same number.
          </p>
        </div>
        <ScoreBadge score={ats.score} size="lg" />
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[
          { label: "Keyword coverage", value: `${ats.coverage}%` },
          { label: "Structure complete", value: `${ats.sectionScore}%` },
          { label: "Keywords tracked", value: `${ats.totalKeywords}` },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border bg-card px-3 py-2">
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd className="mt-0.5 font-mono text-lg tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>

      <KeywordList
        title="Matched"
        tone="good"
        icon={<CheckCircle2 className="size-4 text-score-good" aria-hidden />}
        keywords={ats.matchedKeywords.map((k) => k.keyword)}
      />
      <KeywordList
        title="Missing or weak"
        tone="bad"
        icon={<CircleSlash className="size-4 text-muted-foreground" aria-hidden />}
        keywords={ats.missingKeywords.map((k) => k.keyword)}
      />

      {ats.formatNotes.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium">Structural notes</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {ats.formatNotes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </div>
      )}

      {suggestions.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium">AI suggestions (advisory only)</h4>
          <ol className="space-y-2 text-sm">
            {suggestions.map((suggestion, index) => (
              <li key={suggestion} className="flex gap-2">
                <span className="font-mono text-xs text-muted-foreground">{index + 1}.</span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {iterations.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium">Iteration history</h4>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {iterations.map((record) => (
              <li key={record.iteration} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  Pass {record.iteration}
                </span>
                <ScoreBadge score={record.score} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
