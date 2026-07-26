# WeMembers — Design System

Locked direction for the commercial-grade UI refresh (all three fronts:
customer / business / store). When a value is defined here, hold to it.

---

## Direction: "A base + B for draws" (hybrid)

Two layers on **one shared token set**:

- **A — Fintech Clean (base, ~70% of surfaces).** Cool neutral surfaces, blue
  primary, restrained whitespace, calm. Business dashboard, members, settlements,
  settings, wallet/balance, store back-office, profile, auth, all tools & tables.
  Trust/payment mindset. (This absorbs the earlier "冷静柜台工具" feel below.)
- **B — Huat Festive (accent, draw/prize/reward moments only).** Warm gold +
  orange→vermilion, energetic, the prize pool is the hero. Home draw hero, draw
  detail, campaign marketplace, "claim reward" moments. **Never** on admin/tool
  surfaces — a festive business panel reads unprofessional.

B is a *skin on top of A*, not a separate design. Both share type, spacing,
radius, depth, and the neutral ground.

## Tokens (src/app/globals.css)

- Base A tokens kept: `--primary` blue oklch(0.55 0.22 260), cool neutrals,
  `--radius: 0.75rem` with radius-sm…4xl ladder.
- Festive B layer (added): `--gold`, `--gold-strong`, `--gold-foreground`,
  `--prize` (vermilion), `--festive-from/via/to` (hero gradient). Registered in
  `@theme inline` (`--color-gold` …) so Tailwind utilities work. Dark variants set.
- Utilities: `.bg-festive` (hero gradient), `.bg-gold` (prize chip/tier fill),
  `.nums` (tabular-nums).
- **Bind to semantic tokens, not raw literals** (`bg-card border-border
  text-muted-foreground`). Legacy mixes raw `slate-*`/`white`; migrate as touched
  (required for dark mode).

## Iconography — THE #1 fix

- **No emoji as UI icons.** Use `lucide-react` (1.18.0 — lucide 1.x renamed some:
  `Home` → `House`).
- Central registry `src/components/ui/icons.tsx` → `iconRegistry`, `IconName`,
  `resolveIcon()`. Add semantic keys here; don't scatter raw lucide imports for
  shared concepts.
- **RSC boundary:** a Server Component can't pass a component/function prop to a
  Client Component. Pass a string `IconName`; resolve inside the client component.
  (Why `BottomNav.icon` is `IconName`.)
- Emoji allowed ONLY as genuine content (a prize/product an operator typed, an
  avatar), never as navigation/section iconography.

## Never ship to the user

- Untranslated i18n keys (`store.public.noCoupons` …) — every string via `t()`
  with a real dictionary entry.
- Raw internal identifiers: `localhost` URLs, `seller=cmr...` token IDs, cuids.
  Show a friendly label + copy button.

## Hierarchy & polish

- **One focal point per view.** Draw detail's focal = *buy-voucher* action; long
  copy folds into a "rules" drawer.
- **Type hierarchy via 3 levers** (size + weight + color/opacity), not size alone.
  Money: large, weight 800, `.nums`. Type ratio ~1.25 from 14px body; heroes 28–32.
- **Depth: subtle shadows** — commit, don't mix. Cards `border border-border` +
  soft shadow; festive heroes carry gradient + soft colored shadow.
- **Radius:** controls/buttons small (`rounded-full` for pills), cards
  `rounded-2xl`, sheets/modals `rounded-3xl`. Concentric: child = parent − padding.
- **Spacing:** 4px grid; card pad 16; section gap 16–20.
- **Designed empty states**, not `S$0.00 / 0%` walls. Use
  `src/components/ui/EmptyState.tsx` (tone="festive" on draw surfaces); copy names
  the next action.
- **Motion:** 150–250ms, ease-out `cubic-bezier(0.23,1,0.32,1)`; press
  `active:scale-[0.97]`; animate only transform/opacity; respect reduced-motion.

## Signature — funds-type semantics (PRESERVED, orthogonal to A/B skin)

The funds-custody color code is a **separate axis** from the festive draw skin —
keep both. A draw surface can be festive AND still carry its funds-type badge.

- **先收款**（自用 · 独享）= slate (`#64748B` / `#F1F5F9`)
- **平台托管**（分发 · 共赢）= amber (`#F59E0B` / `#FFF7ED`)
- **Play badge:** 抽奖 previously = violet soft pill. **Reconciliation:** on full
  draw *surfaces* the festive (B) treatment now leads; keep a small violet/festive
  badge only where a draw item sits inside a neutral list. Never let the play
  badge replace the funds-type color.
- Brand CTA remains `#1A6EFF` (= `--primary`).

## Key patterns

- `BottomNav` — h-16, lucide size 22, active = primary + `bg-primary/10` pill +
  strokeWidth 2.4; "more" sheet uses `LayoutGrid`, tokenized, slide-in 200ms.
- `EmptyState` — icon in 56px rounded-2xl tile, title 15/600 balance, desc
  13/muted pretty, optional action; calm vs festive tone.
- Type pickers — two large choice cards (代金：自用/分发；抽奖：独享/共赢).
- Redeem — one scan CTA; badge from code; success copy branches by funds type.
- Wallet — strips never summed: platform settle vs store-received / pending.

## Model split (implementation)

- **Opus (lead):** this system, signature pages (home draw hero, draw detail).
- **Haiku:** mechanical sweeps — emoji→registry, i18n key fixes, raw-id hiding,
  `.nums` on money.
- **Sonnet:** apply the system to remaining pages (business, store, seller, members).

## Related docs

- `docs/roles/product/decisions.md` D-P1-4 … D-P1-7
- `docs/roles/product/ui-voucher-dual-type.md`, `ui-draw-dual-type.md`
