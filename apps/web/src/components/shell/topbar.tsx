"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CaretRight, List, MagnifyingGlass, SignOut, UserCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { findNavItem } from "@/lib/nav";
import { useLogout, useSession } from "@/lib/queries";

export function Topbar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = findNavItem(pathname);
  const { data: session } = useSession();
  const logout = useLogout();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg px-4 md:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenu} aria-label="Abrir navegação">
        <List size={18} />
      </Button>

      <nav aria-label="Trilha de navegação" className="flex min-w-0 items-center gap-1.5 text-[12px]">
        <span className="hidden text-dim sm:inline">{current.section}</span>
        <CaretRight size={10} className="hidden text-line-strong sm:inline" aria-hidden />
        <span className="truncate font-medium text-fg">{current.label}</span>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onSearch}
          className="hidden h-8 w-[240px] items-center gap-2 rounded-sm border border-line bg-[#0b0e11] px-2.5 text-left text-[12px] text-dim transition-colors duration-150 hover:border-line-strong hover:text-muted lg:flex"
        >
          <MagnifyingGlass size={14} />
          <span>Buscar</span>
          <kbd className="ml-auto rounded-[3px] border border-line bg-panel-2 px-1 py-0.5 text-[10px] text-dim">
            Ctrl K
          </kbd>
        </button>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onSearch} aria-label="Buscar">
          <MagnifyingGlass size={16} />
        </Button>

        <Badge tone="outline" className="hidden sm:inline-flex" title="Ambiente local de desenvolvimento com FreeRADIUS real.">
          Local
        </Badge>

        <span aria-hidden className="mx-0.5 h-5 w-px bg-line" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-sm py-1 pl-1 pr-1.5 transition-colors duration-150 hover:bg-panel-2"
              aria-label="Menu da conta"
            >
              <Avatar name={session?.name ?? "Administrador"} size="sm" />
              <span className="hidden text-[12px] font-medium text-fg sm:inline">
                {session?.name?.split(" ")[0] ?? "Admin"}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[220px]">
            <DropdownMenuLabel>
              <span className="block text-[12px] font-medium text-fg">{session?.name ?? "Administrador"}</span>
              <span className="mt-0.5 block truncate text-[11px] font-normal text-dim">
                {session?.email ?? "sessão local"}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <UserCircle size={14} />
                Conta e segurança
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              danger
              onSelect={() => {
                logout.mutate(undefined, {
                  onSuccess: () => {
                    toast.success("Sessão encerrada.");
                    router.replace("/login");
                    router.refresh();
                  },
                });
              }}
            >
              <SignOut size={14} />
              Sair do painel
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
