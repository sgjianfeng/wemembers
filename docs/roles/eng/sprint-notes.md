# I0 Sprint Notes

## 已完成（会话前已交付）

- [x] 公司 Dashboard / 门店详情 / 去全局门店切换  
- [x] 核销选店（query + picker）  
- [x] 失效 JWT → logout 清 cookie  
- [x] members 页 SSR onChange 修复  
- [x] 落地页 roleView hydration 修复  
- [x] 本地冒烟：注册企业、设置 PATCH、3 门店、关键页 200  

## 实体券（B-15）— 2026-07-19

- [x] 绑定后 = 线上 `CustomerCoupon` / `DrawTicket`（真相源）
- [x] 核销双向同步（实体台 ↔ `/api/business/redeem`）
- [x] 本店 only + 跨店拒绝
- [x] 抽奖批次须关联 campaign
- [x] Playwright：`npx playwright test tests/e2e/physical-tickets.spec.ts`（11 passed）
- [ ] 生产：`prisma db push` + `NEXT_PUBLIC_APP_URL` 印码域名
- [ ] 真 Stripe live / 线上购券同步打开（明日试点）

## I0 剩余工程

- [ ] 按 `acceptance.md` 再跑一遍手工/脚本，勾选归档  
- [ ] 扫其他业务页是否仍有 RSC 事件处理器  
- [ ] 确认 staff 进 `/business/members` 的 businessId（T6）  
- [ ] 硬刷新落地页确认无 hydration  
- [ ] （可选）把冒烟脚本收成 `npm run smoke:biz` — 仅当会复用时再做  

## 每日节奏（建议）

- 每天只推进 acceptance 里未勾项  
- 新需求一律进 `product/backlog.md`，不直接开干  

## 阻塞升级

若 Stripe/域名/生产库需要大股东资源 → 写到 `docs/company/decisions/` 等拍板。  
