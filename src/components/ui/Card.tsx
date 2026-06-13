import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      className={cn(
        "bg-white border border-slate-100 rounded-xl overflow-hidden",
        onClick && "cursor-pointer active:bg-slate-50 transition-colors",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-4", className)}>{children}</div>;
}
