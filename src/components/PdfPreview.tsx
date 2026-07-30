import { useEffect, useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export function PdfPreview({ pdf, busy }: { pdf: Uint8Array | null; busy: boolean }) {
  const [url, setUrl] = useState<string | null>(null);

  const key = useMemo(() => (pdf ? `${pdf.byteLength}-${pdf[pdf.length - 1] ?? 0}` : "empty"), [pdf]);

  useEffect(() => {
    if (!pdf) {
      setUrl(null);
      return;
    }
    const bytes = new Uint8Array(pdf);
    const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    setUrl(blobUrl);
    // Revoked on unmount and before every recompile so blobs never accumulate.
    return () => URL.revokeObjectURL(blobUrl);
  }, [pdf, key]);

  if (busy && !url) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-[560px] w-full" />
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex h-full min-h-96 flex-col items-center justify-center gap-3 p-10 text-center">
        <FileText className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">No PDF yet</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Run the optimiser, or paste Typst into the code perspective and recompile.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Compiled PDF
        </span>
        <Button asChild size="sm" variant="outline">
          <a href={url} download="resume.pdf">
            <Download className="size-3.5" aria-hidden />
            Download
          </a>
        </Button>
      </div>
      <iframe
        title="Resume PDF preview"
        src={url}
        className="min-h-[640px] w-full flex-1 bg-muted"
      />
    </div>
  );
}
