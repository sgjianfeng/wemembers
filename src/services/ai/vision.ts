// 票据视觉识别 — 可切换后端（Claude / OpenAI），统一「分类 + 抽字段 + 候选标签」
// 通过 OCR_PROVIDER 选择：claude(默认) | openai
// 复用 ai/client.ts 的返回结构与「无 key 降级 + aiUsageLog 记账」范式

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const OCR_PROVIDER = (process.env.OCR_PROVIDER || "claude").toLowerCase();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_VISION_MODEL || "claude-sonnet-5";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";

// 与 ai/client.ts 保持一致的返回结构
export interface AiCallResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  usage: { promptTokens: number; completionTokens: number; costCents: number };
  cached: boolean;
}

export interface ReceiptOcrItem {
  name: string;
  quantity?: number | null;
  unitPriceCents?: number | null;
  amountCents?: number | null;
}

export interface ReceiptOcr {
  category: "purchase" | "customer_sale" | "platform" | "expense" | "unknown";
  vendorName?: string | null;
  totalAmountCents?: number | null;
  taxAmountCents?: number | null;
  currency?: string | null;
  receiptDate?: string | null; // ISO yyyy-mm-dd
  items: ReceiptOcrItem[];
  candidateTags: string[];
  rawText?: string | null;
  confidence?: number | null; // 0~1
}

// 分类 + 抽字段的共享说明（provider 无关）
const CORE_PROMPT = `你是餐饮门店的票据识别助手。用户会给你一张票据图片。请完成三件事：
1. 分类 category，取值之一：
   - purchase        供应商采购单/发票（有供应商抬头、品项明细、税号）
   - customer_sale   顾客消费小票（门店自己出票、桌号/单号）
   - platform        外卖平台对账单（美团/饿了么等平台、含佣金/结算）
   - expense         费用报销（水电/房租/工资/杂费）
   - unknown         无法确定
2. 抽字段：商家名(vendorName)、总额(totalAmountCents)、税额(taxAmountCents)、币种(currency)、日期(receiptDate, yyyy-mm-dd)、逐行明细(items)。
   所有金额一律用「分」为单位的整数（例如 12.80 元 => 1280）。识别不到的字段填 null。
3. 候选标签 candidateTags：给出 3~6 个便于归档检索的中文短标签（如「冷冻食材」「含税」「蜀海」「2026-07」）。`;

const started = () => Date.now();

// 记账 (fire-and-forget)，照 ai/client.ts
function logUsage(feature: string, promptTokens: number, completionTokens: number, costCents: number, latencyMs: number) {
  import("@/lib/db")
    .then(({ prisma }) =>
      prisma.aiUsageLog
        .create({ data: { feature, promptTokens, completionTokens, costCents, latencyMs, success: true } })
        .catch(() => {})
    )
    .catch(() => {});
}

function degraded(error: string): AiCallResult<ReceiptOcr> {
  return { success: false, error, usage: { promptTokens: 0, completionTokens: 0, costCents: 0 }, cached: false };
}

/**
 * 识别一张票据图片。无对应 provider 的 key 时降级返回 success=false（路由层转人工填写）。
 */
export async function recognizeReceipt(
  imageBase64: string,
  mimeType: string,
  options: { timeout?: number } = {}
): Promise<AiCallResult<ReceiptOcr>> {
  if (OCR_PROVIDER === "openai") {
    return recognizeWithOpenAI(imageBase64, mimeType, options);
  }
  return recognizeWithClaude(imageBase64, mimeType, options);
}

// ───────────────────────── Claude (Anthropic) ─────────────────────────

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  return _anthropic;
}

const CLAUDE_TOOL = {
  name: "record_receipt",
  description: "记录从票据图片中识别出的结构化数据",
  input_schema: {
    type: "object" as const,
    properties: {
      category: { type: "string", enum: ["purchase", "customer_sale", "platform", "expense", "unknown"] },
      vendorName: { type: ["string", "null"] },
      totalAmountCents: { type: ["integer", "null"], description: "总额（分）" },
      taxAmountCents: { type: ["integer", "null"], description: "税额（分）" },
      currency: { type: ["string", "null"] },
      receiptDate: { type: ["string", "null"], description: "yyyy-mm-dd" },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            quantity: { type: ["number", "null"] },
            unitPriceCents: { type: ["integer", "null"] },
            amountCents: { type: ["integer", "null"] },
          },
          required: ["name"],
        },
      },
      candidateTags: { type: "array", items: { type: "string" } },
      rawText: { type: ["string", "null"] },
      confidence: { type: ["number", "null"], description: "0~1" },
    },
    required: ["category", "items", "candidateTags"],
  },
};

