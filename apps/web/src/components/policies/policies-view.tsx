"use client";

import { toast } from "sonner";
import type { Policy } from "@aaa/contracts";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { EmptyState, ErrorState } from "@/components/states";
import { CreatePolicyDialog } from "@/components/policies/create-policy-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { usePolicies, useTogglePolicy } from "@/lib/queries";

const SCOPE_LABEL: Record<Policy["scope"], string> = {
  identity: "Identidade",
  device: "Equipamento",
  session: "Sessão",
};

const ACTION_TONE: Record<Policy["action"], "ok" | "danger" | "warn"> = {
  allow: "ok",
  deny: "danger",
  challenge: "warn",
};

const ACTION_LABEL: Record<Policy["action"], string> = {
  allow: "Permitir",
  deny: "Negar",
  challenge: "Desafiar",
};

function ConditionList({ policy }: { policy: Policy }) {
  if (policy.conditions.length === 0) {
    return <span className="text-[11px] text-dim">Sem condicoes</span>;
  }
  return (
    <span className="block max-w-[420px] truncate text-mono text-[10.5px] text-dim">
      {policy.conditions.map((condition) => `${condition.attribute} ${condition.operator} ${condition.value}`).join(" | ")}
    </span>
  );
}

export function PoliciesView() {
  const { data, isPending, isError, refetch, error } = usePolicies();
  const toggle = useTogglePolicy();

  const policies = data?.items ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Políticas de acesso"
        description="Catálogo declarativo de intenções. A aplicação real ocorre pelas regras de grupo, validade e equipamento no FreeRADIUS."
        actions={<CreatePolicyDialog />}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-dim">
        <span>Prioridade menor aparece primeiro; condições personalizadas ainda não são avaliadas automaticamente.</span>
        <span className="hidden h-3 w-px bg-line sm:block" aria-hidden />
        <span>As políticas são um catálogo advisory; a autorização efetiva é aplicada pelo FreeRADIUS.</span>
      </div>

      <Panel title="Regras" hint={`${policies.length} políticas no diretório`} flush>
        {isError ? (
          <ErrorState onRetry={() => refetch()} message={error.message} />
        ) : isPending ? (
          <TableSkeleton rows={6} cols={6} />
        ) : policies.length === 0 ? (
          <EmptyState
            title="Nenhuma política definida"
            description="Sem regras, o RADIUS aplica apenas a validade da conta e os grupos autorizados do NAS."
            action={<CreatePolicyDialog />}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr>
                    <TH className="w-16">Prior.</TH>
                    <TH>Política</TH>
                    <TH className="hidden lg:table-cell">Escopo</TH>
                    <TH className="hidden xl:table-cell">Condicoes</TH>
                    <TH>Ação</TH>
                    <TH className="hidden lg:table-cell">Atualizada</TH>
                    <TH className="w-16 text-right">Ativa</TH>
                  </tr>
                </THead>
                <TBody>
                  {policies.map((policy) => (
                    <TR key={policy.id}>
                      <TD>
                        <span className="text-mono text-[11px] text-dim">{String(policy.priority).padStart(3, "0")}</span>
                      </TD>
                      <TD>
                        <span className="block text-[12.5px] font-medium text-fg">{policy.name}</span>
                        <span className="mt-0.5 block max-w-[46ch] truncate text-[11px] text-dim">{policy.description}</span>
                      </TD>
                      <TD className="hidden lg:table-cell">
                        <span className="text-[11px] text-muted">{SCOPE_LABEL[policy.scope]}</span>
                      </TD>
                      <TD className="hidden xl:table-cell">
                        <ConditionList policy={policy} />
                      </TD>
                      <TD>
                        <Badge tone={ACTION_TONE[policy.action]}>{ACTION_LABEL[policy.action]}</Badge>
                      </TD>
                      <TD className="hidden lg:table-cell">
                        <span className="text-[11px] text-dim">{relativeTime(policy.updatedAt)}</span>
                      </TD>
                      <TD className="text-right">
                        <Switch
                          checked={policy.enabled}
                          disabled={toggle.isPending}
                          onCheckedChange={(enabled) => {
                            toggle.mutate(
                              { id: policy.id, enabled },
                              {
                                onSuccess: () =>
                                  toast.success(enabled ? "Política ativada." : "Política desativada."),
                                onError: (mutationError) =>
                                  toast.error(
                                    mutationError instanceof ApiError ? mutationError.message : "Falha ao alterar política.",
                                  ),
                              },
                            );
                          }}
                          aria-label={`${policy.enabled ? "Desativar" : "Ativar"} ${policy.name}`}
                        />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>

            <ul className="divide-y divide-line/70 md:hidden">
              {policies.map((policy) => (
                <li key={policy.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium text-fg">{policy.name}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-dim">{policy.description}</p>
                    </div>
                    <Switch
                      checked={policy.enabled}
                      disabled={toggle.isPending}
                      onCheckedChange={(enabled) => toggle.mutate({ id: policy.id, enabled })}
                      aria-label={`${policy.enabled ? "Desativar" : "Ativar"} ${policy.name}`}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={ACTION_TONE[policy.action]}>{ACTION_LABEL[policy.action]}</Badge>
                    <Badge tone="neutral">{SCOPE_LABEL[policy.scope]}</Badge>
                    <span className="text-mono text-[10px] text-dim">prioridade {policy.priority}</span>
                  </div>
                  <div className="mt-2">
                    <ConditionList policy={policy} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="border-t border-line px-4 py-2.5 text-[10.5px] leading-4 text-dim">
          Este catálogo não substitui as regras de autorização do FreeRADIUS. Condições
          personalizadas ainda não são avaliadas automaticamente.
        </p>
      </Panel>
    </div>
  );
}
