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

- **VoucherTypeBadge / left rail:** self = slate (`#64748B` / `#F1F5F9`); distribution = amber (`#F59E0B` / `#FFF7ED`).
- Brand CTA remains `#1A6EFF`.

## Key patterns

- `VoucherTypePicker` — two large choice cards, single selection, then form.
- Redeem — one scan CTA; type from code; success card copy branches.
- Wallet — two strips never summed: distribution settle vs self-use sold/pending.

## Related docs

- `docs/roles/product/decisions.md` D-P1-4 / D-P1-5
- `docs/roles/product/ui-voucher-dual-type.md`
