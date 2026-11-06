"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Device } from "@aaa/contracts";
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
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import { useGroups, useUpdateDevice } from "@/lib/queries";

export function EditDeviceAccessDialog({
  device,
  open,
  onOpenChange,
}: {
  device: Device;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: groups } = useGroups();
  const update = useUpdateDevice();
  const [groupIds, setGroupIds] = useState<string[]>(device.authorizedGroupIds);

  const save = () => {
    if (groupIds.length === 0) {
      toast.error("Selecione ao menos um grupo autorizado.");
      return;
    }
    update.mutate(
      { id: device.id, input: { authorizedGroupIds: groupIds } },
      {
        onSuccess: () => {
          toast.success("Grupos autorizados atualizados.");
          onOpenChange(false);
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Falha ao salvar o acesso do equipamento."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Grupos autorizados de {device.name}</DialogTitle>
          <DialogDescription>
            Somente identidades que pertencem a pelo menos um destes grupos podem autenticar neste
            NAS. A regra é consultada pelo FreeRADIUS em tempo real.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div>
            <p className="text-[12px] font-medium text-muted">Grupos autorizados neste NAS</p>
            <p className="mt-0.5 text-[11px] leading-4 text-dim">
              Sem interseção entre o grupo da identidade e esta lista, o RADIUS responde
              Access-Reject.
            </p>
            <div className="mt-2 grid gap-0.5 rounded-sm border border-line bg-[#0b0e11] p-1.5 sm:grid-cols-2">
              {(groups?.items ?? []).map((group) => {
                const checked = groupIds.includes(group.id);
                return (
                  <label
                    key={group.id}
                    htmlFor={`device-access-${group.id}`}
                    className="flex cursor-pointer items-center gap-2 rounded-[4px] px-1.5 py-1.5 text-[12px] transition-colors duration-100 hover:bg-panel-2"
                  >
                    <Checkbox
                      id={`device-access-${group.id}`}
                      checked={checked}
                      onCheckedChange={(next) => {
                        const set = new Set(groupIds);
                        if (next) set.add(group.id);
                        else set.delete(group.id);
                        setGroupIds([...set]);
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-muted">{group.name}</span>
                    <span className="text-mono text-[10px] text-dim">{group.memberCount}</span>
                  </label>
                );
              })}
            </div>
            {groupIds.length === 0 ? (
              <p className="mt-1 text-[11px] text-danger" role="alert">
                Selecione ao menos um grupo.
              </p>
            ) : null}
          </div>

          {device.nasIp === "0.0.0.0/0" ? (
            <p className="rounded-sm border border-warn/25 bg-warn/[0.06] px-2.5 py-2 text-[11px] leading-4 text-warn/90">
              Este é o NAS padrão. Estes grupos valem para qualquer equipamento não cadastrado
              individualmente.
            </p>
          ) : null}

          <p className="rounded-sm border border-line bg-[#0b0e11] px-3 py-2.5 text-[11px] leading-4 text-dim">
            Atributos de resposta como Session-Timeout e Filter-Id são definidos nos grupos, em
            <span className="text-muted"> Grupos</span>, e não no equipamento.
          </p>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} loading={update.isPending} disabled={groupIds.length === 0}>
            Salvar grupos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
