import * as vscode from "vscode";
import { callAI, buildSystemPrompt, getProvider, isConfigured } from "./aiProvider";
import type { Message } from "./aiProvider";
import { getNonce, getFileContext } from "./utils";

export class ChatPanel {
  public static currentPanel: ChatPanel | undefined;
  private static readonly viewType = "aiCodingAgent.chatView";

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _history: Message[] = [];
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.ViewColumn.Beside;

    if (ChatPanel.currentPanel) {
      ChatPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ChatPanel.viewType,
      "AI Coding Agent",
      column,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, "media")],
        retainContextWhenHidden: true,
      }
    );

    ChatPanel.currentPanel = new ChatPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message: { type: string; text?: string; action?: string }) => {
        switch (message.type) {
          case "send":
            await this._handleUserMessage(message.text ?? "");
            break;
          case "clear":
            this._history = [];
            this._panel.webview.postMessage({ type: "cleared" });
            break;
          case "openSettings":
            vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "aiCodingAgent"
            );
            break;
          case "insertCode": {
            const editor = vscode.window.activeTextEditor;
            if (editor && message.text) {
              editor.edit((editBuilder) => {
                const sel = editor.selection;
                if (!sel.isEmpty) {
                  editBuilder.replace(sel, message.text!);
                } else {
                  editBuilder.insert(sel.active, message.text!);
                }
              });
            }
            break;
          }
          case "copyCode":
            if (message.text) {
              await vscode.env.clipboard.writeText(message.text);
              vscode.window.showInformationMessage("Code copied to clipboard");
            }
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public async sendWithContext(userText: string) {
    ChatPanel.createOrShow(this._extensionUri);
    await this._handleUserMessage(userText);
  }

  private async _handleUserMessage(userText: string) {
    if (!userText.trim()) return;

    const check = isConfigured();
    if (!check.ok) {
      this._panel.webview.postMessage({
        type: "error",
        text: check.message,
      });
      return;
    }

    const fileCtx = getFileContext();
    const systemPrompt = buildSystemPrompt(fileCtx);

    const messages: Message[] = [
      { role: "system", content: systemPrompt },
      ...this._history,
      { role: "user", content: userText },
    ];

    this._history.push({ role: "user", content: userText });
    this._panel.webview.postMessage({ type: "userMessage", text: userText });
    this._panel.webview.postMessage({ type: "thinking" });

    const result = await callAI(messages);

    if (result.error) {
      this._panel.webview.postMessage({ type: "error", text: result.error });
      this._history.pop();
    } else {
      this._history.push({ role: "assistant", content: result.text });
      this._panel.webview.postMessage({
        type: "assistantMessage",
        text: result.text,
        provider: getProvider(),
      });
    }
  }

  public clearHistory() {
    this._history = [];
    this._panel.webview.postMessage({ type: "cleared" });
  }

  private _update() {
    this._panel.title = "AI Coding Agent";
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const nonce = getNonce();
    const provider = getProvider();
    const { ok } = isConfigured();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Coding Agent</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);background:var(--vscode-sideBar-background);color:var(--vscode-foreground);height:100vh;display:flex;flex-direction:column;overflow:hidden}
  #header{padding:10px 12px;border-bottom:1px solid var(--vscode-panel-border);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-shrink:0}
  #header-left{display:flex;align-items:center;gap:8px}
  #header h1{font-size:13px;font-weight:600;opacity:0.9}
  .provider-badge{font-size:10px;padding:2px 8px;border-radius:99px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);font-weight:600;text-transform:uppercase;letter-spacing:0.04em}
  #header-actions{display:flex;gap:4px}
  .icon-btn{background:none;border:none;cursor:pointer;color:var(--vscode-icon-foreground);padding:4px;border-radius:4px;display:flex;align-items:center;opacity:0.7;font-size:16px}
  .icon-btn:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground)}
  #messages{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:12px}
  .msg{display:flex;flex-direction:column;gap:4px;max-width:100%;animation:fadeIn .2s ease}
  @keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
  .msg-user{align-items:flex-end}
  .msg-bubble{padding:8px 12px;border-radius:10px;font-size:12.5px;line-height:1.5;word-break:break-word;white-space:pre-wrap}
  .msg-user .msg-bubble{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-radius:10px 10px 2px 10px}
  .msg-ai .msg-bubble{background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border);border-radius:2px 10px 10px 10px}
  .msg-label{font-size:10px;opacity:0.5;padding:0 4px;font-weight:600}
  .thinking{display:flex;align-items:center;gap:6px;padding:8px 12px;background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border);border-radius:8px;font-size:12px;opacity:0.7}
  .dot{width:6px;height:6px;border-radius:50%;background:var(--vscode-button-background);animation:bounce .8s infinite}
  .dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}
  @keyframes bounce{0%,80%,100%{transform:scale(0.8);opacity:0.5}40%{transform:scale(1.2);opacity:1}}
  .msg-ai .msg-bubble pre{margin:8px 0;padding:10px;background:var(--vscode-textCodeBlock-background);border-radius:6px;overflow-x:auto;font-size:12px;font-family:var(--vscode-editor-font-family)}
  .msg-ai .msg-bubble code{font-family:var(--vscode-editor-font-family);font-size:12px;background:var(--vscode-textCodeBlock-background);padding:1px 4px;border-radius:3px}
  .code-actions{display:flex;gap:4px;margin-top:4px}
  .code-btn{font-size:10px;padding:3px 8px;border-radius:4px;border:1px solid var(--vscode-button-secondaryBorder,var(--vscode-panel-border));background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);cursor:pointer;font-family:var(--vscode-font-family)}
  .code-btn:hover{background:var(--vscode-button-secondaryHoverBackground)}
  .error-msg{background:var(--vscode-inputValidation-errorBackground);border:1px solid var(--vscode-inputValidation-errorBorder);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--vscode-errorForeground)}
  .setup-banner{margin:12px;padding:12px;border-radius:8px;background:var(--vscode-inputValidation-warningBackground);border:1px solid var(--vscode-inputValidation-warningBorder);font-size:12px;line-height:1.5}
  .setup-banner button{margin-top:8px;padding:5px 12px;border-radius:4px;border:none;background:var(--vscode-button-background);color:var(--vscode-button-foreground);cursor:pointer;font-size:12px}
  #input-area{padding:10px 12px;border-top:1px solid var(--vscode-panel-border);display:flex;gap:8px;align-items:flex-end;flex-shrink:0}
  #input{flex:1;background:var(--vscode-input-background);border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:6px;padding:8px 10px;color:var(--vscode-input-foreground);font-size:12.5px;font-family:var(--vscode-font-family);resize:none;min-height:36px;max-height:120px;outline:none;line-height:1.5}
  #input:focus{border-color:var(--vscode-focusBorder)}
  #input::placeholder{color:var(--vscode-input-placeholderForeground)}
  #send-btn{padding:7px 14px;border-radius:6px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;cursor:pointer;font-size:12px;font-weight:600;font-family:var(--vscode-font-family);flex-shrink:0;height:36px}
  #send-btn:hover{background:var(--vscode-button-hoverBackground)}
  #send-btn:disabled{opacity:0.5;cursor:not-allowed}
  .quick-actions{padding:0 12px 8px;display:flex;flex-wrap:wrap;gap:4px}
  .qa-btn{font-size:11px;padding:3px 8px;border-radius:99px;border:1px solid var(--vscode-panel-border);background:transparent;color:var(--vscode-foreground);cursor:pointer;opacity:0.75;font-family:var(--vscode-font-family)}
  .qa-btn:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground)}
  .welcome{text-align:center;padding:24px 16px;opacity:0.6;font-size:12px;line-height:1.7}
  .welcome h2{font-size:15px;margin-bottom:8px;opacity:0.9}