type SupportedMedia = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
function toMediaType(mimeType: string): SupportedMedia {
  if (mimeType === "image/png") return "image/png";
  if (mimeType === "image/webp") return "image/webp";
  if (mimeType === "image/gif") return "image/gif";
  return "image/jpeg";
}

async function recognizeWithClaude(
  imageBase64: string,
  mimeType: string,
  options: { timeout?: number }
): Promise<AiCallResult<ReceiptOcr>> {
  if (!ANTHROPIC_API_KEY) return degraded("No Anthropic API key configured");

  const t0 = started();
  try {
    const res = await getAnthropic().messages.create(
      {
        model: ANTHROPIC_MODEL,
        max_tokens: 1500,
        system: `${CORE_PROMPT}\n只通过给定的 record_receipt 工具返回结构化结果，不要输出多余文字。`,
        tools: [CLAUDE_TOOL],
        tool_choice: { type: "tool", name: "record_receipt" },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: toMediaType(mimeType), data: imageBase64 } },
              { type: "text", text: "请识别这张票据。" },
            ],
          },
        ],
      },
      { timeout: options.timeout ?? 30000 }
    );

    const toolUse = res.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return degraded("No structured output returned");

    const data = toolUse.input as ReceiptOcr;
    const promptTokens = res.usage?.input_tokens || 0;
    const completionTokens = res.usage?.output_tokens || 0;
    logUsage("receipt_ocr_claude", promptTokens, completionTokens, (promptTokens * 3 + completionTokens * 15) / 1_000_000, Date.now() - t0);

    return { success: true, data, usage: { promptTokens, completionTokens, costCents: 0 }, cached: false };
  } catch (e: unknown) {
    return degraded(e instanceof Error ? e.message : "Vision request failed");
  }
}

// ───────────────────────── OpenAI ─────────────────────────

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  return _openai;
}

// OpenAI structured outputs（strict）：所有字段须 required + additionalProperties:false，可空用 ["type","null"]
const OPENAI_SCHEMA = {
  name: "receipt",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      category: { type: "string", enum: ["purchase", "customer_sale", "platform", "expense", "unknown"] },
      vendorName: { type: ["string", "null"] },
      totalAmountCents: { type: ["integer", "null"] },
      taxAmountCents: { type: ["integer", "null"] },
      currency: { type: ["string", "null"] },
      receiptDate: { type: ["string", "null"] },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            quantity: { type: ["number", "null"] },
            unitPriceCents: { type: ["integer", "null"] },
            amountCents: { type: ["integer", "null"] },
          },
          required: ["name", "quantity", "unitPriceCents", "amountCents"],
        },
      },
      candidateTags: { type: "array", items: { type: "string" } },
      rawText: { type: ["string", "null"] },
      confidence: { type: ["number", "null"] },
    },
    required: [
      "category",
      "vendorName",
      "totalAmountCents",
      "taxAmountCents",
      "currency",
      "receiptDate",
      "items",
      "candidateTags",
      "rawText",
      "confidence",
    ],
  },
};

async function recognizeWithOpenAI(
  imageBase64: string,
  mimeType: string,
  options: { timeout?: number }
): Promise<AiCallResult<ReceiptOcr>> {
  if (!OPENAI_API_KEY) return degraded("No OpenAI API key configured");

  const t0 = started();
  try {
    const res = await getOpenAI().chat.completions.create(
      {
        model: OPENAI_MODEL,
        max_tokens: 1500,
        messages: [
          { role: "system", content: `${CORE_PROMPT}\n以严格 JSON 返回，字段与给定 schema 一致。` },
          {
            role: "user",
            content: [
              { type: "text", text: "请识别这张票据。" },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
        response_format: { type: "json_schema", json_schema: OPENAI_SCHEMA },
      },
      { timeout: options.timeout ?? 30000 }
    );

    const content = res.choices?.[0]?.message?.content;
    if (!content) return degraded("No content returned");

    let data: ReceiptOcr;
    try {
      data = JSON.parse(content);
    } catch {
      return degraded("Failed to parse OpenAI JSON");
    }

    const promptTokens = res.usage?.prompt_tokens || 0;
    const completionTokens = res.usage?.completion_tokens || 0;
    // gpt-4o-mini 参考价：$0.15 / $0.60 每百万
    logUsage("receipt_ocr_openai", promptTokens, completionTokens, (promptTokens * 0.15 + completionTokens * 0.6) / 1_000_000, Date.now() - t0);

    return { success: true, data, usage: { promptTokens, completionTokens, costCents: 0 }, cached: false };
  } catch (e: unknown) {
    return degraded(e instanceof Error ? e.message : "Vision request failed");
  }
}
