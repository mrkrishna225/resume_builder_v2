import { lazy, Suspense, useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Monaco is heavy: lazy-loaded so it never blocks first paint.
const MonacoEditor = lazy(() => import("./MonacoTypst"));

function EditorSkeleton() {
  return (
    <div className="space-y-2 p-4">
      <Skeleton className="h-4 w-52" />
      <Skeleton className="h-[520px] w-full" />
    </div>
  );
}

export function CodePerspective({
  source,
  onChange,
  onRecompile,
  busy,
}: {
  source: string;
  onChange: (value: string) => void;
  onRecompile: () => void;
  busy: boolean;
}) {
  const [mounted, setMounted] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Typst source {mounted ? "" : "· loading editor"}
        </span>
        <Button size="sm" variant="outline" onClick={onRecompile} disabled={busy || !source.trim()}>
          <Play className="size-3.5" aria-hidden />
          Recompile
        </Button>
      </div>
      <div className="h-[560px] w-full">
        <Suspense fallback={<EditorSkeleton />}>
          <MonacoEditor value={source} onChange={onChange} onReady={() => setMounted(true)} />
        </Suspense>
      </div>
      <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        Manual edits never re-trigger the AI loop — hit Recompile to see them.
      </p>
    </div>
  );
}
