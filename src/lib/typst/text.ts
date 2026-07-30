/** Browser-safe Typst helpers — no WASM, safe to import from SSR paths. */

/** Strips Typst markup so the scorer sees roughly what an ATS parser sees. */
export function extractPlainText(source: string): string {
  return source
    .replace(/\/\/.*$/gm, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^#(set|show|let|import|include)[^\n]*$/gm, " ")
    .replace(/#(?:[a-zA-Z][\w-]*)\s*\(/g, " ")
    .replace(/#[a-zA-Z][\w-]*/g, " ")
    .replace(/\$[^$]*\$/g, " ")
    .replace(/[*_`#\\]/g, " ")
    .replace(/[[\]{}()]/g, " ")
    .replace(/^[=\-+]+\s*/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}
