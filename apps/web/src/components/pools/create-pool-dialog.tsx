"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { CreateIpPoolInput, IpPool } from "@aaa/contracts";
import { createIpPoolSchema } from "@aaa/contracts";
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
import { useCreateIpPool } from "@/lib/queries";

const DEFAULTS: CreateIpPoolInput = {
  name: "",
  description: "",
  startIp: "",
  endIp: "",
};

export function CreateIpPoolDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (pool: IpPool) => void;
}) {
  const create = useCreateIpPool();
  const form = useForm<CreateIpPoolInput>({
    resolver: zodResolver(createIpPoolSchema),
    defaultValues: DEFAULTS,
    mode: "onBlur",
  });

  useEffect(() => {
    if (open) form.reset(DEFAULTS);
  }, [open, form]);

  const onSubmit = form.handleSubmit((values) => {
    create.mutate(
      { ...values, description: values.description?.trim() || undefined },
      {
        onSuccess: (pool) => {
          toast.success(`Pool ${pool.name} criado com ${pool.total} endereços.`);
          onCreated?.(pool);
          onOpenChange(false);
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Falha ao criar o pool."),
      },
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo pool de IP</DialogTitle>
          <DialogDescription>
            Defina uma faixa IPv4 exclusiva. Os endereços livres podem ser vinculados a identidades
            dos grupos de VPN.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate>
          <DialogBody className="space-y-3.5">
            <Field label="Nome" htmlFor="pool-name" error={form.formState.errors.name?.message}>
              <Input id="pool-name" placeholder="Pool VPN" {...form.register("name")} />
            </Field>
            <Field
              label="Descrição"
              htmlFor="pool-description"
              hint="Opcional. Ajuda a identificar a finalidade da faixa."
              error={form.formState.errors.description?.message}
            >
              <Input
                id="pool-description"
                placeholder="Endereços fixos das VPNs"
                {...form.register("description")}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="IP inicial"
                htmlFor="pool-start"
                error={form.formState.errors.startIp?.message}
              >
                <Input
                  id="pool-start"
                  placeholder="192.168.128.2"
                  className="text-mono"
                  autoComplete="off"
                  {...form.register("startIp")}
                />
              </Field>
              <Field label="IP final" htmlFor="pool-end" error={form.formState.errors.endIp?.message}>
                <Input
                  id="pool-end"
                  placeholder="192.168.128.69"
                  className="text-mono"
                  autoComplete="off"
                  {...form.register("endIp")}
                />
              </Field>
            </div>
            <p className="rounded-sm border border-line bg-[#0b0e11] px-3 py-2.5 text-[11px] leading-4 text-dim">
              Máximo de 1.024 endereços por pool. Faixas não podem se sobrepor. Cada IP pode estar
              vinculado a uma única identidade.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={create.isPending}>
              <Plus size={14} weight="bold" />
              Criar pool
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