</style>
</head>
<body>
<div id="header">
  <div id="header-left">
    <h1>✦ AI Agent</h1>
    <span class="provider-badge">${provider}</span>
  </div>
  <div id="header-actions">
    <button class="icon-btn" id="settings-btn" title="Settings">⚙</button>
    <button class="icon-btn" id="clear-btn" title="Clear chat">✕</button>
  </div>
</div>

${!ok ? `<div class="setup-banner">
  ⚠ No API key configured. Add your key in Settings to start using the AI agent.
  <br><button id="setup-btn">Open Settings</button>
</div>` : ""}

<div id="messages">
  <div class="welcome">
    <h2>AI Coding Agent</h2>
    Ask me to write, explain, refactor, or fix any code.<br>
    I can see your current file for context.<br><br>
    <kbd>Ctrl+Shift+G</kbd> to generate from a selection
  </div>
</div>

<div class="quick-actions">
  <button class="qa-btn" data-prompt="Explain this file">📖 Explain file</button>
  <button class="qa-btn" data-prompt="What could be improved in this file?">✨ Improve</button>
  <button class="qa-btn" data-prompt="Find any bugs or issues in this code">🐛 Find bugs</button>
  <button class="qa-btn" data-prompt="Write unit tests for this code">🧪 Write tests</button>
