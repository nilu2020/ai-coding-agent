import * as vscode from "vscode";
import { callAI, buildSystemPrompt, isConfigured } from "./aiProvider";

export class AICompletionProvider implements vscode.InlineCompletionItemProvider {
  private _pendingTimer: ReturnType<typeof setTimeout> | undefined;
  private _lastRequest: string = "";

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionList | undefined> {
    const cfg = vscode.workspace.getConfiguration("aiCodingAgent");
    if (!cfg.get<boolean>("autocomplete.enabled", true)) return undefined;

    const check = isConfigured();
    if (!check.ok) return undefined;

    const lineText = document.lineAt(position.line).text;
    const textBefore = lineText.substring(0, position.character);

    if (textBefore.trim().length < 3) return undefined;
    if (token.isCancellationRequested) return undefined;

    const delay = cfg.get<number>("autocomplete.delay", 600);
    await new Promise<void>((resolve) => {
      this._pendingTimer = setTimeout(resolve, delay);
    });

    if (token.isCancellationRequested) return undefined;

    const lang = document.languageId;
    const startLine = Math.max(0, position.line - 30);
    const contextRange = new vscode.Range(startLine, 0, position.line, position.character);
    const contextText = document.getText(contextRange);
    const fileName = document.fileName.split("/").pop() ?? "";

    const requestKey = `${document.uri}:${position.line}:${position.character}:${textBefore}`;
    if (requestKey === this._lastRequest) return undefined;
    this._lastRequest = requestKey;

    const systemPrompt = `You are a code autocomplete engine. Complete the code at the cursor position.
Rules:
- Only output the completion text, nothing else — no explanations, no markdown, no \`\`\` fences
- The completion should fit naturally after the cursor
- Be concise — typically 1-5 lines unless it's obvious more is needed
- Match the existing code style, indentation, and conventions
- If completing a comment that starts with TODO/FIXME/NOTE, complete just the comment text`;

    const userPrompt = `File: ${fileName} (${lang})

Code before cursor:
\`\`\`${lang}
${contextText}
\`\`\`

Complete the code from exactly where the cursor is. Output ONLY the completion, nothing else.`;

    const result = await callAI([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    if (token.isCancellationRequested) return undefined;
    if (result.error || !result.text.trim()) return undefined;

    let completionText = result.text
      .replace(/^```[\w]*\n?/, "")
      .replace(/\n?```$/, "")
      .trimEnd();

    if (!completionText) return undefined;

    const item = new vscode.InlineCompletionItem(completionText, new vscode.Range(position, position));

    return new vscode.InlineCompletionList([item]);
  }

  dispose() {
    if (this._pendingTimer) clearTimeout(this._pendingTimer);
  }
}
