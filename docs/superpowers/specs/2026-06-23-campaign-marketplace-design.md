# 活动市场 — 设计文档

**日期**: 2026-06-23
**状态**: 已确认

---

## 1. 背景

抽奖活动的核心模式是「平台策划活动 → 发布到市场 → 门店加入参与」。

**第一阶段限定**：只有 `wemembers.platform` 企业账号可以创建市场活动。其他门店只参与、不创建。等活动市场模式验证后，再开放给大品牌自行创建。

现有代码已有基础字段（`joinable`, `storeIds`, `CampaignJoinRequest`），但缺少：Dashboard 入口、活动市场页、一键参与流程。

## 2. 目标

- 门店注册后能快速发现活动并参与，降低起步门槛
- 平台（`wemembers.platform`）创建活动，自动出现在市场
- 参与流程简单，免审批
- 其他门店不看到活动创建相关设置，界面干净

## 3. 用户故事

1. 作为**平台运营**，我用 `wemembers.platform` 账号创建抽奖活动，活动自动出现在市场
2. 作为**门店老板**，我在 Dashboard 就能看到市场上有多少活动，点进去浏览并一键加入
3. 作为**顾客**，无论消费在哪个参与门店，都能获得抽奖券进入同一个奖池

## 4. 平台账号约定

- 账号：`wemembers.platform` 注册为 business 角色
- 该账号创建的活动自动 `joinable: true`、`joinApproval: false`
- 后端通过 email/businessSlug 判断是否为平台账号（环境变量 `PLATFORM_ACCOUNT_EMAIL`）
- 其他门店创建活动时 `joinable` 字段不可见，后端强制 `false`

## 5. 页面设计

### 5.1 Dashboard 新增入口

在 `/business` Dashboard 快捷操作区新增一个卡片：

```
🎰  参与活动
  浏览平台活动，一键加入
```

显示徽标数字：「N 个活动可参与」

### 5.2 活动市场页 `GET /business/campaigns/market`

新页面 `/business/campaigns/market`，列出所有 `joinable: true` 且 `status: active` 且 `endDate >= now` 的活动。

每条活动卡片展示：
- 活动名称 + 标签色
- 创建方名称
- 奖池金额（instantPoolCents / 奖池总值）
- 已参与门店数
- 剩余天数
- 参与按钮

顶部搜索框，支持按名称搜索。

**参与按钮行为**：
- 还未参与 → 「参与」按钮
- 已参与 → 「已参与 ✓」
- 已过期 → 「已结束」

### 5.3 活动创建页（仅平台账号）

平台账号在 `/business/campaigns/new` 创建抽奖活动时，无需额外开关 — 创建的抽奖活动自动出现在市场。

其他门店创建活动时，表单无变化（不显示 marketplace 相关选项），后端确保 `joinable: false`。

### 5.4 平台活动管理

平台账号在活动详情页（`/business/campaigns/:id`）增加「参与门店」标签：
- 显示已参与门店列表
- 可以移除已参与门店

## 6. API 设计

### 6.1 `GET /api/business/campaigns/market`

返回可参与的活动列表。复用现有 `/api/business/campaigns/discover` 逻辑，改名为 market。

Query: `?search=xxx`

Response:
```json
{
  "data": [{
    "id": "...",
    "name": "Summer Festival",
    "color": "#FF6B35",
    "business": { "businessName": "WeMembers", "businessSlug": "wemembers" },
    "prizeCount": 5,
    "totalPoolCents": 500000,
    "participantCount": 12,
    "endDate": "2026-07-15",
    "myStatus": "joined" | null
  }]
}
```

### 6.2 `POST /api/business/campaigns/:id/join`

门店参与活动（免审批）。

逻辑：
1. 校验活动 `joinable: true` + `status: active` + 未过期
2. 校验门店未重复参与
3. 将门店 stores 追加到 `campaign.storeIds`，`joinCount += 1`
4. 返回 `{ status: "joined" }`

### 6.3 `POST /api/business/campaigns/:id/leave`

门店退出参与。

逻辑：
1. 从 `campaign.storeIds` 中移除本门店 stores，`joinCount -= 1`
2. 不影响已发放的券/抽奖记录

## 7. 数据模型变更

在现有 `Campaign` 模型新增字段：

```
joinCount     Int     @default(0)      // 已参与门店数（冗余计数器）
```

不新增 `joinApproval`（第一阶段不需要审批）。

## 8. 后端判断平台账号

新增环境变量：

```
PLATFORM_ACCOUNT_EMAIL="wemembers.platform@wemembers.store"
```

创建活动 API 中：

```typescript
function isPlatformAccount(userEmail: string): boolean {
  return userEmail === process.env.PLATFORM_ACCOUNT_EMAIL;
}

// 创建活动时
const data = {
  ...rest,
  joinable: isPlatformAccount(user.email),  // 平台账号自动 true
  joinCount: 0,
};
```

## 9. 范围

### 包含

- 环境变量 `PLATFORM_ACCOUNT_EMAIL`
- Dashboard 活动市场入口
- 活动市场页面（列表 + 搜索 + 参与）
- 创建活动 API 自动设置 `joinable`（仅平台账号）
- join/leave API（免审批）
- 平台账号活动详情页参与门店列表
- 改造现有 `/business/campaigns/discover` → `/business/campaigns/market`

### 不包含

- 其他门店创建活动时不显示 marketplace 设置（后端控制即可，前端不需要改）
- 不做审批模式（第一阶段不需要）
- 不做「按分类筛选」—— 先做搜索即可
- 不做「活动推荐算法」—— 按参与门店数排序
- 不做「活动效果统计给参与门店看」—— 后续迭代
- 门店退出参与后已发放的券/记录处理不做复杂逻辑（保留即可）

## 10. 自检

- [x] 无 TBD 占位符
- [x] API 建模完成
- [x] 数据模型变更明确（仅新增 `joinCount`）
- [x] 平台账号约定清楚（环境变量 + 后端自动判断）
- [x] 与现有代码的衔接点清楚（复用 discover → market，后端控制 joinable）
