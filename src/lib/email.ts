// 邮件发送 - MVP 占位，后续接入 Resend/SendGrid

export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📧 EMAIL (placeholder)");
  console.log(`   To: ${to}`);
  console.log(`   Subject: ${subject}`);
  console.log(`   Body: ${body}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  return true;
}

export async function sendVerificationCode(email: string, code: string): Promise<boolean> {
  return sendEmail(
    email,
    "验证码 - WeMembers",
    `您的验证码是: ${code}，5分钟内有效。`
  );
}
