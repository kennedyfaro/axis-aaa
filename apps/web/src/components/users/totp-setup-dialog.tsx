"use client";

import { useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  normalizeTotpSecret,
  TOTP_SECRET_MESSAGE,
  TOTP_SECRET_PATTERN,
} from "@aaa/contracts";
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
import { useConfigureSelfTotp, useConfigureUserTotp } from "@/lib/queries";

export function TotpSetupDialog({
  userId,
  login,
  endpoint = "user",
  open,
  onOpenChange,
  onConfigured,
}: {
  userId: string;
  login: string;
  endpoint?: "user" | "self";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigured: (data: { secret: string; uri: string }) => void;
}) {
  const configureUser = useConfigureUserTotp();
  const configureSelf = useConfigureSelfTotp();
  const pending = endpoint === "self" ? configureSelf.isPending : configureUser.isPending;
  const [mode, setMode] = useState<"generate" | "manual">("generate");
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (next: boolean) => {
    if (!next) {
      setMode("generate");
      setSecret("");
      setShowSecret(false);
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = () => {
    const normalized = normalizeTotpSecret(secret);
    if (mode === "manual" && !TOTP_SECRET_PATTERN.test(normalized)) {
      setError(TOTP_SECRET_MESSAGE);
      return;
    }
    setError(null);
    const secretValue = mode === "manual" ? normalized : undefined;
    const callbacks = {
      onSuccess: (data: { secret: string; uri: string }) => {
        toast.success("2FA configurado. Guarde o segredo no autenticador.");
        onConfigured({ secret: data.secret, uri: data.uri });
        close(false);
      },
      onError: (mutationError: unknown) =>
        setError(
          mutationError instanceof ApiError ? mutationError.message : "Falha ao configurar o 2FA.",
        ),
    };
    if (endpoint === "self") {
      configureSelf.mutate({ secret: secretValue }, callbacks);
    } else {
      configureUser.mutate({ id: userId, secret: secretValue }, callbacks);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar 2FA de {login}</DialogTitle>
          <DialogDescription>
            Gere um segredo novo ou informe um segredo que já existe no seu autenticador. O login
            no painel passará a exigir o código de 6 dígitos.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <Field label="Origem do segredo" htmlFor="totp-mode">
            <Select
              id="totp-mode"
              value={mode}
              aria-label="Origem do segredo TOTP"
              onChange={(event) => {
                setMode(event.target.value as "generate" | "manual");
                setSecret("");
                setShowSecret(false);
                setError(null);
              }}
            >
              <option value="generate">Gerar automaticamente</option>
              <option value="manual">Informar manualmente</option>
            </Select>
          </Field>

          {mode === "manual" ? (
            <Field
              label="Segredo TOTP"
              htmlFor="totp-secret"
              error={error ?? undefined}
              hint="Base32 de 16 a 64 caracteres, apenas A-Z e 2-7. Espaços e hifens são ignorados."
            >
              <div className="flex gap-2">
                <Input
                  id="totp-secret"
                  type={showSecret ? "text" : "password"}
                  value={secret}
                  onChange={(event) => {
                    setSecret(event.target.value);
                    setError(null);
                  }}
                  className="text-mono"
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={showSecret ? "Ocultar segredo" : "Mostrar segredo"}
                  onClick={() => setShowSecret((current) => !current)}
                >
                  {showSecret ? <EyeSlash size={14} /> : <Eye size={14} />}
                </Button>
              </div>
            </Field>
          ) : (
            <p className="rounded-sm border border-line bg-[#0b0e11] px-3 py-2.5 text-[11px] leading-4 text-dim">
              Um segredo novo será gerado e exibido uma única vez para você cadastrar no autenticador.
              O segredo anterior deixa de funcionar.
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={pending}>
            Configurar 2FA
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
