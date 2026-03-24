import * as vscode from "vscode";
import { getAllFunctions } from "./functionUtils";

export class AIFunctionLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  refresh() {
    this._onDidChangeCodeLenses.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument
  ): Promise<vscode.CodeLens[]> {
    const cfg = vscode.workspace.getConfiguration("aiCodingAgent");
    if (!cfg.get<boolean>("codeLens.enabled", true)) return [];

    const functions = await getAllFunctions(document);
    const lenses: vscode.CodeLens[] = [];

    for (const fn of functions) {
      const lineRange = new vscode.Range(fn.range.start, fn.range.start);

      const actions: Array<{ label: string; command: string }> = [
        { label: "⚡ Analyze", command: "aiCodingAgent.analyzeFunction" },
        { label: "🔧 Refactor", command: "aiCodingAgent.refactorFunction" },
        { label: "🧪 Test", command: "aiCodingAgent.testFunction" },
        { label: "📝 Document", command: "aiCodingAgent.documentFunction" },
        { label: "🚀 Optimize", command: "aiCodingAgent.optimizeFunction" },
      ];

      for (const action of actions) {
        lenses.push(
          new vscode.CodeLens(lineRange, {
            title: action.label,
            command: action.command,
            arguments: [fn],
            tooltip: `AI: ${action.label.replace(/^.\s/, "")} this function`,
          })
        );
      }
    }

    return lenses;
  }
}
