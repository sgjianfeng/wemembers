# 活动市场 — 设计文档

**日期**: 2026-06-23
**状态**: 已确认

---

## 1. 背景

抽奖活动的核心模式是「大品牌设计活动 → 发布到市场 → 小店加入参与」。平台注册企业账号（如 `wemembers.platform`），创建活动后开放给所有门店参与。

现有代码已有基础字段（`joinable`, `storeIds`, `CampaignJoinRequest`），但缺少：Dashboard 入口、活动市场页、一键参与流程。

## 2. 目标

- 门店注册后能快速发现活动并参与，降低起步门槛
- 大品牌（包括平台）能创建活动并开放到市场
- 参与流程简单，默认免审批

## 3. 用户故事

1. 作为**平台运营**，我可以用企业账号创建活动，勾选「开放参与」，其他门店就能看到
2. 作为**门店老板**，我在 Dashboard 就能看到市场上有多少活动，点进去浏览并一键加入
3. 作为**顾客**，无论消费在哪个参与门店，都能获得抽奖券进入同一个奖池

## 4. 页面设计

### 4.1 Dashboard 新增入口

在 `/business` Dashboard 快捷操作区新增一个卡片：

```
🎰  参与活动
  浏览平台活动，一键加入
```

显示徽标数字：「N 个活动可参与」

### 4.2 活动市场页 `GET /business/campaigns/market`

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
- 已申请（审批模式）→ 「等待审批」
- 已参与 → 「已参与 ✓」
- 已过期 → 「已结束」

### 4.3 活动创建页扩展

在 `/business/campaigns/new` 现有表单底部增加：

```
□ 开放给其他门店参与（出现在活动市场）
□ 需要审批（不勾选则自动通过）
```

创建时写入 `joinable` 和 `joinApproval` 字段。

### 4.4 参与详情 / 审批管理

在创建方视角的活动详情页（`/business/campaigns/:id`）增加「参与门店」标签：
- 显示已参与门店列表
- 如果开启了审批模式，显示待审批申请
- 可以移除已参与门店

## 5. API 设计

### 5.1 `GET /api/business/campaigns/market`

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
    "myStatus": "joined" | "pending" | null
  }]
}
```

### 5.2 `POST /api/business/campaigns/:id/join`

门店参与活动。

Request: `{ message?: string }`（审批模式时可附言）

逻辑：
1. 校验活动 `joinable: true` + `status: active` + 未过期
2. 校验门店未重复参与
3. 如果活动 `joinApproval !== true` → 直接将门店 stores 追加到 `campaign.storeIds`，返回 `{ status: "joined" }`
4. 如果活动需要审批 → 创建 `CampaignJoinRequest`，返回 `{ status: "pending" }`

### 5.3 `POST /api/business/campaigns/:id/leave`

门店退出参与。

逻辑：
1. 从 `campaign.storeIds` 中移除本门店 stores
2. 清理相关 join requests
3. 不影响已发放的券/抽奖记录

## 6. 数据模型变更

在现有 `Campaign` 模型新增字段：

```
joinApproval  Boolean @default(false)  // 参与是否需要审批
joinCount     Int     @default(0)      // 已参与门店数（冗余计数器）
```

## 7. 免审批 vs 审批

| | 免审批 | 需审批 |
|---|---|---|
| 活动创建时 | `joinApproval: false` | `joinApproval: true` |
| 门店点击参与 | 直接生效 | 创建 JoinRequest |
| storeIds 更新 | 即时追加 | 审批通过后追加 |
| 适用场景 | 平台促销活动 | 品牌跨界合作 |

默认 `joinApproval: false`。

## 8. 范围

### 包含

- Dashboard 活动入口
- 活动市场页面（列表 + 搜索 + 参与）
- 创建活动时增加 joinable/joinApproval 开关
- join/leave API
- 活动详情页参与门店列表
- 改造现有 `/business/campaigns/discover` → `/business/campaigns/market`

### 不包含

- 活动市场不做「按分类筛选」—— 先做搜索即可
- 不做「活动推荐算法」—— 按参与门店数排序
- 不做「活动效果统计给参与门店看」—— 后续迭代
- 门店退出参与后已发放的券/记录处理不做复杂逻辑（保留即可）

## 9. 自检

- [x] 无 TBD 占位符
- [x] API 建模完成
- [x] 数据模型变更明确
- [x] 与现有代码的衔接点清楚（复用 discover → market，扩展创建表单）
