# WeMembers 消费者首页（未登录）重设计方案

> 讨论日期：2026-06-21  
> 参与角色：产品经理（PM）· 前端架构师（Arch）· UI/UX 设计师（Design）  
> 目标：未登录消费者打开 wemembers.store 后看到什么

---

## 现状诊断

| 问题 | 严重度 |
|------|--------|
| 默认进商家视图，消费者是二等公民 | 🔴 P0 |
| 刷新就回到商家视图（纯 React state） | 🔴 P0 |
| 消费者视图是静态 mock，没有真实数据 | 🔴 P0 |
| V2 抽奖是核心变现功能，消费者首页零体现 | 🔴 P0 |
| 三根柱子展示「券·会员·抽奖」但消费者只想看「有什么优惠」 | 🟡 P1 |

---

## 三方讨论

### PM（产品经理）

**我的核心观点：首页的第一屏决定用户去留。**

一个消费者打开 wemembers.store 的第一秒，他需要立刻看到三件事：
1. 这里能省钱
2. 这里有抽奖，可能赢大奖
3. 开始使用只需要一步

V2 抽奖是我们的差异化核心。"买券即抽奖，100% 中奖"是别的平台没有的。如果首页都看不到这个，用户凭什么留下来？

**我建议的首页结构（从上到下）：**
1. Hero：大标题「买券抽大奖」+ 动态奖品轮播（iPhone / MacBook / BYD 图标闪烁）
2. 一行 CTA「免费注册，立即参与」
3. 奖池进度条（实时数据，展示三档大奖已筹金额）
4. 热门优惠券横向滑动列表
5. 商家入驻入口（小字底部）

**反对意见？不要让首页成为商家宣传页。消费者进来不是来开店的。商家入驻是二级需求，放在底部即可。**

---

### Design（设计师）

**PM 说的对，但我补充视觉层面。**

**当前问题：**
- 消费者视图是橙色主题，但和品牌蓝色不一致。建议消费者视图也保持蓝色系，用暖黄作为强调色
- 角色切换 Tab 太小，而且是按钮组的形式，用户可能忽略
- Hero 区文字太多，没有视觉焦点

**我建议的视觉方案：**

**第一屏（Hero）- 强烈视觉冲击：**
- 深蓝渐变背景 + 粒子动效（或至少静态装饰）
- 大标题：「买券赢大奖」（一个字少但冲击力强）
- 三个奖品牌匾水平排列：🎁 S$0.5~S$20 即时奖 · 📱 iPhone · 🚗 BYD
- 每个品牌匾下面一个进度条，实时显示已筹金额
- 一个大 CTA 按钮：「免费注册，立即抽奖」

**第二屏（奖池详情）：**
- 白色背景，三个卡（iPhone/MacBook/BYD）显示已筹金额和预计开奖天数
- 这个数据从 `/api/campaign/pool-status` 获取

**第三屏（热门券）：**
- 横向滑动券卡片，调用 `/api/coupons/discover` API
- 每张券显示面值、所需积分、「领取」按钮

**关于角色切换：**
- 底部放一个小的「商家入驻」入口，不影响消费主流
- 不要用等宽的 Tab 切换——这让两个角色看起来同等重要，但实际上 90% 流量是消费者

---

### Arch（架构师）

**设计很好看，但我关注可行性和数据来源。**

**技术约束：**
1. 首页是 `"use client"` 组件，目前用 `useState("business")`，刷新会重置。需要改成 localStorage 或 cookie 持久化
2. 奖池数据来自 `/api/campaign/pool-status?slug=xxx`，需要知道当前有哪些 active 的 V2 campaign。应该新增一个 API：`/api/campaign/active-draws` 返回当前进行中的抽奖活动列表
3. `/api/coupons/discover` 已存在，直接调用
4. 角色偏好应持久化。我建议：
   - 用 `localStorage` 存 `wem_role_view`（不需要 cookie，因为这不是服务端决策）
   - 默认值改为 `"consumer"`
   - 首次访问默认消费者，改过一次后记住

**实现方案：**
```
localStorage.getItem("wem_role_view") || "consumer"
```

**性能考量：**
- 奖池数据和热门券应该在客户端 fetch，用 `Promise.all` 并行请求
- 两个 API 各返回数据，加载时显示 skeleton，数据到后渲染
- 首页不需要 SEO（这是 SPA 式的 landing），所以 client component 合理

**具体修改：**
1. `src/app/page.tsx`：角色默认 `consumer`，持久化到 localStorage
2. `src/app/page.tsx`：消费者视图重做 → Hero 展示抽奖 + 奖池进度 + 热门券
3. 新增 `src/app/api/campaign/active-draws/route.ts`：返回进行中的 V2 campaign 列表

---

## 三方共识

| 决策 | PM | Design | Arch | 结论 |
|------|-----|--------|------|------|
| 默认角色 | 消费者 | 消费者 | 消费者 | ✅ 默认 consumer |
| 持久化 | 不用太复杂 | 记住用户选择 | localStorage | ✅ localStorage |
| Hero 第一屏 | 抽奖为主线 | 三奖品牌匾 + 进度条 | 需要 API | ✅ 静态展示 + 动态数据 |
| 奖池进度 | 实时展示 | 三个卡 | 用 pool-status API | ✅ 实时数据 |
| 热门券 | 横向滑动 | 固定金额+领取按钮 | discover API | ✅ API 加载 |
| 商家入口 | 底部小字 | 底部独立按钮 | 没问题 | ✅ Footer 上方 |
| 角色切换 | 不需要 Tab | 底部小入口 | URL param 也行 | ✅ 底部切换 |

---

## 实施计划

### 第一步：角色默认 consumer + 持久化
- `useState("consumer")` 
- `useEffect` 读取 localStorage，有值则覆盖
- 切换时写入 localStorage

### 第二步：重做消费者视图 Hero
- 大标题「🎰 买券抽大奖」/"Buy Vouchers & Win Big"
- 三奖品牌匾：即时奖 S$0.5~S$20 / 📱 iPhone / 🚗 BYD
- 每个带进度条（从 API 获取，未加载时用占位）
- CTA 按钮：「免费注册，立即参与」

### 第三步：奖池进度卡片区
- 调用 `/api/campaign/active-drawV2`（新建）获取当前活跃 V2 campaign
- 如果有活跃 campaign，调用 `/api/campaign/pool-status?slug=xxx` 获取进度
- 展示 iPhone / MacBook / BYD 三个进度卡

### 第四步：热门券
- 调用 `/api/coupons/discover` 获取热门券
- 横向滑动或列表展示

### 第五步：商家入口
- 底部放「🏪 商家入驻」入口
- 角色切换保持（但视觉权重降低）
