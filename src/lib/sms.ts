// 短信发送 - 阿里云短信服务
// 文档: https://help.aliyun.com/zh/sms/developer-reference/nodejs-sdk

import Dysmsapi20170525, * as $Dysmsapi20170525 from "@alicloud/dysmsapi20170525";
import * as $OpenApi from "@alicloud/openapi-client";
import * as $Util from "@alicloud/tea-util";

function getClient(): Dysmsapi20170525 | null {
  const accessKeyId = process.env.ALIBABA_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALIBABA_ACCESS_KEY_SECRET;
  if (!accessKeyId || !accessKeySecret || accessKeyId === "LTAI..." || accessKeySecret === "...") return null;
  const endpoint = process.env.ALIBABA_SMS_ENDPOINT || "dysmsapi.ap-southeast-1.aliyuncs.com";
  const config = new $OpenApi.Config({ accessKeyId, accessKeySecret, endpoint });
  return new Dysmsapi20170525(config);
}

export async function sendSMS(
  phone: string,
  templateParam: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  const client = getClient();
  if (!client) {
    console.log(`[SMS PLACEHOLDER] To: ${phone}, Params: ${JSON.stringify(templateParam)}`);
    return { success: true };
  }

  const signName = process.env.ALIBABA_SMS_SIGN_NAME || "WeMembers";
  const templateCode = process.env.ALIBABA_SMS_TEMPLATE_CODE || "SMS_...";

  try {
    const req = new $Dysmsapi20170525.SendSmsRequest({
      phoneNumbers: phone,
      signName,
      templateCode,
      templateParam: JSON.stringify(templateParam),
    });
    const runtime = new $Util.RuntimeOptions({});
    const resp = await client.sendSmsWithOptions(req, runtime);

    if (resp.body?.code === "OK") {
      console.log(`[SMS] ✅ Sent to ${phone}, BizId: ${resp.body?.bizId}`);
      return { success: true };
    }
    const msg = resp.body?.message || resp.body?.code || "Unknown error";
    console.error(`[SMS] Failed: ${resp.body?.code} - ${msg}`);
    return { success: false, error: msg };
  } catch (err: any) {
    if (err.data?.Message?.includes("Signature")) {
      return { success: false, error: "短信签名未就绪" };
    }
    if (err.data?.Message?.includes("Template")) {
      return { success: false, error: "短信模板未就绪" };
    }
    console.error("[SMS] Exception:", err.message);
    return { success: false, error: err.message };
  }
}

export async function sendVerificationSMS(
  phone: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  return sendSMS(phone, { code });
}
