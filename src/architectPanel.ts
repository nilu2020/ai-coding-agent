import * as vscode from "vscode";
import * as path from "path";
import { callAI } from "./aiProvider";
import { PHASE_PROMPTS, getAllPhasesPrompt } from "./architectPrompts";
import { getNonce } from "./utils";
import { toPdf, toDocx } from "./documentConverters";

export type ExportFormat = "md" | "html" | "txt" | "json" | "pdf" | "docx";

interface DocEntry {
  phase: number;
  title: string;
  content: string;
}

export class ArchitectPanel {
  public static currentPanel: ArchitectPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (ArchitectPanel.currentPanel) {
      ArchitectPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "aiArchitect",
      "AI Architect Intelligence",
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "out")],
        retainContextWhenHidden: true,
      }
    );

    ArchitectPanel.currentPanel = new ArchitectPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case "generate":
            await this._handleGenerate(message.phase, message.requirements);
            break;
          case "export":
            await this._handleExport(
              message.phase,
              message.content,
              message.requirements,
              message.format as ExportFormat,
              message.title
            );
            break;
          case "exportAll":
            await this._handleExportAll(
              message.docs as DocEntry[],
              message.requirements,
              message.format as ExportFormat
            );
            break;
          case "generateAll":
            await this._handleGenerateAll(message.requirements);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  // ── Generation ──────────────────────────────────────────────────────────────

  private async _handleGenerate(phase: number, requirements: string): Promise<void> {
    if (!requirements.trim()) {
      this._postMessage({ type: "error", message: "Please enter your system requirements first." });
      return;
    }
    const phasePrompt = PHASE_PROMPTS.find((p) => p.phase === phase);
    if (!phasePrompt) {
      this._postMessage({ type: "error", message: `Unknown phase: ${phase}` });
      return;
    }
    this._postMessage({ type: "generating", phase, title: phasePrompt.title });
    const result = await callAI([
      { role: "system", content: phasePrompt.systemPrompt },
      { role: "user", content: phasePrompt.userPrompt(requirements) },
    ]);
    if (result.error) {
      this._postMessage({ type: "error", message: result.error });
      return;
    }
    this._postMessage({ type: "result", phase, title: phasePrompt.title, content: result.text });
  }

  private async _handleGenerateAll(requirements: string): Promise<void> {
    if (!requirements.trim()) {
      this._postMessage({ type: "error", message: "Please enter your system requirements first." });
      return;
    }
    this._postMessage({ type: "generating", phase: 0, title: "Architecture Strategy Overview" });
    const overviewResult = await callAI([
      {
        role: "system",
        content: "You are a Principal Software Architect. Produce well-structured, immediately actionable Markdown documents.",
      },
      { role: "user", content: getAllPhasesPrompt(requirements) },
    ]);
    if (overviewResult.error) {
      this._postMessage({ type: "error", message: overviewResult.error });
      return;
    }
    this._postMessage({
      type: "result",
      phase: 0,
      title: "Architecture Strategy Overview",
      content: overviewResult.text,
    });
    for (const pp of PHASE_PROMPTS) {
      this._postMessage({ type: "generating", phase: pp.phase, title: pp.title });
      const res = await callAI([
        { role: "system", content: pp.systemPrompt },
        { role: "user", content: pp.userPrompt(requirements) },
      ]);
      if (res.error) {
        this._postMessage({ type: "phaseError", phase: pp.phase, message: res.error });
      } else {
        this._postMessage({ type: "result", phase: pp.phase, title: pp.title, content: res.text });
      }
    }
    this._postMessage({ type: "allDone" });
  }

  // ── Export — Single Document ─────────────────────────────────────────────────

  private async _handleExport(
    phase: number,
    content: string,
    requirements: string,
    format: ExportFormat,
    title: string
  ): Promise<void> {
    const slugs: Record<number, string> = {
      0: "architecture-overview",
      1: "phase1-foundation",
      2: "phase2-growth",
      3: "phase3-enterprise",
    };
    const base = slugs[phase] ?? `phase${phase}`;
    const fileName = `${base}.${format}`;
    const fileData = await this._convertAny(content, format, title, requirements);
    await this._saveFile(fileName, format, fileData);
  }

  // ── Export — All Documents ────────────────────────────────────────────────────

  private async _handleExportAll(
    docs: DocEntry[],
    requirements: string,
    format: ExportFormat
  ): Promise<void> {
    if (!docs.length) {
      vscode.window.showWarningMessage("No documents generated yet. Generate at least one phase first.");
      return;
    }

    // Combined single-file formats
    if (format === "json") {
      const combined = {
        generatedAt: new Date().toISOString(),
        tool: "AI Architect Intelligence",
        requirements: requirements.slice(0, 500),
        documents: docs.map((d) => ({ phase: d.phase, title: d.title, content: d.content })),
      };
      await this._saveFile("architecture-all.json", "json", JSON.stringify(combined, null, 2));
      return;
    }

    if (format === "html") {
      const combinedMd = docs.map((d) => `# ${d.title}\n\n${d.content}`).join("\n\n---\n\n");
      const html = this._toHtml(combinedMd, "Full Architecture Document", requirements, true);
      await this._saveFile("architecture-all.html", "html", html);
      return;
    }

    if (format === "pdf") {
      const combinedMd = docs.map((d) => `# ${d.title}\n\n${d.content}`).join("\n\n---\n\n");
      const pdfBuf = await toPdf(combinedMd, "Full Architecture Document", requirements);
      await this._saveFile("architecture-all.pdf", "pdf", pdfBuf);
      return;
    }

    if (format === "docx") {
      const combinedMd = docs.map((d) => `# ${d.title}\n\n${d.content}`).join("\n\n---\n\n");
      const docxBuf = await toDocx(combinedMd, "Full Architecture Document", requirements);
      await this._saveFile("architecture-all.docx", "docx", docxBuf);
      return;
    }

    // Per-file for md and txt
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const outDir = workspaceFolders
      ? vscode.Uri.joinPath(workspaceFolders[0].uri, "architecture-docs")
      : undefined;

    const slugs: Record<number, string> = {
      0: "architecture-overview",
      1: "phase1-foundation",
      2: "phase2-growth",
      3: "phase3-enterprise",
    };

    const saved: string[] = [];
    for (const doc of docs) {
      const base = slugs[doc.phase] ?? `phase${doc.phase}`;
      const fileName = `${base}.${format}`;
      const fileData = await this._convertAny(doc.content, format, doc.title, requirements);
      let uri: vscode.Uri;
      if (outDir) {
        uri = vscode.Uri.joinPath(outDir, fileName);
      } else {
        const picked = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(fileName),
          filters: this._formatFilters(format),
        });
        if (!picked) continue;
        uri = picked;
      }
      const bytes = typeof fileData === "string" ? Buffer.from(fileData, "utf-8") : fileData;
      await vscode.workspace.fs.writeFile(uri, bytes);
      saved.push(path.basename(uri.fsPath));
    }

    if (saved.length) {
      vscode.window.showInformationMessage(`Exported ${saved.length} file(s): ${saved.join(", ")}`);
    }
  }

  // ── Format Conversion ─────────────────────────────────────────────────────────

  private async _convertAny(
    content: string,
    format: ExportFormat,
    title: string,
    requirements: string
  ): Promise<string | Buffer> {
    switch (format) {
      case "md":   return this._toMarkdown(content, requirements);
      case "html": return this._toHtml(content, title, requirements, false);
      case "txt":  return this._toPlainText(content, title, requirements);
      case "json": return this._toJson(content, title, requirements);
      case "pdf":  return toPdf(content, title, requirements);
      case "docx": return toDocx(content, title, requirements);
      default:     return content;
    }
  }

  private _toMarkdown(content: string, requirements: string): string {
    const ts = new Date().toISOString();
    return [
      `<!-- Generated by AI Architect Intelligence — ${ts} -->`,
      `<!-- Requirements: ${requirements.slice(0, 300).replace(/\n/g, " ")} -->`,
      "",
      content,
    ].join("\n");
  }

  private _toHtml(
    mdContent: string,
    title: string,
    requirements: string,
    combined: boolean
  ): string {
    const ts = new Date().toLocaleString();
    const safeReq = requirements.slice(0, 300).replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Minimal but complete Markdown → HTML (server-side, no external libs)
    let body = mdContent
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Code blocks first
    body = body.replace(/```[\w]*\n([\s\S]*?)```/g, (_, c) => `<pre><code>${c}</code></pre>`);
    // Inline code
    body = body.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Headers
    body = body.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
    body = body.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    body = body.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    body = body.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    // HR
    body = body.replace(/^---+$/gm, "<hr>");
    // Bold + italic
    body = body.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    body = body.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    body = body.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    // Tables
    body = body.replace(/((?:\|.+\|\n)+)/g, (m) => {
      const rows = m.trim().split("\n").filter((r) => r.trim());
      if (rows.length < 2) return m;
      const headers = rows[0].split("|").map((c) => c.trim()).filter(Boolean);
      let tbl = `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>`;
      for (let i = 2; i < rows.length; i++) {
        if (!rows[i].trim() || /^[\s|:-]+$/.test(rows[i])) continue;
        const cols = rows[i].split("|").map((c) => c.trim()).filter(Boolean);
        tbl += `<tr>${cols.map((c) => `<td>${c}</td>`).join("")}</tr>`;
      }
      return tbl + "</tbody></table>";
    });
    // Blockquote
    body = body.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
    // Unordered lists
    body = body.replace(/((?:^[-*] .+\n?)+)/gm, (m) =>
      "<ul>" + m.replace(/^[-*] (.+)$/gm, "<li>$1</li>") + "</ul>"
    );
    // Ordered lists
    body = body.replace(/((?:^\d+\. .+\n?)+)/gm, (m) =>
      "<ol>" + m.replace(/^\d+\. (.+)$/gm, "<li>$1</li>") + "</ol>"
    );
    // Paragraphs
    body = body.replace(/^(?!<[a-zA-Z/]|$)(.+)$/gm, "<p>$1</p>");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  :root{--blue:#2563eb;--blue-light:#eff6ff;--border:#e2e8f0;--text:#1e293b;--muted:#64748b;--bg:#ffffff;--code-bg:#f8fafc}
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:15px;line-height:1.7;color:var(--text);background:var(--bg);margin:0;padding:0}
  .page{max-width:900px;margin:0 auto;padding:48px 40px}
  .doc-header{border-bottom:3px solid var(--blue);padding-bottom:20px;margin-bottom:36px}
  .doc-header h1{font-size:26px;font-weight:700;color:var(--blue);margin:0 0 8px}
  .doc-meta{font-size:12px;color:var(--muted);display:flex;gap:24px;flex-wrap:wrap}
  .doc-meta span{display:flex;align-items:center;gap:4px}
  .req-box{background:var(--blue-light);border-left:4px solid var(--blue);border-radius:4px;padding:12px 16px;margin-bottom:32px;font-size:13px;color:var(--text)}
  .req-box strong{display:block;margin-bottom:4px;color:var(--blue)}
  h1{font-size:22px;font-weight:700;color:var(--blue);margin:36px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--border)}
  h2{font-size:18px;font-weight:600;color:var(--text);margin:28px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--border)}
  h3{font-size:15px;font-weight:600;color:var(--text);margin:20px 0 8px}
  h4{font-size:14px;font-weight:600;color:var(--muted);margin:14px 0 6px}
  p{margin:8px 0;line-height:1.8}
  a{color:var(--blue)}
  code{background:var(--code-bg);border:1px solid var(--border);padding:2px 5px;border-radius:3px;font-family:"Fira Code","Courier New",monospace;font-size:13px}
  pre{background:var(--code-bg);border:1px solid var(--border);border-radius:6px;padding:16px;overflow-x:auto;margin:14px 0}
  pre code{background:none;border:none;padding:0;font-size:13px;line-height:1.6}
  table{border-collapse:collapse;width:100%;margin:14px 0;font-size:14px}
  th{background:var(--blue);color:#fff;padding:8px 12px;text-align:left;font-weight:600}
  td{padding:7px 12px;border:1px solid var(--border)}
  tr:nth-child(even) td{background:var(--blue-light)}
  ul,ol{margin:8px 0 8px 24px;line-height:1.8}
  li{margin:3px 0}
  blockquote{border-left:4px solid var(--blue);margin:12px 0;padding:8px 16px;background:var(--blue-light);border-radius:0 4px 4px 0;color:var(--muted)}
  hr{border:none;border-top:2px solid var(--border);margin:28px 0}
  strong{font-weight:600}
  em{font-style:italic}
  .footer{margin-top:48px;padding-top:16px;border-top:1px solid var(--border);font-size:12px;color:var(--muted);text-align:center}
  @media print{body{font-size:12px}.page{padding:20px}}
  @media(max-width:600px){.page{padding:24px 16px}}
</style>
</head>
<body>
<div class="page">
  <div class="doc-header">
    <h1>🏛️ ${title}</h1>
    <div class="doc-meta">
      <span>📅 Generated: ${ts}</span>
      <span>🤖 AI Architect Intelligence</span>
      ${combined ? `<span>📦 Combined Export</span>` : ""}
    </div>
  </div>
  ${safeReq ? `<div class="req-box"><strong>Requirements Summary</strong>${safeReq}${requirements.length > 300 ? "…" : ""}</div>` : ""}
  ${body}
  <div class="footer">Generated by AI Architect Intelligence VS Code Extension &bull; ${ts}</div>
</div>
</body>
</html>`;
  }

  private _toPlainText(content: string, title: string, requirements: string): string {
    const ts = new Date().toISOString();
    const separator = "=".repeat(72);
    const divider   = "-".repeat(72);

    let text = content
      // Remove HTML if any
      .replace(/<[^>]+>/g, "")
      // Headers → uppercase + underline
      .replace(/^#### (.+)$/gm, (_, t) => `    ${t.toUpperCase()}\n    ${"-".repeat(t.length)}`)
      .replace(/^### (.+)$/gm,  (_, t) => `  ${t.toUpperCase()}\n  ${"-".repeat(t.length)}`)
      .replace(/^## (.+)$/gm,   (_, t) => `${t.toUpperCase()}\n${"-".repeat(t.length)}`)
      .replace(/^# (.+)$/gm,    (_, t) => `${separator}\n${t.toUpperCase()}\n${separator}`)
      // Bold/italic → plain
      .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
      .replace(/\*\*(.+?)\*\*/g,     "$1")
      .replace(/\*(.+?)\*/g,         "$1")
      // Inline code → backticks
      .replace(/`([^`]+)`/g, "`$1`")
      // Code blocks → indented
      .replace(/```[\w]*\n([\s\S]*?)```/g, (_, c) =>
        c.split("\n").map((l: string) => `    ${l}`).join("\n")
      )
      // Tables → spaced text
      .replace(/((?:\|.+\|\n)+)/g, (m) => {
        const rows = m.trim().split("\n").filter((r) => r.trim() && !/^[\s|:-]+$/.test(r));
        return rows.map((r) => r.replace(/\|/g, " | ").replace(/^\s*\|\s*/, "").replace(/\s*\|\s*$/, "")).join("\n") + "\n";
      })
      // HR
      .replace(/^---+$/gm, divider)
      // Blockquote
      .replace(/^> (.+)$/gm, "  > $1")
      // Clean up extra blank lines
      .replace(/\n{3,}/g, "\n\n");

    return [
      separator,
      title.toUpperCase(),
      separator,
      `Generated:     ${ts}`,
      `Tool:          AI Architect Intelligence`,
      `Requirements:  ${requirements.slice(0, 200).replace(/\n/g, " ")}`,
      separator,
      "",
      text,
      "",
      separator,
      "END OF DOCUMENT",
      separator,
    ].join("\n");
  }

  private _toJson(content: string, title: string, requirements: string): string {
    // Parse markdown sections into structured data
    const sections: Array<{ heading: string; level: number; content: string }> = [];
    const lines = content.split("\n");
    let currentSection: { heading: string; level: number; lines: string[] } | null = null;

    for (const line of lines) {
      const h4 = line.match(/^#### (.+)$/);
      const h3 = line.match(/^### (.+)$/);
      const h2 = line.match(/^## (.+)$/);
      const h1 = line.match(/^# (.+)$/);
      const match = h1 ?? h2 ?? h3 ?? h4;
      const level = h1 ? 1 : h2 ? 2 : h3 ? 3 : h4 ? 4 : 0;

      if (match && level > 0) {
        if (currentSection) {
          sections.push({
            heading: currentSection.heading,
            level: currentSection.level,
            content: currentSection.lines.join("\n").trim(),
          });
        }
        currentSection = { heading: match[1], level, lines: [] };
      } else if (currentSection) {
        currentSection.lines.push(line);
      }
    }
    if (currentSection) {
      sections.push({
        heading: currentSection.heading,
        level: currentSection.level,
        content: currentSection.lines.join("\n").trim(),
      });
    }

    const doc = {
      metadata: {
        title,
        generatedAt: new Date().toISOString(),
        tool: "AI Architect Intelligence",
        version: "1.3.0",
      },
      requirements: requirements.slice(0, 1000),
      rawMarkdown: content,
      sections,
    };

    return JSON.stringify(doc, null, 2);
  }

  // ── File Save Helper ──────────────────────────────────────────────────────────

  private async _saveFile(
    fileName: string,
    format: ExportFormat,
    fileContent: string | Buffer
  ): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let saveUri: vscode.Uri;

    if (workspaceFolders) {
      saveUri = vscode.Uri.joinPath(workspaceFolders[0].uri, "architecture-docs", fileName);
    } else {
      const picked = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(fileName),
        filters: this._formatFilters(format),
      });
      if (!picked) return;
      saveUri = picked;
    }

    const bytes =
      typeof fileContent === "string"
        ? Buffer.from(fileContent, "utf-8")
        : fileContent;

    await vscode.workspace.fs.writeFile(saveUri, bytes);

    const isBinary = format === "pdf" || format === "docx";
    const action = await vscode.window.showInformationMessage(
      `Saved: ${path.basename(saveUri.fsPath)}`,
      isBinary ? "Open Folder" : "Open File",
      "Open Folder"
    );
    if (action === "Open File") {
      vscode.window.showTextDocument(saveUri);
    } else if (action === "Open Folder") {
      vscode.commands.executeCommand("revealFileInOS", saveUri);
    }
  }

  private _formatFilters(format: ExportFormat): Record<string, string[]> {
    const map: Record<ExportFormat, Record<string, string[]>> = {
      md:   { Markdown: ["md"] },
      html: { "HTML Document": ["html", "htm"] },
      txt:  { "Plain Text": ["txt"] },
      json: { JSON: ["json"] },
      pdf:  { "PDF Document": ["pdf"] },
      docx: { "Word Document": ["docx"] },
    };
    return map[format] ?? { "All Files": ["*"] };
  }

  private _postMessage(message: Record<string, unknown>): void {
    this._panel.webview.postMessage(message);
  }

  // ── Webview HTML ──────────────────────────────────────────────────────────────

  private _getHtml(): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Architect Intelligence</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--vscode-font-family);font-size:13px;background:var(--vscode-editor-background);color:var(--vscode-editor-foreground);height:100vh;display:flex;flex-direction:column;overflow:hidden}
  header{padding:10px 16px;background:var(--vscode-sideBarSectionHeader-background);border-bottom:1px solid var(--vscode-panel-border);flex-shrink:0;display:flex;align-items:center;gap:10px}
  header h1{font-size:14px;font-weight:600;flex:1}
  header .badge{font-size:10px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);padding:2px 6px;border-radius:10px}
  .layout{display:flex;flex:1;overflow:hidden}
  .sidebar{width:224px;flex-shrink:0;border-right:1px solid var(--vscode-panel-border);display:flex;flex-direction:column;overflow:hidden}
  .sidebar-section{padding:10px 12px;border-bottom:1px solid var(--vscode-panel-border)}
  .sidebar-section label{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--vscode-descriptionForeground);margin-bottom:5px}
  textarea{width:100%;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:3px;padding:7px;font-family:var(--vscode-font-family);font-size:12px;resize:vertical;min-height:110px;line-height:1.5}
  textarea:focus{outline:none;border-color:var(--vscode-focusBorder)}
  .btn{display:block;width:100%;padding:7px 10px;border:none;border-radius:3px;font-size:12px;font-family:var(--vscode-font-family);cursor:pointer;text-align:center;font-weight:600;margin-bottom:5px}
  .btn-primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
  .btn-primary:hover{background:var(--vscode-button-hoverBackground)}
  .btn-primary:disabled{opacity:.45;cursor:not-allowed}
  .btn-all{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;font-weight:700}
  .btn-all:hover{opacity:.88}
  .phase-nav{flex:1;overflow-y:auto;padding:6px}
  .phase-tab{padding:7px 9px;border-radius:3px;cursor:pointer;margin-bottom:3px;border:none;background:none;color:var(--vscode-editor-foreground);font-family:var(--vscode-font-family);font-size:12px;width:100%;text-align:left;display:flex;align-items:center;gap:7px}
  .phase-tab:hover{background:var(--vscode-list-hoverBackground)}
  .phase-tab.active{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}
  .phase-tab .st{margin-left:auto;font-size:11px}
  .phase-tab .st.ok{color:#4ade80}.phase-tab .st.spin{color:var(--vscode-progressBar-background)}.phase-tab .st.err{color:#f87171}
  .main{flex:1;display:flex;flex-direction:column;overflow:hidden}
  .doc-header{padding:8px 14px;border-bottom:1px solid var(--vscode-panel-border);display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap}
  .doc-header h2{font-size:12px;font-weight:600;flex:1;min-width:120px}
  .toolbar{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
  .tool-btn{padding:4px 8px;font-size:11px;border:1px solid var(--vscode-panel-border);border-radius:3px;background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);cursor:pointer;font-family:var(--vscode-font-family);white-space:nowrap}
  .tool-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
  select.fmt-select{padding:3px 6px;font-size:11px;border:1px solid var(--vscode-panel-border);border-radius:3px;background:var(--vscode-dropdown-background);color:var(--vscode-dropdown-foreground);font-family:var(--vscode-font-family);cursor:pointer}
  .sep{width:1px;height:16px;background:var(--vscode-panel-border);flex-shrink:0}
  .doc-content{flex:1;overflow-y:auto;padding:18px 20px}
  .placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--vscode-descriptionForeground);text-align:center;gap:10px}
  .placeholder .icon{font-size:40px}
  .placeholder p{font-size:12px;max-width:280px;line-height:1.6}
  .spinner{display:inline-block;width:13px;height:13px;border:2px solid var(--vscode-progressBar-background);border-top-color:transparent;border-radius:50%;animation:spin .65s linear infinite;vertical-align:middle}
  @keyframes spin{to{transform:rotate(360deg)}}
  .err-box{background:#f8717120;border:1px solid #f87171;border-radius:4px;padding:10px;margin-bottom:10px;color:#f87171;font-size:12px}
  .gen-box{display:flex;align-items:center;gap:9px;padding:10px;background:var(--vscode-inputValidation-infoBackground);border:1px solid var(--vscode-inputValidation-infoBorder);border-radius:4px;margin-bottom:10px;font-size:12px}
  /* Markdown rendering */
  .md h1{font-size:17px;font-weight:700;margin:0 0 14px;padding-bottom:7px;border-bottom:2px solid var(--vscode-panel-border)}
  .md h2{font-size:14px;font-weight:600;margin:18px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--vscode-panel-border);color:var(--vscode-textLink-foreground)}
  .md h3{font-size:13px;font-weight:600;margin:13px 0 5px}
  .md h4{font-size:12px;font-weight:600;margin:9px 0 4px;color:var(--vscode-descriptionForeground)}
  .md p{margin:5px 0;line-height:1.65}
  .md ul,.md ol{margin:5px 0 5px 18px;line-height:1.75}
  .md li{margin:2px 0}
  .md code{background:var(--vscode-textCodeBlock-background);padding:1px 4px;border-radius:3px;font-family:var(--vscode-editor-font-family);font-size:11px}
  .md pre{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-panel-border);border-radius:4px;padding:10px;overflow-x:auto;margin:9px 0;font-family:var(--vscode-editor-font-family);font-size:11px;line-height:1.5}
  .md pre code{background:none;padding:0}
  .md table{border-collapse:collapse;width:100%;margin:9px 0;font-size:12px}
  .md th{background:var(--vscode-editor-inactiveSelectionBackground);padding:5px 9px;text-align:left;border:1px solid var(--vscode-panel-border);font-weight:600}
  .md td{padding:4px 9px;border:1px solid var(--vscode-panel-border)}
  .md tr:nth-child(even) td{background:var(--vscode-editor-inactiveSelectionBackground)}
  .md blockquote{border-left:3px solid var(--vscode-textLink-foreground);padding:3px 11px;margin:7px 0;color:var(--vscode-descriptionForeground)}
  .md strong{font-weight:600}.md em{font-style:italic}
  .md hr{border:none;border-top:1px solid var(--vscode-panel-border);margin:14px 0}
  .fmt-row{display:flex;align-items:center;gap:5px}
  .fmt-label{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap}
