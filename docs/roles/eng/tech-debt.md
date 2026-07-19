# 技术债与风险

| ID | 项 | 严重度 | 计划 |
|----|-----|--------|------|
| T1 | 密码哈希 SHA-256+静态盐（MVP） | 中 | 试点前评估 bcrypt 迁移方案，不单干 |
| T2 | 大量历史测试账号污染本地库 | 低 | 已清库；保留 `db:reset` 习惯 |
| T3 | middleware → proxy 迁移（Next 16 提示） | 低 | I1+ 阅读官方 docs 再迁 |
| T4 | Server Component 里残余 client 事件 | 中 | I0 扫业务页 |
| T5 | Stripe / 真支付本地未默认闭环 | 中 | I1 试点清单 |
| T6 | staff 的 membership 查询是否误用 staff.userId 当 businessId | 中 | ✅ 已修：从 store.businessId 取企业 |
| T7 | Token 相关 UI/文案残留 | 低 | 文案审计 |
| T8 | E2E 套件与 schema 漂移（历史 tsc 噪声） | 中 | 试点前修主路径 E2E |

## 质量底线（不可为赶工打破）

1. 主路径无 500  
2. 鉴权不新引入库  
3. 金额单位分 + S$ 展示  
4. 生产用 `db push` 流程，不手改生产库结构  
