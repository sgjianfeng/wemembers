/**
 * 新加坡国旗结构背景（上红下白 · 新月五星）
 * 几何绘制，不扭曲星月；国庆期宣传用，须庄重不倒置。
 */

function starPath(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
  }
  return `M${pts.join("L")}Z`;
}

function crescentStarsGeometry(starCx: number, starCy: number, ring: number, starR: number) {
  return Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return {
      cx: starCx + Math.cos(a) * ring,
      cy: starCy + Math.sin(a) * ring,
      d: starPath(
        starCx + Math.cos(a) * ring,
        starCy + Math.sin(a) * ring,
        starR
      ),
    };
  });
}

/**
 * 仅星月（新月 + 五星），用于活动页 hero 右上角装饰。
 * 放在国庆红底上：月牙由白圆 + 同色红圆挖空；不画国旗下半白。
 * 默认固定像素，避免 width/height 100% 在 absolute 容器被撑成整屏。
 */
export function SingaporeCrescentStars({
  red = "#CE1126",
  className,
  fill = "#FFFFFF",
  size = 56,
}: {
  red?: string;
  className?: string;
  /** 星月填充色，默认白 */
  fill?: string;
  /** 正方形边长 px */
  size?: number;
}) {
  // 构图：月在左、星环在右（与国旗一致，不倒置）
  const stars = crescentStarsGeometry(68, 48, 16, 6.2);

  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      focusable="false"
    >
      {/* 新月：白圆 − 红圆（红须与 hero 底同色） */}
      <circle cx="34" cy="50" r="26" fill={fill} />
      <circle cx="46" cy="48" r="21" fill={red} />
      {stars.map((s, i) => (
        <path key={i} d={s.d} fill={fill} />
      ))}
    </svg>
  );
}

export function SingaporeFlagBackdrop({
  red = "#CE1126",
  className,
}: {
  red?: string;
  className?: string;
}) {
  const stars = crescentStarsGeometry(62, 50, 18, 7);

  return (
    <svg
      className={className}
      width="100%"
      height="100%"
      aria-hidden
      focusable="false"
    >
      {/* 上红下白铺满卡片（竖版时红区约一半） */}
      <rect width="100%" height="48%" fill={red} />
      <rect y="48%" width="100%" height="52%" fill="#FFFFFF" />
      {/* 星月：左上红区内，独立比例不横向拉伸 */}
      <svg
        x="2%"
        y="6%"
        width="42%"
        height="36%"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMinYMid meet"
      >
        <circle cx="32" cy="50" r="28" fill="#FFFFFF" />
        <circle cx="44" cy="48" r="23" fill={red} />
        {stars.map((s, i) => (
          <path key={i} d={s.d} fill="#FFFFFF" />
        ))}
      </svg>
    </svg>
  );
}
