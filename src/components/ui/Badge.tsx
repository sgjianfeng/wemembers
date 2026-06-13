import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "blue" | "green" | "orange" | "red" | "slate" | "purple" | "amber";
  size?: "sm" | "md";
  className?: string;
}

const variants: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700",
  green: "bg-green-50 text-green-700",
  orange: "bg-orange-50 text-orange-700",
  red: "bg-red-50 text-red-700",
  slate: "bg-slate-100 text-slate-600",
  purple: "bg-purple-50 text-purple-700",
  amber: "bg-amber-50 text-amber-700",
};

const sizes: Record<string, string> = {
  sm: "px-1.5 py-0.5 text-[10px]",
  md: "px-2 py-0.5 text-xs",
};

export function Badge({ children, variant = "slate", size = "md", className }: BadgeProps) {
  return (
    <span className={cn("inline-flex items-center font-medium rounded-full", variants[variant], sizes[size], className)}>
      {children}
    </span>
  );
}
