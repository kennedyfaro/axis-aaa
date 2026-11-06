"use client";

import { useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
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
import { Field, Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { useChangeSelfPassword } from "@/lib/queries";

export function SelfPasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const change = useChangeSelfPassword();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (next: boolean) => {
    if (!next) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setShow(false);
      setError(null);
    }
    onOpenChange(next);
  };

  const submit = () => {
    if (newPassword.length < 14) {
      setError("A nova senha deve ter ao menos 14 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setError(null);
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          toast.success("Senha alterada. Use a nova senha no próximo acesso.");
          close(false);
        },
        onError: (mutationError) =>
          setError(
            mutationError instanceof ApiError ? mutationError.message : "Falha ao alterar a senha.",
          ),
      },
    );
  };

  const type = show ? "text" : "password";

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Alterar minha senha</DialogTitle>
          <DialogDescription>
            A senha é a mesma do RADIUS e do painel. A alteração vale para os equipamentos e para o
            próximo login.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <Field label="Senha atual" htmlFor="self-current-password">
            <div className="flex gap-2">
              <Input
                id="self-current-password"
                type={type}
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  setError(null);
                }}
                autoComplete="current-password"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={show ? "Ocultar senhas" : "Mostrar senhas"}
                onClick={() => setShow((current) => !current)}
              >
                {show ? <EyeSlash size={14} /> : <Eye size={14} />}
              </Button>
            </div>
          </Field>

          <Field
            label="Nova senha"
            htmlFor="self-new-password"
            hint="Mínimo de 14 caracteres."
            error={error ?? undefined}
          >
            <Input
              id="self-new-password"
              type={type}
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                setError(null);
              }}
              autoComplete="new-password"
            />
          </Field>

          <Field label="Confirmar nova senha" htmlFor="self-confirm-password">
            <Input
              id="self-confirm-password"
              type={type}
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setError(null);
              }}
              autoComplete="new-password"
            />
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            loading={change.isPending}
            disabled={currentPassword.length < 10 || newPassword.length < 14 || newPassword !== confirmPassword}
          >
            Alterar senha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
