"use client";

import type { ReactNode } from "react";
import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  description,
  action,
  compact = false,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "px-4 py-10 text-center" : "px-6 py-16 text-center"}>
      <div className="mx-auto mb-3 grid h-9 w-9 place-items-center rounded-sm border border-line bg-panel-2">
        <span className="h-1.5 w-1.5 rounded-full bg-dim" />
      </div>
      <p className="text-[13px] font-medium text-fg">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-[12px] leading-5 text-dim">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Não foi possível carregar",
  message,
  onRetry,
  compact = false,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "px-4 py-10 text-center" : "px-6 py-16 text-center"} role="alert">
      <WarningCircle size={20} className="mx-auto text-danger" />
      <p className="mt-2 text-[13px] font-medium text-fg">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-[12px] leading-5 text-dim">
        {message ?? "A API não respondeu. Verifique o serviço e tente novamente."}
      </p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <ArrowClockwise size={13} />
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

export function InlineNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 border-t border-line px-4 py-2.5 text-[11px] leading-4 text-dim">
      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-dim" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