</div>

<div id="input-area">
  <textarea id="input" placeholder="Ask the AI anything... (Enter to send, Shift+Enter for newline)" rows="1"></textarea>
  <button id="send-btn">Send</button>
</div>

<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
let isThinking = false;

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatMessage(text) {
  const parts = text.split(/(^\`\`\`[\s\S]*?\`\`\`$)/m);
  return parts.map(part => {
    const fenceMatch = part.match(/^\`\`\`(\w*)\n?([\s\S]*?)\`\`\`$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || '';
      const code = fenceMatch[2];
      const id = 'code-' + Math.random().toString(36).slice(2);
      return \`<div><pre id="\${id}"><code class="\${escapeHtml(lang)}">\${escapeHtml(code)}</code></pre>
        <div class="code-actions">
          <button class="code-btn" onclick="insertCode('\${id}')">▶ Insert into editor</button>
          <button class="code-btn" onclick="copyCode('\${id}')">⧉ Copy</button>
        </div></div>\`;
    }
    const escaped = escapeHtml(part);
    const withCode = escaped.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
    const withBold = withCode.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
    return '<span>' + withBold + '</span>';
  }).join('');
}

function getCodeText(id) {
  const el = document.getElementById(id);
  return el ? el.querySelector('code').textContent : '';
}

function insertCode(id) {
  vscode.postMessage({ type: 'insertCode', text: getCodeText(id) });
}

function copyCode(id) {
  vscode.postMessage({ type: 'copyCode', text: getCodeText(id) });
}

function appendUserMsg(text) {
  const div = document.createElement('div');
  div.className = 'msg msg-user';
  div.innerHTML = \`<span class="msg-label">You</span><div class="msg-bubble">\${escapeHtml(text)}</div>\`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendAIMsg(text, provider) {
  removeThinking();
  const div = document.createElement('div');
  div.className = 'msg msg-ai';
  div.innerHTML = \`<span class="msg-label">\${provider ?? 'AI'}</span><div class="msg-bubble">\${formatMessage(text)}</div>\`;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showThinking() {
  removeThinking();
  const div = document.createElement('div');
  div.className = 'thinking';
  div.id = 'thinking';
  div.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div><span>Thinking...</span>';
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function removeThinking() {
  const el = document.getElementById('thinking');
  if (el) el.remove();
}

function appendError(text) {
  removeThinking();
  const div = document.createElement('div');
  div.className = 'error-msg';
  div.textContent = '⚠ ' + text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  isThinking = false;
  sendBtn.disabled = false;
}

function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isThinking) return;
  inputEl.value = '';
  inputEl.style.height = '36px';
  isThinking = true;
  sendBtn.disabled = true;
  vscode.postMessage({ type: 'send', text });
}

sendBtn.addEventListener('click', sendMessage);
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
});

document.getElementById('clear-btn').addEventListener('click', () => {
  vscode.postMessage({ type: 'clear' });
});
document.getElementById('settings-btn').addEventListener('click', () => {
  vscode.postMessage({ type: 'openSettings' });
});
document.getElementById('setup-btn')?.addEventListener('click', () => {
  vscode.postMessage({ type: 'openSettings' });
});

document.querySelectorAll('.qa-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    inputEl.value = btn.dataset.prompt;
    sendMessage();
  });
});

window.addEventListener('message', e => {
  const msg = e.data;
  switch (msg.type) {
    case 'userMessage': appendUserMsg(msg.text); break;
    case 'assistantMessage': appendAIMsg(msg.text, msg.provider); isThinking = false; sendBtn.disabled = false; break;
    case 'thinking': showThinking(); break;
    case 'error': appendError(msg.text); break;
    case 'cleared':
      messagesEl.innerHTML = '<div class="welcome"><h2>AI Coding Agent</h2>Chat cleared. Ask me anything!</div>';
      isThinking = false; sendBtn.disabled = false; break;
  }
});
</script>
</body>
</html>`;
  }

  public dispose() {
    ChatPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) d.dispose();
    }
  }
}
