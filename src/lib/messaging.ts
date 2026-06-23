// 消息发送闸门 —— 控制短信和邮件是否真实发送
//
// 闸门 1: MESSAGING_MODE 环境变量
//   设为 "live" → 开启真实发送
//   不设 (默认) → 只 log，不发
//
// 闸门 2: BLOCKED_CONTACTS
//   逗号分隔的联系人列表 (email / phone)
//   即使 MESSAGING_MODE=live，名单中的联系人也只 log 不发
//
// 使用: 在 sms.ts / email.ts 发送前调用 shouldLogOnly(contact)

/**
 * 检查是否应该只记录日志而不真实发送消息。
 *
 * @param contact - email 地址或电话号码
 * @returns true = 只 log，不发；false = 允许真实发送
 */
export function shouldLogOnly(contact: string): boolean {
  // 闸门 1: 生产环境开关
  const mode = process.env.MESSAGING_MODE;
  if (mode !== "live") {
    return true;
  }

  // 闸门 2: 联系人黑名单 (测试号/内部号)
  const blocked = process.env.BLOCKED_CONTACTS;
  if (blocked) {
    const blockedList = blocked
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);

    if (blockedList.includes(contact.toLowerCase())) {
      return true;
    }
  }

  return false;
}
