import * as vscode from "vscode";

export interface FunctionInfo {
  name: string;
  range: vscode.Range;
  code: string;
  language: string;
  fileName: string;
  startLine: number;
}

async function getDocumentSymbols(
  doc: vscode.TextDocument
): Promise<vscode.DocumentSymbol[]> {
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    "vscode.executeDocumentSymbolProvider",
    doc.uri
  );
  return symbols ?? [];
}

function flattenSymbols(symbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
  const result: vscode.DocumentSymbol[] = [];
  for (const sym of symbols) {
    result.push(sym);
    if (sym.children?.length) {
      result.push(...flattenSymbols(sym.children));
    }
  }
  return result;
}

function isFunctionLike(kind: vscode.SymbolKind): boolean {
  return (
    kind === vscode.SymbolKind.Function ||
    kind === vscode.SymbolKind.Method ||
    kind === vscode.SymbolKind.Constructor ||
    kind === vscode.SymbolKind.Interface ||
    kind === vscode.SymbolKind.Class
  );
}

export async function getFunctionAtCursor(): Promise<FunctionInfo | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;

  const doc = editor.document;
  const cursor = editor.selection.active;

  const symbols = await getDocumentSymbols(doc);
  const flat = flattenSymbols(symbols);

  const funcSymbols = flat
    .filter((s) => isFunctionLike(s.kind))
    .filter((s) => s.range.contains(cursor))
    .sort((a, b) => {
      const aLen = a.range.end.line - a.range.start.line;
      const bLen = b.range.end.line - b.range.start.line;
      return aLen - bLen;
    });

  const sym = funcSymbols[0];
  if (!sym) return undefined;

  const code = doc.getText(sym.range);
  const fileName = doc.fileName.split("/").pop() ?? doc.fileName;

  return {
    name: sym.name,
    range: sym.range,
    code,
    language: doc.languageId,
    fileName,
    startLine: sym.range.start.line + 1,
  };
}

export async function getAllFunctions(
  doc: vscode.TextDocument
): Promise<vscode.DocumentSymbol[]> {
  const symbols = await getDocumentSymbols(doc);
  return flattenSymbols(symbols).filter((s) => isFunctionLike(s.kind));
}

export function getSelectedOrFunctionCode(
  editor: vscode.TextEditor,
  fn: FunctionInfo | undefined
): { code: string; source: "selection" | "function" | "none" } {
  if (!editor.selection.isEmpty) {
    return { code: editor.document.getText(editor.selection), source: "selection" };
  }
  if (fn) {
    return { code: fn.code, source: "function" };
  }
  return { code: "", source: "none" };
}

export function computeComplexity(code: string): {
  lines: number;
  branches: number;
  nestingDepth: number;
  score: "low" | "medium" | "high" | "very high";
} {
  const lines = code.split("\n").length;

  const branchKeywords = /\b(if|else|else if|switch|case|for|while|do|catch|&&|\|\||\?)\b/g;
  const branches = (code.match(branchKeywords) ?? []).length;

  let depth = 0;
  let maxDepth = 0;
  for (const ch of code) {
    if (ch === "{" || ch === "(") depth++;
    else if (ch === "}" || ch === ")") depth--;
    if (depth > maxDepth) maxDepth = depth;
  }
  const nestingDepth = maxDepth;

  const score =
    lines > 100 || branches > 15 || nestingDepth > 8
      ? "very high"
      : lines > 50 || branches > 8 || nestingDepth > 5
      ? "high"
      : lines > 20 || branches > 4 || nestingDepth > 3
      ? "medium"
      : "low";

  return { lines, branches, nestingDepth, score };
}
