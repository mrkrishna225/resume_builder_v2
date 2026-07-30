import { cn } from "@/lib/utils";
import { scoreTone } from "@/lib/ats/scorer";

const toneClass: Record<string, string> = {
  good: "border-score-good/30 bg-score-good/10 text-score-good",
  mid: "border-score-mid/30 bg-score-mid/10 text-score-mid",
  bad: "border-score-bad/30 bg-score-bad/10 text-score-bad",
};

export function ScoreBadge({
  score,
  size = "sm",
  className,
}: {
  score: number;
  size?: "sm" | "lg";
  className?: string;
}) {
  const tone = scoreTone(score);
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 rounded-full border font-mono tabular-nums",
        toneClass[tone],
        size === "lg" ? "px-4 py-1.5 text-2xl" : "px-2.5 py-0.5 text-xs",
        className,
      )}
      aria-label={`ATS score ${score} out of 100`}
    >
      {score}
      <span className={size === "lg" ? "text-sm opacity-70" : "text-[10px] opacity-70"}>/100</span>
    </span>
  );
}
