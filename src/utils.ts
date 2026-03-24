import * as vscode from "vscode";

export function getNonce(): string {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function getFileContext(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;

  const cfg = vscode.workspace.getConfiguration("aiCodingAgent");
  const contextLines = cfg.get<number>("contextLines", 50);

  const doc = editor.document;
  const sel = editor.selection;
  const lang = doc.languageId;
  const fileName = doc.fileName.split("/").pop() ?? doc.fileName;

  let context = `File: ${fileName} (${lang})\n`;

  if (!sel.isEmpty) {
    const selectedText = doc.getText(sel);
    const lineNum = sel.start.line + 1;
    context += `Selected lines ${lineNum}–${sel.end.line + 1}:\n\`\`\`${lang}\n${selectedText}\n\`\`\``;

    const surroundStart = Math.max(0, sel.start.line - 10);
    const surroundEnd = Math.min(doc.lineCount - 1, sel.end.line + 10);
    if (surroundStart < sel.start.line || surroundEnd > sel.end.line) {
      const surroundRange = new vscode.Range(surroundStart, 0, surroundEnd, doc.lineAt(surroundEnd).text.length);
      context += `\n\nSurrounding context:\n\`\`\`${lang}\n${doc.getText(surroundRange)}\n\`\`\``;
    }
  } else {
    const cursorLine = sel.active.line;
    const start = Math.max(0, cursorLine - Math.floor(contextLines / 2));
    const end = Math.min(doc.lineCount - 1, cursorLine + Math.floor(contextLines / 2));
    const range = new vscode.Range(start, 0, end, doc.lineAt(end).text.length);
    context += `Lines ${start + 1}–${end + 1} (cursor at line ${cursorLine + 1}):\n\`\`\`${lang}\n${doc.getText(range)}\n\`\`\``;
  }

  return context;
}

export function getSelectedText(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.selection.isEmpty) return undefined;
  return editor.document.getText(editor.selection);
}
