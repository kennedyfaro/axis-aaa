"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Plus, ArrowsClockwise } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { CreateUserInput } from "@aaa/contracts";
import { createUserSchema } from "@aaa/contracts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TotpSecretDialog } from "@/components/users/totp-secret-dialog";
import { ApiError } from "@/lib/api";
import { useCreateUser, useGroups } from "@/lib/queries";
import { generatePassword } from "@/lib/password";
import { cn } from "@/lib/utils";

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "")
    .slice(0, 32);
}

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [loginTouched, setLoginTouched] = useState(false);
  const [totpInfo, setTotpInfo] = useState<{
    login: string;
    email: string;
    secret: string;
    uri: string;
  } | null>(null);
  const { data: groups } = useGroups();
  const create = useCreateUser();

  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      login: "",
      email: "",
      password: "",
      groupIds: [],
      validUntil: "",
      mfa: true,
      notes: null,
    },
    mode: "onBlur",
  });

  const selectedGroups = useWatch({ control: form.control, name: "groupIds" }) ?? [];
  const password = useWatch({ control: form.control, name: "password" }) ?? "";
  const mfa = useWatch({ control: form.control, name: "mfa" }) ?? true;

  const close = () => {
    setOpen(false);
    form.reset();
    setLoginTouched(false);
  };

  const onSubmit = form.handleSubmit((values) => {
    create.mutate(
      {
        ...values,
        validUntil: values.validUntil ? values.validUntil : null,
        notes: values.notes ? values.notes : null,
      },
      {
        onSuccess: (user) => {
          if (user.totpSecret && user.totpUri) {
            setTotpInfo({ login: user.login, email: user.email, secret: user.totpSecret, uri: user.totpUri });
          }
          toast.success(`Identidade ${user.login} criada.`);
          close();
        },
        onError: (error) => {
          toast.error(error instanceof ApiError ? error.message : "Não foi possível criar a identidade.");
        },
      },
    );
  });

  return (
    <>
      <Dialog
        open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else setOpen(true);
      }}
    >
      <DialogTrigger asChild>
        <Button size="md">
          <Plus size={14} weight="bold" />
          Novo usuário
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nova identidade</DialogTitle>
          <DialogDescription>
            Identidades deste diretório autenticam em equipamentos de rede. Elas não acessam o painel
            administrativo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate>
          <DialogBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Nome completo"
                htmlFor="user-name"
                error={form.formState.errors.name?.message}
                className="sm:col-span-2"
              >
                <Input
                  id="user-name"
                  autoComplete="off"
                  placeholder="Ex.: Ana Beatriz Rocha"
                  aria-invalid={Boolean(form.formState.errors.name)}
                  {...form.register("name", {
                    onChange: (event) => {
                      if (!loginTouched) {
                        form.setValue("login", slug(event.target.value), { shouldValidate: false });
                      }
                    },
                  })}
                />
              </Field>

              <Field label="Login" htmlFor="user-login" error={form.formState.errors.login?.message}>
                <Input
                  id="user-login"
                  autoComplete="off"
                  className="text-mono"
                  placeholder="ana.rocha"
                  aria-invalid={Boolean(form.formState.errors.login)}
                  {...form.register("login", { onBlur: () => setLoginTouched(true) })}
                />
              </Field>

              <Field label="E-mail" htmlFor="user-email" error={form.formState.errors.email?.message}>
                <Input
                  id="user-email"
                  type="email"
                  autoComplete="off"
                  placeholder="ana.rocha@aaa.local"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  {...form.register("email")}
                />
              </Field>

              <Field
                label="Senha RADIUS"
                htmlFor="user-password"
                hint="Copie agora. A senha não será exibida novamente. Mínimo de 14 caracteres."
                error={form.formState.errors.password?.message}
                className="sm:col-span-2"
              >
                <div className="flex gap-2">
                  <Input
                    id="user-password"
                    autoComplete="new-password"
                    className="text-mono"
                    aria-invalid={Boolean(form.formState.errors.password)}
                    {...form.register("password")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    onClick={() =>
                      form.setValue("password", generatePassword(), {
                        shouldValidate: true,
                        shouldDirty: true,
                      })
                    }
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
                label="Validade da conta"
                htmlFor="user-valid"
                hint="Em branco significa sem prazo. Contas expiradas perdem acesso automaticamente."
                error={form.formState.errors.validUntil?.message}
              >
                <Input id="user-valid" type="date" {...form.register("validUntil")} />
              </Field>

              <div className="flex flex-col justify-between gap-2 rounded-sm border border-line bg-[#0b0e11] px-3 py-2.5">
                <div>
                  <p className="text-[12px] font-medium text-muted">Exigir MFA</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-dim">Aplicado ao login no painel, se a identidade tiver permissões.</p>
                </div>
                <Switch
                  checked={mfa}
                  onCheckedChange={(checked) => form.setValue("mfa", checked)}
                  aria-label="Exigir MFA"
                  className="self-start"
                />
              </div>
            </div>

            <div>
              <p className="text-[12px] font-medium text-muted">Grupos de acesso</p>
              <p className="mt-0.5 text-[11px] text-dim">O menor privilégio comeca pela associacao correta.</p>
              <div
                className={cn(
                  "mt-2 grid max-h-[148px] gap-0.5 overflow-y-auto rounded-sm border border-line bg-[#0b0e11] p-1.5 sm:grid-cols-2",
                  form.formState.errors.groupIds && "border-danger/60",
                )}
              >
                {(groups?.items ?? []).map((group) => {
                  const checked = selectedGroups.includes(group.id);
                  return (
                    <label
                      key={group.id}
                      htmlFor={`group-${group.id}`}
                      className="flex cursor-pointer items-center gap-2 rounded-[4px] px-1.5 py-1.5 text-[12px] transition-colors duration-100 hover:bg-panel-2"
                    >
                      <Checkbox
                        id={`group-${group.id}`}
                        checked={checked}
                        onCheckedChange={(next) => {
                          const set = new Set(selectedGroups);
                          if (next) set.add(group.id);
                          else set.delete(group.id);
                          form.setValue("groupIds", [...set], { shouldValidate: true });
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate text-muted">{group.name}</span>
                      <span className="text-mono text-[10px] text-dim">{group.memberCount}</span>
                    </label>
                  );
                })}
              </div>
              {form.formState.errors.groupIds ? (
                <p className="mt-1 text-[11px] text-danger" role="alert">
                  {form.formState.errors.groupIds.message}
                </p>
              ) : null}
            </div>

            <Field
              label="Observações"
              htmlFor="user-notes"
              hint="Opcional. Visivel apenas no painel administrativo."
              error={form.formState.errors.notes?.message}
            >
              <Textarea
                id="user-notes"
                rows={2}
                placeholder="Vínculo, contrato ou contexto de acesso"
                {...form.register("notes")}
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button type="submit" loading={create.isPending}>
              Criar identidade
            </Button>
          </DialogFooter>
        </form>
        </DialogContent>
      </Dialog>

      {totpInfo ? (
        <TotpSecretDialog
          login={totpInfo.login}
          email={totpInfo.email}
          secret={totpInfo.secret}
          uri={totpInfo.uri}
          open
          onOpenChange={(next) => {
            if (!next) setTotpInfo(null);
          }}
        />
      ) : null}
    </>
  );
}
