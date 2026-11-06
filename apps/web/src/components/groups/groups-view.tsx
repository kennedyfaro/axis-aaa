"use client";

import { useState } from "react";
import { Check, Minus, SlidersHorizontal } from "@phosphor-icons/react";
import type { Group, Permission } from "@aaa/contracts";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EditGroupAttributesDialog } from "@/components/groups/edit-group-attributes-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PERMISSION_LABEL } from "@/lib/format";
import { useGroups } from "@/lib/queries";
import { cn } from "@/lib/utils";

const MODULE_LABEL: Record<string, string> = {
  users: "Identidades",
  groups: "Grupos",
  policies: "Políticas",
  devices: "Equipamentos",
  sessions: "Sessões",
  audit: "Auditoria",
  settings: "Configurações",
  self: "Minha conta",
};

const ALL_PERMISSIONS = Object.keys(PERMISSION_LABEL) as Permission[];

export function GroupsView() {
  const { data, isPending, isError, refetch, error } = useGroups();
  const [selectedId, setSelectedId] = useState("grp-admin");
  const [attributesGroup, setAttributesGroup] = useState<Group | null>(null);
  const groups = data?.items ?? [];
  const selected = groups.find((group) => group.id === selectedId) ?? groups[0];

  const grouped = ALL_PERMISSIONS.reduce<Record<string, Permission[]>>((acc, permission) => {
    const scope = permission.split(".")[0];
    acc[scope] = [...(acc[scope] ?? []), permission];
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <PageHeader
        title="Grupos e permissões"
        description="Cada grupo define permissões de painel e os atributos RADIUS das identidades. Os atributos valem em qualquer NAS; o vínculo com equipamentos fica em Equipamentos."
      />

      <Tabs defaultValue="groups">
        <TabsList aria-label="Visão de grupos">
          <TabsTrigger value="groups">Grupos</TabsTrigger>
          <TabsTrigger value="matrix">Matriz de permissões</TabsTrigger>
        </TabsList>

        <TabsContent value="groups" className="mt-4">
          {isError ? (
            <Panel>
              <ErrorState onRetry={() => refetch()} message={error.message} />
            </Panel>
          ) : (
            <div className="grid grid-cols-12 gap-4">
              <Panel className="col-span-12 lg:col-span-4" title="Grupos" hint={`${groups.length} perfis definidos`} flush>
                {isPending ? (
                  <div className="space-y-3 p-4">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <Skeleton className="h-3 w-32" />
                        <Skeleton className="h-3 w-8" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <ul className="divide-y divide-line/70">
                    {groups.map((group) => {
                      const active = selected?.id === group.id;
                      return (
                        <li key={group.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(group.id)}
                            aria-pressed={active}
                            className={cn(
                              "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100",
                              active ? "bg-accent/10" : "hover:bg-panel-2/50",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <p className={cn("truncate text-[12.5px]", active ? "font-medium text-fg" : "text-muted")}>
                                {group.name}
                              </p>
                              <p className="mt-0.5 text-[10px] text-dim">
                                {group.kind === "system" ? "Perfil de sistema" : "Perfil personalizado"}
                              </p>
                            </div>
                            <span className="text-mono text-[11px] text-dim">{group.memberCount}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>

              <div className="col-span-12 lg:col-span-8">
                {selected ? (
                  <Panel
                    title={selected.name}
                    hint={selected.description}
                    action={<Badge tone={selected.kind === "system" ? "accent" : "neutral"}>{selected.kind === "system" ? "Sistema" : "Personalizado"}</Badge>}
                  >
                    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-line bg-line">
                      <div className="bg-panel px-3 py-2.5">
                        <p className="label">Membros</p>
                        <p className="mt-1 text-mono text-[18px] text-fg">{selected.memberCount}</p>
                      </div>
                      <div className="bg-panel px-3 py-2.5">
                        <p className="label">Permissões</p>
                        <p className="mt-1 text-mono text-[18px] text-fg">{selected.permissions.length}</p>
                      </div>
                      <div className="bg-panel px-3 py-2.5">
                        <p className="label">Escopo</p>
                        <p className="mt-1 text-[12px] text-fg">
                          {selected.permissions.length === 0 ? "Somente rede" : "Painel"}
                        </p>
                      </div>
                    </div>

                    {selected.permissions.length === 0 ? (
                      <p className="mt-4 rounded-sm border border-line bg-[#0b0e11] px-3 py-2.5 text-[11.5px] leading-4 text-dim">
                        Este grupo não concede acesso ao painel. Ele existe para autorizar conexões de
                        equipamentos pelo RADIUS.
                      </p>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {Object.entries(grouped).map(([scope, permissions]) => {
                          const granted = permissions.filter((permission) =>
                            selected.permissions.includes(permission),
                          );
                          if (granted.length === 0) return null;
                          return (
                            <div key={scope} className="flex flex-col gap-1.5 border-b border-line/70 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4">
                              <p className="w-32 shrink-0 pt-0.5 text-[11px] text-dim">{MODULE_LABEL[scope] ?? scope}</p>
                              <div className="flex flex-wrap gap-1">
                                {granted.map((permission) => (
                                  <Badge key={permission} tone="outline">
                                    {PERMISSION_LABEL[permission]}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-5 border-t border-line pt-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-[12px] font-medium text-muted">Atributos RADIUS</p>
                          <p className="mt-0.5 text-[11px] leading-4 text-dim">
                            Aplicados a todas as sessões das identidades deste grupo, em qualquer
                            equipamento.
                          </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setAttributesGroup(selected)}>
                          <SlidersHorizontal size={13} />
                          Editar atributos
                        </Button>
                      </div>

                      {selected.radiusAttributes && Object.keys(selected.radiusAttributes).length > 0 ? (
                        <>
                          <div className="mt-3 divide-y divide-line/70 rounded-sm border border-line bg-[#0b0e11]">
                            {Object.entries(selected.radiusAttributes).map(([attribute, value]) => (
                              <div key={attribute} className="flex items-center justify-between gap-3 px-3 py-2">
                                <span className="text-mono text-[11.5px] text-fg">{attribute}</span>
                                <span
                                  className="max-w-[55%] truncate text-mono text-[11px] text-muted"
                                  title={value}
                                >
                                  {value}
                                </span>
                              </div>
                            ))}
                          </div>
                          {selected.radiusGroupName ? (
                            <p className="mt-2 text-[10.5px] text-dim">
                              Grupo no FreeRADIUS:{" "}
                              <span className="text-mono text-muted">{selected.radiusGroupName}</span>
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <p className="mt-3 rounded-sm border border-line bg-[#0b0e11] px-3 py-2.5 text-[11px] leading-4 text-dim">
                          Nenhum atributo. O grupo apenas autoriza a identidade; os atributos de
                          resposta não serão enviados ao NAS.
                        </p>
                      )}
                    </div>
                  </Panel>
                ) : null}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="matrix" className="mt-4">
          <Panel
            title="Matriz de permissões"
            hint="Validada no backend em toda operação protegida. O frontend apenas reflete o resultado."
            flush
          >
            {isPending ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-4 w-full" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-[12px]">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 border-b border-line bg-panel px-4 py-2 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-dim">
                        Permissão
                      </th>
                      {groups.map((group) => (
                        <th
                          key={group.id}
                          title={group.name}
                          className="border-b border-line px-2 py-2 text-center text-[10px] font-medium text-dim"
                        >
                          <span className="block max-w-[96px] truncate">{group.name}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/70">
                    {ALL_PERMISSIONS.map((permission) => (
                      <tr key={permission} className="hover:bg-panel-2/40">
                        <th
                          scope="row"
                          className="sticky left-0 z-10 bg-panel px-4 py-2 text-left text-[11.5px] font-normal text-muted"
                        >
                          {PERMISSION_LABEL[permission]}
                        </th>
                        {groups.map((group) => {
                          const granted = group.permissions.includes(permission);
                          return (
                            <td key={group.id} className="px-2 py-2 text-center">
                              {granted ? (
                                <Check size={13} className="mx-auto text-ok" aria-label="Concedida" />
                              ) : (
                                <Minus size={12} className="mx-auto text-line-strong" aria-label="Não concedida" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="border-t border-line px-4 py-2.5 text-[10.5px] leading-4 text-dim">
              A matriz reflete os grupos do seed local. Em produção, a autorização é aplicada no módulo
              Auth da API, nunca apenas na interface.
            </p>
          </Panel>
        </TabsContent>
      </Tabs>

      {attributesGroup ? (
        <EditGroupAttributesDialog
          key={attributesGroup.id}
          group={attributesGroup}
          open
          onOpenChange={(next) => {
            if (!next) setAttributesGroup(null);
          }}
        />
      ) : null}
    </div>
  );
}
