"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;

export function SheetContent({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-[#050607]/75" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-y-0 left-0 z-[var(--z-dialog)] flex w-[280px] flex-col border-r border-line-strong bg-panel",
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="sr-only">Navegação</DialogPrimitive.Title>
        {children}
        <DialogPrimitive.Close
          className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-sm text-dim hover:bg-panel-2 hover:text-fg"
          aria-label="Fechar navegação"
        >
          <X size={15} />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
