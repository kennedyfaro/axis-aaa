"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PencilSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { User } from "@aaa/contracts";
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
import { useGroups, useUpdateUser } from "@/lib/queries";
import { cn } from "@/lib/utils";

const schema = createUserSchema.omit({ login: true, password: true });
type EditInput = Omit<import("@aaa/contracts").CreateUserInput, "login" | "password">;

export function EditUserDialog({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [totpInfo, setTotpInfo] = useState<{
    login: string;
    email: string;
    secret: string;
    uri: string;
  } | null>(null);
  const { data: groups } = useGroups();
  const update = useUpdateUser(user.id);

  const form = useForm<EditInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user.name,
      email: user.email,
      groupIds: user.groupIds,
      validUntil: user.validUntil ? user.validUntil.slice(0, 10) : "",
      mfa: user.mfa,
      notes: user.notes ?? "",
    },
    mode: "onBlur",
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: user.name,
        email: user.email,
        groupIds: user.groupIds,
        validUntil: user.validUntil ? user.validUntil.slice(0, 10) : "",
        mfa: user.mfa,
        notes: user.notes ?? "",
      });
    }
  }, [open, user, form]);

  const selectedGroups = useWatch({ control: form.control, name: "groupIds" }) ?? [];
  const mfa = useWatch({ control: form.control, name: "mfa" }) ?? true;

  const onSubmit = form.handleSubmit((values) => {
    update.mutate(
      {
        ...values,
        validUntil: values.validUntil ? values.validUntil : null,
        notes: values.notes ? values.notes : null,
      },
      {
        onSuccess: (data) => {
          if (data.totpSecret && data.totpUri) {
            setTotpInfo({
              login: data.login,
              email: data.email,
              secret: data.totpSecret,
              uri: data.totpUri,
            });
          }
          toast.success("Identidade atualizada.");
          setOpen(false);
        },
        onError: (error) => toast.error(error instanceof ApiError ? error.message : "Falha ao atualizar."),
      },
    );
  });

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="md">
          <PencilSimple size={14} />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Editar identidade</DialogTitle>
          <DialogDescription>
            O login <span className="text-mono text-muted">{user.login}</span> é imutável. Alterações
            entram na trilha de auditoria com o estado anterior.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate>
          <DialogBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome completo" htmlFor="edit-name" error={form.formState.errors.name?.message} className="sm:col-span-2">
                <Input id="edit-name" {...form.register("name")} />
              </Field>
              <Field label="E-mail" htmlFor="edit-email" error={form.formState.errors.email?.message}>
                <Input id="edit-email" type="email" {...form.register("email")} />
              </Field>
              <Field
                label="Validade"
                htmlFor="edit-valid"
                hint="Em branco remove o prazo de expiração."
                error={form.formState.errors.validUntil?.message}
              >
                <Input id="edit-valid" type="date" {...form.register("validUntil")} />
              </Field>
            </div>

            <div>
              <p className="text-[12px] font-medium text-muted">Grupos de acesso</p>
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
                      htmlFor={`edit-group-${group.id}`}
                      className="flex cursor-pointer items-center gap-2 rounded-[4px] px-1.5 py-1.5 text-[12px] transition-colors duration-100 hover:bg-panel-2"
                    >
                      <Checkbox
                        id={`edit-group-${group.id}`}
                        checked={checked}
                        onCheckedChange={(next) => {
                          const set = new Set(selectedGroups);
                          if (next) set.add(group.id);
                          else set.delete(group.id);
                          form.setValue("groupIds", [...set], { shouldValidate: true });
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate text-muted">{group.name}</span>
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

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-sm border border-line bg-[#0b0e11] px-3 py-2.5">
                <div>
                  <p className="text-[12px] font-medium text-muted">Exigir MFA</p>
                  <p className="text-[11px] text-dim">Quando houver acesso ao painel</p>
                </div>
                <Switch checked={mfa} onCheckedChange={(checked) => form.setValue("mfa", checked)} aria-label="Exigir MFA" />
              </div>
              <Field label="Observações" htmlFor="edit-notes" error={form.formState.errors.notes?.message}>
                <Textarea id="edit-notes" rows={2} className="min-h-[38px]" {...form.register("notes")} />
              </Field>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={update.isPending}>
              Salvar alterações
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
