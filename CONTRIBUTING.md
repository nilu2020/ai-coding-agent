# Contributing to AI Coding Agent

  ## Quick Start

  ```bash
  git clone https://github.com/nilu2020/ai-coding-agent.git
  npm install
  npm run typecheck   # verify types
  npm run bundle      # build single-file bundle
  npm run package     # create .vsix
  ```

  ## Development Workflow

  1. Edit files in `src/`
  2. Run `npm run typecheck` to catch type errors
  3. Run `npm run bundle` to rebuild the bundle
  4. Press `F5` in VS Code to launch the Extension Development Host

  ## Architecture

  - **No webpack config needed** — esbuild handles bundling in `build.mjs`
  - All deps (pdfkit, docx) are bundled into `out/extension.js`
  - The VSIX only contains one JS file — no `node_modules` folder

  ## Adding a New AI Provider

  Edit `src/aiProvider.ts` — add a new branch in the `callAI()` function and register the provider name in `package.json` under `aiCodingAgent.provider` enum.

  ## Submitting Changes

  1. Fork the repo
  2. Create a feature branch: `git checkout -b feat/my-feature`
  3. Commit with conventional commits: `feat:`, `fix:`, `chore:`
  4. Open a Pull Request
  