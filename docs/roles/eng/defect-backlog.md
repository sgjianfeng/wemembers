# 工程缺陷 backlog（活文档）

> 产品可改优先级；工程更新状态。  
> 最近审计：2026-07-19 · prod surface + customer E2E

## 最近审计摘要

| 检查 | 结果 | 时间 |
|------|------|------|
| HTTP 表面 | OK | 07-19 |
| Playwright `customer-flow-prod` | **5/5** | 07-19 |
| Playwright `business-flow-prod` | **5/5**（Meow OTP→后台页→活动/门店） | 07-19 |
| 购券 Test 真付 | 手工清单 `acceptance-purchase-test.md` | 待大股东 |
| 客户越权 `/business/*` | 307→`/home` | 07-19 |

## P0 — 主路径阻塞

| ID | 问题 | 状态 | 备注 |
|----|------|------|------|
| D-001 | 注册页 i18n 裸 key | ✅ 已修 | LanguageProvider 同步字典 |
| D-002 | 短信 Vonage 422（无 +65） | ✅ 已修 | normalizeSingaporePhone |
| D-003 | 商家会话点用户注册跳 /business | ✅ 已修 | 入口分离 + logout next |
| D-004 | 消费者/商家入口混乱 | ✅ 已修 | `/` vs `/for-business` |
| D-005 | 越权访问返回 JSON 403 白屏 | ✅ 已修 | middleware 改 redirect |
| D-006 | 登录 UI 偶发点不中（E2E） | 🔄 | API 登录已绿；UI 待跟进 |

## P1 — 已发布能力受损

| ID | 问题 | 状态 |
|----|------|------|
| D-010 | 客户 cookie 访问 `/business` 与 `/business/stores` 行为不一致 | 🔧 本提交统一 |
| D-011 | `/balance` 未进 customerRoutes 保护列表 | 🔧 本提交补上 |
| D-012 | 登录页手机号前端未统一 +65（曾导致困惑） | ✅ 已部分修 |
| D-013 | 部署切换瞬间 Server Action / 旧 chunk | 🔄 运维：部署后硬刷新 |

## P2 — 产品未齐（勿对外宣称）

| ID | 能力 | 状态 |
|----|------|------|
| D-020 | 消费者查找门店 | ❌ 未做 |
| D-021 | 关注门店 UI | ❌ 仅 schema |
| D-022 | 最近去过门店 | ❌ 未做 |
| D-023 | 消费者首页数据驱动活动流 | 🔄 部分 active-draws |
| D-024 | 商家主路径 I0 acceptance 手工全勾 | 🔄 待产品归档 |

## 建议下一迭代顺序

1. **关 P0 残留**（D-006 UI 登录稳定性）  
2. **商家 E2E**：登录 Meow → 活动列表 → 核销台 200  
3. **购券 Test 验账** E2E 或清单手工归档  
4. 再开 D-020～022（找店/关注/最近）

## 复跑命令

```bash
npm run audit:prod
npm run test:e2e:customer-prod
npm run test:e2e:business-prod
# 三门禁一次跑：
npm run gate:prod
```
