"use client";

import { Copy, ShieldWarning } from "@phosphor-icons/react";
import { toast } from "sonner";
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

export function DeviceSecretDialog({
  deviceName,
  secret,
  open,
  onOpenChange,
}: {
  deviceName: string;
  secret: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Shared secret de {deviceName}</DialogTitle>
          <DialogDescription>
            Aplique este valor no NAS e no cliente RADIUS. Ele não será exibido novamente.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="flex gap-2">
            <code className="flex-1 overflow-x-auto rounded-sm border border-line bg-[#080a0c] px-3 py-2 text-mono text-[12px] text-fg">
              {secret}
            </code>
            <Button
              variant="outline"
              size="icon"
              aria-label="Copiar shared secret"
              onClick={() => {
                void navigator.clipboard.writeText(secret);
                toast.success("Shared secret copiado.");
              }}
            >
              <Copy size={14} />
            </Button>
          </div>
          <div className="flex items-start gap-2 rounded-sm border border-warn/25 bg-warn/[0.06] px-3 py-2.5">
            <ShieldWarning size={15} className="mt-0.5 shrink-0 text-warn" />
            <p className="text-[11px] leading-4 text-warn/90">
              O painel armazena o segredo cifrado para sincronizar a tabela <span className="text-mono">nas</span>.
              O equipamento entra em operação imediatamente, sem reiniciar o FreeRADIUS. Após rotacionar,
              o novo segredo passa a valer em até 60 segundos. Em produção, use um cofre de segredos
              e rotacione após qualquer suspeita de vazamento.
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Concluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
