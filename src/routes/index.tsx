import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Play, Sparkles, Square, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { AtsReport } from "@/components/AtsReport";
import { CodePerspective } from "@/components/CodePerspective";
import { PaneErrorBoundary } from "@/components/PaneErrorBoundary";
import { PdfPreview } from "@/components/PdfPreview";
import { ProviderSettingsDialog } from "@/components/ProviderSettingsDialog";
import { RunLog } from "@/components/RunLog";
import { ScoreBadge } from "@/components/ScoreBadge";

import { useResumePipeline } from "@/hooks/useResumePipeline";
import { MODEL_TIERS, defaultSettings, loadSettings, type ProviderSettings } from "@/lib/ai/models";
import { MAX_ITERATIONS, TARGET_SCORE } from "@/lib/ats/scorer";
import { deleteRun, listRuns, loadDraft, saveDraft, saveRun, type SavedRun } from "@/lib/history";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ResumeForge — AI ATS Resume Builder, In Your Browser" },
      {
        name: "description",
        content:
          "Paste a job description and your resume. ResumeForge rewrites it into an ATS-optimised Typst document, compiles a live PDF, and iterates until it clears the score bar.",
      },
      { property: "og:title", content: "ResumeForge — AI ATS Resume Builder" },
      {
        property: "og:description",
        content:
          "Client-side AI resume optimisation: Typst compilation, deterministic ATS scoring, and automatic iteration — your API key never leaves your browser.",
      },
    ],
  }),
  component: Builder,
});

