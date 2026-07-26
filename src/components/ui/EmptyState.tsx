import { resolveIcon, type IconName } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** semantic icon key from the central registry */
  icon?: IconName;
  /** headline — say what's here, not what's missing */
  title: string;
  /** one supporting line, ideally pointing to the next action */
  description?: string;
  /** optional call-to-action rendered below the copy */
  action?: React.ReactNode;
  className?: string;
  /** festive tint for reward/draw contexts (B layer); default is calm (A) */
  tone?: "calm" | "festive";
}

/**
 * Designed empty state — replaces dead "S$0.00 / 0%" screens with a guided
 * moment. Calm by default (A base); pass tone="festive" on draw/prize surfaces.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  tone = "calm",
}: EmptyStateProps) {
  const Icon = icon ? resolveIcon(icon) : null;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 py-12",
        className
      )}
    >
      {Icon && (
        <div
          className={cn(
            "grid place-items-center h-14 w-14 rounded-2xl mb-4",
            tone === "festive"
              ? "bg-gold/15 text-gold-strong"
              : "bg-muted text-muted-foreground"
          )}
        >
          <Icon size={26} strokeWidth={1.9} aria-hidden />
        </div>
      )}
      <p className="text-[15px] font-semibold text-foreground text-balance">
        {title}
      </p>
      {description && (
        <p className="mt-1.5 text-[13px] text-muted-foreground max-w-[46ch] text-pretty">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
