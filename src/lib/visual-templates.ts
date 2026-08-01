/**
 * 实体券 / 分享图视觉模版（系统精修 · 非设计工具）
 * 商家只选模版 + 有限主题色；版式由平台固定。
 */

export type VisualTemplateId = "store_classic" | "store_bold" | "festival_ndp";

export type ThemeColorId =
  | "blue"
  | "orange"
  | "violet"
  | "green"
  | "dark"
  | "ndp_red"
  | "festival_red";

export interface ThemeSwatch {
  id: ThemeColorId;
  hex: string;
  labelZh: string;
  labelEn: string;
}

/** 新加坡国庆红（印刷常用） */
export const SG_NDP_RED = "#CE1126";
export const SG_NDP_RED_DEEP = "#9B0A1A";

export const THEME_SWATCHES: ThemeSwatch[] = [
  {
    id: "ndp_red",
    hex: SG_NDP_RED,
    labelZh: "国庆红（推荐节日）",
    labelEn: "National Day red",
  },
  {
    id: "festival_red",
    hex: "#EF3340",
    labelZh: "节日红",
    labelEn: "Festival red",
  },
  { id: "orange", hex: "#E85D04", labelZh: "券橙", labelEn: "Voucher orange" },
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
  {
    id: "festival_ndp",
    family: "store",
    nameZh: "国庆节日",
    nameEn: "National Day",
    taglineZh: "上红下白国旗结构 · SG61 · 适合满赠台卡",
    taglineEn: "Red/white flag layout · SG61 · table tent",
    defaultThemeHex: SG_NDP_RED,
    // light：避免走「醒目色块」黑底分支；国庆色由 accent 整卡渲染
    surface: "light",
  },
];

/** 是否国庆/节日类活动（用于默认模版与落地页） */
export function isFestivalNdpCampaign(
  type?: string | null,
  name?: string | null,
  tags?: string | null
): boolean {
  if (type === "holiday") return true;
  if (name && /国庆|ndp|national\s*day|满120送|满赠/i.test(name)) return true;
  if (tags && /ndp|国庆|national|category:ndp/i.test(tags)) return true;
  return false;
}

/** 主题是否偏国庆红（导出时用红白渐变 + 星月装饰） */
export function isNdpFestivalAccent(hex: string | null | undefined): boolean {
  if (!hex) return false;
  const h = hex.toUpperCase();
  return (
    h === SG_NDP_RED.toUpperCase() ||
    h === "#EF3340" ||
    h === "#ED2939" ||
    h === "#C8102E" ||
    h === "#DC143C"
  );
}

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

export function listVisualTemplatesForType(
  type: "voucher" | "draw" | "festival"
) {
  return VISUAL_TEMPLATES.map((t) => ({
    ...t,
    recommended:
      type === "festival"
        ? t.id === "festival_ndp"
        : type === "draw"
          ? t.id === "store_bold"
          : t.id === "store_classic",
  }));
}
