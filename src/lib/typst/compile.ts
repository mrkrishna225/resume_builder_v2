/**
 * Client-only Typst -> PDF compiler.
 *
 * The WASM module is fetched from a pinned CDN version (never @latest) and this
 * module must only ever be imported dynamically, after hydration, so the WASM
 * glue never enters the SSR bundle.
 */

const TYPST_VERSION = "0.7.0";
const COMPILER_WASM = `https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler@${TYPST_VERSION}/pkg/typst_ts_web_compiler_bg.wasm`;
const RENDERER_WASM = `https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-renderer@${TYPST_VERSION}/pkg/typst_ts_renderer_bg.wasm`;

import { extractPlainText } from "./text";

export class TypstCompileError extends Error {
  log: string;
  constructor(log: string) {
    super("Typst compilation failed");
    this.name = "TypstCompileError";
    this.log = log;
  }
}

type Snippet = {
  setCompilerInitOptions: (o: Record<string, unknown>) => void;
  setRendererInitOptions: (o: Record<string, unknown>) => void;
  pdf: (o: { mainContent: string }) => Promise<Uint8Array | undefined>;
};

let snippetPromise: Promise<Snippet> | null = null;

async function getSnippet(): Promise<Snippet> {
  if (typeof window === "undefined") {
    throw new Error("The Typst compiler is browser-only.");
  }
  if (!snippetPromise) {
    snippetPromise = (async () => {
      const mod = await import("@myriaddreamin/typst.ts/contrib/snippet");
      const $typst = mod.$typst as unknown as Snippet;
      $typst.setCompilerInitOptions({ getModule: () => COMPILER_WASM });
      $typst.setRendererInitOptions({ getModule: () => RENDERER_WASM });
      return $typst;
    })().catch((error) => {
      snippetPromise = null;
      throw error;
    });
  }
  return snippetPromise;
}

/** Warm the WASM compiler so the first real compile feels fast. */
export async function preloadCompiler(): Promise<void> {
  await getSnippet();
}

export interface CompileResult {
  pdf: Uint8Array;
  text: string;
}

/**
 * Compiles Typst source exactly once and returns both the PDF bytes and the
 * plain text extracted from that same source (used by the ATS scorer, so we
 * never compile twice for one iteration).
 */
export async function compileTypst(source: string): Promise<CompileResult> {
  const $typst = await getSnippet();
  try {
    const pdf = await $typst.pdf({ mainContent: source });
    if (!pdf || pdf.length === 0) throw new TypstCompileError("Compiler produced an empty PDF.");
    return { pdf, text: extractPlainText(source) };
  } catch (error) {
    if (error instanceof TypstCompileError) throw error;
    const log = error instanceof Error ? error.message : String(error);
    throw new TypstCompileError(log || "Unknown Typst error");
  }
}

export { extractPlainText };
