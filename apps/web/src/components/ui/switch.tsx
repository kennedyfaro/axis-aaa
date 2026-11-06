"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-line-strong transition-colors duration-150 ease-out",
        "data-[state=unchecked]:bg-panel-3 data-[state=checked]:border-accent data-[state=checked]:bg-accent",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block h-3 w-3 translate-x-0.5 rounded-full bg-fg transition-transform duration-150 ease-out",
          "data-[state=checked]:translate-x-[16px] data-[state=checked]:bg-accent-ink",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
