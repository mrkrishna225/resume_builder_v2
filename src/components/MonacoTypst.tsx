import { useEffect } from "react";
import Editor from "@monaco-editor/react";
import { Skeleton } from "@/components/ui/skeleton";

export default function MonacoTypst({
  value,
  onChange,
  onReady,
}: {
  value: string;
  onChange: (value: string) => void;
  onReady?: () => void;
}) {
  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return (
    <Editor
      height="100%"
      defaultLanguage="markdown"
      value={value}
      onChange={(next) => onChange(next ?? "")}
      loading={<Skeleton className="h-full w-full" />}
      options={{
        fontSize: 13,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        minimap: { enabled: false },
        wordWrap: "on",
        scrollBeyondLastLine: false,
        renderLineHighlight: "line",
        padding: { top: 12, bottom: 12 },
        tabSize: 2,
        automaticLayout: true,
      }}
    />
  );
}
