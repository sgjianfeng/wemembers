// SMS 发送 - MVP 占位，后续接入 Twilio/阿里云短信

export async function sendSMS(phone: string, message: string): Promise<boolean> {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📱 SMS (placeholder)");
  console.log(`   To: ${phone}`);
  console.log(`   Message: ${message}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  return true;
}

export async function sendVerificationSMS(phone: string, code: string): Promise<boolean> {
  return sendSMS(phone, `【WeMembers】验证码: ${code}，5分钟内有效。`);
}
