import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  hint,
  action,
  link,
  children,
  className,
  bodyClassName,
  flush = false,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
  link?: { href: string; label: string };
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean;
}) {
  return (
    <section className={cn("overflow-hidden rounded-lg border border-line bg-panel", className)}>
      {title ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="text-[13px] font-medium text-fg">{title}</h2>
            {hint ? <p className="mt-0.5 text-[11px] text-dim">{hint}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            {action}
            {link ? (
              <Link
                href={link.href}
                className="flex items-center gap-1 text-[11px] text-dim transition-colors duration-150 hover:text-fg"
              >
                {link.label}
                <ArrowUpRight size={11} />
              </Link>
            ) : null}
          </div>
        </header>
      ) : null}
      <div className={cn(!flush && "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
