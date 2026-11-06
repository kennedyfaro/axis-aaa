"use client";

import { useDeferredValue, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  LinkSimple,
  MagnifyingGlass,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import type { IpPool } from "@aaa/contracts";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AssignIpDialog } from "@/components/pools/assign-ip-dialog";
import { CreateIpPoolDialog } from "@/components/pools/create-pool-dialog";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { EmptyState, ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/select";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { can } from "@/lib/permissions";
import {
  useDeleteIpPool,
  useIpPoolAddresses,
  useIpPools,
  useReleaseIp,
  useSession,
} from "@/lib/queries";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

function PoolUsage({ used, total }: { used: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((used / total) * 100);
  return (
    <div className="shrink-0 text-right">
      <p className="text-mono text-[11px] text-muted">
        {used}/{total}
      </p>
      <div className="mt-1 h-1 w-14 overflow-hidden rounded-full bg-panel-2">
        <div className="h-full rounded-full bg-accent/80" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function PoolsView() {
  const { data: session } = useSession();
  const canWrite = can(session, "pools.write");
  const poolsQuery = useIpPools();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [assign, setAssign] = useState<{ address?: string } | null>(null);
  const [deletePool, setDeletePool] = useState<IpPool | null>(null);
  const [status, setStatus] = useState<"all" | "free" | "used">("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [page, setPage] = useState(1);

  const pools = poolsQuery.data?.items ?? [];
  const selected = pools.find((pool) => pool.id === selectedId) ?? pools[0] ?? null;
  const addressesQuery = useIpPoolAddresses(selected?.id ?? "");
  const detail = addressesQuery.data;
  const remove = useDeleteIpPool();
  const release = useReleaseIp();

  const items = (detail?.items ?? []).filter((item) => {
    if (status !== "all" && item.status !== status) return false;
    if (!deferredQuery) return true;
    const term = deferredQuery.toLowerCase();
    return (
      item.address.includes(term) ||
      (item.user?.name.toLowerCase().includes(term) ?? false) ||
      (item.user?.login.toLowerCase().includes(term) ?? false)
    );
  });
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageItems = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const start = items.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const end = Math.min(items.length, safePage * PAGE_SIZE);
  const freeAddresses = (detail?.items ?? [])
    .filter((item) => item.status === "free")
    .map((item) => item.address);
  const freeCount = detail?.free ?? selected?.free ?? 0;

  const releaseAddress = (userId: string) => {
    if (!selected) return;
    release.mutate(
      { poolId: selected.id, userId },
      {
        onSuccess: (result) => toast.success(`IP ${result.address} liberado.`),
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Falha ao liberar o endereço."),
      },
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pools de IP"
        description="Faixas fixas para identidades dos grupos de VPN. O endereço vinculado é enviado ao NAS como Framed-IP-Address."
        actions={
          <Button onClick={() => setCreateOpen(true)} disabled={!canWrite}>
            <Plus size={14} weight="bold" />
            Novo pool
          </Button>
        }
      />

      {poolsQuery.isError ? (
        <Panel>
          <ErrorState
            title="Não foi possível carregar os pools"
            message={poolsQuery.error.message}
            onRetry={() => poolsQuery.refetch()}
          />
        </Panel>
      ) : poolsQuery.isPending ? (
        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <Panel title="Pools" flush>
            <div className="space-y-3 p-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="space-y-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-2.5 w-44" />
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Endereços" flush>
            <TableSkeleton rows={8} cols={4} />
          </Panel>
        </div>
      ) : pools.length === 0 ? (
        <Panel>
          <EmptyState
            title="Nenhum pool cadastrado"
            description="Crie uma faixa IPv4 para reservar endereços fixos às identidades de VPN."
            action={
              <Button onClick={() => setCreateOpen(true)} disabled={!canWrite}>
                <Plus size={14} weight="bold" />
                Criar pool
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <Panel title="Pools" hint={`${pools.length} faixa${pools.length === 1 ? "" : "s"}`} flush>
            <ul className="divide-y divide-line/70">
              {pools.map((pool) => {
                const active = selected?.id === pool.id;
                return (
                  <li key={pool.id} className="flex items-stretch">
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => {
                        setSelectedId(pool.id);
                        setPage(1);
                      }}
                      className={cn(
                        "flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-3 text-left transition-colors duration-100",
                        active ? "bg-panel-2" : "hover:bg-panel-2/60",
                      )}
                    >
                      <span className="min-w-0">
                        <span className={cn("block truncate text-[12.5px]", active ? "text-fg" : "text-muted")}>
                          {pool.name}
                        </span>
                        <span className="mt-0.5 block truncate text-mono text-[10px] text-dim">
                          {pool.startIp} a {pool.endIp}
                        </span>
                      </span>
                      <PoolUsage used={pool.used} total={pool.total} />
                    </button>
                    <div className="flex items-center pr-2">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Excluir ${pool.name}`}
                        title={pool.used > 0 ? "Libere os endereços antes de excluir" : "Excluir pool"}
                        disabled={!canWrite || pool.used > 0}
                        onClick={() => setDeletePool(pool)}
                      >
                        <Trash size={14} />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-line px-3 py-2.5 text-[10.5px] leading-4 text-dim">
              Cada identidade recebe um único endereço. Pools com IPs vinculados não podem ser
              excluídos.
            </p>
          </Panel>

          <Panel
            title={selected?.name ?? "Endereços"}
            hint={
              selected
                ? `${selected.startIp} a ${selected.endIp} · ${freeCount} livres de ${detail?.total ?? selected.total}`
                : undefined
            }
            flush
            action={
              <Button
                size="sm"
                disabled={!canWrite || addressesQuery.isPending || freeCount === 0}
                onClick={() => setAssign({})}
              >
                <LinkSimple size={13} />
                Vincular IP
              </Button>
            }
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
              <div className="relative min-w-[200px] flex-1 sm:max-w-[280px]">
                <MagnifyingGlass
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim"
                />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Buscar IP, nome ou login"
                  className="pl-8"
                  aria-label="Buscar endereços"
                />
              </div>
              <Segmented
                label="Filtrar endereços"
                value={status}
                onChange={(value) => {
                  setStatus(value);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "Todos" },
                  { value: "free", label: "Livres" },
                  { value: "used", label: "Em uso" },
                ]}
              />
              <span className="ml-auto text-[11px] text-dim">
                {addressesQuery.isFetching ? "Atualizando" : `${items.length} endereços`}
              </span>
            </div>

            {addressesQuery.isError ? (
              <ErrorState
                onRetry={() => addressesQuery.refetch()}
                message={addressesQuery.error.message}
              />
            ) : addressesQuery.isPending ? (
              <TableSkeleton rows={8} cols={4} />
            ) : items.length === 0 ? (
              <EmptyState
                compact
                title="Nenhum endereço neste filtro"
                description="Ajuste a busca ou o status para ver outros endereços do pool."
              />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Endereço</TH>
                    <TH>Status</TH>
                    <TH>Identidade</TH>
                    <TH className="w-24">
                      <span className="sr-only">Ações</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {pageItems.map((item) => (
                    <TR key={item.address}>
                      <TD>
                        <span className="text-mono text-[11.5px] text-fg">{item.address}</span>
                      </TD>
                      <TD>
                        <Badge tone={item.status === "used" ? "accent" : "outline"} dot>
                          {item.status === "used" ? "Em uso" : "Livre"}
                        </Badge>
                      </TD>
                      <TD>
                        {item.user ? (
                          <span className="block min-w-0">
                            <span className="block truncate text-[12px] text-fg">{item.user.name}</span>
                            <span className="block truncate text-mono text-[10.5px] text-dim">
                              {item.user.login}
                            </span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-dim">Disponível</span>
                        )}
                      </TD>
                      <TD className="text-right">
                        {item.status === "used" && item.user ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!canWrite}
                            loading={
                              release.isPending && release.variables?.userId === item.user.id
                            }
                            onClick={() => releaseAddress(item.user!.id)}
                          >
                            Liberar
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!canWrite}
                            onClick={() => setAssign({ address: item.address })}
                          >
                            Vincular
                          </Button>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2">
              <span className="text-[11px] text-dim">
                {items.length === 0 ? "Sem resultados" : `Mostrando ${start}-${end} de ${items.length}`}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={safePage <= 1 || addressesQuery.isFetching}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  aria-label="Pagina anterior"
                >
                  <ArrowLeft size={13} />
                </Button>
                <span className="min-w-10 text-center text-mono text-[11px] text-muted">
                  {safePage} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={safePage >= pageCount || addressesQuery.isFetching}
                  onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                  aria-label="Próxima pagina"
                >
                  <ArrowRight size={13} />
                </Button>
              </div>
            </div>

            <p className="border-t border-line px-4 py-2.5 text-[10.5px] leading-4 text-dim">
              O IP é enviado no Access-Accept como Framed-IP-Address. A reserva não abre sessão; o
              NAS aplica o endereço na próxima autenticação da identidade.
            </p>
          </Panel>
        </div>
      )}

      <CreateIpPoolDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(pool) => {
          setSelectedId(pool.id);
          setStatus("all");
          setQuery("");
          setPage(1);
        }}
      />

      {assign && selected ? (
        <AssignIpDialog
          pool={selected}
          open
          onOpenChange={(next) => {
            if (!next) setAssign(null);
          }}
          address={assign.address}
          freeAddresses={freeAddresses}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(deletePool)}
        onOpenChange={(open) => {
          if (!open) setDeletePool(null);
        }}
        title={deletePool ? `Excluir ${deletePool.name}?` : "Excluir pool"}
        description={
          deletePool
            ? `A faixa ${deletePool.startIp} a ${deletePool.endIp} será removida. Somente pools sem IPs vinculados podem ser excluídos.`
            : ""
        }
        confirmLabel="Excluir pool"
        loading={remove.isPending}
        onConfirm={() => {
          if (!deletePool) return;
          const removing = deletePool;
          remove.mutate(removing.id, {
            onSuccess: () => {
              toast.success(`Pool ${removing.name} excluído.`);
              if (selected?.id === removing.id) setSelectedId(null);
              setPage(1);
              setDeletePool(null);
            },
            onError: (error) =>
              toast.error(error instanceof ApiError ? error.message : "Falha ao excluir o pool."),
          });
        }}
      />
    </div>
  );
}