function Builder() {
  const [settings, setSettings] = useState<ProviderSettings>(defaultSettings);
  const [tier, setTier] = useState("balanced");
  const [jobDescription, setJobDescription] = useState("");
  const [resume, setResume] = useState("");
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const [tab, setTab] = useState("preview");

  const { state, run, cancel, reset, recompile, autoFix, setSource } = useResumePipeline();

  // Browser-only reads happen after hydration.
  useEffect(() => {
    setSettings(loadSettings());
    setRuns(listRuns());
    const draft = loadDraft();
    if (draft) {
      setJobDescription(draft.jobDescription ?? "");
      setResume(draft.resume ?? "");
      if (draft.tier) setTier(draft.tier);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => saveDraft({ jobDescription, resume, tier }), 600);
    return () => clearTimeout(timer);
  }, [jobDescription, resume, tier]);


  const model = useMemo(
    () => settings.tierModels[tier] ?? MODEL_TIERS[0].defaultModel,
    [settings.tierModels, tier],
  );

  const canRun =
    !state.running && jobDescription.trim().length > 40 && resume.trim().length > 80;

  const start = () => {
    if (!settings.apiKey) {
      toast.error("Add your API key first", {
        description: "Everything runs locally, but the model calls need your own provider key.",
      });
      return;
    }
    setTab("preview");
    void run({ jobDescription, resume, model, settings });
  };

  const persist = () => {
    if (!state.ats || !state.typstSource) return;
    const saved = saveRun({
      title: jobDescription.trim().split("\n")[0].slice(0, 60) || "Untitled role",
      jobDescription,
      resume,
      typstSource: state.typstSource,
      score: state.ats.score,
      model,
      iterations: state.iteration,
      matchedKeywords: state.ats.matchedKeywords.map((k) => k.keyword),
      missingKeywords: state.ats.missingKeywords.map((k) => k.keyword),
      suggestions: state.suggestions,
    });
    setRuns(listRuns());
    toast.success("Run saved locally", { description: saved.title });
  };

  const restore = (item: SavedRun) => {
    setJobDescription(item.jobDescription);
    setResume(item.resume);
    setSource(item.typstSource);
    setTab("code");
    toast.message("Run restored", { description: "Hit Recompile to render the PDF again." });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4" aria-hidden />
            <span className="font-serif text-xl leading-none">ResumeForge</span>
          </div>
          <p className="hidden text-xs text-muted-foreground md:block">
            AI ATS optimisation · runs entirely in your browser
          </p>
          <div className="ml-auto flex items-center gap-2">
            {state.ats && <ScoreBadge score={state.ats.score} />}
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger className="w-[190px]" aria-label="Model tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_TIERS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ProviderSettingsDialog settings={settings} onChange={setSettings} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <h1 className="sr-only">ResumeForge — AI-powered ATS resume builder</h1>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <section className="space-y-4" aria-label="Inputs">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-serif text-lg">Optimise a resume</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The loop stops as soon as the deterministic score reaches {TARGET_SCORE}, or after{" "}
                {MAX_ITERATIONS} passes.
              </p>

              <div className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="jd">Job description</Label>
                  <Textarea
                    id="jd"
                    value={jobDescription}
                    onChange={(event) => setJobDescription(event.target.value)}
                    placeholder="Paste the full posting — responsibilities, requirements, tech stack…"
                    className="min-h-40 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="resume">Your current resume</Label>
                  <Textarea
                    id="resume"
                    value={resume}
                    onChange={(event) => setResume(event.target.value)}
                    placeholder="Paste your resume as plain text."
                    className="min-h-52 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {state.running ? (
                  <Button variant="outline" onClick={cancel}>
                    <Square className="size-3.5" aria-hidden />
                    Stop run
                  </Button>
                ) : (
                  <Button onClick={start} disabled={!canRun}>
                    <Play className="size-3.5" aria-hidden />
                    Optimise resume
                  </Button>
                )}
                <Button variant="ghost" onClick={reset} disabled={state.running}>
                  Clear results
                </Button>
                {state.ats && !state.running && (
                  <Button variant="outline" onClick={persist}>
                    Save run
                  </Button>
                )}
              </div>
              {!canRun && !state.running && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Paste a job description and a resume to enable the run.
                </p>
              )}
            </div>

            {state.error && (
              <Alert variant="destructive">
                <AlertTitle>Run failed</AlertTitle>
                <AlertDescription className="break-words">{state.error}</AlertDescription>
              </Alert>
            )}

            {state.compileError && (
              <Alert>
                <AlertTitle>Typst compile error</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p className="max-h-24 overflow-y-auto break-words font-mono text-xs">
                    {state.compileError}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={state.running || !settings.apiKey}
                    onClick={() => void autoFix({ settings, model, jobDescription })}
                  >
                    {state.running ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Wand2 className="size-3.5" aria-hidden />
                    )}
                    Auto-fix with AI (one attempt)
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <RunLog logs={state.logs} stage={state.stage} retryIn={state.retryIn} />

            {runs.length > 0 && (
              <section aria-label="Saved runs" className="rounded-lg border border-border bg-card">
                <header className="border-b border-border px-3 py-2">
                  <h2 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    Saved runs
                  </h2>
                </header>
                <ul className="divide-y divide-border">
                  {runs.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => restore(item)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-sm">{item.title}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {new Date(item.createdAt).toLocaleString()} · {item.model}
                        </span>
                      </button>
                      <ScoreBadge score={item.score} />
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${item.title}`}
                        onClick={() => {
                          deleteRun(item.id);
                          setRuns(listRuns());
                        }}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </section>

          <section aria-label="Output" className="min-w-0">
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList>
                <TabsTrigger value="preview">PDF preview</TabsTrigger>
                <TabsTrigger value="report">ATS report</TabsTrigger>
                <TabsTrigger value="code">Typst code</TabsTrigger>
              </TabsList>

              <TabsContent value="preview" className="mt-3">
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <PaneErrorBoundary label="PDF preview">
                    <PdfPreview pdf={state.pdf} busy={state.running} />
                  </PaneErrorBoundary>
                </div>
              </TabsContent>

              <TabsContent value="report" className="mt-3">
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <PaneErrorBoundary label="ATS report">
                    <AtsReport
                      ats={state.ats}
                      suggestions={state.suggestions}
                      iterations={state.iterations}
                    />
                  </PaneErrorBoundary>
                </div>
              </TabsContent>

              <TabsContent value="code" className="mt-3">
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <PaneErrorBoundary label="Typst editor">
                    <CodePerspective
                      source={state.typstSource}
                      onChange={setSource}
                      busy={state.running}
                      onRecompile={() => void recompile(state.typstSource, jobDescription)}
                    />
                  </PaneErrorBoundary>
                </div>
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </main>
    </div>
  );
}
