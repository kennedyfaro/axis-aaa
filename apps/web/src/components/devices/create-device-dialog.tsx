"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { CreateDeviceInput } from "@aaa/contracts";
import { createDeviceSchema } from "@aaa/contracts";
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
import { Field, Input } from "@/components/ui/input";
import { DeviceSecretDialog } from "@/components/devices/device-secret-dialog";
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { useCreateDevice, useGroups } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function CreateDeviceDialog() {
  const [open, setOpen] = useState(false);
  const [secretInfo, setSecretInfo] = useState<{ name: string; secret: string } | null>(null);
  const [secretMode, setSecretMode] = useState<"generate" | "custom">("generate");
  const [showSecret, setShowSecret] = useState(false);
  const { data: groups } = useGroups();
  const create = useCreateDevice();

  const form = useForm<CreateDeviceInput>({
    resolver: zodResolver(createDeviceSchema),
    defaultValues: {
      name: "",
      description: "",
      vendor: "mikrotik",
      model: "",
      kind: "router",
      ip: "",
      nasIdentifier: "",
      site: "",
      environment: "production",
      authorizedGroupIds: [],
      secret: undefined,
    },
    mode: "onBlur",
  });

  const selected = useWatch({ control: form.control, name: "authorizedGroupIds" }) ?? [];
  const ip = useWatch({ control: form.control, name: "ip" });
  const isDefault = ip === "0.0.0.0/0";

  const onSubmit = form.handleSubmit((values) => {
    create.mutate(secretMode === "generate" ? { ...values, secret: undefined } : values, {
      onSuccess: (device) => {
        toast.success(`${device.name} cadastrado. Copie o shared secret para configurar o NAS.`);
        setSecretInfo({ name: device.name, secret: device.secret });
        setOpen(false);
        form.reset();
        setSecretMode("generate");
        setShowSecret(false);
      },
      onError: (error) => toast.error(error instanceof ApiError ? error.message : "Falha ao cadastrar equipamento."),
    });
  });

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus size={14} weight="bold" />
          Novo equipamento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Cadastrar equipamento</DialogTitle>
          <DialogDescription>
            O shared secret é exibido uma única vez após o cadastro. O equipamento entra em operação
            imediatamente, sem reiniciar o FreeRADIUS.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <DialogBody className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome do equipamento" htmlFor="device-name" error={form.formState.errors.name?.message}>
                <Input id="device-name" placeholder="edge-rt-sp01" className="text-mono" {...form.register("name")} />
              </Field>
              <Field label="Modelo" htmlFor="device-model" error={form.formState.errors.model?.message}>
                <Input id="device-model" placeholder="CCR2004-1G-12S+2XS" {...form.register("model")} />
              </Field>
              <Field
                label="Descrição"
                htmlFor="device-description"
                className="sm:col-span-2"
                error={form.formState.errors.description?.message}
              >
                <Input id="device-description" placeholder="Roteador de borda do core" {...form.register("description")} />
              </Field>
              <Field label="Fabricante" htmlFor="device-vendor">
                <Select id="device-vendor" {...form.register("vendor")}>
                  <option value="mikrotik">MikroTik</option>
                  <option value="huawei">Huawei</option>
                  <option value="nokia">Nokia</option>
                  <option value="zte">ZTE</option>
                  <option value="cisco">Cisco</option>
                  <option value="other">Outro</option>
                </Select>
              </Field>
              <Field label="Tipo" htmlFor="device-kind">
                <Select id="device-kind" {...form.register("kind")}>
                  <option value="router">Roteador</option>
                  <option value="switch">Switch</option>
                  <option value="olt">OLT</option>
                  <option value="firewall">Firewall</option>
                  <option value="wireless-controller">Controladora Wi-Fi</option>
                </Select>
              </Field>
              <Field
                label="Endereço IP"
                htmlFor="device-ip"
                error={form.formState.errors.ip?.message}
                hint="IPv4 de origem do NAS, ou 0.0.0.0/0 para o NAS padrão."
              >
                <Input id="device-ip" placeholder="10.10.0.1 ou 0.0.0.0/0" className="text-mono" {...form.register("ip")} />
              </Field>
              <Field label="NAS-Identifier" htmlFor="device-nas" error={form.formState.errors.nasIdentifier?.message}>
                <Input id="device-nas" placeholder="edge-rt-sp01" className="text-mono" {...form.register("nasIdentifier")} />
              </Field>
              <Field label="Localidade" htmlFor="device-site" error={form.formState.errors.site?.message}>
                <Input id="device-site" placeholder="São Paulo - Core" {...form.register("site")} />
              </Field>
              <Field label="Ambiente" htmlFor="device-env">
                <Select id="device-env" {...form.register("environment")}>
                  <option value="production">Produção</option>
                  <option value="staging">Homologacao</option>
                  <option value="lab">Laboratorio</option>
                </Select>
              </Field>
            </div>

            <div className="border-t border-line pt-3.5">
              <Field
                label="Shared secret"
                htmlFor="device-secret-mode"
                error={form.formState.errors.secret?.message}
                hint={
                  secretMode === "custom"
                    ? "Informe exatamente o segredo configurado no equipamento."
                    : "Um segredo aleatório de 24 caracteres será gerado e exibido uma única vez."
                }
              >
                <div className="grid gap-2 sm:grid-cols-[210px_1fr]">
                  <Select
                    id="device-secret-mode"
                    value={secretMode}
                    aria-label="Modo do shared secret"
                    onChange={(event) => {
                      const mode = event.target.value as "generate" | "custom";
                      setSecretMode(mode);
                      if (mode === "generate") {
                        form.setValue("secret", undefined);
                        form.clearErrors("secret");
                      }
                    }}
                  >
                    <option value="generate">Gerar automaticamente</option>
                    <option value="custom">Informar manualmente</option>
                  </Select>
                  {secretMode === "custom" ? (
                    <div className="flex gap-2">
                      <Input
                        id="device-secret"
                        type={showSecret ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="8 a 60 caracteres"
                        className="text-mono"
                        {...form.register("secret")}
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
                  ) : (
                    <p className="self-center rounded-sm border border-line bg-[#0b0e11] px-2.5 py-2 text-[11px] text-dim">
                      O painel gera e mostra o valor ao concluir o cadastro.
                    </p>
                  )}
                </div>
              </Field>
            </div>

            {isDefault ? (
              <div className="flex items-start gap-2 rounded-sm border border-warn/25 bg-warn/[0.06] px-3 py-2.5">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
                <p className="text-[11px] leading-4 text-warn/90">
                  NAS padrão: qualquer equipamento que use este shared secret será aceito, mesmo sem
                  cadastro individual. Os grupos abaixo passam a valer para todos eles. Use apenas em
                  rede controlada.
                </p>
              </div>
            ) : null}

            <div>
              <p className="text-[12px] font-medium text-muted">Grupos autorizados</p>
              <p className="mt-0.5 text-[11px] text-dim">Quem pode autenticar neste NAS.</p>
              <div
                className={cn(
                  "mt-2 grid max-h-[132px] gap-0.5 overflow-y-auto rounded-sm border border-line bg-[#0b0e11] p-1.5 sm:grid-cols-2",
                  form.formState.errors.authorizedGroupIds && "border-danger/60",
                )}
              >
                {(groups?.items ?? []).map((group) => {
                  const checked = selected.includes(group.id);
                  return (
                    <label
                      key={group.id}
                      htmlFor={`device-group-${group.id}`}
                      className="flex cursor-pointer items-center gap-2 rounded-[4px] px-1.5 py-1.5 text-[12px] transition-colors duration-100 hover:bg-panel-2"
                    >
                      <Checkbox
                        id={`device-group-${group.id}`}
                        checked={checked}
                        onCheckedChange={(next) => {
                          const set = new Set(selected);
                          if (next) set.add(group.id);
                          else set.delete(group.id);
                          form.setValue("authorizedGroupIds", [...set], { shouldValidate: true });
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate text-muted">{group.name}</span>
                    </label>
                  );
                })}
              </div>
              {form.formState.errors.authorizedGroupIds ? (
                <p className="mt-1 text-[11px] text-danger" role="alert">
                  {form.formState.errors.authorizedGroupIds.message}
                </p>
              ) : null}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={create.isPending}>
              Cadastrar equipamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {secretInfo ? (
      <DeviceSecretDialog
        deviceName={secretInfo.name}
        secret={secretInfo.secret}
        open
        onOpenChange={(next) => {
          if (!next) setSecretInfo(null);
        }}
      />
    ) : null}
    </>
  );
}
