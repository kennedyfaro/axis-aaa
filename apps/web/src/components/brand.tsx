import { cn } from "@/lib/utils";

export function BrandMark({ className, size = 26 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 26 26"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <rect x="0.75" y="0.75" width="24.5" height="24.5" rx="4.25" stroke="currentColor" strokeOpacity="0.35" />
      <path d="M13 5.4v15.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8.4 13h9.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeOpacity="0.55" />
      <circle cx="13" cy="7" r="1.65" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="13" cy="19" r="1.65" stroke="currentColor" strokeWidth="1.25" />
      <path d="M13 10.65 15.35 13 13 15.35 10.65 13Z" fill="var(--accent)" />
    </svg>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark className="text-fg" />
      <div className={cn("min-w-0", compact && "hidden xl:block")}>
        <p className="text-[13px] font-semibold leading-4 tracking-[-0.01em] text-fg">Áxis</p>
        <p className="text-[10px] leading-4 text-dim">Acesso e auditoria</p>
      </div>
    </div>
  );
}
