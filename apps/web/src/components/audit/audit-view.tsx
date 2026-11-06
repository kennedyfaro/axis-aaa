"use client";

import { useDeferredValue, useState } from "react";
import { CaretDown, DownloadSimple, MagnifyingGlass } from "@phosphor-icons/react";
import type { AuditEvent } from "@aaa/contracts";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { EmptyState, ErrorState } from "@/components/states";
import { ResultBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { AUDIT_ACTION_LABEL, formatDateTime, relativeTime } from "@/lib/format";
import { useAudit, useSettings } from "@/lib/queries";
import { cn } from "@/lib/utils";

function actionLabel(event: AuditEvent) {
  if (event.metadata?.sessionKind === "vpn") {
    if (event.action === "radius.session.start") return "Sessão VPN iniciada";
    if (event.action === "radius.session.stop") return "Sessão VPN encerrada";
  }
  return AUDIT_ACTION_LABEL[event.action];
}

function Metadata({ event }: { event: AuditEvent }) {
  const entries = event.metadata ? Object.entries(event.metadata) : [];
  return (
    <div className="grid gap-x-6 gap-y-1.5 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <p className="label">Request ID</p>
        <p className="mt-0.5 truncate text-mono text-[10.5px] text-muted">{event.requestId}</p>
      </div>
      <div>
        <p className="label">Perfil do ator</p>
        <p className="mt-0.5 text-[11px] text-muted">{event.actorRole}</p>
      </div>
      {entries.length === 0 ? (
        <div className="sm:col-span-2">
          <p className="label">Metadados</p>
          <p className="mt-0.5 text-[11px] text-dim">Sem metadados adicionais para este evento.</p>
        </div>
      ) : (
        entries.map(([key, value]) => (
          <div key={key}>
            <p className="label">{key}</p>
            <p className="mt-0.5 truncate text-[11px] text-muted">{String(value)}</p>
          </div>
        ))
      )}
    </div>
  );
}

export function AuditView() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [result, setResult] = useState("all");
  const [period, setPeriod] = useState("7d");
  const [limit, setLimit] = useState(25);
  const [expanded, setExpanded] = useState<string | null>(null);

  const audit = useAudit({ query: deferredQuery, result, period });
  const { data: settings } = useSettings();

  const resetPaging = () => {
    setLimit(25);
    setExpanded(null);
  };

  const events = audit.data?.items ?? [];
  const visible = events.slice(0, limit);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Auditoria"
        description="Trilha de ações administrativas e autenticações. Registros não podem ser editados nem removidos pelo painel."
        actions={
          <Button variant="outline" asChild>
            <a href={`/api/v1/export/audit?period=${period}&result=${result}${deferredQuery ? `&query=${encodeURIComponent(deferredQuery)}` : ""}`}>
              <DownloadSimple size={14} />
              Exportar CSV
            </a>
          </Button>
        }
      />

      <Panel flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <div className="relative min-w-[200px] flex-1 sm:max-w-[320px]">
            <MagnifyingGlass size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetPaging();
              }}
              placeholder="Buscar por ator, ação ou alvo"
              className="pl-8"
              aria-label="Buscar eventos"
            />
          </div>
          <Select
            value={result}
            onChange={(event) => {
              setResult(event.target.value);
              resetPaging();
            }}
            aria-label="Filtrar por resultado"
          >
            <option value="all">Todos os resultados</option>
            <option value="success">Sucesso</option>
            <option value="failure">Falha</option>
          </Select>
          <Select
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value);
              resetPaging();
            }}
            aria-label="Filtrar por período"
          >
            <option value="24h">Últimas 24 horas</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
          </Select>
          <span className="ml-auto text-[11px] text-dim">
            {audit.isFetching ? "Atualizando" : `${events.length} eventos`}
          </span>
        </div>

        {audit.isError ? (
          <ErrorState onRetry={() => audit.refetch()} message={audit.error.message} />
        ) : audit.isPending ? (
          <TableSkeleton rows={10} cols={6} />
        ) : events.length === 0 ? (
          <EmptyState
            title="Nenhum evento neste filtro"
            description="Ajuste o período ou a busca. A trilha não permite exclusão de registros individuais."
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr>
                    <TH className="w-8">
                      <span className="sr-only">Expandir</span>
                    </TH>
                    <TH>Horário</TH>
                    <TH>Ator</TH>
                    <TH>Ação</TH>
                    <TH>Alvo</TH>
                    <TH>Resultado</TH>
                    <TH className="hidden xl:table-cell">IP de origem</TH>
                  </tr>
                </THead>
                <TBody>
                  {visible.map((event) => {
                    const open = expanded === event.id;
                    return (
                      <EventRows
                        key={event.id}
                        event={event}
                        open={open}
                        onToggle={() => setExpanded(open ? null : event.id)}
                      />
                    );
                  })}
                </TBody>
              </Table>
            </div>

            <ul className="divide-y divide-line/70 md:hidden">
              {visible.map((event) => (
                <li key={event.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] text-fg">{actionLabel(event)}</p>
                      <p className="mt-0.5 truncate text-mono text-[10.5px] text-dim">{event.target}</p>
                    </div>
                    <ResultBadge result={event.result} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-[10.5px] text-dim">
                    <span className="truncate">{event.actor}</span>
                    <span className="shrink-0">{relativeTime(event.at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5">
          <p className="text-[10.5px] leading-4 text-dim">
            Retenção de {settings?.auditRetentionDays ?? 365} dias. Exportação autorizada é registrada na trilha.
          </p>
          {visible.length < events.length ? (
            <Button variant="outline" size="sm" onClick={() => setLimit((value) => value + 25)}>
              Carregar mais
            </Button>
          ) : (
            <span className="text-[10.5px] text-dim">Fim do período selecionado</span>
          )}
        </div>
      </Panel>
    </div>
  );
}

function EventRows({ event, open, onToggle }: { event: AuditEvent; open: boolean; onToggle: () => void }) {
  return (
    <>
      <TR className={cn(open && "bg-panel-2/50")}>
        <TD>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`${open ? "Recolher" : "Expandir"} evento`}
            className="grid h-6 w-6 place-items-center rounded-sm text-dim transition-colors duration-150 hover:bg-panel-3 hover:text-fg"
          >
            <CaretDown size={13} className={cn("transition-transform duration-150", open && "rotate-180")} />
          </button>
        </TD>
        <TD>
          <span className="block text-[11.5px] text-muted">{formatDateTime(event.at)}</span>
          <span className="block text-[10px] text-dim">{relativeTime(event.at)}</span>
        </TD>
        <TD>
          <span className="block text-[11.5px] text-fg">{event.actor}</span>
          <span className="block text-[10px] text-dim">{event.actorRole}</span>
        </TD>
        <TD>
          <Badge tone="outline">{actionLabel(event)}</Badge>
          <span className="mt-0.5 block text-mono text-[10px] text-dim">{event.action}</span>
        </TD>
        <TD>
          <span className="block max-w-[28ch] truncate text-mono text-[11px] text-muted">{event.target}</span>
        </TD>
        <TD>
          <ResultBadge result={event.result} />
        </TD>
        <TD className="hidden xl:table-cell">
          <span className="text-mono text-[11px] text-dim">{event.ip}</span>
        </TD>
      </TR>
      {open ? (
        <tr className="bg-[#0b0e11]">
          <td colSpan={7} className="border-b border-line">
            <Metadata event={event} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
