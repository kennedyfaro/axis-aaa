import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-sm border border-line-strong bg-panel-3 font-medium text-muted",
        size === "sm" ? "h-6 w-6 text-[10px]" : size === "lg" ? "h-11 w-11 text-[13px]" : "h-7 w-7 text-[11px]",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
