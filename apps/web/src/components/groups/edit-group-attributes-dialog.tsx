"use client";

import { useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { Group } from "@aaa/contracts";
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
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { useUpdateGroup } from "@/lib/queries";

const SUGGESTIONS = [
  { attribute: "Session-Timeout", value: "28800", note: "Duração máxima da sessão em segundos" },
  { attribute: "Idle-Timeout", value: "1800", note: "Encerra após inatividade" },
  { attribute: "Acct-Interim-Interval", value: "300", note: "Frequência de Interim-Update" },
  { attribute: "Filter-Id", value: "NET-ADMIN", note: "Perfil de filtro interpretado pelo NAS" },
  { attribute: "Mikrotik-Group", value: "full", note: "VSA RouterOS. Depende do firmware." },
  { attribute: "Mikrotik-Rate-Limit", value: "10M/10M", note: "VSA RouterOS. Depende do firmware." },
  { attribute: "Cisco-AVPair", value: "shell:priv-lvl=15", note: "VSA Cisco IOS/IOS-XE." },
  { attribute: "Huawei-Exec-Privilege", value: "15", note: "VSA Huawei VRP." },
];

export function EditGroupAttributesDialog({
  group,
  open,
  onOpenChange,
}: {
  group: Group;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateGroup();
  const [rows, setRows] = useState<{ attribute: string; value: string }[]>(
    Object.entries(group.radiusAttributes ?? {}).map(([attribute, value]) => ({ attribute, value })),
  );

  const used = new Set(rows.map((row) => row.attribute.trim()));
  const radiusGroupName = group.radiusGroupName ?? (rows.length > 0 ? group.slug : null);

  const save = () => {
    const filled = rows
      .map((row) => ({ attribute: row.attribute.trim(), value: row.value.trim() }))
      .filter((row) => row.attribute && row.value);

    const names = filled.map((row) => row.attribute);
    if (new Set(names).size !== names.length) {
      toast.error("Há atributos repetidos. Remova a duplicidade antes de salvar.");
      return;
    }
    if (filled.some((row) => !/^[A-Za-z0-9._-]{1,64}$/.test(row.attribute))) {
      toast.error("Nome de atributo inválido.");
      return;
    }

    update.mutate(
      {
        id: group.id,
        input: {
          radiusAttributes: Object.fromEntries(filled.map((row) => [row.attribute, row.value])),
        },
      },
      {
        onSuccess: () => {
          toast.success("Atributos RADIUS do grupo atualizados.");
          onOpenChange(false);
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Falha ao salvar os atributos do grupo."),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Atributos RADIUS de {group.name}</DialogTitle>
          <DialogDescription>
            Valem para todas as sessões das identidades deste grupo, em qualquer equipamento. Não são
            mais definidos por NAS.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[12px] font-medium text-muted">Atributos de resposta</p>
              <p className="mt-0.5 text-[11px] leading-4 text-dim">
                Aplicados pelo FreeRADIUS em tempo real, sem restart.
                {radiusGroupName ? (
                  <>
                    {" "}
                    Grupo RADIUS: <span className="text-mono text-muted">{radiusGroupName}</span>.
                  </>
                ) : null}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRows((current) => [...current, { attribute: "", value: "" }])}
            >
              <Plus size={13} />
              Atributo
            </Button>
          </div>

          {rows.length === 0 ? (
            <p className="rounded-sm border border-line bg-[#0b0e11] px-3 py-2.5 text-[11px] leading-4 text-dim">
              Nenhum atributo. Sem atributos, o grupo apenas autoriza a identidade no RADIUS.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((row, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <Input
                    value={row.attribute}
                    onChange={(event) => {
                      const next = [...rows];
                      next[index] = { ...row, attribute: event.target.value };
                      setRows(next);
                    }}
                    placeholder="Session-Timeout"
                    aria-label={`Atributo ${index + 1}`}
                    className="min-w-[180px] flex-1 text-mono"
                  />
                  <Input
                    value={row.value}
                    onChange={(event) => {
                      const next = [...rows];
                      next[index] = { ...row, value: event.target.value };
                      setRows(next);
                    }}
                    placeholder="28800"
                    aria-label={`Valor ${index + 1}`}
                    className="min-w-[140px] flex-1 text-mono"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover atributo ${index + 1}`}
                    onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                  >
                    <Trash size={14} className="text-danger" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="label mb-2">Sugestões</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.filter((suggestion) => !used.has(suggestion.attribute)).map((suggestion) => (
                <button
                  key={suggestion.attribute}
                  type="button"
                  title={suggestion.note}
                  onClick={() =>
                    setRows((current) => [
                      ...current,
                      { attribute: suggestion.attribute, value: suggestion.value },
                    ])
                  }
                  className="rounded-xs border border-line bg-panel-2 px-2 py-1 text-[11px] text-muted transition-colors duration-150 hover:border-line-strong hover:text-fg"
                >
                  + {suggestion.attribute}
                </button>
              ))}
            </div>
          </div>

          <p className="rounded-sm border border-line bg-[#0b0e11] px-3 py-2.5 text-[11px] leading-4 text-dim">
            Atributos VSA, como os da MikroTik, Cisco e Huawei, são enviados sem validação do dicionário
            do firmware. Teste no modelo antes de aplicar em produção.
          </p>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} loading={update.isPending}>
            Salvar atributos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
