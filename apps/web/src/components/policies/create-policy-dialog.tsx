"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { CreatePolicyInput } from "@aaa/contracts";
import { createPolicySchema } from "@aaa/contracts";
import { Button } from "@/components/ui/button";
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
import { Select } from "@/components/ui/select";
import { ApiError } from "@/lib/api";
import { useCreatePolicy } from "@/lib/queries";

export function CreatePolicyDialog() {
  const [open, setOpen] = useState(false);
  const create = useCreatePolicy();

  const form = useForm<CreatePolicyInput>({
    resolver: zodResolver(createPolicySchema),
    defaultValues: {
      name: "",
      description: "",
      scope: "identity",
      action: "deny",
      priority: 100,
    },
    mode: "onBlur",
  });

  const onSubmit = form.handleSubmit((values) => {
    create.mutate(values, {
      onSuccess: (policy) => {
        toast.success(`Política "${policy.name}" criada sem condicoes.`);
        setOpen(false);
        form.reset();
      },
      onError: (error) => toast.error(error instanceof ApiError ? error.message : "Falha ao criar política."),
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus size={14} weight="bold" />
          Nova política
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova política</DialogTitle>
          <DialogDescription>
            A política nasce sem condicoes e passa a valer assim que a primeira regra for associada.
            Prioridade menor executa primeiro.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <DialogBody className="space-y-3.5">
            <Field label="Nome" htmlFor="policy-name" error={form.formState.errors.name?.message}>
              <Input id="policy-name" placeholder="Ex.: Bloquear acesso fora do horário" {...form.register("name")} />
            </Field>
            <Field label="Descrição" htmlFor="policy-description" error={form.formState.errors.description?.message}>
              <Textarea
                id="policy-description"
                rows={2}
                placeholder="O que esta regra garante e por que existe"
                {...form.register("description")}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Escopo" htmlFor="policy-scope">
                <Select id="policy-scope" {...form.register("scope")}>
                  <option value="identity">Identidade</option>
                  <option value="device">Equipamento</option>
                  <option value="session">Sessão</option>
                </Select>
              </Field>
              <Field label="Ação" htmlFor="policy-action">
                <Select id="policy-action" {...form.register("action")}>
                  <option value="allow">Permitir</option>
                  <option value="deny">Negar</option>
                  <option value="challenge">Desafiar</option>
                </Select>
              </Field>
              <Field label="Prioridade" htmlFor="policy-priority" error={form.formState.errors.priority?.message}>
                <Input
                  id="policy-priority"
                  type="number"
                  min={1}
                  max={999}
                  className="text-mono"
                  {...form.register("priority", { valueAsNumber: true })}
                />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={create.isPending}>
              Criar política
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
