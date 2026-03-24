# AI Coding Agent — VS Code Extension

> An AI-powered VS Code extension with chat, inline code generation, function-level AI actions, Architect Intelligence, a Content Writer with a full Content Systems Builder, and direct social media publishing.

[![Version](https://img.shields.io/badge/version-1.7.0-7c3aed)](https://github.com/nilu2020/ai-coding-agent)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-2563eb)](https://code.visualstudio.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE.txt)

---

## Features

### 🤖 AI Chat Panel — `Ctrl+Shift+A`
Full-context conversation with your AI model. Sees your open file and selected code. Supports multi-turn conversation with history.

### ⚡ Inline Code Generation — `Ctrl+Shift+G`
Describe what to build and the code is inserted directly at your cursor. Works in any language.

### 🔍 Function-Level AI (CodeLens)
AI action buttons appear above every function automatically:

```
⚡ Analyze  🔧 Refactor  🧪 Test  📝 Document  🚀 Optimize
```

Shortcuts: `Ctrl+Shift+F` (analyze), `Ctrl+Shift+S` (code smells)

### 🏗️ Architect Intelligence — `Ctrl+Shift+I`
Generate enterprise-grade multi-phase architecture documents from plain-English requirements. Export to **PDF, Word (.docx), HTML, Markdown, JSON, or Plain Text**.

| Phase | Coverage |
|---|---|
| Phase 1 | HLD, tech stack, data model, API design, security baseline |
| Phase 2 | LLD, event-driven patterns, CI/CD, observability, scaling |
| Phase 3 | Platform engineering, data lake, governance, global scale |

### ✍️ AI Content Writer — `Ctrl+Shift+W`
A 20-year expert-level content strategist that generates a full **Content System** from one subject:

```
1 Blog Post  →  10 LinkedIn Posts  →  3 Tweets
           →  1 Video Script     →  3 Instagram Posts
           →  1 Strategy Overview
```

### 📤 Social Media Publishing
Post directly from VS Code to **Twitter/X**, **LinkedIn**, and **Instagram** using the publish panel. Individual post cards, editable before posting, with success/error status per post.

### 🔮 AI Autocomplete
Ghost-text inline suggestions as you type (like GitHub Copilot), with configurable trigger delay.

---

## Supported AI Providers

| Provider | Models | Requires Key |
|---|---|---|
| **OpenAI** | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo` | Yes — [platform.openai.com](https://platform.openai.com) |
| **Anthropic** | `claude-3-5-sonnet-20241022`, `claude-3-haiku` | Yes — [console.anthropic.com](https://console.anthropic.com) |
| **Google Gemini** | `gemini-2.0-flash`, `gemini-1.5-pro` | Yes — [aistudio.google.com](https://aistudio.google.com) |
| **Ollama** (local) | `llama3`, `mistral`, `codellama`, any | **No key needed** — [ollama.ai](https://ollama.ai) |

---

## Installation

### Quick Install (VSIX)

1. Download the latest `ai-coding-agent-X.Y.Z.vsix` from [Releases](https://github.com/nilu2020/ai-coding-agent/releases)
2. In VS Code: Extensions panel (`Ctrl+Shift+X`) → `···` menu → **Install from VSIX…**
3. Select the downloaded file and reload VS Code

Or via terminal:
```bash
code --install-extension ai-coding-agent-1.7.0.vsix
```

### Configuration

Open VS Code Settings (`Ctrl+,`) and search for `aiCodingAgent`:

```json
{
  "aiCodingAgent.provider": "openai",
  "aiCodingAgent.model": "gpt-4o",
  "aiCodingAgent.apiKey": "sk-..."
}
```

For **local Ollama** (free, no API key):
```json
{
  "aiCodingAgent.provider": "ollama",
  "aiCodingAgent.model": "llama3",
  "aiCodingAgent.ollamaBaseUrl": "http://localhost:11434"
}
```

**See [INSTALL.md](INSTALL.md) for the complete setup guide**, including social media API key configuration for all three platforms.

---

## Keyboard Shortcuts

| Shortcut (Win/Linux) | macOS | Action |
|---|---|---|
| `Ctrl+Shift+A` | `Cmd+Shift+A` | AI Chat Panel |
| `Ctrl+Shift+G` | `Cmd+Shift+G` | Inline Code Generation |
| `Ctrl+Shift+F` | `Cmd+Shift+F` | Analyze Current Function |
| `Ctrl+Shift+S` | `Cmd+Shift+S` | Find Code Smells |
| `Ctrl+Shift+I` | `Cmd+Shift+I` | Architect Intelligence |
| `Ctrl+Shift+W` | `Cmd+Shift+W` | Content Writer |

---

## Building from Source

```bash
git clone https://github.com/nilu2020/ai-coding-agent.git
cd ai-coding-agent

npm install
npm run typecheck   # TypeScript validation
npm run bundle      # esbuild bundle (includes pdfkit, docx)
npm run package     # produces ai-coding-agent-X.Y.Z.vsix
```

### Project Structure

```
src/
├── extension.ts          # Entry point, command registration
├── aiProvider.ts         # OpenAI / Anthropic / Gemini / Ollama calls
├── chatPanel.ts          # AI Chat webview
├── autocomplete.ts       # Inline ghost-text completions
├── functionLens.ts       # CodeLens buttons above functions
├── functionUtils.ts      # Function detection & complexity scoring
├── architectPanel.ts     # Architect Intelligence webview
├── architectPrompts.ts   # Phase 1/2/3 architecture system prompts
├── contentPanel.ts       # Content Writer webview + publishing
├── contentPrompts.ts     # Blog / LinkedIn / Twitter / video / Instagram prompts
├── documentConverters.ts # PDF (pdfkit) + DOCX (docx) generation
├── socialPublisher.ts    # Twitter OAuth 1.0a / LinkedIn / Instagram APIs
└── utils.ts              # Shared utilities
```

---

## Version History

| Version | Highlights |
|---|---|
| **1.7.0** | Social media publishing (Twitter/X, LinkedIn, Instagram) |
| **1.6.0** | AI Content Writer with full Content Systems Builder |
| **1.5.0** | PDF and Word (.docx) export via esbuild bundling |
| **1.4.0** | Multi-format export (MD, HTML, TXT, JSON) |
| **1.3.0** | Architect Intelligence panel with 3-phase architecture |
| **1.2.0** | Function-level AI (CodeLens, vFunction-style operations) |
| **1.1.0** | Ollama local model support |
| **1.0.0** | Initial release: chat, autocomplete, inline generation |

---

## License

MIT — see [LICENSE.txt](LICENSE.txt)
