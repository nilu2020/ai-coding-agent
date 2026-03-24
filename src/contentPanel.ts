import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  ContentContext,
  ContentTone,
  ContentIndustry,
  blogPostPrompt,
  linkedInPrompt,
  tweetsPrompt,
  videoScriptPrompt,
  instagramPrompt,
  contentStrategyPrompt,
} from "./contentPrompts";
import { toPdf, toDocx } from "./documentConverters";
import {
  postToTwitter,
  postToLinkedIn,
  postToInstagram,
  parseTweets,
  parseLinkedInPosts,
  parseInstagramPosts,
  ParsedPost,
} from "./socialPublisher";

// ── Types ──────────────────────────────────────────────────────────────────────

type ContentTab =
  | "strategy"
  | "blog"
  | "linkedin"
  | "tweets"
  | "video"
  | "instagram";

type ExportFormat = "md" | "html" | "pdf" | "docx" | "txt" | "json";

interface ContentState {
  strategy: string;
  blog: string;
  linkedin: string;
  tweets: string;
  video: string;
  instagram: string;
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export class ContentWriterPanel {
  public static currentPanel: ContentWriterPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _content: ContentState = {
    strategy: "",
    blog: "",
    linkedin: "",
    tweets: "",
    video: "",
    instagram: "",
  };

  static readonly viewType = "contentWriter";

  public static createOrShow(extensionUri: vscode.Uri): void {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    if (ContentWriterPanel.currentPanel) {
      ContentWriterPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ContentWriterPanel.viewType,
      "✍️ AI Content Writer",
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    ContentWriterPanel.currentPanel = new ContentWriterPanel(panel);
  }

  private constructor(panel: vscode.WebviewPanel) {
    this._panel = panel;
    this._panel.webview.html = this._getHtml();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg),
      null,
      this._disposables
    );
  }

