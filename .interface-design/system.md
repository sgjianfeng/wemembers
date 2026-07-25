# WeMembers UI — 自用券 / 分发券 切片

## Direction

- **Feel:** 冷静柜台工具 — 大数字、少字、pill 主按钮、类型色条标签为签名。
- **Not:** 报表仪表盘堆砌、多 Tab 核销分叉。

## Depth & spacing

- Depth: light border `slate-100` + one soft shadow max.
- Spacing base: 4px grid; card pad 16; section gap 16–20.
- Radius: controls/buttons `rounded-full`; cards `rounded-2xl`.

## Hierarchy

- Type ratio ~1.25 from 14px body.
- Amounts: `tabular-nums`, 28–32px semibold for heroes.
- Weight+color over size for labels.

## Signature

- **Funds type (left rail / badge):**  
  - **先收款**（自用 · 独享）= slate (`#64748B` / `#F1F5F9`)  
  - **平台托管**（分发 · 共赢）= amber (`#F59E0B` / `#FFF7ED`)  
- **Play badge:** 抽奖 = violet soft pill (`violet-50` / `violet-700`) — never replaces funds color.  
- Brand CTA remains `#1A6EFF`.

## Key patterns

- Type pickers — two large choice cards (代金：自用/分发；抽奖：独享/共赢).  
- Redeem — one scan CTA; badge from code; success copy branches by funds type.  
- Wallet — strips never summed: platform settle vs store-received / pending liability.

## Related docs

- `docs/roles/product/decisions.md` D-P1-4 … D-P1-7  
- `docs/roles/product/ui-voucher-dual-type.md`  
- `docs/roles/product/ui-draw-dual-type.md`
