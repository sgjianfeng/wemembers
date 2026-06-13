// DeepSeek AI 服务封装 — 缓存 + 重试 + 降级

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_BASE = "https://api.deepseek.com/v1";
const DEFAULT_MODEL = "deepseek-chat";

interface AiCallOptions {
  model?: string; temperature?: number; maxTokens?: number;
  timeout?: number; retries?: number; cacheTTL?: number;
}

interface AiCallResult<T> {
  success: boolean; data?: T; error?: string;
  usage: { promptTokens: number; completionTokens: number; costCents: number };
  cached: boolean;
}

const cache = new Map<string, { data: unknown; expiresAt: number }>();

function cacheKey(prompt: string): string {
  let hash = 0; for (let i = 0; i < prompt.length; i++) { hash = ((hash << 5) - hash) + prompt.charCodeAt(i); hash |= 0; }
  return hash.toString(36);
}

export async function callAi<T>(systemPrompt: string, userPrompt: string, options: AiCallOptions = {}): Promise<AiCallResult<T>> {
  const key = cacheKey(systemPrompt + userPrompt);

  // 检查缓存
  if (options.cacheTTL && options.cacheTTL > 0) {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return { success: true, data: cached.data as T, usage: { promptTokens: 0, completionTokens: 0, costCents: 0 }, cached: true };
    }
  }

  // 无 API Key 时直接返回降级
  if (!DEEPSEEK_API_KEY) {
    return { success: false, error: "No API key configured", usage: { promptTokens: 0, completionTokens: 0, costCents: 0 }, cached: false };
  }

  const maxRetries = options.retries ?? 1;
  let lastError = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeout ?? 8000);

      const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
        body: JSON.stringify({ model: options.model || DEFAULT_MODEL, temperature: options.temperature ?? 0.3, max_tokens: options.maxTokens ?? 500, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], response_format: { type: "json_object" } }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content || "";
      const usage = json.usage || {};

      // 解析 JSON
      let data: T;
      try {
        data = JSON.parse(content.replace(/^```json\s*|```$/g, "").trim());
      } catch {
        data = { raw: content } as unknown as T;
      }

      // 缓存
      if (options.cacheTTL && options.cacheTTL > 0) {
        cache.set(key, { data, expiresAt: Date.now() + options.cacheTTL * 1000 });
      }

      // 记录日志 (fire-and-forget)
      const { prisma } = await import("@/lib/db");
      prisma.aiUsageLog.create({
        data: { feature: "ai_call", promptTokens: usage.prompt_tokens || 0, completionTokens: usage.completion_tokens || 0, costCents: ((usage.prompt_tokens || 0) * 1 + (usage.completion_tokens || 0) * 2) / 1_000_000, latencyMs: 0, success: true },
      }).catch(() => {});

      return { success: true, data, usage: { promptTokens: usage.prompt_tokens || 0, completionTokens: usage.completion_tokens || 0, costCents: 0 }, cached: false };
    } catch (e: any) {
      lastError = e?.message || "AI request failed";
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 500));
    }
  }

  return { success: false, error: lastError, usage: { promptTokens: 0, completionTokens: 0, costCents: 0 }, cached: false };
}
