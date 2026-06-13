# 商家会员系统 + 门店架构 设计

## 概述

在现有基础上做两层增强：
1. **门店体系**：公司 → 门店 → 店员，引入 staff 角色，权限按角色+数据归属控制
2. **运营型会员系统**：独立等级配置、积分流水、消费自动积分、签到联动

---

## 一、门店架构

### 角色体系

```
role: "business"  →  公司老板，全权限，看全公司数据
role: "staff"     →  店员，只有核销 + 会员（本门店），3个Tab
role: "customer"  →  客户端
role: "admin"     →  平台超管
```

权限不引入独立 RBAC 表。靠 `role` + `storeId` 过滤数据。

### 数据模型

```prisma
model Store {
  id          String   @id @default(cuid())
  businessId  String               // 所属公司
  name        String               // "星巴克·国贸店"
  slug        String   @unique     // URL 标识
  address     String?
  phone       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  business    User     @relation("BusinessStores", fields: [businessId], references: [id])
  staff       User[]   @relation("StoreStaff")
  redemptions RedemptionLog[]

  @@unique([businessId, name])
}

// User 增加字段：
// storeId  String?   // 店员归属的门店（null = 公司老板/customer/admin）

// RedemptionLog 增加字段：
// storeId  String?   // 核销门店

// PointsLog 增加字段：
// storeId  String?   // 积分操作门店
```

### 公司注册自动创建默认门店

公司注册时自动创建一个默认门店，确保 MVP 不做门店管理也能用。

### 店员界面（精简导航）

```
📷 核销   → /business/scan
👥 会员   → /business/members  （仅本店）
⚙️ 本店   → /business/store     （本店信息 + 二维码）
```

### 老板界面（完整导航）

```
📊 概览   → /business
👥 会员   → /business/members   （全公司）
🎫 券管理 → /business/coupons
📅 活动   → /business/campaigns
🏪 门店   → /business/stores     （门店管理）
```

### 门店店铺页

每家门店有独立的 `/store/{slug}` 公开页 + 二维码，和公司级别的 `/shop/{business-slug}` 是两套体系。门店页只展示公司可用的券 + 门店信息。

---

## 二、会员系统

### Membership 增加字段

```prisma
model Membership {
  // ... 已有
  tier  String @default("regular")
}
```

### 新增 MembershipTierConfig

```prisma
model MembershipTierConfig {
  id             String  @id @default(cuid())
  businessId     String
  tier           String  // regular | silver | gold | platinum
  name           String  // "金卡会员"
  pointsRequired Int     // 升级所需积分
  color          String? // 标签色
  benefits       String? // JSON数组
  @@unique([businessId, tier])
}
```

### 新增 PointsLog

```prisma
model PointsLog {
  id           String   @id @default(cuid())
  membershipId String
  storeId      String?  // 积分操作门店（可追溯）
  amount       Int      // 正=获得, 负=消耗
  type         String   // checkin | redeem_bonus | manual_grant | manual_deduct
  reason       String
  balanceAfter Int
  createdAt    DateTime @default(now())
}
```

### 功能模块

1. **会员列表增强** — 搜索、等级筛选、排序
2. **会员详情增强** — 积分流水、等级进度、手动加减积分+原因
3. **等级配置** — 商家自定义 4 级门槛和权益
4. **消费自动积分** — 核销后自动积分、自动检查升级
5. **签到联动** — 签到积分记入最近消费的商家

---

## 三、页面路由汇总

| 路由 | 说明 | 权限 |
|------|------|------|
| `/business` | 概览 | business + staff |
| `/business/members` | 会员列表 | business（全公司）/ staff（本店） |
| `/business/members/[id]` | 会员详情 | business + staff |
| `/business/members/config` | 等级配置 | business only |
| `/business/coupons` | 券管理 | business only |
| `/business/coupons/new` | 创建券 | business only |
| `/business/coupons/[id]` | 券详情 | business only |
| `/business/campaigns` | 活动管理 | business only |
| `/business/scan` | 扫码核销 | business + staff |
| `/business/stores` | 门店管理 | business only |
| `/business/store` | 本店设置+二维码 | staff only |
| `/business/settings` | 公司设置 | business only |
| `/store/{slug}` | 门店公开页 | 公开 |

## 四、API 路由汇总

| 方法 | 路径 | 说明 | 新增/修改 |
|------|------|------|------|
| GET | `/api/business/members` | 会员列表 | 修改：+搜索/筛选/排序/staff过滤 |
| GET | `/api/business/members/[id]` | 会员详情 | 修改 |
| PUT | `/api/business/members/[id]` | 编辑会员 | 不变 |
| POST | `/api/business/members/[id]` | 发放/扣减积分 | 修改：+storeId |
| GET | `/api/business/members/[id]/points-log` | 积分流水 | 新增 |
| GET | `/api/business/members/config` | 获取等级配置 | 新增 |
| PUT | `/api/business/members/config` | 更新等级配置 | 新增 |
| POST | `/api/business/redeem` | 核销 | 修改：+自动积分+storeId |
| GET/POST | `/api/business/stores` | 门店列表/创建 | 新增 |
| PUT | `/api/business/stores/[id]` | 编辑门店 | 新增 |
| POST | `/api/business/stores/[id]/staff` | 邀请店员 | 新增 |
| GET | `/api/store/qr` | 门店二维码 | 新增 |
| POST | `/api/game/checkin` | 签到 | 修改：+商家积分 |
```
