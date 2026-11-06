"use client";

import { useState } from "react";
import { Copy, ShieldWarning } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { Device } from "@aaa/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VENDOR_LABEL } from "@/lib/format";
import { VENDOR_PROFILES } from "@/lib/vendor-profiles";

export function DeviceConfigDialog({
  device,
  onOpenChange,
}: {
  device: Device | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const profile = device ? VENDOR_PROFILES[device.vendor] : null;

  return (
    <Dialog
      open={Boolean(device)}
      onOpenChange={(open) => {
        if (!open) setCopied(false);
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-2xl">
        {device && profile ? (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-mono">{device.name}</DialogTitle>
                <Badge tone="neutral">{VENDOR_LABEL[device.vendor]}</Badge>
              </div>
              <DialogDescription>
                Perfil de integração para {profile.label}. O segredo real não é retornado pela API.
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11.5px] sm:grid-cols-4">
                <div>
                  <dt className="label">NAS-IP</dt>
                  <dd className="mt-0.5 text-mono text-fg">{device.nasIp}</dd>
                </div>
                <div>
                  <dt className="label">Identificador</dt>
                  <dd className="mt-0.5 truncate text-mono text-fg">{device.nasIdentifier}</dd>
                </div>
                <div>
                  <dt className="label">Portas</dt>
                  <dd className="mt-0.5 text-mono text-fg">1812 / 1813</dd>
                </div>
                <div>
                  <dt className="label">Segredo</dt>
                  <dd className="mt-0.5 text-fg">Restrito</dd>
                </div>
              </dl>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <p className="text-[12px] font-medium text-muted">Configuração de exemplo</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(profile.snippet);
                      setCopied(true);
                      toast.success("Comandos copiados.");
                    }}
                  >
                    <Copy size={13} />
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                </div>
                <pre className="overflow-x-auto rounded-sm border border-line bg-[#080a0c] p-3 text-mono text-[11px] leading-5 text-muted">
                  {profile.snippet}
                </pre>
                <p className="mt-1.5 text-[10.5px] leading-4 text-dim">{profile.nasNote}</p>
              </div>

              <div className="flex items-start gap-2 rounded-sm border border-warn/25 bg-warn/[0.06] px-3 py-2.5">
                <ShieldWarning size={15} className="mt-0.5 shrink-0 text-warn" />
                <p className="text-[11px] leading-4 text-warn/90">{profile.caveat}</p>
              </div>
            </DialogBody>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
