"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, DownloadSimple, WarningCircle } from "@phosphor-icons/react";
import type { ServiceHealth } from "@aaa/contracts";
import { AuthChart } from "@/components/dashboard/auth-chart";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { EmptyState, ErrorState } from "@/components/states";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/select";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AUDIT_ACTION_LABEL, formatNumber, formatPercent, relativeTime, PROTOCOL_LABEL, daysUntil } from "@/lib/format";
import {
  useAudit,
  useAuthSeries,
  useDashboard,
  useHealth,
  useSessions,
  useUsers,
} from "@/lib/queries";
import { cn } from "@/lib/utils";

function Metric({
  label,
  value,
  context,
}: {
  label: string;
  value: string;
  context: React.ReactNode;
}) {
  return (
    <div className="bg-panel px-4 py-3.5">
      <p className="label">{label}</p>
      <p className="mt-1.5 text-mono text-[26px] font-medium leading-none tracking-[-0.03em] text-fg">{value}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] leading-4 text-dim">{context}</p>
    </div>
  );
}

function healthTone(status: ServiceHealth["status"]) {
  return status === "operational" ? "text-ok" : status === "degraded" ? "text-warn" : "text-danger";
}

function HealthPanel() {
  const { data, isPending, isError, refetch } = useHealth();
  const services = data?.services.filter((service) => ["radius", "postgres", "worker"].includes(service.id));

  return (
    <Panel title="Saúde dos serviços" link={{ href: "/settings", label: "Saude" }} flush>
      {isPending ? (
        <div className="space-y-3 p-4">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex items-center justify-between">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <ErrorState compact onRetry={() => refetch()} />
      ) : (
        <ul className="divide-y divide-line/70">
          {services?.map((service) => (
            <li key={service.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[12px] text-fg">{service.name}</p>
                <p className="text-mono text-[10px] text-dim">
                  {service.version}
                  {service.latencyMs !== null ? ` / ${service.latencyMs} ms` : ""}
                </p>
              </div>
              <span className={cn("flex items-center gap-1.5 text-[11px]", healthTone(service.status))}>
                <span
                  aria-hidden
                  className={cn(
                    "h-1 w-1 rounded-full",
                    service.status === "operational" ? "bg-ok" : service.status === "degraded" ? "bg-warn" : "bg-danger",
                  )}
                />
                {service.status === "operational" ? "operacional" : service.status === "degraded" ? "degradado" : "fora"}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-line px-4 py-2 text-[10px] leading-4 text-dim">
        Sondas em tempo real do banco, Redis e worker.
      </p>
    </Panel>
  );
}

function ExpiringPanel() {
  const { data, isPending } = useUsers({ query: "", status: "all", group: "all", page: 1, pageSize: 100 });
  const expiring = (data?.items ?? [])
    .filter((user) => {
      const days = daysUntil(user.validUntil);
      return user.status === "active" && days !== null && days >= 0 && days <= 14;
    })
    .sort((a, b) => (a.validUntil ?? "").localeCompare(b.validUntil ?? ""))
    .slice(0, 4);

  return (
    <Panel title="Credenciais expirando" hint="Próximos 14 dias" link={{ href: "/users", label: "Usuários" }} flush>
      {isPending ? (
        <div className="space-y-3 p-4">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-7 w-full" />
          ))}
        </div>
      ) : expiring.length === 0 ? (
        <EmptyState compact title="Nada expira nos próximos 14 dias" description="As validades do diretório estão em dia." />
      ) : (
        <ul className="divide-y divide-line/70">
          {expiring.map((user) => {
            const days = daysUntil(user.validUntil);
            return (
              <li key={user.id}>
                <Link
                  href={`/users/${user.id}`}
                  className="flex items-center gap-2.5 px-4 py-2.5 transition-colors duration-100 hover:bg-panel-2/60"
                >
                  <Avatar name={user.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-fg">{user.name}</p>
                    <p className="truncate text-mono text-[10px] text-dim">{user.login}</p>
                  </div>
                  <span className={cn("text-mono text-[11px]", days !== null && days <= 3 ? "text-warn" : "text-dim")}>
                    {days} d
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function RecentSessions() {
  const { data, isPending, isError, refetch } = useSessions({ status: "active", query: "" });
  const sessions = (data?.items ?? []).slice(0, 6);

  return (
    <Panel
      title="Sessões ativas"
      hint="RADIUS e SSH neste momento"
      link={{ href: "/sessions", label: "Ver todas" }}
      flush
    >
      {isPending ? (
        <TableSkeleton rows={5} cols={5} />
      ) : isError ? (
        <ErrorState compact onRetry={() => refetch()} />
      ) : sessions.length === 0 ? (
        <EmptyState compact title="Nenhuma sessão aberta" description="Quando uma autenticação for aceita, a sessão aparece aqui." />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Usuário</TH>
              <TH className="hidden md:table-cell">Equipamento</TH>
              <TH className="hidden sm:table-cell">Protocolo</TH>
              <TH className="hidden lg:table-cell">IP atribuido</TH>
              <TH>Início</TH>
            </tr>
          </THead>
          <TBody>
            {sessions.map((session) => (
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
                <TD className="hidden md:table-cell">
                  <span className="text-mono text-[11.5px] text-muted">
                    {session.nasIdentifier ?? session.deviceName}
                  </span>
                </TD>
                <TD className="hidden sm:table-cell">
                  <span className="text-[11px] text-muted">{PROTOCOL_LABEL[session.protocol]}</span>
                </TD>
                <TD className="hidden lg:table-cell">
                  <span className="text-mono text-[11.5px] text-dim">{session.assignedIp ?? "dinamico"}</span>
                </TD>
                <TD>
                  <span className="text-mono text-[11px] text-dim">{relativeTime(session.startedAt)}</span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Panel>
  );
}

function RecentAudit() {
  const { data, isPending, isError, refetch } = useAudit({ query: "", result: "all", period: "7d" });
  const events = (data?.items ?? []).slice(0, 7);

  return (
    <Panel title="Auditoria recente" hint="Ações administrativas dos últimos 7 dias" link={{ href: "/audit", label: "Abrir trilha" }} flush>
      {isPending ? (
        <div className="space-y-4 p-4">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="h-3 flex-1" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <ErrorState compact onRetry={() => refetch()} />
      ) : (
        <ul className="divide-y divide-line/70">
          {events.map((event) => (
            <li key={event.id} className="flex items-start gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] text-fg">
                  {AUDIT_ACTION_LABEL[event.action]}
                  <span className="text-dim"> / </span>
                  <span className="text-mono text-[11px] text-muted">{event.target}</span>
                </p>
                <p className="mt-0.5 truncate text-[10.5px] text-dim">
                  {event.actor}
                  <span className="mx-1 text-line-strong">/</span>
                  {event.requestId}
                </p>
              </div>
              <span className="shrink-0 text-mono text-[10px] text-dim">{relativeTime(event.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function DashboardView() {
  const [range, setRange] = useState<"24h" | "7d" | "30d">("24h");
  const summary = useDashboard();
  const series = useAuthSeries(range);

  const data = summary.data;
  const points = series.data?.points ?? [];
  const acceptedTotal = points.reduce((total, point) => total + point.accepted, 0);
  const rejectedTotal = points.reduce((total, point) => total + point.rejected, 0);
  const peak = points.length ? Math.max(...points.map((point) => point.accepted)) : 0;
  const average = points.length ? acceptedTotal / points.length : 0;
  const rejectionRate = acceptedTotal + rejectedTotal > 0 ? (rejectedTotal / (acceptedTotal + rejectedTotal)) * 100 : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Visão geral"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>Estado do plano de controle.</span>
            <span className="text-dim">Atualizado {data ? relativeTime(data.lastSyncAt).toLowerCase() : "agora"}.</span>
          </span>
        }
        actions={
          <>
            <Button variant="outline" size="md" asChild>
              <a href="/api/v1/export/audit?period=7d">
                <DownloadSimple size={14} />
                Exportar auditoria
              </a>
            </Button>
            <CreateUserDialog />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-line bg-panel-2 px-3 py-2 text-[11px] leading-4 text-muted">
        <WarningCircle size={13} className="shrink-0" />
        Ambiente local: dados persistidos no PostgreSQL e autenticações reais registradas pelo FreeRADIUS em <span className="text-mono">/api/v1</span>.
      </div>

      {summary.isError ? (
        <Panel>
          <ErrorState onRetry={() => summary.refetch()} message={summary.error.message} />
        </Panel>
      ) : (
        <section aria-label="Indicadores" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
          {summary.isPending || !data ? (
            <>
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="bg-panel px-4 py-3.5">
                  <Skeleton className="h-2.5 w-24" />
                  <Skeleton className="mt-2 h-7 w-16" />
                  <Skeleton className="mt-2 h-2.5 w-28" />
                </div>
              ))}
            </>
          ) : (
            <>
              <Metric
                label="Identidades ativas"
                value={formatNumber(data.activeUsers)}
                context={
                  <>
                    <span>{data.blockedUsers} bloqueadas</span>
                    <span className="text-line-strong">/</span>
                    <span>{data.pendingUsers} pendentes</span>
                  </>
                }
              />
              <Metric
                label="Sucesso de autenticação"
                value={formatPercent(data.successRate)}
                context={
                  <>
                    <span className="text-ok">{formatNumber(data.authAccepted24h)} aceitas</span>
                    <span className="text-line-strong">/</span>
                    <span>{formatNumber(data.authRejected24h)} rejeitadas</span>
                  </>
                }
              />
              <Metric
                label="Sessões ativas"
                value={formatNumber(data.activeSessions)}
                context={<span>RADIUS e SSH agora</span>}
              />
              <Metric
                label="Equipamentos online"
                value={`${data.devicesOnline}/${data.devicesTotal}`}
                context={<span>{data.devicesTotal - data.devicesOnline} não estão online</span>}
              />
            </>
          )}
        </section>
      )}

      <div className="grid grid-cols-12 gap-4">
        <Panel
          className="col-span-12 xl:col-span-8"
          title="Autenticações"
          hint={range === "24h" ? "Últimas 24 horas, por hora" : range === "7d" ? "Últimos 7 dias" : "Últimos 30 dias"}
          action={
            <Segmented
              label="Período do grafico"
              value={range}
              onChange={setRange}
              options={[
                { value: "24h", label: "24 h" },
                { value: "7d", label: "7 d" },
                { value: "30d", label: "30 d" },
              ]}
            />
          }
          flush
        >
          {series.isError ? (
            <ErrorState compact onRetry={() => series.refetch()} message={series.error.message} />
          ) : (
            <>
              <AuthChart points={points} range={range} loading={series.isPending} />
              <div className="grid grid-cols-3 gap-px border-t border-line bg-line">
                <div className="bg-panel px-4 py-2.5">
                  <p className="label">{range === "24h" ? "Pico por hora" : "Pico por dia"}</p>
                  <p className="mt-1 text-mono text-[15px] text-fg">{formatNumber(peak)}</p>
                </div>
                <div className="bg-panel px-4 py-2.5">
                  <p className="label">Média por {range === "24h" ? "hora" : "dia"}</p>
                  <p className="mt-1 text-mono text-[15px] text-fg">{average.toFixed(1).replace(".", ",")}</p>
                </div>
                <div className="bg-panel px-4 py-2.5">
                  <p className="label">Taxa de rejeição</p>
                  <p className="mt-1 text-mono text-[15px] text-fg">{formatPercent(rejectionRate)}</p>
                </div>
              </div>
            </>
          )}
        </Panel>

        <div className="col-span-12 flex flex-col gap-4 xl:col-span-4">
          <HealthPanel />
          <ExpiringPanel />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 xl:col-span-7">
          <RecentSessions />
        </div>
        <div className="col-span-12 xl:col-span-5">
          <RecentAudit />
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 pt-1 text-[11px] text-dim">
        <p>
          Sessões e eventos expiram conforme a retenção definida em Configurações.
        </p>
        <Link href="/audit" className="flex items-center gap-1 transition-colors duration-150 hover:text-fg">
          Consultar trilha completa
          <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}