</style>
</head>
<body>
<header>
  <h1>🏛️ AI Architect Intelligence</h1>
  <span class="badge">v1.3</span>
</header>

<div class="layout">
  <!-- Sidebar -->
  <div class="sidebar">
    <div class="sidebar-section">
      <label>System Requirements</label>
      <textarea id="requirements" placeholder="Describe your system — domain, scale, team size, tech preferences, constraints…&#10;&#10;e.g. SaaS e-commerce for 100k users, team of 8, AWS, needs real-time inventory &amp; payments." rows="8"></textarea>
    </div>
    <div class="sidebar-section">
      <button class="btn btn-all" onclick="generateAll()">⚡ Generate All Phases</button>
    </div>
    <div class="phase-nav">
      <button class="phase-tab active" id="tab-0" onclick="selectTab(0)">
        <span>📋</span> Strategy Overview <span class="st" id="st-0"></span>
      </button>
      <button class="phase-tab" id="tab-1" onclick="selectTab(1)">
        <span>🏗️</span> Phase 1 — Foundation <span class="st" id="st-1"></span>
      </button>
      <button class="phase-tab" id="tab-2" onclick="selectTab(2)">
        <span>📈</span> Phase 2 — Growth <span class="st" id="st-2"></span>
      </button>
      <button class="phase-tab" id="tab-3" onclick="selectTab(3)">
        <span>🏢</span> Phase 3 — Enterprise <span class="st" id="st-3"></span>
      </button>
    </div>
  </div>

  <!-- Main -->
  <div class="main">
    <div class="doc-header">
      <h2 id="docTitle">Strategy Overview</h2>
      <div class="toolbar" id="toolbar" style="display:none">
        <div class="fmt-row">
          <span class="fmt-label">Format:</span>
          <select class="fmt-select" id="fmtSelect">
            <option value="md">📝 Markdown (.md)</option>
            <option value="html">🌐 HTML (.html)</option>
            <option value="pdf">📕 PDF (.pdf)</option>
            <option value="docx">📘 Word (.docx)</option>
            <option value="txt">📄 Plain Text (.txt)</option>
            <option value="json">{ } JSON (.json)</option>
          </select>
        </div>
        <div class="sep"></div>
        <button class="tool-btn" onclick="copyContent()">📋 Copy</button>
        <button class="tool-btn" onclick="exportOne()">💾 Export</button>
        <button class="tool-btn" onclick="exportAll()">📦 Export All</button>
        <div class="sep"></div>
        <button class="tool-btn" onclick="regenerate()">🔄 Regenerate</button>
      </div>
    </div>

    <div class="doc-content" id="docContent">
      <div class="placeholder">
        <div class="icon">🏛️</div>
        <p>Enter your system requirements and click <strong>Generate All Phases</strong> for a complete architecture strategy, or open a Phase tab to generate individually.</p>
        <p style="font-size:11px;margin-top:6px;opacity:.7">Works with OpenAI · Anthropic · Gemini · Ollama</p>
      </div>
    </div>
  </div>