  private async _handleMessage(msg: {
    type: string;
    tab?: ContentTab;
    context?: ContentContext;
    format?: ExportFormat;
    tab_export?: ContentTab;
    content?: string;
    filename?: string;
    platform?: "twitter" | "linkedin" | "instagram";
    postContent?: string;
    postIndex?: number;
    imageUrl?: string;
  }): Promise<void> {
    switch (msg.type) {
      case "generate":
        await this._generate(msg.tab!, msg.context!);
        break;
      case "generateAll":
        await this._generateAll(msg.context!);
        break;
      case "export":
        await this._export(msg.format!, msg.tab_export!, msg.content!);
        break;
      case "exportAll":
        await this._exportAll(msg.format!, msg.context!);
        break;
      case "getParsedPosts":
        this._getParsedPosts(msg.tab!);
        break;
      case "publish":
        await this._publish(
          msg.platform!,
          msg.postContent!,
          msg.postIndex!,
          msg.imageUrl
        );
        break;
      case "openSocialSettings":
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "aiCodingAgent.social"
        );
        break;
    }
  }

  private _getParsedPosts(tab: ContentTab): void {
    const raw = this._content[tab];
    if (!raw) {
      this._post({ type: "parsedPosts", tab, posts: [] });
      return;
    }
    let posts: ParsedPost[] = [];
    if (tab === "tweets") {
      posts = parseTweets(raw);
    } else if (tab === "linkedin") {
      posts = parseLinkedInPosts(raw);
    } else if (tab === "instagram") {
      posts = parseInstagramPosts(raw);
    }
    this._post({ type: "parsedPosts", tab, posts });
  }

  private async _publish(
    platform: "twitter" | "linkedin" | "instagram",
    text: string,
    postIndex: number,
    imageUrl?: string
  ): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("aiCodingAgent");
    try {
      let result: { id: string; url: string };

      if (platform === "twitter") {
        const creds = {
          apiKey: cfg.get<string>("social.twitter.apiKey", ""),
          apiSecret: cfg.get<string>("social.twitter.apiSecret", ""),
          accessToken: cfg.get<string>("social.twitter.accessToken", ""),
          accessTokenSecret: cfg.get<string>(
            "social.twitter.accessTokenSecret",
            ""
          ),
        };
        if (
          !creds.apiKey ||
          !creds.apiSecret ||
          !creds.accessToken ||
          !creds.accessTokenSecret
        ) {
          throw new Error(
            "Twitter credentials not configured. Open Settings → search 'aiCodingAgent.social.twitter'."
          );
        }
        result = await postToTwitter(text, creds);
      } else if (platform === "linkedin") {
        const creds = {
          accessToken: cfg.get<string>("social.linkedin.accessToken", ""),
          personId: cfg.get<string>("social.linkedin.personId", ""),
        };
        if (!creds.accessToken || !creds.personId) {
          throw new Error(
            "LinkedIn credentials not configured. Open Settings → search 'aiCodingAgent.social.linkedin'."
          );
        }
        result = await postToLinkedIn(text, creds);
      } else {
        const creds = {
          accessToken: cfg.get<string>("social.instagram.accessToken", ""),
          userId: cfg.get<string>("social.instagram.userId", ""),
        };
        if (!creds.accessToken || !creds.userId) {
          throw new Error(
            "Instagram credentials not configured. Open Settings → search 'aiCodingAgent.social.instagram'."
          );
        }
        result = await postToInstagram(text, imageUrl, creds);
      }

      this._post({
        type: "publishResult",
        platform,
        postIndex,
        success: true,
        url: result.url,
        id: result.id,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this._post({
        type: "publishResult",
        platform,
        postIndex,
        success: false,
        error: message,
      });
    }
  }

  // ── AI generation ──────────────────────────────────────────────────────────

  private async _generate(tab: ContentTab, ctx: ContentContext): Promise<void> {
    const promptFn: Record<ContentTab, (c: ContentContext) => string> = {
      strategy: contentStrategyPrompt,
      blog: blogPostPrompt,
      linkedin: linkedInPrompt,
      tweets: tweetsPrompt,
      video: videoScriptPrompt,
      instagram: instagramPrompt,
    };

    const prompt = promptFn[tab](ctx);
    const config = vscode.workspace.getConfiguration("aiCodingAgent");
    const provider: string = config.get("provider", "openai");
    const model: string = config.get("model", "gpt-4o");
    const apiKey: string = config.get("apiKey", "");
    const ollamaUrl: string = config.get(
      "ollamaBaseUrl",
      "http://localhost:11434"
    );

    this._post({ type: "generating", tab });

    try {
      const result = await callAI(provider, model, apiKey, ollamaUrl, prompt);
      this._content[tab] = result;
      this._post({ type: "generated", tab, content: result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this._post({ type: "error", tab, message });
    }
  }

  private async _generateAll(ctx: ContentContext): Promise<void> {
    const tabs: ContentTab[] = [
      "strategy",
      "blog",
      "linkedin",
      "tweets",
      "video",
      "instagram",
    ];
    for (const tab of tabs) {
      await this._generate(tab, ctx);
    }
    this._post({ type: "allDone" });
  }

  // ── Export ─────────────────────────────────────────────────────────────────

  private async _export(
    format: ExportFormat,
    tab: ContentTab,
    content: string
  ): Promise<void> {
    const tabLabels: Record<ContentTab, string> = {
      strategy: "Content Strategy",
      blog: "Blog Post",
      linkedin: "LinkedIn Posts",
      tweets: "Tweets",
      video: "Video Script",
      instagram: "Instagram Posts",
    };

    const label = tabLabels[tab];
    const dir = this._ensureOutputDir();
    const slug = label.toLowerCase().replace(/\s+/g, "-");
    const filename = `content-${slug}-${Date.now()}`;

    try {
      let filePath = "";
      switch (format) {
        case "md":
          filePath = path.join(dir, `${filename}.md`);
          fs.writeFileSync(filePath, `# ${label}\n\n${content}`, "utf8");
          break;
        case "txt":
          filePath = path.join(dir, `${filename}.txt`);
          fs.writeFileSync(
            filePath,
            `${label.toUpperCase()}\n${"=".repeat(label.length)}\n\n${content}`,
            "utf8"
          );
          break;
        case "html":
          filePath = path.join(dir, `${filename}.html`);
          fs.writeFileSync(filePath, markdownToHtml(content, label), "utf8");
          break;
        case "json":
          filePath = path.join(dir, `${filename}.json`);
          fs.writeFileSync(
            filePath,
            JSON.stringify(
              { title: label, generated: new Date().toISOString(), content },
              null,
              2
            ),
            "utf8"
          );
          break;
        case "pdf": {
          filePath = path.join(dir, `${filename}.pdf`);
          const pdfBuf = await toPdf(content, label, "");
          fs.writeFileSync(filePath, pdfBuf);
          break;
        }
        case "docx": {
          filePath = path.join(dir, `${filename}.docx`);
          const docxBuf = await toDocx(content, label, "");
          fs.writeFileSync(filePath, docxBuf);
          break;
        }
      }

      const uri = vscode.Uri.file(filePath);
      const choice = await vscode.window.showInformationMessage(
        `✅ Exported ${label} as ${format.toUpperCase()}`,
        "Open File",
        "Show in Explorer"
      );
      if (choice === "Open File") {
        await vscode.window.showTextDocument(uri);
      } else if (choice === "Show in Explorer") {
        await vscode.commands.executeCommand("revealFileInOS", uri);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Export failed: ${message}`);
    }
  }

  private async _exportAll(
    format: ExportFormat,
    ctx: ContentContext
  ): Promise<void> {
    const tabs: ContentTab[] = [
      "strategy",
      "blog",
      "linkedin",
      "tweets",
      "video",
      "instagram",
    ];
    const tabLabels: Record<ContentTab, string> = {
      strategy: "Content Strategy",
      blog: "Blog Post",
      linkedin: "LinkedIn Posts",
      tweets: "Tweets",
      video: "Video Script",
      instagram: "Instagram Posts",
    };

    const sections = tabs
      .filter((t) => this._content[t])
      .map((t) => ({ phase: tabLabels[t], content: this._content[t] }));

    if (sections.length === 0) {
      vscode.window.showWarningMessage("No content generated yet to export.");
      return;
    }

    const dir = this._ensureOutputDir();
    const filename = `content-system-${Date.now()}`;
    const title = `Content System: ${ctx.subject}`;
    const ts = new Date().toISOString();
    let filePath = "";

    try {
      switch (format) {
        case "md": {
          filePath = path.join(dir, `${filename}.md`);
          const body = sections
            .map((s) => `# ${s.phase}\n\n${s.content}`)
            .join("\n\n---\n\n");
          fs.writeFileSync(filePath, `# ${title}\n\n${body}`, "utf8");
          break;
        }
        case "txt": {
          filePath = path.join(dir, `${filename}.txt`);
          const body = sections
            .map(
              (s) =>
                `${s.phase.toUpperCase()}\n${"=".repeat(s.phase.length)}\n\n${s.content}`
            )
            .join("\n\n" + "-".repeat(60) + "\n\n");
          fs.writeFileSync(filePath, `${title}\n\n${body}`, "utf8");
          break;
        }
        case "html": {
          filePath = path.join(dir, `${filename}.html`);
          const body = sections
            .map((s) => markdownToHtml(s.content, s.phase))
            .join("<hr/>");
          fs.writeFileSync(
            filePath,
            `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:sans-serif;max-width:900px;margin:40px auto;padding:20px}</style></head><body><h1>${title}</h1>${body}</body></html>`,
            "utf8"
          );
          break;
        }
        case "json": {
          filePath = path.join(dir, `${filename}.json`);
          fs.writeFileSync(
            filePath,
            JSON.stringify(
              { title, subject: ctx.subject, generated: ts, sections },
              null,
              2
            ),
            "utf8"
          );
          break;
        }
        case "pdf": {
          filePath = path.join(dir, `${filename}.pdf`);
          const combinedMd = sections.map((s) => `# ${s.phase}\n\n${s.content}`).join("\n\n---\n\n");
          const pdfBuf = await toPdf(combinedMd, title, ctx.subject);
          fs.writeFileSync(filePath, pdfBuf);
          break;
        }
        case "docx": {
          filePath = path.join(dir, `${filename}.docx`);
          const combinedMd2 = sections.map((s) => `# ${s.phase}\n\n${s.content}`).join("\n\n---\n\n");
          const docxBuf = await toDocx(combinedMd2, title, ctx.subject);
          fs.writeFileSync(filePath, docxBuf);
          break;
        }
      }

      const uri = vscode.Uri.file(filePath);
      const choice = await vscode.window.showInformationMessage(
        `✅ Content System exported as ${format.toUpperCase()} (${sections.length} sections)`,
        "Open File",
        "Show in Explorer"
      );
      if (choice === "Open File" && format !== "pdf" && format !== "docx") {
        await vscode.window.showTextDocument(uri);
      } else if (choice === "Show in Explorer") {
        await vscode.commands.executeCommand("revealFileInOS", uri);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Export All failed: ${message}`);
    }
  }

  private _ensureOutputDir(): string {
    const folders = vscode.workspace.workspaceFolders;
    const base = folders ? folders[0].uri.fsPath : require("os").homedir();
    const dir = path.join(base, "content-output");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  private _post(data: Record<string, unknown>): void {
    this._panel.webview.postMessage(data);
  }

  public dispose(): void {
    ContentWriterPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) {
        d.dispose();
      }
    }
  }

  // ── HTML ───────────────────────────────────────────────────────────────────

  private _getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Content Writer</title>
<style>
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --panel: var(--vscode-sideBar-background, #1e1e2e);
    --border: var(--vscode-panel-border, #333);
    --input-bg: var(--vscode-input-background);
    --input-fg: var(--vscode-input-foreground);
    --input-border: var(--vscode-input-border);
    --btn: var(--vscode-button-background);
    --btn-fg: var(--vscode-button-foreground);
    --btn-hover: var(--vscode-button-hoverBackground);
    --accent: #7c3aed;
    --accent2: #2563eb;
    --green: #16a34a;
    --orange: #d97706;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
    background: var(--bg);
    color: var(--fg);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Header */
  .header {
    background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
    padding: 12px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .header-title {
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.3px;
  }
  .header-sub {
    font-size: 10px;
    color: rgba(255,255,255,0.75);
    margin-top: 1px;
  }
  .header-badge {
    font-size: 10px;
    background: rgba(255,255,255,0.15);
    color: #fff;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.25);
  }

  /* Layout */
  .layout {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* Sidebar form */
  .sidebar {
    width: 280px;
    min-width: 240px;
    background: var(--panel);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    flex-shrink: 0;
  }
  .sidebar-section {
    padding: 14px 14px 0;
  }
  .sidebar-label {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--accent);
    margin-bottom: 8px;
  }
  .form-group {
    margin-bottom: 10px;
  }
  .form-group label {
    font-size: 11px;
    color: var(--fg);
    opacity: 0.75;
    display: block;
    margin-bottom: 4px;
  }
  .form-group input,
  .form-group select,
  .form-group textarea {
    width: 100%;
    background: var(--input-bg);
    color: var(--input-fg);
    border: 1px solid var(--input-border, #555);
    border-radius: 4px;
    padding: 6px 8px;
    font-size: 11px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }
  .form-group textarea {
    resize: vertical;
    min-height: 52px;
  }
  .form-group input:focus,
  .form-group select:focus,
  .form-group textarea:focus {
    border-color: var(--accent);
  }

  /* Tone pills */
  .tone-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5px;
  }
  .tone-pill {
    padding: 5px 6px;
    border-radius: 4px;
    border: 1px solid var(--border);
    background: var(--input-bg);
    color: var(--fg);
    font-size: 10px;
    cursor: pointer;
    text-align: center;
    transition: all 0.15s;
  }
  .tone-pill:hover { border-color: var(--accent); }
  .tone-pill.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
  }

  /* Action buttons */
  .sidebar-actions {
    padding: 12px 14px;
    border-top: 1px solid var(--border);
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 5px;
    border: none;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-primary {
    background: linear-gradient(135deg, #7c3aed, #2563eb);
    color: #fff;
  }
  .btn-primary:hover { opacity: 0.9; }
  .btn-secondary {
    background: var(--btn, #333);
    color: var(--btn-fg, #fff);
    border: 1px solid var(--border);
  }
  .btn-secondary:hover { background: var(--btn-hover); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Main content area */
  .content-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Tabs */
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
    overflow-x: auto;
    flex-shrink: 0;
  }
  .tab {
    padding: 10px 14px;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    border-bottom: 2px solid transparent;
    color: var(--fg);
    opacity: 0.6;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    gap: 5px;
    position: relative;
  }
  .tab:hover { opacity: 0.9; }
  .tab.active {
    opacity: 1;
    border-bottom-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  .tab-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--green);
    flex-shrink: 0;
    display: none;
  }
  .tab.has-content .tab-dot { display: block; }

  /* Tab panel */
  .tab-panels {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .tab-panel {
    display: none;
    flex: 1;
    flex-direction: column;
    overflow: hidden;
  }
  .tab-panel.active {
    display: flex;
  }

  /* Output toolbar */
  .output-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  .output-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    opacity: 0.5;
  }
  .format-select {
    background: var(--input-bg);
    color: var(--input-fg);
    border: 1px solid var(--input-border, #555);
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11px;
    outline: none;
    cursor: pointer;
  }
  .btn-export {
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid var(--accent);
    background: transparent;
    color: var(--accent);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-export:hover { background: var(--accent); color: #fff; }
  .btn-export-all {
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid var(--accent2);
    background: transparent;
    color: var(--accent2);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    margin-left: auto;
  }
  .btn-export-all:hover { background: var(--accent2); color: #fff; }

  /* Content output */
  .output-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }
  .output-content {
    font-size: 13px;
    line-height: 1.7;
    white-space: pre-wrap;
    font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
  }
  .output-content.is-code {
    font-family: var(--vscode-editor-font-family, 'Courier New', monospace);
  }

  /* Empty states */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    text-align: center;
    opacity: 0.6;
  }
  .empty-icon { font-size: 40px; margin-bottom: 12px; }
  .empty-title { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
  .empty-sub { font-size: 12px; opacity: 0.7; }

  /* Loading */
  .loading-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 12px;
  }
  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading-text { font-size: 12px; opacity: 0.7; }

  /* Divider in sidebar */
  .sidebar-divider {
    height: 1px;
    background: var(--border);
    margin: 10px 14px;
  }

  /* Content system map */
  .system-map {
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px 12px;
    margin: 12px 14px;
    font-size: 10px;
    line-height: 1.8;
    opacity: 0.8;
  }
  .system-map-title {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--accent);
    margin-bottom: 6px;
  }

  /* Progress bar for generate all */
  .progress-bar-wrap {
    height: 3px;
    background: var(--border);
    flex-shrink: 0;
  }
  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #7c3aed, #2563eb);
    width: 0%;
    transition: width 0.3s;
  }

  /* Publish button */
  .btn-publish {
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid #16a34a;
    background: transparent;
    color: #16a34a;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    margin-left: 4px;
  }
  .btn-publish:hover { background: #16a34a; color: #fff; }

  /* Publish overlay */
  .publish-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.65);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }
  .publish-overlay.hidden { display: none; }
  .publish-panel {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    width: 100%;
    max-width: 680px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  }
  .publish-header {
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: linear-gradient(135deg, #16a34a22 0%, #15803d11 100%);
    flex-shrink: 0;
  }
  .publish-title {
    font-size: 14px;
    font-weight: 700;
    color: #16a34a;
  }
  .publish-sub {
    font-size: 10px;
    opacity: 0.6;
    margin-top: 2px;
  }
  .publish-close {
    background: none;
    border: none;
    color: var(--fg);
    font-size: 18px;
    cursor: pointer;
    opacity: 0.6;
    padding: 4px 8px;
  }
  .publish-close:hover { opacity: 1; }

  /* Platform tabs in publish panel */
  .platform-tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
    flex-shrink: 0;
  }
  .platform-tab {
    padding: 8px 16px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    opacity: 0.6;
    transition: all 0.15s;
  }
  .platform-tab:hover { opacity: 0.9; }
  .platform-tab.active {
    opacity: 1;
    border-bottom-color: #16a34a;
    color: #16a34a;
  }

  /* Publish body */
  .publish-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 18px;
  }
  .publish-settings-note {
    font-size: 11px;
    background: #1e3a5f22;
    border: 1px solid #2563eb44;
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 14px;
    color: var(--fg);
    line-height: 1.5;
  }
  .publish-settings-note a {
    color: #2563eb;
    cursor: pointer;
    text-decoration: underline;
  }

  /* Post cards */
  .post-card {
    border: 1px solid var(--border);
    border-radius: 7px;
    margin-bottom: 12px;
    overflow: hidden;
  }
  .post-card-header {
    padding: 8px 12px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .post-card-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--fg);
    opacity: 0.6;
  }
  .post-card-status {
    font-size: 11px;
    font-weight: 600;
  }
  .status-pending { opacity: 0.5; }
  .status-posting { color: #d97706; }
  .status-posted { color: #16a34a; }
  .status-error { color: #ef4444; }

  .post-textarea {
    width: 100%;
    background: var(--input-bg);
    color: var(--input-fg);
    border: none;
    padding: 10px 12px;
    font-size: 12px;
    font-family: inherit;
    resize: vertical;
    min-height: 90px;
    outline: none;
    line-height: 1.6;
  }
  .post-char-count {
    font-size: 10px;
    opacity: 0.5;
    text-align: right;
    padding: 3px 12px;
    border-top: 1px solid var(--border);
  }
  .post-card-footer {
    padding: 8px 12px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--panel);
  }
  .btn-post {
    padding: 5px 12px;
    border-radius: 5px;
    border: none;
    background: #16a34a;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
  }
  .btn-post:hover { background: #15803d; }
  .btn-post:disabled { opacity: 0.5; cursor: not-allowed; }
  .post-link {
    font-size: 11px;
    color: #2563eb;
    text-decoration: underline;
    cursor: pointer;
    display: none;
  }

  /* Image URL row for Instagram */
  .ig-image-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-top: 1px solid var(--border);
  }
  .ig-image-row input {
    flex: 1;
    background: var(--input-bg);
    color: var(--input-fg);
    border: 1px solid var(--input-border, #555);
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11px;
    outline: none;
  }
  .ig-image-row label {
    font-size: 10px;
    opacity: 0.6;
    white-space: nowrap;
  }

  .publish-footer {
    padding: 12px 18px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .btn-post-all {
    padding: 7px 16px;
    border-radius: 5px;
    border: none;
    background: linear-gradient(135deg, #16a34a, #15803d);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-post-all:hover { opacity: 0.9; }
  .btn-post-all:disabled { opacity: 0.5; cursor: not-allowed; }
  .publish-footer-note { font-size: 10px; opacity: 0.5; }
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div>
    <div class="header-title">✍️ AI Content Writer</div>
    <div class="header-sub">Strategic Content Systems · 20-year Expert Mode</div>
  </div>
  <div class="header-badge">Content Systems Builder</div>
</div>

<!-- Main layout -->
<div class="layout">

  <!-- Sidebar -->
  <div class="sidebar">
    <div class="sidebar-section">
      <div class="sidebar-label">Content Brief</div>

      <div class="form-group">
        <label>Subject / Topic *</label>
        <textarea id="subject" placeholder="e.g. How AI is transforming B2B sales cycles in 2025" rows="3"></textarea>
      </div>

      <div class="form-group">
        <label>Target Audience *</label>
        <input id="audience" type="text" placeholder="e.g. B2B Sales VPs at mid-market SaaS companies" />
      </div>

      <div class="form-group">
        <label>Industry</label>
        <select id="industry">
          <option value="Technology">Technology</option>
          <option value="SaaS" selected>SaaS</option>
          <option value="Finance">Finance</option>
          <option value="Healthcare">Healthcare</option>
          <option value="Marketing">Marketing</option>
          <option value="E-commerce">E-commerce</option>
          <option value="Consulting">Consulting</option>
          <option value="Education">Education</option>
          <option value="Real Estate">Real Estate</option>
          <option value="Media">Media</option>
          <option value="General">General</option>
        </select>
      </div>

      <div class="form-group">
        <label>SEO Keywords (comma-separated)</label>
        <input id="keywords" type="text" placeholder="e.g. AI sales, B2B automation, revenue growth" />
      </div>
    </div>

    <div class="sidebar-divider"></div>

    <div class="sidebar-section">
      <div class="sidebar-label">Tone & Voice</div>
      <div class="tone-grid" id="toneGrid">
        <div class="tone-pill active" data-tone="professional">🎯 Professional</div>
        <div class="tone-pill" data-tone="conversational">💬 Conversational</div>
        <div class="tone-pill" data-tone="storytelling">📖 Storytelling</div>
        <div class="tone-pill" data-tone="inspirational">🚀 Inspirational</div>
        <div class="tone-pill" data-tone="educational">🎓 Educational</div>
        <div class="tone-pill" data-tone="bold">⚡ Bold</div>
      </div>

      <div class="form-group" style="margin-top:10px">
        <label>Brand Voice Notes (optional)</label>
        <textarea id="brandVoice" placeholder="e.g. We avoid corporate jargon. We're direct but warm. We use 'you' not 'our clients'." rows="3"></textarea>
      </div>
    </div>

    <!-- Content system map -->
    <div class="system-map">
      <div class="system-map-title">📐 Content System</div>
      1 Blog → 10 LinkedIn posts<br>
      → 3 Tweets → 1 Video Script<br>
      → 3 Instagram posts<br>
      → 1 Strategy Overview
    </div>

    <!-- Actions -->
    <div class="sidebar-actions">
      <button class="btn btn-primary" id="btnGenerateAll">
        <span>⚡</span> Generate Full System
      </button>
      <button class="btn btn-secondary" id="btnGenerateCurrent">
        <span>▶</span> Generate Current Tab
      </button>
    </div>
  </div>

  <!-- Content area -->
  <div class="content-area">

    <!-- Tab bar -->
    <div class="tabs">
      <div class="tab active" data-tab="strategy">
        <span class="tab-dot"></span>📐 Strategy
      </div>
      <div class="tab" data-tab="blog">
        <span class="tab-dot"></span>📝 Blog Post
      </div>
      <div class="tab" data-tab="linkedin">
        <span class="tab-dot"></span>💼 LinkedIn (10)
      </div>
      <div class="tab" data-tab="tweets">
        <span class="tab-dot"></span>🐦 Tweets (3)
      </div>
      <div class="tab" data-tab="video">
        <span class="tab-dot"></span>🎬 Video Script
      </div>
      <div class="tab" data-tab="instagram">
        <span class="tab-dot"></span>📸 Instagram (3)
      </div>
    </div>

    <!-- Progress bar -->
    <div class="progress-bar-wrap">
      <div class="progress-bar" id="progressBar"></div>
    </div>

    <!-- Tab panels -->
    <div class="tab-panels">

      ${["strategy", "blog", "linkedin", "tweets", "video", "instagram"]
        .map(
          (tab) => `
      <div class="tab-panel${tab === "strategy" ? " active" : ""}" data-panel="${tab}">
        <!-- Toolbar -->
        <div class="output-toolbar">
          <span class="output-label">${tabLabel(tab)}</span>
          <select class="format-select" id="fmt-${tab}">
            <option value="md">📝 Markdown</option>
            <option value="html">🌐 HTML</option>
            <option value="pdf">📕 PDF</option>
            <option value="docx">📘 Word</option>
            <option value="txt">📄 Plain Text</option>
            <option value="json">{ } JSON</option>
          </select>
          <button class="btn-export" onclick="exportTab('${tab}')">⬇ Export</button>
          <button class="btn-export-all" onclick="exportAll()">📦 Export All</button>
          ${["linkedin", "tweets", "instagram"].includes(tab) ? `<button class="btn-publish" onclick="openPublishPanel('${tab}')">📤 Publish</button>` : ""}
        </div>
        <!-- Content -->
        <div id="panel-${tab}" style="flex:1;display:flex;flex-direction:column;overflow:hidden">
          <div class="empty-state" id="empty-${tab}">
            <div class="empty-icon">${tabIcon(tab)}</div>
            <div class="empty-title">No content yet</div>
            <div class="empty-sub">Fill in the brief and click Generate</div>
          </div>
          <div class="loading-state" id="loading-${tab}" style="display:none">
            <div class="spinner"></div>
            <div class="loading-text">Generating ${tabLabel(tab)}…</div>
          </div>
          <div class="output-scroll" id="scroll-${tab}" style="display:none">
            <div class="output-content" id="output-${tab}"></div>
          </div>
        </div>
      </div>`
        )
        .join("")}

    </div><!-- /tab-panels -->
  </div><!-- /content-area -->
</div><!-- /layout -->

<script>
  const vscode = acquireVsCodeApi();
  let activeTone = 'professional';
  let activeTab = 'strategy';
  const completedTabs = new Set();
  let generatingCount = 0;
  const totalTabs = 6;

  // ── Tab switching ──────────────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      document.querySelector(\`.tab-panel[data-panel="\${activeTab}"]\`).classList.add('active');
    });
  });

  // ── Tone selection ─────────────────────────────────────────────────────────
  document.querySelectorAll('.tone-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.tone-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeTone = pill.dataset.tone;
    });
  });

  // ── Buttons ────────────────────────────────────────────────────────────────
  document.getElementById('btnGenerateAll').addEventListener('click', () => {
    const ctx = getContext();
    if (!ctx) return;
    completedTabs.clear();
    generatingCount = 0;
    updateProgress();
    vscode.postMessage({ type: 'generateAll', context: ctx });
  });

  document.getElementById('btnGenerateCurrent').addEventListener('click', () => {
    const ctx = getContext();
    if (!ctx) return;
    vscode.postMessage({ type: 'generate', tab: activeTab, context: ctx });
  });

  function getContext() {
    const subject = document.getElementById('subject').value.trim();
    const audience = document.getElementById('audience').value.trim();
    if (!subject) {
      document.getElementById('subject').style.borderColor = '#ef4444';
      setTimeout(() => document.getElementById('subject').style.borderColor = '', 1500);
      return null;
    }
    return {
      subject,
      audience: audience || 'General professional audience',
      industry: document.getElementById('industry').value,
      tone: activeTone,
      brandVoice: document.getElementById('brandVoice').value.trim(),
      keywords: document.getElementById('keywords').value.trim(),
    };
  }

  function exportTab(tab) {
    const content = document.getElementById('output-' + tab)?.innerText;
    if (!content) { alert('No content to export yet. Generate this section first.'); return; }
    const format = document.getElementById('fmt-' + tab).value;
    vscode.postMessage({ type: 'export', format, tab_export: tab, content });
  }

  function exportAll() {
    const ctx = getContext();
    if (!ctx) return;
    const format = document.getElementById('fmt-' + activeTab).value;
    vscode.postMessage({ type: 'exportAll', format, context: ctx });
  }

  // ── Progress ───────────────────────────────────────────────────────────────
  function updateProgress() {
    const pct = (completedTabs.size / totalTabs) * 100;
    document.getElementById('progressBar').style.width = pct + '%';
  }

  // ── Messages from extension ────────────────────────────────────────────────
  window.addEventListener('message', e => {
    const msg = e.data;
    if (msg.type === 'generating') {
      showLoading(msg.tab);
    } else if (msg.type === 'generated') {
      showContent(msg.tab, msg.content);
      completedTabs.add(msg.tab);
      updateProgress();
      markTabComplete(msg.tab);
    } else if (msg.type === 'error') {
      showError(msg.tab, msg.message);
    } else if (msg.type === 'allDone') {
      document.getElementById('progressBar').style.width = '100%';
    } else if (msg.type === 'parsedPosts') {
      renderPublishPanel(msg.tab, msg.posts);
    } else if (msg.type === 'publishResult') {
      handlePublishResult(msg);
    }
  });

  function showLoading(tab) {
    document.getElementById('empty-' + tab).style.display = 'none';
    document.getElementById('loading-' + tab).style.display = 'flex';
    document.getElementById('scroll-' + tab).style.display = 'none';
  }

  function showContent(tab, content) {
    document.getElementById('empty-' + tab).style.display = 'none';
    document.getElementById('loading-' + tab).style.display = 'none';
    const scroll = document.getElementById('scroll-' + tab);
    scroll.style.display = 'block';
    document.getElementById('output-' + tab).textContent = content;
  }

  function showError(tab, message) {
    document.getElementById('empty-' + tab).style.display = 'none';
    document.getElementById('loading-' + tab).style.display = 'none';
    const scroll = document.getElementById('scroll-' + tab);
    scroll.style.display = 'block';
    document.getElementById('output-' + tab).textContent = '❌ Error: ' + message;
  }

  function markTabComplete(tab) {
    const tabEl = document.querySelector('.tab[data-tab="' + tab + '"]');
    if (tabEl) tabEl.classList.add('has-content');
  }

  // ── Publish panel ──────────────────────────────────────────────────────────

  let publishTab = '';
  let publishPlatform = '';

  const PLATFORM_MAP = {
    tweets: { platform: 'twitter', label: '𝕏 / Twitter', icon: '🐦', charLimit: 280 },
    linkedin: { platform: 'linkedin', label: 'LinkedIn', icon: '💼', charLimit: 3000 },
    instagram: { platform: 'instagram', label: 'Instagram', icon: '📸', charLimit: 2200 },
  };

  function openPublishPanel(tab) {
    publishTab = tab;
    const info = PLATFORM_MAP[tab];
    if (!info) return;
    publishPlatform = info.platform;

    // Update header
    document.getElementById('publishTitle').textContent = '📤 Publish to ' + info.label;
    document.getElementById('publishSub').textContent =
      'Review, edit, and post each item directly from the extension.';

    // Show overlay loading state
    document.getElementById('publishBody').innerHTML =
      '<div style="text-align:center;padding:40px;opacity:0.5"><div class="spinner" style="margin:0 auto 12px"></div><div>Parsing content…</div></div>';
    document.getElementById('publishOverlay').classList.remove('hidden');

    // Ask extension to parse posts
    vscode.postMessage({ type: 'getParsedPosts', tab });
  }

  function closePublishPanel() {
    document.getElementById('publishOverlay').classList.add('hidden');
  }

  function renderPublishPanel(tab, posts) {
    const info = PLATFORM_MAP[tab];
    if (!info) return;
    const isInstagram = tab === 'instagram';
    const charLimit = info.charLimit;

    if (!posts || posts.length === 0) {
      document.getElementById('publishBody').innerHTML =
        '<div style="text-align:center;padding:40px;opacity:0.5">No posts found. Generate content first, then try again.</div>';
      return;
    }

    const settingsNote = \`
      <div class="publish-settings-note">
        🔑 <strong>API keys required.</strong> Configure credentials in VS Code Settings → search
        <a onclick="vscode.postMessage({type:'openSocialSettings'})">aiCodingAgent.social</a>.
        Each platform needs its own token — see the README for setup steps.
      </div>\`;

    const cards = posts.map((post, i) => {
      const igImageRow = isInstagram ? \`
        <div class="ig-image-row">
          <label>Image URL *</label>
          <input id="ig-img-\${i}" type="url" placeholder="https://... (required for Instagram)" />
        </div>\` : '';
      return \`
        <div class="post-card" id="card-\${i}">
          <div class="post-card-header">
            <span class="post-card-label">\${post.label}</span>
            <span class="post-card-status status-pending" id="status-\${i}">● Ready</span>
          </div>
          <textarea class="post-textarea" id="post-text-\${i}"
            maxlength="\${charLimit}"
            oninput="updateCharCount(\${i}, \${charLimit})">\${escapeHtml(post.content)}</textarea>
          \${igImageRow}
          <div class="post-char-count" id="chars-\${i}">\${post.content.length} / \${charLimit}</div>
          <div class="post-card-footer">
            <button class="btn-post" id="btn-post-\${i}" onclick="postSingle(\${i})">
              \${info.icon} Post \${post.label}
            </button>
            <a class="post-link" id="link-\${i}" target="_blank">🔗 View post</a>
          </div>
        </div>\`;
    }).join('');

    document.getElementById('publishBody').innerHTML = settingsNote + cards;

    // Update footer button
    document.getElementById('btnPostAll').onclick = () => postAll(posts.length);
    document.getElementById('publishFooterNote').textContent =
      \`Posts to \${info.label} · \${posts.length} item\${posts.length !== 1 ? 's' : ''}\`;
  }

  function escapeHtml(text) {
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function updateCharCount(index, limit) {
    const textarea = document.getElementById('post-text-' + index);
    const countEl = document.getElementById('chars-' + index);
    if (!textarea || !countEl) return;
    const len = textarea.value.length;
    countEl.textContent = len + ' / ' + limit;
    countEl.style.color = len > limit * 0.9 ? '#ef4444' : '';
  }

  function postSingle(index) {
    const btn = document.getElementById('btn-post-' + index);
    const statusEl = document.getElementById('status-' + index);
    const textarea = document.getElementById('post-text-' + index);
    const imageInput = document.getElementById('ig-img-' + index);
    if (!btn || !statusEl || !textarea) return;

    btn.disabled = true;
    statusEl.className = 'post-card-status status-posting';
    statusEl.textContent = '⏳ Posting…';

    vscode.postMessage({
      type: 'publish',
      platform: publishPlatform,
      postContent: textarea.value,
      postIndex: index,
      imageUrl: imageInput ? imageInput.value.trim() : undefined,
    });
  }

  function postAll(count) {
    for (let i = 0; i < count; i++) {
      const btn = document.getElementById('btn-post-' + i);
      const statusEl = document.getElementById('status-' + i);
      if (statusEl && !statusEl.classList.contains('status-posted')) {
        setTimeout(() => postSingle(i), i * 800); // stagger to avoid rate limits
      }
    }
  }

  function handlePublishResult(msg) {
    const statusEl = document.getElementById('status-' + msg.postIndex);
    const btn = document.getElementById('btn-post-' + msg.postIndex);
    const linkEl = document.getElementById('link-' + msg.postIndex);

    if (!statusEl) return;

    if (msg.success) {
      statusEl.className = 'post-card-status status-posted';
      statusEl.textContent = '✓ Posted!';
      if (btn) btn.disabled = true;
      if (linkEl && msg.url) {
        linkEl.style.display = 'inline';
        linkEl.href = msg.url;
        linkEl.textContent = '🔗 View post';
      }
    } else {
      statusEl.className = 'post-card-status status-error';
      statusEl.textContent = '✗ Failed';
      if (btn) {
        btn.disabled = false;
        btn.textContent = '↻ Retry';
      }
      // Show error in a tooltip-like way
      const card = document.getElementById('card-' + msg.postIndex);
      if (card) {
        let errEl = card.querySelector('.post-error');
        if (!errEl) {
          errEl = document.createElement('div');
          errEl.className = 'post-error';
          errEl.style.cssText = 'padding:6px 12px;font-size:10px;color:#ef4444;background:#ef444411;border-top:1px solid #ef444433';
          card.appendChild(errEl);
        }
        errEl.textContent = '⚠ ' + msg.error;
      }
    }
  }
</script>

<!-- Publish overlay -->
<div class="publish-overlay hidden" id="publishOverlay">
  <div class="publish-panel">
    <div class="publish-header">
      <div>
        <div class="publish-title" id="publishTitle">📤 Publish</div>
        <div class="publish-sub" id="publishSub">Post directly to your social platforms</div>
      </div>
      <button class="publish-close" onclick="closePublishPanel()">✕</button>
    </div>
    <div class="publish-body" id="publishBody">
      <!-- Populated dynamically -->
    </div>
    <div class="publish-footer">
      <button class="btn-post-all" id="btnPostAll">📤 Post All</button>
      <span class="publish-footer-note" id="publishFooterNote"></span>
    </div>
  </div>
</div>

</body>
</html>`;
  }
}

// ── Tab helpers (used in template literal) ──────────────────────────────────

function tabLabel(tab: string): string {
  const labels: Record<string, string> = {
    strategy: "Content Strategy",
    blog: "Blog Post",
    linkedin: "LinkedIn Posts",
    tweets: "Tweets",
    video: "Video Script",
    instagram: "Instagram Posts",
  };
  return labels[tab] ?? tab;
}

function tabIcon(tab: string): string {
  const icons: Record<string, string> = {
    strategy: "📐",
    blog: "📝",
    linkedin: "💼",
    tweets: "🐦",
    video: "🎬",
    instagram: "📸",
  };
  return icons[tab] ?? "✨";
}

// ── AI provider call ─────────────────────────────────────────────────────────

async function callAI(
  provider: string,
  model: string,
  apiKey: string,
  ollamaUrl: string,
  prompt: string
): Promise<string> {
  const http = await import("https");
  const httpPlain = await import("http");

  if (provider === "ollama") {
    return ollamaCall(ollamaUrl, model || "llama3", prompt, httpPlain);
  }

  const endpoints: Record<string, { host: string; path: string }> = {
    openai: { host: "api.openai.com", path: "/v1/chat/completions" },
    anthropic: { host: "api.anthropic.com", path: "/v1/messages" },
    gemini: {
      host: "generativelanguage.googleapis.com",
      path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
    },
  };

  const ep = endpoints[provider];
  if (!ep) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  if (!apiKey) {
    throw new Error(
      `No API key configured for ${provider}. Set it in extension settings.`
    );
  }

  if (provider === "anthropic") {
    return anthropicCall(ep.host, ep.path, apiKey, model, prompt, http);
  }
  if (provider === "gemini") {
    return geminiCall(ep.host, ep.path, prompt, http);
  }
  return openaiCall(ep.host, ep.path, apiKey, model, prompt, http);
}

function openaiCall(
  host: string,
  path: string,
  apiKey: string,
  model: string,
  prompt: string,
  http: typeof import("https")
): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: model || "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4096,
    });
    const req = http.request(
      { hostname: host, path, method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` } },
      (res) => {
        let data = "";
        res.on("data", (c: Buffer) => (data += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(data);
            if (j.error) reject(new Error(j.error.message));
            else resolve(j.choices?.[0]?.message?.content ?? "");
          } catch {
            reject(new Error("Invalid JSON response"));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function anthropicCall(
  host: string,
  path: string,
  apiKey: string,
  model: string,
  prompt: string,
  http: typeof import("https")
): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: model || "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    const req = http.request(
      {
        hostname: host, path, method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c: Buffer) => (data += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(data);
            if (j.error) reject(new Error(j.error.message));
            else resolve(j.content?.[0]?.text ?? "");
          } catch {
            reject(new Error("Invalid JSON response"));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function geminiCall(
  host: string,
  path: string,
  prompt: string,
  http: typeof import("https")
): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });
    const req = http.request(
      { hostname: host, path, method: "POST", headers: { "Content-Type": "application/json" } },
      (res) => {
        let data = "";
        res.on("data", (c: Buffer) => (data += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(data);
            if (j.error) reject(new Error(j.error.message));
            else resolve(j.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
          } catch {
            reject(new Error("Invalid JSON response"));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function ollamaCall(
  baseUrl: string,
  model: string,
  prompt: string,
  http: typeof import("http")
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL("/api/generate", baseUrl);
    const body = JSON.stringify({ model, prompt, stream: false });
    const req = http.request(
      { hostname: url.hostname, port: url.port || 11434, path: url.pathname, method: "POST", headers: { "Content-Type": "application/json" } },
      (res) => {
        let data = "";
        res.on("data", (c: Buffer) => (data += c));
        res.on("end", () => {
          try {
            const j = JSON.parse(data);
            if (j.error) reject(new Error(j.error));
            else resolve(j.response ?? "");
          } catch {
            reject(new Error("Invalid JSON from Ollama"));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Simple markdown → HTML ───────────────────────────────────────────────────

function markdownToHtml(md: string, title: string): string {
  const body = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/\n/g, "<br>");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>body{font-family:Georgia,serif;max-width:820px;margin:40px auto;padding:20px;line-height:1.7;color:#1e293b}
  h1{color:#7c3aed}h2{color:#2563eb}h3{color:#374151}ul{margin:8px 0 8px 20px}</style>
  </head><body><h1>${title}</h1>${body}</body></html>`;
}
