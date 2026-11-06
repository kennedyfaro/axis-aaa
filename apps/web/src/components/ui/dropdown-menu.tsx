"use client";

import * as React from "react";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  align = "end",
  sideOffset = 4,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-[var(--z-overlay)] min-w-[184px] overflow-hidden rounded-md border border-line-strong bg-panel-2 p-1 shadow-[0_8px_24px_rgb(0_0_0/0.45)]",
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  danger = false,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { danger?: boolean }) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-[4px] px-2 py-1.5 text-[12px] outline-none",
        "data-[highlighted]:bg-panel-3 data-[disabled]:pointer-events-none data-[disabled]:opacity-45",
        danger ? "text-danger data-[highlighted]:bg-danger/10" : "text-muted data-[highlighted]:text-fg",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>) {
  return (
    <DropdownPrimitive.Label
      className={cn("px-2 py-1.5 text-[11px] font-medium text-dim", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>) {
  return <DropdownPrimitive.Separator className={cn("my-1 h-px bg-line", className)} {...props} />;
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.CheckboxItem>) {
  return (
    <DropdownPrimitive.CheckboxItem
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-[4px] px-2 py-1.5 text-[12px] text-muted outline-none",
        "data-[highlighted]:bg-panel-3 data-[highlighted]:text-fg",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="grid h-3.5 w-3.5 place-items-center rounded-[3px] border border-line-strong">
        <DropdownPrimitive.ItemIndicator>
          <Check size={10} weight="bold" />
        </DropdownPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownPrimitive.CheckboxItem>
  );
}
