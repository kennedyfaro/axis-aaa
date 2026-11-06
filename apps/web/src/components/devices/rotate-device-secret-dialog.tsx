"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Device } from "@aaa/contracts";
import { RADIUS_SECRET_MESSAGE, RADIUS_SECRET_PATTERN } from "@aaa/contracts";
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
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { useRotateDeviceSecret } from "@/lib/queries";

export function RotateDeviceSecretDialog({
  device,
  open,
  onOpenChange,
  onRotated,
}: {
  device: Device;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRotated: (info: { name: string; secret: string }) => void;
}) {
  const rotate = useRotateDeviceSecret();
  const [mode, setMode] = useState<"generate" | "custom">("generate");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (mode === "custom" && !RADIUS_SECRET_PATTERN.test(secret)) {
      setError(RADIUS_SECRET_MESSAGE);
      return;
    }
    setError(null);
    rotate.mutate(
      { id: device.id, secret: mode === "custom" ? secret : undefined },
      {
        onSuccess: (data) => {
          toast.success(mode === "custom" ? "Shared secret atualizado." : "Novo shared secret gerado.");
          onRotated({ name: data.name, secret: data.secret });
          onOpenChange(false);
        },
        onError: (mutationError) =>
          toast.error(mutationError instanceof ApiError ? mutationError.message : "Falha ao atualizar o segredo."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Shared secret de {device.name}</DialogTitle>
          <DialogDescription>
            Gere um novo segredo ou informe o segredo que já está configurado no equipamento.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <Field
            label="Shared secret"
            htmlFor="rotate-secret-mode"
            error={error ?? undefined}
            hint={
              mode === "custom"
                ? "Use exatamente o segredo configurado no NAS para não interromper a autenticação."
                : "O valor atual será substituído por um segredo aleatório de 24 caracteres."
            }
          >
            <div className="space-y-2">
              <Select
                id="rotate-secret-mode"
                value={mode}
                aria-label="Modo do shared secret"
                onChange={(event) => {
                  setMode(event.target.value as "generate" | "custom");
                  setError(null);
                }}
              >
                <option value="generate">Gerar automaticamente</option>
                <option value="custom">Informar manualmente</option>
              </Select>
              {mode === "custom" ? (
                <div className="flex gap-2">
                  <Input
                    id="rotate-secret"
                    type={showSecret ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="8 a 60 caracteres"
                    className="text-mono"
                    value={secret}
                    onChange={(event) => {
                      setSecret(event.target.value);
                      setError(null);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSecret((current) => !current)}
                  >
                    {showSecret ? "Ocultar" : "Mostrar"}
                  </Button>
                </div>
              ) : null}
            </div>
          </Field>

          <p className="rounded-sm border border-line bg-[#0b0e11] px-3 py-2.5 text-[11px] leading-4 text-dim">
            O novo valor vale para o FreeRADIUS em até 60 segundos, por causa do cache de clientes.
            Aplique o mesmo segredo no equipamento para evitar rejeições.
          </p>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={rotate.isPending}>
            Aplicar segredo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
