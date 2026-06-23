// 短信发送 - Vonage Messages API
// 文档: https://developer.vonage.com/en/messaging/sms/overview

import { Vonage } from "@vonage/server-sdk";
import { Channels } from "@vonage/messages";
import { shouldLogOnly } from "@/lib/messaging";

let vonageClient: Vonage | null = null;

function getClient(): Vonage | null {
  if (vonageClient) return vonageClient;
  const apiKey = process.env.VONAGE_API_KEY;
  const apiSecret = process.env.VONAGE_API_SECRET;
  if (!apiKey || !apiSecret || apiKey === "..." || apiSecret === "...") return null;
  vonageClient = new Vonage({ apiKey, apiSecret });
  return vonageClient;
}

export async function sendSMS(
  phone: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  // 闸门检查：非生产环境或测试联系人 → 只 log
  if (shouldLogOnly(phone)) {
    console.log(`[SMS GATE] Not in live mode or contact blocked. To: ${phone}, Text: ${text}`);
    return { success: true };
  }

  const client = getClient();
  if (!client) {
    console.log(`[SMS PLACEHOLDER] To: ${phone}, Text: ${text}`);
    return { success: true };
  }

  const from = process.env.VONAGE_FROM_NAME || "WeMembers";

  try {
    const { messageUUID } = await client.messages.send({
      channel: Channels.SMS,
      messageType: "text",
      text,
      to: phone,
      from,
    });
    console.log(`[Vonage] ✅ Sent to ${phone}, UUID: ${messageUUID}`);
    return { success: true };
  } catch (err: any) {
    console.error("[Vonage] Error:", err.message);
    return { success: false, error: err.message };
  }
}

export async function sendVerificationSMS(
  phone: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  return sendSMS(phone, `Your WeMembers verification code is ${code}. Valid for 5 minutes.`);
}
