import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * 品牌 W 标。
 * - solid：深紫底 + 玫瑰金线，亮色顶栏清晰（默认）
 * - line：透明底线标，仅适合深色背景
 */
export function BrandMark({
  size = 28,
  variant = "solid",
  className,
  priority = false,
}: {
  size?: number;
  variant?: "solid" | "line";
  className?: string;
  priority?: boolean;
}) {
  const src =
    variant === "line" ? "/logo-mark.png" : "/logo-mark-solid.png";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        variant === "solid" && "bg-[#240444] shadow-sm ring-1 ring-black/5",
        className
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt=""
        width={256}
        height={256}
        priority={priority}
        className="h-full w-full object-cover"
      />
    </span>
  );
}
