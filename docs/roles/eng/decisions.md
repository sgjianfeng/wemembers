# 工程决策 log

## 2026-07-18 · I0

### D-E0-1 门店上下文

- **决定**：废弃企业端「全局当前门店 cookie」作为 UX；核销显式 `storeId`（query 或 body）。Cookie API 可残留但不再驱动主流程。  
- **原因**：多店误核销；产品已定公司/门店分层。  

### D-E0-2 失效会话

- **决定**：用户不存在时 **redirect 到** `GET /api/auth/logout?next=/auth/login`（Route Handler 清 cookie）。禁止在 RSC 里 `cookies().delete`。  
- **原因**：Next 限制 + 避免 login↔dashboard 死循环。  

### D-E0-3 SSR 交互

- **决定**：Server Component 禁止传事件处理器；排序等用 GET form 或抽 Client 小组件。  
- **触发**：`/business/members` select onChange 500。  

### D-E0-4 落地页 roleView

- **决定**：首屏固定默认 tab，localStorage 仅 `useEffect` 后恢复。  
- **原因**：hydration mismatch。  
