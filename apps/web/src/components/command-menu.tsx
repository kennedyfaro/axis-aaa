"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { MagnifyingGlass, Plus, DownloadSimple, ArrowRight } from "@phosphor-icons/react";
import { NAV_ITEMS } from "@/lib/nav";
import { download } from "@/lib/api";
import { useSession } from "@/lib/queries";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [query, setQuery] = useState("");
  const permissions = new Set(session?.permissions ?? []);
  const navItems = NAV_ITEMS.filter(
    (item) =>
      permissions.has(item.permission) &&
      (item.href !== "/me" || Boolean(session?.selfService)),
  );
  const canCreateUser = permissions.has("users.write");
  const canExportAudit = permissions.has("audit.export");

  const run = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery("");
        onOpenChange(next);
      }}
    >
      <DialogContent showClose={false} className="top-[22%] max-w-[520px] translate-y-0 p-0">
        <DialogTitle className="sr-only">Busca e comandos</DialogTitle>
        <Command
          shouldFilter
          className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-dim"
        >
          <div className="flex items-center gap-2 border-b border-line px-3">
            <MagnifyingGlass size={15} className="text-dim" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              autoFocus
              placeholder="Buscar tela, usuário ou ação"
              className="h-11 w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-dim"
            />
            <kbd className="rounded-[3px] border border-line bg-panel-2 px-1.5 py-0.5 text-[10px] text-dim">ESC</kbd>
          </div>
          <Command.List className="max-h-[340px] overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-8 text-center text-[12px] text-dim">
              Nenhum resultado para esta busca.
            </Command.Empty>
            <Command.Group heading="Navegar">
              {navItems.map((item) => (
                <Command.Item
                  key={item.href}
                  value={`${item.label} ${item.section}`}
                  onSelect={() => run(item.href)}
                  className="flex cursor-pointer items-center gap-2 rounded-[4px] px-2.5 py-2 text-[12.5px] text-muted data-[selected=true]:bg-panel-3 data-[selected=true]:text-fg"
                >
                  <item.icon size={15} className="text-dim" />
                  <span>{item.label}</span>
                  <span className="ml-auto text-[10px] text-dim">{item.section}</span>
                </Command.Item>
              ))}
            </Command.Group>
            {canCreateUser || canExportAudit ? (
            <Command.Group heading="Ações rápidas">
              {canCreateUser ? (
              <Command.Item
                value="novo usuário criar identidade"
                onSelect={() => run("/users")}
                className="flex cursor-pointer items-center gap-2 rounded-[4px] px-2.5 py-2 text-[12.5px] text-muted data-[selected=true]:bg-panel-3 data-[selected=true]:text-fg"
              >
                <Plus size={15} className="text-dim" />
                Criar usuário
                <ArrowRight size={12} className="ml-auto text-dim" />
              </Command.Item>
              ) : null}
              {canExportAudit ? (
              <Command.Item
                value="exportar auditoria csv"
                onSelect={() => {
                  onOpenChange(false);
                  download("/export/audit?period=30d");
                }}
                className="flex cursor-pointer items-center gap-2 rounded-[4px] px-2.5 py-2 text-[12.5px] text-muted data-[selected=true]:bg-panel-3 data-[selected=true]:text-fg"
              >
                <DownloadSimple size={15} className="text-dim" />
                Exportar auditoria (30 dias)
                <ArrowRight size={12} className="ml-auto text-dim" />
              </Command.Item>
              ) : null}
            </Command.Group>
            ) : null}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
