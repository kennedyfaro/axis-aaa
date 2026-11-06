"use client";

import { Copy, ShieldCheck } from "@phosphor-icons/react";
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

export function TotpSecretDialog({
  login,
  email,
  secret,
  uri,
  open,
  onOpenChange,
}: {
  login: string;
  email: string;
  secret: string;
  uri: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Autenticação em dois fatores</DialogTitle>
          <DialogDescription>
            Cadastre o segredo abaixo no autenticador de <span className="text-mono text-muted">{login}</span>.
            O próximo login no painel vai pedir o código de 6 dígitos.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <div className="flex items-start gap-2 rounded-sm border border-accent/25 bg-accent/[0.06] px-3 py-2.5">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-[11px] leading-4 text-muted">
              Conta do painel: <span className="text-mono text-fg">{email}</span>. A senha continua
              sendo a mesma credencial RADIUS da identidade.
            </p>
          </div>

          <div>
            <p className="label mb-1.5">Segredo TOTP</p>
            <div className="flex gap-2">
              <code className="flex-1 overflow-x-auto rounded-sm border border-line bg-[#080a0c] px-3 py-2 text-mono text-[12px] text-fg">
                {secret}
              </code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Copiar segredo TOTP"
                onClick={() => {
                  void navigator.clipboard.writeText(secret);
                  toast.success("Segredo copiado.");
                }}
              >
                <Copy size={14} />
              </Button>
            </div>
          </div>

          <div>
            <p className="label mb-1.5">URI para o autenticador</p>
            <code className="block break-all rounded-sm border border-line bg-[#080a0c] px-3 py-2 text-mono text-[10.5px] leading-4 text-muted">
              {uri}
            </code>
          </div>

          <p className="text-[11px] leading-4 text-dim">
            Guarde o segredo em local seguro. Ele não será exibido novamente. Se perder o
            autenticador, um administrador pode gerar um novo segredo.
          </p>
        </DialogBody>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Concluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
