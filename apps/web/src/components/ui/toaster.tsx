"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      theme="dark"
      closeButton
      duration={4200}
      toastOptions={{
        classNames: {
          toast:
            "!bg-panel-2 !border !border-line-strong !text-fg !rounded-md !shadow-[0_8px_28px_rgb(0_0_0/0.5)] !font-sans",
          title: "!text-[12.5px] !font-medium",
          description: "!text-[11.5px] !text-muted",
          actionButton: "!bg-fg !text-bg !text-[11px]",
          cancelButton: "!bg-panel-3 !text-muted !text-[11px]",
          closeButton: "!bg-panel-3 !border-line !text-muted",
          error: "!border-danger/40",
          success: "!border-ok/40",
        },
      }}
    />
  );
}
