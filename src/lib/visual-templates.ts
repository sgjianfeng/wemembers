/**
 * 实体券 / 分享图视觉模版（系统精修 · 非设计工具）
 * 商家只选模版 + 有限主题色；版式由平台固定。
 */

export type VisualTemplateId = "store_classic" | "store_bold";

export type ThemeColorId = "blue" | "orange" | "violet" | "green" | "dark";

export interface ThemeSwatch {
  id: ThemeColorId;
  hex: string;
  labelZh: string;
  labelEn: string;
}

export const THEME_SWATCHES: ThemeSwatch[] = [
  { id: "orange", hex: "#E85D04", labelZh: "券橙（推荐）", labelEn: "Voucher orange" },
  { id: "blue", hex: "#1A6EFF", labelZh: "品牌蓝", labelEn: "Blue" },
  { id: "violet", hex: "#7C3AED", labelZh: "抽奖紫", labelEn: "Violet" },
  { id: "green", hex: "#15803D", labelZh: "深绿", labelEn: "Green" },
  { id: "dark", hex: "#1E1B2E", labelZh: "深色", labelEn: "Dark" },
];

export interface VisualTemplateMeta {
  id: VisualTemplateId;
  family: "store";
  nameZh: string;
  nameEn: string;
  taglineZh: string;
  taglineEn: string;
  /** 预览用默认主题色 */
  defaultThemeHex: string;
  /** classic = 白底；bold = 深色块 */
  surface: "light" | "dark";
}

export const VISUAL_TEMPLATES: VisualTemplateMeta[] = [
  {
    id: "store_classic",
    family: "store",
    nameZh: "宽幅浅色",
    nameEn: "Wide light",
    taglineZh: "暖底满宽 · 条款+QR · 适合代金券",
    taglineEn: "Warm full-width · terms + QR · best for vouchers",
    // 暖橙金更像消费券（蓝太偏平台感）
    defaultThemeHex: "#E85D04",
    surface: "light",
  },
  {
    id: "store_bold",
    family: "store",
    nameZh: "醒目色块",
    nameEn: "Bold block",
    taglineZh: "深色满宽 · 主题色可选 · 代金/抽奖通用",
    taglineEn: "Dark full-width · pick theme · voucher & draw",
    defaultThemeHex: "#1E1B2E",
    surface: "dark",
  },
];

export function getVisualTemplate(
  id: string | null | undefined
): VisualTemplateMeta {
  return (
    VISUAL_TEMPLATES.find((t) => t.id === id) || VISUAL_TEMPLATES[0]
  );
}

export function isVisualTemplateId(id: string): id is VisualTemplateId {
  return VISUAL_TEMPLATES.some((t) => t.id === id);
}

export function resolveThemeHex(
  themeColor: string | null | undefined,
  templateId: string | null | undefined
): string {
  if (themeColor && /^#[0-9A-Fa-f]{6}$/.test(themeColor)) {
    return themeColor;
  }
  const swatch = THEME_SWATCHES.find((s) => s.id === themeColor);
  if (swatch) return swatch.hex;
  return getVisualTemplate(templateId).defaultThemeHex;
}

export function listVisualTemplatesForType(type: "voucher" | "draw") {
  // P0：两款本店模版均可用；抽奖默认推荐 bold
  return VISUAL_TEMPLATES.map((t) => ({
    ...t,
    recommended: type === "draw" ? t.id === "store_bold" : t.id === "store_classic",
  }));
}
