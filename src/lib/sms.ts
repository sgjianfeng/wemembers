// 短信发送 - Vonage SMS API（REST）
// 文档: https://developer.vonage.com/en/messaging/sms/overview
//
// 重要：试用/Demo 账号会对未白名单号码异步 reject（error 29），
// Messages API 的 "accepted" 并不等于送达。这里用 REST 提交后轮询
// Reports，把 demo 拒发等终态暴露给调用方，避免 UI 假成功。

import { shouldLogOnly } from "@/lib/messaging";

type SmsResult = { success: boolean; error?: string; messageId?: string };

function getCredentials(): { apiKey: string; apiSecret: string } | null {
  const apiKey = process.env.VONAGE_API_KEY;
  const apiSecret = process.env.VONAGE_API_SECRET;
  if (!apiKey || !apiSecret || apiKey === "..." || apiSecret === "...") return null;
  return { apiKey, apiSecret };
}

/** 把 E.164 收件人规范成 Vonage 常用的纯数字（可带国家码） */
function toVonageMsisdn(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

function mapSubmitStatus(status: string | undefined): string {
  switch (status) {
    case "1":
      return "SMS_THROTTLED";
    case "4":
      return "SMS_BAD_CREDENTIALS";
    case "9":
      return "SMS_NO_CREDIT";
    case "15":
      return "SMS_INVALID_SENDER";
    case "29":
      return "SMS_DEMO_MODE";
    default:
      return status ? `SMS_STATUS_${status}` : "SMS_SUBMIT_FAILED";
  }
}

/**
 * 轮询 Reports，拿到终态（delivered / rejected / expired…）。
 * Demo 模式常见：submit status=0，随后 status=rejected + error_code=29。
 */
async function pollFinalStatus(
  apiKey: string,
  apiSecret: string,
  messageId: string,
  timeoutMs = 4500
): Promise<{ status: string; errorCode?: string } | null> {
  const auth =
    "Basic " + Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
  const deadline = Date.now() + timeoutMs;
  const start = new Date(Date.now() - 60_000).toISOString();
  const end = new Date(Date.now() + 60_000).toISOString();

  while (Date.now() < deadline) {
    try {
      const url = new URL("https://api.nexmo.com/v2/reports/records");
      url.searchParams.set("account_id", apiKey);
      url.searchParams.set("product", "SMS");
      url.searchParams.set("direction", "outbound");
      url.searchParams.set("date_start", start);
      url.searchParams.set("date_end", end);
      url.searchParams.set("include_message", "true");

      const res = await fetch(url.toString(), {
        headers: { Authorization: auth },
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as {
          records?: Array<{
            message_id?: string;
            status?: string;
            error_code?: string | number;
          }>;
        };
        const hit = data.records?.find((r) => r.message_id === messageId);
        if (hit?.status && hit.status !== "accepted" && hit.status !== "submitted") {
          return {
            status: hit.status,
            errorCode:
              hit.error_code != null ? String(hit.error_code) : undefined,
          };
        }
      }
    } catch (err) {
      console.warn("[Vonage] poll report failed:", (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  return null;
}

export async function sendSMS(
  phone: string,
  text: string
): Promise<SmsResult> {
  if (shouldLogOnly(phone)) {
    console.log(
      `[SMS GATE] Not in live mode or contact blocked. To: ${phone}, Text: ${text}`
    );
    return { success: true };
  }

  const creds = getCredentials();
  if (!creds) {
    console.log(`[SMS PLACEHOLDER] To: ${phone}, Text: ${text}`);
    return { success: true };
  }

  const from = process.env.VONAGE_FROM_NAME || "WeMembers";
  const to = toVonageMsisdn(phone);

  try {
    const body = new URLSearchParams({
      api_key: creds.apiKey,
      api_secret: creds.apiSecret,
      to,
      from,
      text,
      "status-report-req": "1",
    });

    const res = await fetch("https://rest.nexmo.com/sms/json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });

    const data = (await res.json()) as {
      "message-count"?: string;
      messages?: Array<{
        to?: string;
        "message-id"?: string;
        status?: string;
        "error-text"?: string;
        network?: string;
      }>;
    };

    const msg = data.messages?.[0];
    if (!msg) {
      console.error("[Vonage] Empty SMS response:", data);
      return { success: false, error: "SMS_EMPTY_RESPONSE" };
    }

    if (msg.status !== "0") {
      const code = mapSubmitStatus(msg.status);
      console.error(
        `[Vonage] Submit failed to +${to}: status=${msg.status} ${msg["error-text"] || code}`
      );
      return { success: false, error: code, messageId: msg["message-id"] };
    }

    const messageId = msg["message-id"] || "";
    console.log(
      `[Vonage] Submitted to +${to}, id=${messageId}, network=${msg.network || "?"}`
    );

    // Demo/试用：submit 成功后异步 reject，不轮询会假成功
    if (messageId) {
      const final = await pollFinalStatus(
        creds.apiKey,
        creds.apiSecret,
        messageId
      );
      if (final) {
        if (final.status === "rejected" || final.status === "failed") {
          const err =
            final.errorCode === "29"
              ? "SMS_DEMO_MODE"
              : `SMS_REJECTED_${final.errorCode || final.status}`;
          console.error(
            `[Vonage] ❌ Rejected to +${to}, id=${messageId}, status=${final.status}, code=${final.errorCode}`
          );
          return { success: false, error: err, messageId };
        }
        console.log(
          `[Vonage] ✅ Final status=${final.status} to +${to}, id=${messageId}`
        );
      } else {
        // 超时未拿到终态：多数正式账号会最终送达；仍记成功，但打日志
        console.warn(
          `[Vonage] No final DLR within poll window for ${messageId}; treating as accepted`
        );
      }
    }

    return { success: true, messageId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Vonage] Error:", message);
    return { success: false, error: message };
  }
}

export async function sendVerificationSMS(
  phone: string,
  code: string
): Promise<SmsResult> {
  return sendSMS(
    phone,
    `Your WeMembers verification code is ${code}. Valid for 5 minutes.`
  );
}

/** 用户可见错误文案（中文） */
export function smsErrorMessage(error?: string): string {
  switch (error) {
    case "SMS_DEMO_MODE":
      return "短信通道仍为试用模式，运营商拒收。请改用邮箱验证，或联系平台完成短信正式开通。";
    case "SMS_NO_CREDIT":
      return "短信余额不足，请稍后重试或改用邮箱。";
    case "SMS_INVALID_SENDER":
      return "短信发件名未授权，请改用邮箱或联系平台。";
    case "SMS_BAD_CREDENTIALS":
      return "短信服务配置异常，请联系平台。";
    case "SMS_THROTTLED":
      return "发送过于频繁，请稍后再试。";
    default:
      return "短信发送失败，请稍后重试或改用邮箱。";
  }
}
