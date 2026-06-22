// 短信发送 - Vonage (Nexmo)
// 文档: https://developer.vonage.com/en/messaging/sms/overview

import { Vonage } from "@vonage/server-sdk";

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
  const client = getClient();
  if (!client) {
    console.log(`[SMS PLACEHOLDER] To: ${phone}, Text: ${text}`);
    return { success: true };
  }

  const from = process.env.VONAGE_FROM_NAME || "WeMembers";

  try {
    const resp = await client.sms.send({ to: phone, from, text });
    const first = resp?.messages?.[0];
    if (first?.status === "0") {
      console.log(`[Vonage] ✅ Sent to ${phone}, ID: ${first.messageId}`);
      return { success: true };
    }
    const errMsg = first?.errorText || "Unknown error";
    console.error(`[Vonage] Failed: ${first?.status} - ${errMsg}`);
    return { success: false, error: errMsg };
  } catch (err: any) {
    console.error("[Vonage] Exception:", err.message);
    return { success: false, error: err.message };
  }
}

export async function sendVerificationSMS(
  phone: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  return sendSMS(phone, `Your WeMembers verification code is ${code}. Valid for 5 minutes.`);
}
