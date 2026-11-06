"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ServiceHealth } from "@aaa/contracts";
import { Brand } from "@/components/brand";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "@/lib/nav";
import { useSession } from "@/lib/queries";

function StatusLine({ label, services }: { label: string; services?: ServiceHealth[] }) {
  const relevant = services?.filter((service) =>
    label === "RADIUS" ? service.id.startsWith("radius") : service.id === "api",
  );
  const down = relevant?.some((service) => service.status === "down");
  const degraded = relevant?.some((service) => service.status === "degraded");
  const tone = !relevant?.length ? "bg-dim" : down ? "bg-danger" : degraded ? "bg-warn" : "bg-ok";
  const text = !relevant?.length ? "sem sinal" : down ? "fora" : degraded ? "degradado" : "operacional";

  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-dim">{label}</span>
      <span className="flex items-center gap-1.5 text-muted">
        <span aria-hidden className={cn("h-1 w-1 rounded-full", tone)} />
        {text}
      </span>
    </div>
  );
}

export function SidebarContent({
  health,
  mobile = false,
  onNavigate,
}: {
  health?: ServiceHealth[];
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const compact = !mobile;
  const { data: session } = useSession();
  const permissions = new Set(session?.permissions ?? []);
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        permissions.has(item.permission) &&
        (item.href !== "/me" || Boolean(session?.selfService)),
    ),
  })).filter((section) => section.items.length > 0);
  const homeHref =
    session && session.permissions.every((permission) => permission.startsWith("self."))
      ? "/me"
      : "/dashboard";

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-14 items-center border-b border-line", compact ? "justify-center px-2 xl:justify-start xl:px-4" : "px-4")}>
        <Link href={homeHref} onClick={onNavigate} aria-label="Áxis, ir para o início">
          <Brand compact={compact} />
        </Link>
      </div>

      <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-2 py-3 xl:px-2.5">
        {sections.map((section, index) => (
          <div key={section.label} className={cn(index > 0 && "mt-1")}>
            {index > 0 ? <div className="mx-2 my-2 h-px bg-line/70 md:block xl:hidden" /> : null}
            <p className={cn("mb-1 px-2 text-[10px] font-medium uppercase tracking-[0.07em] text-dim", compact && "hidden xl:block")}>
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      title={item.label}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex h-8 items-center gap-2.5 rounded-sm px-2 text-[12.5px] transition-colors duration-150 ease-out",
                        compact && "justify-center xl:justify-start",
                        active
                          ? "bg-panel-2 text-fg"
                          : "text-muted hover:bg-panel-2/60 hover:text-fg",
                      )}
                    >
                      <item.icon
                        size={16}
                        className={cn("shrink-0", active ? "text-accent" : "text-dim group-hover:text-muted")}
                      />
                      <span className={cn("truncate", compact && "hidden xl:inline")}>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn("border-t border-line p-3", compact && "hidden xl:block")}>
        <div className="rounded-sm border border-line bg-[#0b0e11] px-2.5 py-2">
          <div className="space-y-1.5">
            <StatusLine label="RADIUS" services={health} />
            <StatusLine label="API" services={health} />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-dim">
          <span>Ambiente local</span>
          <span className="text-mono">v0.1.0</span>
        </div>
      </div>

      {compact ? (
        <div className="hidden border-t border-line px-3 py-2.5 md:block xl:hidden">
          <div className="flex items-center justify-center gap-2" aria-label="Estado dos serviços">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" title="API operacional" />
            <span className="h-1.5 w-1.5 rounded-full bg-ok" title="RADIUS operacional" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Sidebar({ health }: { health?: ServiceHealth[] }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col border-r border-line bg-panel md:flex xl:w-[244px]">
      <SidebarContent health={health} />
    </aside>
  );
}
