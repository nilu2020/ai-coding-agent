import * as vscode from "vscode";
import { ChatPanel } from "./chatPanel";
import { AICompletionProvider } from "./autocomplete";
import { callAI, buildSystemPrompt, isConfigured } from "./aiProvider";
import { getFileContext, getSelectedText } from "./utils";
import { AIFunctionLensProvider } from "./functionLens";
import {
  getFunctionAtCursor,
  getSelectedOrFunctionCode,
  computeComplexity,
  FunctionInfo,
} from "./functionUtils";
import { ArchitectPanel } from "./architectPanel";
import { ContentWriterPanel } from "./contentPanel";

export function activate(context: vscode.ExtensionContext) {
  console.log("AI Coding Agent activated");

  const completionProvider = new AICompletionProvider();
  const inlineProvider = vscode.languages.registerInlineCompletionItemProvider(
    { pattern: "**" },
    completionProvider
  );
  context.subscriptions.push(inlineProvider);

  const lensProvider = new AIFunctionLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ pattern: "**" }, lensProvider)
  );

  async function requireConfigured(): Promise<boolean> {
    const check = isConfigured();
    if (!check.ok) {
      const action = await vscode.window.showWarningMessage(check.message, "Open Settings");
      if (action) vscode.commands.executeCommand("workbench.action.openSettings", "aiCodingAgent");
      return false;
    }
    return true;
  }

  async function runFunctionAction(
    actionType: string,
    fnArg?: FunctionInfo
  ): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    if (!(await requireConfigured())) return;

    const fn = fnArg ?? (await getFunctionAtCursor());
    const { code, source } = getSelectedOrFunctionCode(editor, fn);

    if (source === "none") {
      vscode.window.showWarningMessage(
        "Position your cursor inside a function, or select code to use this action."
      );
      return;
    }

    const lang = editor.document.languageId;
    const label = fn?.name ? `"${fn.name}"` : "the selected code";

    const prompts: Record<string, string> = {
      analyze: buildAnalyzePrompt(code, lang, fn),
      refactor: `Refactor ${label} in ${lang} to improve readability, reduce complexity, and follow best practices. Return the improved code followed by a brief explanation of each change:\n\`\`\`${lang}\n${code}\n\`\`\``,
      test: `Write comprehensive unit tests for this ${lang} function/code. Include happy path, edge cases, and error cases:\n\`\`\`${lang}\n${code}\n\`\`\``,
      document: `Add thorough JSDoc/docstring documentation to this ${lang} code. Document parameters, return values, exceptions, and provide a usage example. Return the fully documented code:\n\`\`\`${lang}\n${code}\n\`\`\``,
      optimize: `Optimize ${label} in ${lang} for performance. Identify bottlenecks, suggest algorithmic improvements, and return the optimized code with explanations:\n\`\`\`${lang}\n${code}\n\`\`\``,
      extract: `Extract logical pieces of this ${lang} code into well-named helper functions. Improve separation of concerns. Return the refactored code with extracted functions:\n\`\`\`${lang}\n${code}\n\`\`\``,
      trace: `Trace and explain the complete execution flow of this ${lang} code. What does it do step by step? What are its dependencies and side effects?\n\`\`\`${lang}\n${code}\n\`\`\``,
      smells: `Identify all code smells, anti-patterns, and potential bugs in this ${lang} code. List each issue clearly with a suggested fix:\n\`\`\`${lang}\n${code}\n\`\`\``,
    };

    const userMsg = prompts[actionType] ?? `${actionType}:\n\`\`\`${lang}\n${code}\n\`\`\``;

    ChatPanel.createOrShow(context.extensionUri);

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "AI is working...", cancellable: false },
      async () => {
        const fileCtx = getFileContext();
        const result = await callAI([
          { role: "system", content: buildSystemPrompt(fileCtx) },
          { role: "user", content: userMsg },
        ]);

        if (result.error) {
          vscode.window.showErrorMessage(result.error);
          return;
        }

        if (ChatPanel.currentPanel) {
          const panel = ChatPanel.currentPanel as unknown as {
            _panel: { webview: { postMessage: (m: unknown) => void } };
          };
          panel._panel.webview.postMessage({ type: "userMessage", text: userMsg.slice(0, 120) + "..." });
          panel._panel.webview.postMessage({ type: "assistantMessage", text: result.text });
        }
      }
    );
  }

  function buildAnalyzePrompt(code: string, lang: string, fn?: FunctionInfo): string {
    const complexity = computeComplexity(code);
    const meta = fn
      ? `Function: "${fn.name}" in ${fn.fileName} (line ${fn.startLine})\n`
      : "";
    const metrics = `Metrics: ${complexity.lines} lines, ~${complexity.branches} branches, max nesting depth ${complexity.nestingDepth} → complexity: ${complexity.score}\n`;

    return `Analyze this ${lang} function and provide:
1. **Purpose** — what it does in plain English
2. **Complexity assessment** (${complexity.score} — ${complexity.lines} lines, ${complexity.branches} branches, depth ${complexity.nestingDepth})
3. **Code quality** — strengths and weaknesses
4. **Potential bugs or edge cases**
5. **Top 3 improvement suggestions**

${meta}${metrics}
\`\`\`${lang}
${code}
\`\`\``;
  }

  const openChat = vscode.commands.registerCommand("aiCodingAgent.openChat", () => {
    ChatPanel.createOrShow(context.extensionUri);
  });

  const openArchitect = vscode.commands.registerCommand("aiCodingAgent.openArchitect", () => {
    ArchitectPanel.createOrShow(context.extensionUri);
  });

  const openContentWriter = vscode.commands.registerCommand("aiCodingAgent.openContentWriter", () => {
    ContentWriterPanel.createOrShow(context.extensionUri);
  });

  const clearChat = vscode.commands.registerCommand("aiCodingAgent.clearChat", () => {
    if (ChatPanel.currentPanel) {
      ChatPanel.currentPanel.clearHistory();
    } else {
      vscode.window.showInformationMessage("No active chat to clear.");
    }
  });

  const toggleLens = vscode.commands.registerCommand("aiCodingAgent.toggleCodeLens", async () => {
    const cfg = vscode.workspace.getConfiguration("aiCodingAgent");
    const current = cfg.get<boolean>("codeLens.enabled", true);
    await cfg.update("codeLens.enabled", !current, vscode.ConfigurationTarget.Global);
    lensProvider.refresh();
    vscode.window.showInformationMessage(
      `AI CodeLens ${!current ? "enabled" : "disabled"}.`
    );
  });

  const generateCmd = vscode.commands.registerCommand(
    "aiCodingAgent.generateFromSelection",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("Open a file and select text or position your cursor first.");
        return;
      }
      if (!(await requireConfigured())) return;

      const selectedText = getSelectedText();
      const prompt = await vscode.window.showInputBox({
        placeHolder: selectedText
          ? "What should I do with this code? e.g. 'refactor this', 'add error handling'"
          : "Describe what to generate... e.g. 'function to sort an array of objects by key'",
        prompt: "AI Code Generation",
        ignoreFocusOut: true,
      });

      if (!prompt) return;

      const fileCtx = getFileContext();
      const systemPrompt = buildSystemPrompt(fileCtx);
      const userMsg = selectedText
        ? `${prompt}\n\nSelected code:\n\`\`\`\n${selectedText}\n\`\`\``
        : prompt;

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: "AI is generating...", cancellable: false },
        async () => {
          const result = await callAI([
            { role: "system", content: systemPrompt },
            { role: "user", content: userMsg },
          ]);

          if (result.error) {
            vscode.window.showErrorMessage(result.error);
            return;
          }

          let code = result.text.trim();
          const fenceMatch = code.match(/^```[\w]*\n([\s\S]*?)\n?```$/);
          if (fenceMatch) code = fenceMatch[1];

          const action = await vscode.window.showInformationMessage(
            "AI generated code is ready.",
            "Insert at cursor",
            "Replace selection",
            "Show in chat"
          );

          if (action === "Insert at cursor" || action === "Replace selection") {
            editor.edit((eb) => {
              const sel = editor.selection;
              if (action === "Replace selection" && !sel.isEmpty) {
                eb.replace(sel, code);
              } else {
                eb.insert(sel.active, code);
              }
            });
          } else if (action === "Show in chat") {
            ChatPanel.createOrShow(context.extensionUri);
          }
        }
      );
    }
  );

  async function makeInlineAction(actionType: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    if (!(await requireConfigured())) return;

    const selectedText = getSelectedText();
    if (!selectedText) {
      vscode.window.showWarningMessage("Please select some code first.");
      return;
    }

    const lang = editor.document.languageId;
    const prompts: Record<string, string> = {
      explain: `Explain this ${lang} code clearly and concisely:\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
      refactor: `Refactor this ${lang} code to be cleaner, more readable, and follow best practices. Return only the improved code:\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
      fix: `Fix any bugs, errors, or issues in this ${lang} code. Return the fixed code with a brief explanation of what was fixed:\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
      tests: `Write comprehensive unit tests for this ${lang} code:\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
      comments: `Add clear, helpful comments and JSDoc/docstring documentation to this ${lang} code. Return the fully commented code:\n\`\`\`${lang}\n${selectedText}\n\`\`\``,
    };

    const userMsg = prompts[actionType] ?? `${actionType}:\n\`\`\`${lang}\n${selectedText}\n\`\`\``;
    ChatPanel.createOrShow(context.extensionUri);

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "AI is working...", cancellable: false },
      async () => {
        const fileCtx = getFileContext();
        const result = await callAI([
          { role: "system", content: buildSystemPrompt(fileCtx) },
          { role: "user", content: userMsg },
        ]);

        if (result.error) {
          vscode.window.showErrorMessage(result.error);
          return;
        }

        if (ChatPanel.currentPanel) {
          const panel = ChatPanel.currentPanel as unknown as {
            _panel: { webview: { postMessage: (m: unknown) => void } };
          };
          panel._panel.webview.postMessage({ type: "userMessage", text: userMsg.slice(0, 100) + "..." });
          panel._panel.webview.postMessage({ type: "assistantMessage", text: result.text });
        }
      }
    );
  }

  context.subscriptions.push(
    openChat,
    openArchitect,
    openContentWriter,
    clearChat,
    toggleLens,
    generateCmd,
    vscode.commands.registerCommand("aiCodingAgent.explainCode", () => makeInlineAction("explain")),
    vscode.commands.registerCommand("aiCodingAgent.refactorCode", () => makeInlineAction("refactor")),
    vscode.commands.registerCommand("aiCodingAgent.fixCode", () => makeInlineAction("fix")),
    vscode.commands.registerCommand("aiCodingAgent.addTests", () => makeInlineAction("tests")),
    vscode.commands.registerCommand("aiCodingAgent.addComments", () => makeInlineAction("comments")),

    vscode.commands.registerCommand("aiCodingAgent.analyzeFunction", (_fn?: FunctionInfo) =>
      runFunctionAction("analyze", _fn)
    ),
    vscode.commands.registerCommand("aiCodingAgent.refactorFunction", (_fn?: FunctionInfo) =>
      runFunctionAction("refactor", _fn)
    ),
    vscode.commands.registerCommand("aiCodingAgent.testFunction", (_fn?: FunctionInfo) =>
      runFunctionAction("test", _fn)
    ),
    vscode.commands.registerCommand("aiCodingAgent.documentFunction", (_fn?: FunctionInfo) =>
      runFunctionAction("document", _fn)
    ),
    vscode.commands.registerCommand("aiCodingAgent.optimizeFunction", (_fn?: FunctionInfo) =>
      runFunctionAction("optimize", _fn)
    ),
    vscode.commands.registerCommand("aiCodingAgent.extractFunction", () =>
      runFunctionAction("extract")
    ),
    vscode.commands.registerCommand("aiCodingAgent.traceFunction", () =>
      runFunctionAction("trace")
    ),
    vscode.commands.registerCommand("aiCodingAgent.findCodeSmells", () =>
      runFunctionAction("smells")
    ),
    completionProvider
  );

  const cfg = vscode.workspace.getConfiguration("aiCodingAgent");
  const provider = cfg.get<string>("provider", "openai");
  const hasKey =
    provider === "ollama" ||
    cfg.get<string>("openaiApiKey", "") ||
    cfg.get<string>("anthropicApiKey", "") ||
    cfg.get<string>("geminiApiKey", "");

  if (!hasKey) {
    vscode.window
      .showInformationMessage(
        "AI Coding Agent: Add your API key (or select Ollama) to get started.",
        "Open Settings"
      )
      .then((action) => {
        if (action) vscode.commands.executeCommand("workbench.action.openSettings", "aiCodingAgent");
      });
  }
}

export function deactivate() {}
