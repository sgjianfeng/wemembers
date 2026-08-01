/**
 * 新加坡国旗结构背景（上红下白 · 新月五星）
 * 几何绘制，不扭曲星月；国庆期宣传用，须庄重不倒置。
 */
export function SingaporeFlagBackdrop({
  red = "#CE1126",
  className,
}: {
  red?: string;
  className?: string;
}) {
  // 五星路径（viewBox 单位，中心 0,0）
  const starPath = (cx: number, cy: number, r: number) => {
    const pts: string[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      pts.push(
        `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`
      );
    }
    return `M${pts.join("L")}Z`;
  };

  const starCx = 62;
  const starCy = 50;
  const ring = 18;
  const starR = 7;
  const stars = Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return {
      cx: starCx + Math.cos(a) * ring,
      cy: starCy + Math.sin(a) * ring,
    };
  });

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
        {/* 新月：白圆 - 红圆 */}
        <circle cx="32" cy="50" r="28" fill="#FFFFFF" />
        <circle cx="44" cy="48" r="23" fill={red} />
        {stars.map((s, i) => (
          <path
            key={i}
            d={starPath(s.cx, s.cy, starR)}
            fill="#FFFFFF"
          />
        ))}
      </svg>
    </svg>
  );
}
