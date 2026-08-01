# 国庆满赠（商业上线版）

状态：**今日可开张**  
入口：企业 `/business/ndp-issue` → **一键开启国庆活动**

## 主场景动线

```
桌码/前台码 → /ndp/{slug}?from=table|counter
  → 注册/登录
  → 路径 A 购券冲大奖 → 前台核销 ≥120 → 自动发 S$61
  → 路径 B 前台付账 → 店员 ndp-issue 绑手机确认小票 → 发 S$61 + 赠送弱抽奖
```

| 路径 | 抽奖 | S$61 |
|------|------|------|
| A 购券 | 购券成功自动（付费高权重） | **核销金额 ≥120 自动** |
| B 凭票 | 店员确认后赠送弱权重 0.2 | 确认后发 |

## 实现索引

| 能力 | 路径 |
|------|------|
| 规则/发放 | `src/lib/ndp-promo.ts` |
| 凭票发双权益 | `POST /api/business/promo/ndp/issue` |
| 一键配置 | `POST /api/business/promo/ndp/setup` |
| 顾客落地页 | `/ndp/[slug]` |
| 核销自动 61 | `POST /api/voucher/redeem` → `maybeIssueNdpOnVoucherRedeem` |
| 店员台 | `/business/ndp-issue` |
| 钱包分组 | `/wallet` |
| 桌/前台 QR | `/api/campaign/qr?slug=...&ndp=1&from=table\|counter` |

## 开张清单（老板 5 分钟）

1. 登录企业号 → **国庆满赠** → **一键开启国庆活动**  
2. 长按保存「桌码」「前台码」打印/贴桌  
3. 确认购券关联（若已有抽奖活动会自动挂 `buyVoucherSlug`）  
4. 店员：核销台扫顾客预付券；现金客走「凭单满赠」  
5. 顾客钱包应看到活动下 S$61（+ 抽奖资格）

## 规则默认

- 门槛 S$120 · 赠券 S$61 · 有效 30 天 · 赠送权重 = 100 购券 × 0.2 · 无小奖  

## 后续

- 短信到期提醒 · 实体印刷 · 更严 OTP 流程  

