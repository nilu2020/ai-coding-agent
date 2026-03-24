# AI Coding Agent — VS Code Extension
## Complete Installation & Setup Guide

**Version:** 1.7.0  
**Publisher:** ai-coding-agent  
**File:** `ai-coding-agent-1.7.0.vsix`

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Installing the Extension](#2-installing-the-extension)
3. [Configuring AI Providers](#3-configuring-ai-providers)
4. [Configuring Social Media Publishing](#4-configuring-social-media-publishing)
5. [Using the Extension](#5-using-the-extension)
6. [Keyboard Shortcuts](#6-keyboard-shortcuts)
7. [Troubleshooting](#7-troubleshooting)
8. [Building from Source](#8-building-from-source)

---

## 1. Prerequisites

Before installing, make sure you have:

| Requirement | Version | Notes |
|---|---|---|
| **VS Code** | 1.85.0 or newer | [Download here](https://code.visualstudio.com/) |
| **Node.js** | 18.x or newer | Required only if building from source |
| **npm** | 9.x or newer | Required only if building from source |

> **No AI API key is required to install** — you can use a local Ollama model for free. API keys are optional and configured after installation.

---

## 2. Installing the Extension

### Method A — Install from VSIX File (Recommended)

This is the fastest way to get started.

**Step 1 — Download the VSIX file**

Download `ai-coding-agent-1.7.0.vsix` from the GitHub repository releases or clone the repo and find it in `artifacts/vscode-ai-agent/`.

**Step 2 — Open VS Code**

Launch VS Code on your machine.

**Step 3 — Open the Extensions panel**

Click the Extensions icon in the left sidebar, or press:
- Windows / Linux: `Ctrl+Shift+X`
- macOS: `Cmd+Shift+X`

**Step 4 — Install from VSIX**

Click the **`···`** (three dots) menu at the top-right of the Extensions panel and choose:

```
Install from VSIX...
```

![Install from VSIX menu location]

**Step 5 — Select the VSIX file**

Browse to the downloaded `ai-coding-agent-1.7.0.vsix` file and click **Install**.

**Step 6 — Reload VS Code**

A notification will appear. Click **Reload Now** (or restart VS Code manually).

**Step 7 — Verify installation**

You should see a new **AI Agent** icon in the left sidebar (activity bar). The extension is now installed.

---

### Method B — Install via Command Line

If you have the `code` CLI available:

```bash
code --install-extension ai-coding-agent-1.7.0.vsix
```

Verify it was installed:

```bash
code --list-extensions | grep ai-coding-agent
# Expected output: ai-coding-agent.ai-coding-agent
```

---

### Method C — Install via Command Palette

1. Open the Command Palette: `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (macOS)
2. Type: `Extensions: Install from VSIX`
3. Select the VSIX file
4. Reload when prompted

---

## 3. Configuring AI Providers

Open VS Code Settings and search for **`aiCodingAgent`** to see all options.

**Quick access:** `Ctrl+,` → search `aiCodingAgent`

### Option A — Ollama (Free, runs locally, no API key needed)

1. Install Ollama from [ollama.ai](https://ollama.ai)
2. Pull a model: `ollama pull llama3` (or `mistral`, `codellama`, etc.)
3. Start Ollama: `ollama serve` (runs on `http://localhost:11434` by default)
4. In VS Code Settings, set:
   - `aiCodingAgent.provider` → `ollama`
   - `aiCodingAgent.model` → `llama3` (or whichever model you pulled)
   - `aiCodingAgent.ollamaBaseUrl` → `http://localhost:11434`

### Option B — OpenAI (GPT-4o)

1. Get an API key from [platform.openai.com](https://platform.openai.com/api-keys)
2. In VS Code Settings, set:
   - `aiCodingAgent.provider` → `openai`
   - `aiCodingAgent.model` → `gpt-4o` (or `gpt-4o-mini` for faster/cheaper)
   - `aiCodingAgent.apiKey` → `sk-...your-key...`

### Option C — Anthropic (Claude)

1. Get an API key from [console.anthropic.com](https://console.anthropic.com/)
2. In VS Code Settings, set:
   - `aiCodingAgent.provider` → `anthropic`
   - `aiCodingAgent.model` → `claude-3-5-sonnet-20241022`
   - `aiCodingAgent.apiKey` → `sk-ant-...your-key...`

### Option D — Google Gemini

1. Get an API key from [aistudio.google.com](https://aistudio.google.com/)
2. In VS Code Settings, set:
   - `aiCodingAgent.provider` → `gemini`
   - `aiCodingAgent.model` → `gemini-2.0-flash`
   - `aiCodingAgent.apiKey` → `AIza...your-key...`

---

## 4. Configuring Social Media Publishing

The Content Writer panel can post directly to Twitter/X, LinkedIn, and Instagram. Configure each platform's credentials in VS Code Settings (`aiCodingAgent.social.*`).

### Twitter / X

You need a **Twitter Developer App** with Read & Write permissions.

1. Go to [developer.twitter.com](https://developer.twitter.com) and sign in
2. Create a new Project and App (or use an existing one)
3. In your App settings, go to **Keys and Tokens**
4. Generate or copy:
   - **API Key** (also called Consumer Key)
   - **API Key Secret** (also called Consumer Secret)
   - **Access Token**
   - **Access Token Secret**
5. In VS Code Settings, set:
   ```
   aiCodingAgent.social.twitter.apiKey          = [your API Key]
   aiCodingAgent.social.twitter.apiSecret       = [your API Key Secret]
   aiCodingAgent.social.twitter.accessToken     = [your Access Token]
   aiCodingAgent.social.twitter.accessTokenSecret = [your Access Token Secret]
   ```

> **Important:** Your App must have **Read and Write** permissions (not just Read). Check App Settings → User authentication settings.

---

### LinkedIn

You need a **LinkedIn App** with the `w_member_social` permission.

1. Go to [developer.linkedin.com](https://developer.linkedin.com/) and sign in
2. Create a new App (or use an existing one)
3. Under **Auth**, add `w_member_social` to the OAuth 2.0 scopes
4. Use the OAuth 2.0 flow to generate a **User Access Token** with your account:
   - Authorization URL: `https://www.linkedin.com/oauth/v2/authorization`
   - Scopes: `r_liteprofile w_member_social`
   - Exchange the authorization code for an access token at: `https://www.linkedin.com/oauth/v2/accessToken`
5. Find your **LinkedIn Person ID**:
   - Visit your LinkedIn profile
   - The URL will look like: `https://www.linkedin.com/in/your-name-aBcD1234/`
   - The alphanumeric ID at the end (`aBcD1234`) is your Person ID
   - Alternatively, call `GET https://api.linkedin.com/v2/me` with your token to get `id`
6. In VS Code Settings, set:
   ```
   aiCodingAgent.social.linkedin.accessToken = [your OAuth access token]
   aiCodingAgent.social.linkedin.personId    = [your LinkedIn person ID]
   ```

> **Note:** LinkedIn access tokens expire after 60 days. You'll need to refresh the token periodically.

---

### Instagram

Instagram posting requires a **Business or Creator Account** linked to a Facebook Page, and access through the Meta Graph API.

1. Go to [developers.facebook.com](https://developers.facebook.com/) and sign in
2. Create a new App (type: **Business**)
3. Add the **Instagram Graph API** product to your app
4. Connect your Instagram Business Account to a Facebook Page
5. Generate a **Page Access Token** with `instagram_content_publish` permission using the Graph API Explorer (`https://developers.facebook.com/tools/explorer/`)
6. Find your **Instagram User ID**:
   - In the Graph API Explorer, make a `GET` request to: `me/accounts`
   - Then call: `{page-id}?fields=instagram_business_account` to get the Instagram User ID
7. In VS Code Settings, set:
   ```
   aiCodingAgent.social.instagram.accessToken = [your Page Access Token]
   aiCodingAgent.social.instagram.userId      = [your Instagram Business User ID]
   ```

> **Important:** Instagram posting via the Graph API requires a **publicly accessible image URL**. You cannot post text-only content or upload images directly — you must host the image somewhere public (e.g. S3, Cloudinary, GitHub raw) and provide the URL in the publish panel.

---

## 5. Using the Extension

### AI Chat Panel — `Ctrl+Shift+A`

Open a full conversation with your configured AI model. The chat is context-aware — it sees your open file and selected code.

**How to use:**
1. Press `Ctrl+Shift+A` to open the chat
2. Type your question or paste code
3. Use the chat for debugging, explanations, architecture discussions, or general coding help
4. Click **Clear History** to start a fresh conversation

---

### Inline Code Generation — `Ctrl+Shift+G`

Generate code at your cursor position.

**How to use:**
1. Place your cursor where you want code inserted
2. Press `Ctrl+Shift+G`
3. Describe what to generate in the prompt box
4. The code is inserted directly at your cursor

---

### Function-Level AI Actions (CodeLens)

When CodeLens is enabled, you'll see a row of AI action buttons above every function:

```
⚡ Analyze  🔧 Refactor  🧪 Test  📝 Document  🚀 Optimize
```

Click any button to run that action on the function. You can also use keyboard shortcuts:
- `Ctrl+Shift+F` — Analyze current function
- `Ctrl+Shift+S` — Find code smells

**Toggle CodeLens** off/on via Command Palette → `AI Agent: Toggle CodeLens Buttons`

---

### Architect Intelligence Panel — `Ctrl+Shift+I`

Generate enterprise-grade multi-phase architecture documents from plain-English requirements.

**How to use:**
1. Press `Ctrl+Shift+I` to open the panel
2. Type your system requirements in the text box
3. Click a phase tab (Phase 1, 2, or 3) and click **Generate**, or click **Generate All Phases**
4. Export as Markdown, HTML, PDF, Word, Plain Text, or JSON
5. Documents are saved to `architecture-docs/` in your workspace

**Phase guide:**
- **Phase 1** — Foundation: HLD, tech stack, data model, APIs, security baseline
- **Phase 2** — Scale: LLD, event-driven patterns, CI/CD, observability
- **Phase 3** — Enterprise: platform engineering, data lake, governance, global scale

---

### AI Content Writer — `Ctrl+Shift+W`

Generate a full Content System from a single subject: blog → LinkedIn posts → tweets → video script → Instagram posts.

**How to use:**
1. Press `Ctrl+Shift+W` to open the Content Writer
2. Fill in the **Content Brief** sidebar:
   - Subject / Topic (required)
   - Target Audience
   - Industry
   - SEO Keywords
   - Tone (Professional, Conversational, Storytelling, Inspirational, Educational, Bold)
   - Brand Voice Notes
3. Click **⚡ Generate Full System** to generate all 6 content types at once, or click a tab and use **▶ Generate Current Tab**
4. Export any tab or all tabs using the format selector and export buttons
5. Click **📤 Publish** on the LinkedIn, Tweets, or Instagram tabs to post directly to social media

**Content System tabs:**
| Tab | What's generated |
|---|---|
| 📐 Strategy | Content opportunity, messaging architecture, audience psychology, distribution plan |
| 📝 Blog Post | 1,500–2,000 word SEO-optimized article |
| 💼 LinkedIn (10) | 10 distinct posts with different angles |
| 🐦 Tweets (3) | Insight tweet, thread opener, wisdom tweet |
| 🎬 Video Script | Full 5–8 min script with B-roll notes and SEO metadata |
| 📸 Instagram (3) | Carousel, single image, and Reels script with captions and hashtags |

---

### AI Autocomplete

The extension provides inline AI-powered autocomplete that appears as you type (ghost text, like GitHub Copilot).

**Settings:**
- `aiCodingAgent.autocomplete.enabled` — toggle on/off (default: true)
- `aiCodingAgent.autocomplete.delay` — milliseconds before triggering (default: 600)
- Press `Tab` to accept a suggestion

---

## 6. Keyboard Shortcuts

| Shortcut (Win/Linux) | Shortcut (macOS) | Action |
|---|---|---|
| `Ctrl+Shift+A` | `Cmd+Shift+A` | Open AI Chat Panel |
| `Ctrl+Shift+G` | `Cmd+Shift+G` | Inline Code Generation |
| `Ctrl+Shift+F` | `Cmd+Shift+F` | Analyze Current Function |
| `Ctrl+Shift+S` | `Cmd+Shift+S` | Find Code Smells |
| `Ctrl+Shift+I` | `Cmd+Shift+I` | Open Architect Intelligence |
| `Ctrl+Shift+W` | `Cmd+Shift+W` | Open AI Content Writer |

All shortcuts can be remapped in VS Code: `File → Preferences → Keyboard Shortcuts` → search `aiCodingAgent`.

---

## 7. Troubleshooting

### "No API key configured" error
Set your API key in VS Code Settings (`Ctrl+,`) → search `aiCodingAgent.apiKey`. For Ollama, no key is needed — set provider to `ollama` instead.

### AI responses are slow or timing out
- Switch to a faster model (e.g. `gpt-4o-mini` instead of `gpt-4o`, or `gemini-2.0-flash`)
- Reduce `aiCodingAgent.contextLines` to 20 and `aiCodingAgent.maxTokens` to 1024
- For Ollama: make sure `ollama serve` is running and the model is pulled

### CodeLens buttons not appearing
- Open Command Palette → `AI Agent: Toggle CodeLens Buttons`
- Or check `aiCodingAgent.codeLens.enabled` is set to `true` in settings
- CodeLens requires a recognized language — try a `.ts`, `.js`, `.py`, or `.go` file

### Architect/Content panel is blank after generating
- Check your API key is correctly configured
- Open VS Code **Output** panel (View → Output → select "AI Coding Agent" from dropdown)
- Paste any error into the AI Chat for debugging help

### Social media posting fails
- **Twitter**: Verify the app has **Read & Write** permissions at developer.twitter.com
- **LinkedIn**: Access tokens expire after 60 days — regenerate at the LinkedIn Developer Portal
- **Instagram**: The image URL must be publicly accessible (not localhost, not a local file path)
- The error message shown in the publish panel card is the exact API error — Google it for platform-specific help

### Extension not loading after install
1. Open the Extensions panel (`Ctrl+Shift+X`)
2. Search for "AI Coding Agent"
3. Click the gear icon → **Disable**, then **Enable**
4. If still broken, open the VS Code Developer Tools: `Help → Toggle Developer Tools` → check the Console for errors

---

## 8. Building from Source

If you want to modify the extension or build the VSIX yourself:

### Prerequisites

```bash
node --version   # Must be 18+
npm --version    # Must be 9+
```

### Steps

**1 — Clone the repository**

```bash
git clone https://github.com/nilu2020/ai-coding-agent.git
cd ai-coding-agent/artifacts/vscode-ai-agent
```

**2 — Install dependencies**

```bash
npm install
```

**3 — Type-check**

```bash
npm run typecheck
```

**4 — Bundle (includes pdfkit, docx, and all dependencies)**

```bash
npm run bundle
```

**5 — Package the VSIX**

```bash
npm run package
# Produces: ai-coding-agent-X.Y.Z.vsix
```

**6 — Install locally for testing**

```bash
code --install-extension ai-coding-agent-X.Y.Z.vsix
```

### Development workflow (watch mode)

```bash
npm run compile    # Full TypeScript compile (for type checking)
npm run bundle     # Re-bundle after changes
```

> **Note:** The extension uses [esbuild](https://esbuild.github.io/) to bundle all TypeScript source files and third-party dependencies (pdfkit, docx) into a single `out/extension.js`. This is why the VSIX only needs one JS file — no `node_modules` folder is included.

### Project structure

```
artifacts/vscode-ai-agent/
├── src/
│   ├── extension.ts          # Entry point, command registration
│   ├── aiProvider.ts         # OpenAI, Anthropic, Gemini, Ollama API calls
│   ├── chatPanel.ts          # AI Chat webview panel
│   ├── autocomplete.ts       # Inline autocomplete provider
│   ├── functionLens.ts       # CodeLens buttons above functions
│   ├── functionUtils.ts      # Function detection, complexity scoring
│   ├── architectPanel.ts     # Architect Intelligence webview
│   ├── architectPrompts.ts   # Phase 1/2/3 architecture prompts
│   ├── contentPanel.ts       # Content Writer webview
│   ├── contentPrompts.ts     # Blog, LinkedIn, Twitter, video, Instagram prompts
│   ├── documentConverters.ts # PDF and DOCX generation (pdfkit, docx)
│   ├── socialPublisher.ts    # Twitter, LinkedIn, Instagram API posting
│   └── utils.ts              # Shared utilities
├── images/
│   ├── icon.png              # Extension marketplace icon
│   └── sidebar-icon.svg      # Activity bar icon
├── build.mjs                 # esbuild bundle script
├── package.json              # Extension manifest + all commands/settings
├── tsconfig.json             # TypeScript configuration
└── LICENSE.txt               # MIT License
```

---

## License

MIT License — see [LICENSE.txt](LICENSE.txt) for details.

---

*Built with VS Code Extension API, esbuild, pdfkit, docx, and support for OpenAI, Anthropic, Gemini, and Ollama.*
