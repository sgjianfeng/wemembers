// 邮件发送 - Resend
// 文档: https://resend.com/docs/send-with-nextjs

import { Resend } from "resend";
import { shouldLogOnly } from "@/lib/messaging";

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "re_...") return null;
  return new Resend(apiKey);
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  // 闸门检查：非生产环境或测试联系人 → 只 log
  if (shouldLogOnly(to)) {
    console.log(`[EMAIL GATE] Not in live mode or contact blocked. To: ${to}, Subject: ${subject}`);
    return { success: true };
  }

  const resend = getResend();
  if (!resend) {
    console.log(`[EMAIL PLACEHOLDER] To: ${to}, Subject: ${subject}`);
    return { success: true };
  }

  const from = process.env.RESEND_FROM_EMAIL || "noreply@wemembers.store";

  try {
    const { error } = await resend.emails.send({ from, to, subject, html });
    if (error) {
      console.error("[Resend] Send failed:", error);
      return { success: false, error: error.message };
    }
    console.log(`[Resend] ✅ Sent to ${to}`);
    return { success: true };
  } catch (err: any) {
    console.error("[Resend] Exception:", err.message);
    return { success: false, error: err.message };
  }
}

export async function sendVerificationCode(
  email: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  // 开发闸门：未 live 时邮件不真发，把验证码打到终端方便本地联调
  if (shouldLogOnly(email)) {
    console.log(`[EMAIL GATE] verification code for ${email}: ${code}`);
  }
  const html = `<div style="max-width:480px;margin:0 auto;padding:32px;font-family:-apple-system,BlinkMacSystemFont,sans-serif"><div style="text-align:center;margin-bottom:24px"><h1 style="color:#FF6B35;margin:0">WeMembers</h1></div><p style="color:#333;font-size:16px">您的验证码是：</p><div style="background:#FFF5F0;border-radius:12px;padding:20px;text-align:center;margin:16px 0"><span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#FF6B35">${code}</span></div><p style="color:#999;font-size:13px">验证码 5 分钟内有效，请勿转发他人。</p><hr style="border:none;border-top:1px solid #f0f0f0;margin:24px 0"/><p style="color:#bbb;font-size:11px;text-align:center">Powered by WeMembers</p></div>`;
  return sendEmail(email, "验证码 - WeMembers", html);
}
