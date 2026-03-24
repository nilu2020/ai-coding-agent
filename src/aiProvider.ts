import * as vscode from "vscode";

export type AIProvider = "openai" | "anthropic" | "gemini" | "ollama";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIResponse {
  text: string;
  error?: string;
}

function getConfig() {
  return vscode.workspace.getConfiguration("aiCodingAgent");
}

export function getProvider(): AIProvider {
  return getConfig().get<AIProvider>("provider", "openai");
}

export function getApiKey(provider?: AIProvider): string {
  const p = provider ?? getProvider();
  const cfg = getConfig();
  if (p === "openai") return cfg.get<string>("openaiApiKey", "");
  if (p === "anthropic") return cfg.get<string>("anthropicApiKey", "");
  if (p === "gemini") return cfg.get<string>("geminiApiKey", "");
  if (p === "ollama") return "ollama";
  return "";
}

export function isConfigured(): { ok: boolean; message: string } {
  const provider = getProvider();
  if (provider === "ollama") {
    return { ok: true, message: "" };
  }
  const key = getApiKey(provider);
  if (!key.trim()) {
    return {
      ok: false,
      message: `No API key set for ${provider}. Go to Settings → Extensions → AI Coding Agent to add your key.`,
    };
  }
  return { ok: true, message: "" };
}

async function callOpenAI(messages: Message[]): Promise<AIResponse> {
  const cfg = getConfig();
  const apiKey = cfg.get<string>("openaiApiKey", "");
  const model = cfg.get<string>("openaiModel", "gpt-4o");
  const maxTokens = cfg.get<number>("maxTokens", 2048);

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { text: "", error: `OpenAI error ${res.status}: ${err.slice(0, 200)}` };
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return { text: data.choices[0]?.message?.content ?? "" };
}

async function callAnthropic(messages: Message[]): Promise<AIResponse> {
  const cfg = getConfig();
  const apiKey = cfg.get<string>("anthropicApiKey", "");
  const model = cfg.get<string>("anthropicModel", "claude-3-5-sonnet-20241022");
  const maxTokens = cfg.get<number>("maxTokens", 2048);

  const systemMsg = messages.find((m) => m.role === "system");
  const chatMsgs = messages.filter((m) => m.role !== "system");

  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: chatMsgs.map((m) => ({ role: m.role, content: m.content })),
  };
  if (systemMsg) body.system = systemMsg.content;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    return { text: "", error: `Anthropic error ${res.status}: ${err.slice(0, 200)}` };
  }

  const data = (await res.json()) as {
    content: { type: string; text: string }[];
  };
  const text = data.content.filter((c) => c.type === "text").map((c) => c.text).join("");
  return { text };
}

async function callGemini(messages: Message[]): Promise<AIResponse> {
  const cfg = getConfig();
  const apiKey = cfg.get<string>("geminiApiKey", "");
  const model = cfg.get<string>("geminiModel", "gemini-2.0-flash");
  const maxTokens = cfg.get<number>("maxTokens", 2048);

  const systemMsg = messages.find((m) => m.role === "system");
  const chatMsgs = messages.filter((m) => m.role !== "system");

  const contents = chatMsgs.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  };

  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    return { text: "", error: `Gemini error ${res.status}: ${err.slice(0, 200)}` };
  }

  const data = (await res.json()) as {
    candidates: { content: { parts: { text: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
  return { text };
}

async function callOllama(messages: Message[]): Promise<AIResponse> {
  const cfg = getConfig();
  const baseUrl = cfg.get<string>("ollamaBaseUrl", "http://localhost:11434");
  const model = cfg.get<string>("ollamaModel", "llama3");
  const maxTokens = cfg.get<number>("maxTokens", 2048);

  const url = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: maxTokens,
        stream: false,
      }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      text: "",
      error: `Cannot reach Ollama at ${baseUrl}. Make sure Ollama is running locally (ollama serve). Error: ${msg}`,
    };
  }

  if (!res.ok) {
    const errText = await res.text();
    return { text: "", error: `Ollama error ${res.status}: ${errText.slice(0, 200)}` };
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return { text: data.choices[0]?.message?.content ?? "" };
}

export async function callAI(messages: Message[]): Promise<AIResponse> {
  const check = isConfigured();
  if (!check.ok) return { text: "", error: check.message };

  const provider = getProvider();
  try {
    if (provider === "openai") return await callOpenAI(messages);
    if (provider === "anthropic") return await callAnthropic(messages);
    if (provider === "gemini") return await callGemini(messages);
    if (provider === "ollama") return await callOllama(messages);
    return { text: "", error: `Unknown provider: ${provider}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { text: "", error: `Network error: ${msg}` };
  }
}

export function buildSystemPrompt(context?: string): string {
  let prompt = `You are an expert AI coding assistant integrated into VS Code. You help developers write, understand, fix, and improve code.

When writing code:
- Always provide complete, working code
- Use appropriate language features and best practices
- Include helpful inline comments for complex logic
- Keep responses concise but thorough

When explaining code:
- Be clear and precise
- Explain the "why" not just the "what"
- Point out any potential issues

When asked to refactor or fix:
- Make targeted, minimal changes unless a full rewrite is clearly better
- Explain what you changed and why`;

  if (context) {
    prompt += `\n\nCurrent file context:\n\`\`\`\n${context}\n\`\`\``;
  }

  return prompt;
}
