"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { Session } from "@aaa/contracts";
import { Avatar } from "@/components/avatar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { EmptyState, ErrorState } from "@/components/states";
import { SessionStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { formatBytes, formatDateTime, formatDuration, PROTOCOL_LABEL, relativeTime } from "@/lib/format";
import { useRevokeSession, useSessions } from "@/lib/queries";

export function SessionsView() {
  const [status, setStatus] = useState<"active" | "all" | "closed">("active");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [pendingRevoke, setPendingRevoke] = useState<Session | null>(null);
  const sessions = useSessions({ status, query: deferredQuery });
  const revoke = useRevokeSession();

  const items = sessions.data?.items ?? [];
  const closedCount = items.filter((session) => session.status === "closed").length;
  const radiusCount = items.filter((session) => session.protocol === "radius" && session.status === "active").length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sessões"
        description="Conexões abertas e encerradas em RADIUS e SSH. Encerrar uma sessão não bloqueia a identidade."
      />

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        <div className="bg-panel px-4 py-3">
          <p className="label">Abertas agora</p>
          <p className="mt-1 text-mono text-[22px] text-fg">{items.filter((item) => item.status === "active").length}</p>
        </div>
        <div className="bg-panel px-4 py-3">
          <p className="label">Encerradas</p>
          <p className="mt-1 text-mono text-[22px] text-fg">{closedCount}</p>
        </div>
        <div className="bg-panel px-4 py-3">
          <p className="label">RADIUS abertas</p>
          <p className="mt-1 text-mono text-[22px] text-fg">{radiusCount}</p>
        </div>
        <div className="bg-panel px-4 py-3">
          <p className="label">No filtro</p>
          <p className="mt-1 text-mono text-[22px] text-fg">{items.length}</p>
        </div>
      </div>

      <Panel flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <div className="relative min-w-[200px] flex-1 sm:max-w-[320px]">
            <MagnifyingGlass size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por usuário, equipamento ou IP"
              className="pl-8"
              aria-label="Buscar sessões"
            />
          </div>
          <Segmented
            label="Filtrar sessões"
            value={status}
            onChange={setStatus}
            options={[
              { value: "active", label: "Ativas" },
              { value: "closed", label: "Encerradas" },
              { value: "all", label: "Todas" },
            ]}
          />
          <span className="ml-auto text-[11px] text-dim">
            {sessions.isFetching ? "Atualizando" : `${items.length} sessões`}
          </span>
        </div>

        {sessions.isError ? (
          <ErrorState onRetry={() => sessions.refetch()} message={sessions.error.message} />
        ) : sessions.isPending ? (
          <TableSkeleton rows={8} cols={6} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Nenhuma sessão neste filtro"
            description="Sessões aparecem quando o RADIUS aceita uma autenticação e o NAS envia accounting."
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr>
                    <TH>Usuário</TH>
                    <TH>Equipamento</TH>
                    <TH>Protocolo</TH>
                    <TH className="hidden xl:table-cell">IP atribuido</TH>
                    <TH>Início</TH>
                    <TH>Fim</TH>
                    <TH className="hidden lg:table-cell">Duração</TH>
                    <TH className="hidden xl:table-cell">Tráfego</TH>
                    <TH>Status</TH>
                    <TH className="w-20">
                      <span className="sr-only">Ações</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {items.map((session) => (
                    <TR key={session.id}>
                      <TD>
                        <Link href={`/users/${session.userId}`} className="group flex items-center gap-2">
                          <Avatar name={session.userName} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate text-[12px] text-fg group-hover:text-accent">{session.userName}</span>
                            <span className="block truncate text-mono text-[10px] text-dim">{session.userLogin}</span>
                          </span>
                        </Link>
                      </TD>
                      <TD>
                        <span className="block text-mono text-[11.5px] text-fg">
                          {session.nasIdentifier ?? session.deviceName}
                        </span>
                        <span className="block text-mono text-[10px] text-dim">{session.nasIp}</span>
                      </TD>
                      <TD>
                        <Badge tone="outline">{PROTOCOL_LABEL[session.protocol]}</Badge>
                      </TD>
                      <TD className="hidden xl:table-cell">
                        <span className="text-mono text-[11px] text-dim">{session.assignedIp ?? "dinamico"}</span>
                      </TD>
                      <TD>
                        <span className="block text-[11px] text-muted">{formatDateTime(session.startedAt)}</span>
                        <span className="block text-[10px] text-dim">{relativeTime(session.startedAt)}</span>
                      </TD>
                      <TD>
                        {session.endedAt ? (
                          <>
                            <span className="block text-[11px] text-muted">{formatDateTime(session.endedAt)}</span>
                            <span className="block text-[10px] text-dim">{relativeTime(session.endedAt)}</span>
                          </>
                        ) : (
                          <span className="block text-[11px] text-dim">em aberto</span>
                        )}
                      </TD>
                      <TD className="hidden lg:table-cell">
                        <span className="text-mono text-[11px] text-dim">{formatDuration(session.startedAt, session.endedAt)}</span>
                      </TD>
                      <TD className="hidden xl:table-cell">
                        <span className="text-mono text-[11px] text-dim">{formatBytes(session.bytesIn + session.bytesOut)}</span>
                      </TD>
                      <TD>
                        <SessionStatusBadge status={session.status} />
                      </TD>
                      <TD>
                        {session.status === "active" ? (
                          <Button variant="ghost" size="sm" onClick={() => setPendingRevoke(session)}>
                            Encerrar
                          </Button>
                        ) : (
                          <span className="text-[10px] text-dim">{session.terminateCause ?? "encerrada"}</span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>

            <ul className="divide-y divide-line/70 md:hidden">
              {items.map((session) => (
                <li key={session.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/users/${session.userId}`} className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={session.userName} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-medium text-fg">{session.userName}</span>
                        <span className="block truncate text-mono text-[10px] text-dim">
                          {session.nasIdentifier ?? session.deviceName}
                        </span>
                      </span>
                    </Link>
                    <SessionStatusBadge status={session.status} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone="outline">{PROTOCOL_LABEL[session.protocol]}</Badge>
                    <span className="text-mono text-[10px] text-dim">{session.assignedIp ?? "dinamico"}</span>
                    <span className="text-[10px] text-dim">{formatDuration(session.startedAt, session.endedAt)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10.5px] text-dim">
                      Início {formatDateTime(session.startedAt)}
                      {session.endedAt
                        ? ` · Fim ${formatDateTime(session.endedAt)}`
                        : " · em aberto"}
                    </span>
                    {session.status === "active" ? (
                      <Button variant="outline" size="sm" onClick={() => setPendingRevoke(session)}>
                        Encerrar
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="border-t border-line px-4 py-2.5 text-[10.5px] leading-4 text-dim">
          O encerramento pelo painel envia um Disconnect-Request (CoA) ao NAS e encerra o accounting.
          Se o equipamento não suportar CoA ou não responder, a sessão é encerrada apenas no painel.
        </p>
      </Panel>

      <ConfirmDialog
        open={Boolean(pendingRevoke)}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(null);
        }}
        title={pendingRevoke ? `Encerrar sessão de ${pendingRevoke.userName}?` : "Encerrar sessão"}
        description="O painel envia um Disconnect-Request (CoA) ao NAS e encerra o accounting. Se o NAS não suportar ou não responder, a sessão pode permanecer ativa no equipamento."
        confirmLabel="Encerrar sessão"
        loading={revoke.isPending}
        onConfirm={() => {
          if (!pendingRevoke) return;
          revoke.mutate(pendingRevoke.id, {
            onSuccess: (result) => {
              if (result.disconnected) toast.success(result.message);
              else toast.warning(result.message);
              setPendingRevoke(null);
            },
            onError: (error) => toast.error(error instanceof ApiError ? error.message : "Falha ao encerrar sessão."),
          });
        }}
      />
    </div>
  );
}
