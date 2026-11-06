"use client";

import { useState } from "react";
import { ArrowsClockwise, CheckCircle, Copy, Eye, EyeSlash } from "@phosphor-icons/react";
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
import { generatePassword } from "@/lib/password";
import { useResetPassword } from "@/lib/queries";

export function ResetPasswordDialog({
  userId,
  login,
  open,
  onOpenChange,
}: {
  userId: string;
  login: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [password, setPassword] = useState(() => generatePassword());
  const [confirmPassword, setConfirmPassword] = useState(() => password);
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);
  const reset = useResetPassword(userId);

  const submit = () => {
    reset.mutate(password, {
      onSuccess: () => {
        setShowPassword(false);
        setDone(true);
        toast.success("Credencial RADIUS atualizada.");
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Falha ao redefinir a credencial."),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          const nextPassword = generatePassword();
          setDone(false);
          setPassword(nextPassword);
          setConfirmPassword(nextPassword);
          setShowPassword(false);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redefinir credencial RADIUS</DialogTitle>
          <DialogDescription>
            O hash NT de <span className="text-mono text-muted">{login}</span> será substituído. A senha
            anterior deixa de funcionar imediatamente.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          {done ? (
            <div className="rounded-sm border border-ok/25 bg-ok/[0.06] p-3">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-ok">
                <CheckCircle size={14} />
                Credencial atualizada
              </p>
              <p className="mt-1 text-[11px] leading-4 text-muted">
                Copie a senha agora. Ela não será exibida novamente.
              </p>
              <div className="mt-2 flex gap-2">
                <Input
                  readOnly
                  type={showPassword ? "text" : "password"}
                  value={password}
                  className="text-mono"
                  aria-label="Nova senha RADIUS"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeSlash size={14} /> : <Eye size={14} />}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Copiar senha"
                  onClick={() => {
                    void navigator.clipboard.writeText(password);
                    toast.success("Senha copiada.");
                  }}
                >
                  <Copy size={14} />
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Field
                label="Nova senha"
                htmlFor="reset-password"
                hint="Mínimo de 14 caracteres. A senha não fica armazenada em texto puro."
              >
                <div className="flex gap-2">
                  <Input
                    id="reset-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="text-mono"
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? <EyeSlash size={14} /> : <Eye size={14} />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    onClick={() => {
                      const generated = generatePassword();
                      setPassword(generated);
                      setConfirmPassword(generated);
                    }}
                  >
                    <ArrowsClockwise size={13} />
                    Gerar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Copiar senha"
                    onClick={() => {
                      void navigator.clipboard.writeText(password);
                      toast.success("Senha copiada.");
                    }}
                  >
                    <Copy size={14} />
                  </Button>
                </div>
              </Field>

              <Field
                label="Confirmar senha"
                htmlFor="reset-password-confirm"
                error={
                  confirmPassword.length > 0 && password !== confirmPassword
                    ? "As senhas não coincidem."
                    : undefined
                }
              >
                <Input
                  id="reset-password-confirm"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="text-mono"
                  autoComplete="new-password"
                />
              </Field>
            </>
          )}
        </DialogBody>

        <DialogFooter>
          {done ? (
            <Button onClick={() => onOpenChange(false)}>Concluir</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={submit}
                loading={reset.isPending}
                disabled={password.length < 14 || password !== confirmPassword}
              >
                Redefinir credencial
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