</div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  let activeTab = 0;
  const docs = {0:null,1:null,2:null,3:null};
  const titles = {
    0:'Strategy Overview',
    1:'Phase 1 — Foundation Architecture',
    2:'Phase 2 — Growth & Stability Architecture',
    3:'Phase 3 — Enterprise Scale Architecture'
  };

  function fmt(){return document.getElementById('fmtSelect').value;}
  function reqs(){return document.getElementById('requirements').value.trim();}

  function selectTab(p){
    document.querySelectorAll('.phase-tab').forEach(t=>t.classList.remove('active'));
    document.getElementById('tab-'+p).classList.add('active');
    activeTab=p;
    document.getElementById('docTitle').textContent=titles[p];
    if(docs[p]) showDoc(docs[p]);
    else showEmpty(p);
  }

  function showEmpty(p){
    document.getElementById('toolbar').style.display='none';
    const hasR=reqs().length>0;
    const name=p===0?'Strategy Overview':'Phase '+p;
    document.getElementById('docContent').innerHTML=\`
      <div class="placeholder">
        <div class="icon">\${['📋','🏗️','📈','🏢'][p]}</div>
        \${hasR
          ? \`<p>\${name} not yet generated.</p>
             <button class="btn btn-primary" style="width:auto;margin-top:8px;padding:7px 18px" onclick="generateOne(\${p})">
               ⚡ Generate \${name}
             </button>\`
          : '<p>Enter system requirements in the sidebar, then generate this phase.</p>'
        }
      </div>\`;
  }

  function generateOne(p){
    if(!reqs()){alert('Please enter system requirements first.');return;}
    if(p===0){vscode.postMessage({type:'generateAll',requirements:reqs()});}
    else{vscode.postMessage({type:'generate',phase:p,requirements:reqs()});}
  }

  function generateAll(){
    if(!reqs()){alert('Please enter system requirements first.');return;}
    vscode.postMessage({type:'generateAll',requirements:reqs()});
  }

  function regenerate(){generateOne(activeTab);}

  function showDoc(content){
    document.getElementById('toolbar').style.display='flex';
    document.getElementById('docContent').innerHTML='<div class="md">'+renderMd(content)+'</div>';
  }

  function copyContent(){
    if(!docs[activeTab])return;
    navigator.clipboard.writeText(docs[activeTab]).then(()=>{
      const btn=event.target;btn.textContent='✅ Copied!';
      setTimeout(()=>btn.textContent='📋 Copy',2000);
    });
  }

  function exportOne(){
    if(!docs[activeTab])return;
    vscode.postMessage({
      type:'export',phase:activeTab,
      content:docs[activeTab],
      requirements:reqs(),
      format:fmt(),
      title:titles[activeTab]
    });
  }

  function exportAll(){
    const available=Object.entries(docs)
      .filter(([,v])=>v!==null)
      .map(([k,v])=>({phase:parseInt(k),title:titles[parseInt(k)],content:v}));
    if(!available.length){alert('Generate at least one phase first.');return;}
    vscode.postMessage({type:'exportAll',docs:available,requirements:reqs(),format:fmt()});
  }

  // ── Markdown renderer ──────────────────────────────────────────────────────
  function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  function renderMd(md){
    let h=esc(md);
    h=h.replace(/\`\`\`[\\w]*\\n([\\s\\S]*?)\`\`\`/g,(_,c)=>'<pre><code>'+c+'</code></pre>');
    h=h.replace(/\`([^\`]+)\`/g,'<code>$1</code>');
    h=h.replace(/^#### (.+)$/gm,'<h4>$1</h4>');
    h=h.replace(/^### (.+)$/gm,'<h3>$1</h3>');
    h=h.replace(/^## (.+)$/gm,'<h2>$1</h2>');
    h=h.replace(/^# (.+)$/gm,'<h1>$1</h1>');
    h=h.replace(/^---+$/gm,'<hr>');
    h=h.replace(/\\*\\*\\*(.+?)\\*\\*\\*/g,'<strong><em>$1</em></strong>');
    h=h.replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>');
    h=h.replace(/\\*([^*\\n]+)\\*/g,'<em>$1</em>');
    h=h.replace(/((?:\\|.+\\|\\n)+)/g,m=>{
      const rows=m.trim().split('\\n').filter(r=>r.trim());
      if(rows.length<2)return m;
      const hdrs=rows[0].split('|').map(c=>c.trim()).filter(Boolean);
      let t='<table><thead><tr>'+hdrs.map(hd=>'<th>'+hd+'</th>').join('')+'</tr></thead><tbody>';
      for(let i=2;i<rows.length;i++){
        if(!rows[i].trim()||/^[\\s|:=-]+$/.test(rows[i]))continue;
        const cols=rows[i].split('|').map(c=>c.trim()).filter(Boolean);
        t+='<tr>'+cols.map(c=>'<td>'+c+'</td>').join('')+'</tr>';
      }
      return t+'</tbody></table>';
    });
    h=h.replace(/^&gt; (.+)$/gm,'<blockquote>$1</blockquote>');
    h=h.replace(/((?:^[-*] .+\\n?)+)/gm,m=>'<ul>'+m.replace(/^[-*] (.+)$/gm,'<li>$1</li>')+'</ul>');
    h=h.replace(/((?:^\\d+\\. .+\\n?)+)/gm,m=>'<ol>'+m.replace(/^\\d+\\. (.+)$/gm,'<li>$1</li>')+'</ol>');
    h=h.replace(/^(?!<[a-zA-Z/]|$)(.+)$/gm,'<p>$1</p>');
    return h;
  }

  // ── Message handler ────────────────────────────────────────────────────────
  window.addEventListener('message',e=>{
    const m=e.data;
    switch(m.type){
      case 'generating':
        setSt(m.phase,'spin','⟳');
        if(activeTab===m.phase){
          document.getElementById('toolbar').style.display='none';
          document.getElementById('docContent').innerHTML=
            '<div class="gen-box"><div class="spinner"></div><span>Generating '+esc(m.title)+'&hellip; (30–90 s)</span></div>';
        }
        break;
      case 'result':
        docs[m.phase]=m.content;
        setSt(m.phase,'ok','✓');
        if(activeTab===m.phase)showDoc(m.content);
        break;
      case 'phaseError':
        setSt(m.phase,'err','✗');
        if(activeTab===m.phase){
          document.getElementById('toolbar').style.display='none';
          document.getElementById('docContent').innerHTML='<div class="err-box">Error: '+esc(m.message)+'</div>';
        }
        break;
      case 'error':
        document.getElementById('toolbar').style.display='none';
        document.getElementById('docContent').innerHTML='<div class="err-box">'+esc(m.message)+'</div>';
        break;
      case 'allDone':
        selectTab(activeTab);break;
    }
  });

  function setSt(p,cls,t){
    const el=document.getElementById('st-'+p);
    if(!el)return;el.className='st '+cls;el.textContent=t;
  }
</script>
</body>
</html>`;
  }

  public dispose(): void {
    ArchitectPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }
}
