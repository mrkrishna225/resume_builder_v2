import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  DEFAULT_BASE_URL,
  DEFAULT_API_KEY,
  MODEL_TIERS,
  clearSettings,
  defaultSettings,
  saveSettings,
  type ProviderSettings,
} from "@/lib/ai/models";

export function ProviderSettingsDialog({
  settings,
  onChange,
}: {
  settings: ProviderSettings;
  onChange: (settings: ProviderSettings) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(settings);

  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  const commit = () => {
    const next: ProviderSettings = {
      ...draft,
      baseUrl: draft.baseUrl.trim().replace(/\/+$/, "") || DEFAULT_BASE_URL,
      apiKey: draft.apiKey.trim(),
    };
    saveSettings(next);
    onChange(next);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={settings.apiKey ? "outline" : "default"} size="sm">
          <KeyRound className="size-3.5" aria-hidden />
          {settings.apiKey ? "API settings" : "Add API key"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Provider settings</DialogTitle>
          <DialogDescription>
            Everything runs in your browser. Your key is stored only in this browser's local storage and
            is sent straight to your provider — never to us.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Quick presets</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full flex-1"
                onClick={() => setDraft({
                  baseUrl: "https://integrate.api.nvidia.com/v1",
                  apiKey: DEFAULT_API_KEY,
                  tierModels: {
                    balanced: "mistralai/mistral-medium-3.5-128b",
                    fast: "minimaxai/minimax-m3",
                    deep: "google/gemma-4-31b-it"
                  }
                })}
              >
                Nvidia NIM Preset
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full flex-1"
                onClick={() => setDraft({
                  baseUrl: "https://api.openai.com/v1",
                  apiKey: "",
                  tierModels: {
                    balanced: "gpt-4.1",
                    fast: "gpt-4.1-mini",
                    deep: "o4-mini"
                  }
                })}
              >
                OpenAI Preset
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="base-url">OpenAI-compatible base URL</Label>
            <Input
              id="base-url"
              value={draft.baseUrl}
              placeholder={DEFAULT_BASE_URL}
              onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Works with OpenAI, OpenRouter, Groq, Together, or any compatible endpoint.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="api-key">API key</Label>
            <Input
              id="api-key"
              type="password"
              autoComplete="off"
              value={draft.apiKey}
              placeholder="sk-…"
              onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
            />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden />
              Stored locally. Clear it any time with the button below.
            </p>
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-medium">Model per tier</p>
            {MODEL_TIERS.map((tier) => (
              <div key={tier.id} className="space-y-1.5">
                <Label htmlFor={`model-${tier.id}`}>{tier.label}</Label>
                <Input
                  id={`model-${tier.id}`}
                  value={draft.tierModels[tier.id] ?? tier.defaultModel}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      tierModels: { ...draft.tierModels, [tier.id]: event.target.value },
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">{tier.blurb}</p>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              clearSettings();
              const fresh = defaultSettings();
              setDraft(fresh);
              onChange(fresh);
            }}
          >
            Clear stored key
          </Button>
          <Button type="button" onClick={commit}>
            Save settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
