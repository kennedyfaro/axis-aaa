"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  DotsThree,
  DownloadSimple,
  MagnifyingGlass,
  Prohibit,
  SignIn,
  Trash,
  UserCircle,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import type { Permission, User } from "@aaa/contracts";
import { Avatar } from "@/components/avatar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { EmptyState, ErrorState } from "@/components/states";
import { UserStatusBadge } from "@/components/status-badge";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { daysUntil, formatDate, relativeTime, USER_STATUS_LABEL } from "@/lib/format";
import { can } from "@/lib/permissions";
import { useDeleteUser, useGroups, useSession, useUserAction, useUsers } from "@/lib/queries";
import { cn } from "@/lib/utils";

function Validity({ date }: { date: string | null }) {
  const days = daysUntil(date);
  if (days === null) return <span className="text-[11px] text-dim">Sem prazo</span>;
  return (
    <span className="flex flex-col">
      <span className="text-[11.5px] text-muted">{formatDate(date)}</span>
      <span className={cn("text-[10px]", days < 0 ? "text-danger" : days <= 14 ? "text-warn" : "text-dim")}>
        {days < 0 ? "expirada" : `${days} dias restantes`}
      </span>
    </span>
  );
}

function RowActions({
  user,
  onDelete,
  permission,
}: {
  user: User;
  onDelete: (user: User) => void;
  permission: (permission: Permission) => boolean;
}) {
  const action = useUserAction();

  const run = (name: "block" | "unblock" | "revoke-sessions") => {
    action.mutate(
      { id: user.id, action: name },
      {
        onSuccess: (data) => {
          if (name === "revoke-sessions") toast.success(`${data.revoked} sessões encerradas.`);
          else if (name === "block") toast.success(`${user.login} bloqueado. ${data.revoked} sessões encerradas.`);
          else toast.success(`${user.login} desbloqueado.`);
        },
        onError: (error) => toast.error(error instanceof ApiError ? error.message : "Falha na operação."),
      },
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${user.name}`}>
          <DotsThree size={17} weight="bold" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem asChild>
          <Link href={`/users/${user.id}`}>
            <UserCircle size={14} />
            Ver detalhes
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void navigator.clipboard.writeText(user.login);
            toast.success("Login copiado.");
          }}
        >
          <Copy size={14} />
          Copiar login
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!permission("sessions.revoke")}
          onSelect={() => run("revoke-sessions")}
        >
          <ArrowsClockwise size={14} />
          Revogar sessões
        </DropdownMenuItem>
        {user.status === "blocked" ? (
          <DropdownMenuItem disabled={!permission("users.block")} onSelect={() => run("unblock")}>
            <SignIn size={14} />
            Desbloquear
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled={!permission("users.block")} onSelect={() => run("block")}>
            <Prohibit size={14} />
            Bloquear conta
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem danger disabled={!permission("users.write")} onSelect={() => onDelete(user)}>
          <Trash size={14} />
          Excluir identidade
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GroupsCell({ user, groupNames }: { user: User; groupNames: Map<string, string> }) {
  if (user.groupIds.length === 0) return <span className="text-[11px] text-dim">Sem grupo</span>;
  const visible = user.groupIds.slice(0, 2);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((id) => (
        <Badge key={id} tone="neutral">
          {groupNames.get(id) ?? id}
        </Badge>
      ))}
      {user.groupIds.length > 2 ? <span className="text-[10px] text-dim">+{user.groupIds.length - 2}</span> : null}
    </div>
  );
}

export function UsersView() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState("all");
  const [group, setGroup] = useState("all");
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);

  const { data: session } = useSession();
  const { data: groups } = useGroups();
  const users = useUsers({ query: deferredQuery, status, group, page, pageSize: 10 });
  const remove = useDeleteUser();

  const allow = (permission: Permission) => can(session, permission);
  const groupNames = new Map((groups?.items ?? []).map((item) => [item.id, item.name]));

  const total = users.data?.total ?? 0;
  const pageSize = 10;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const filtered = Boolean(deferredQuery || status !== "all" || group !== "all");

  const onConfirmDelete = () => {
    if (!pendingDelete) return;
    remove.mutate(pendingDelete.id, {
      onSuccess: () => {
        toast.success(`${pendingDelete.login} removido do diretório.`);
        setPendingDelete(null);
      },
      onError: (error) => toast.error(error instanceof ApiError ? error.message : "Não foi possível excluir."),
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Usuários"
        description="Identidades que autenticam em equipamentos de rede. Contas do painel ficam separadas deste diretório."
        actions={
          <>
            <Button variant="outline" size="md" asChild disabled={!allow("users.export")}>
              <a href="/api/v1/export/users" aria-disabled={!allow("users.export")}>
                <DownloadSimple size={14} />
                Exportar CSV
              </a>
            </Button>
            {allow("users.write") ? <CreateUserDialog /> : null}
          </>
        }
      />

      <Panel flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <div className="relative min-w-[200px] flex-1 sm:max-w-[300px]">
            <MagnifyingGlass size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-dim" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Buscar por nome, login ou e-mail"
              className="pl-8"
              aria-label="Buscar identidades"
            />
          </div>
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            aria-label="Filtrar por status"
          >
            <option value="all">Todos os status</option>
            {Object.entries(USER_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            value={group}
            onChange={(event) => {
              setGroup(event.target.value);
              setPage(1);
            }}
            aria-label="Filtrar por grupo"
          >
            <option value="all">Todos os grupos</option>
            {(groups?.items ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          {filtered ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setStatus("all");
                setGroup("all");
                setPage(1);
              }}
            >
              Limpar filtros
            </Button>
          ) : null}
          <span className="ml-auto text-[11px] text-dim">
            {users.isPending ? "Carregando" : `${total} identidade${total === 1 ? "" : "s"}`}
          </span>
        </div>

        {users.isError ? (
          <ErrorState onRetry={() => users.refetch()} message={users.error.message} />
        ) : users.isPending ? (
          <TableSkeleton rows={8} cols={6} />
        ) : (users.data?.items.length ?? 0) === 0 ? (
          <EmptyState
            title="Nenhuma identidade encontrada"
            description="Ajuste a busca ou os filtros. Se o diretório estiver vazio, crie a primeira identidade."
            action={
              filtered ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                    setGroup("all");
                    setPage(1);
                  }}
                >
                  Limpar filtros
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <THead>
                  <tr>
                    <TH>Usuário</TH>
                    <TH>Grupos</TH>
                    <TH>Status</TH>
                    <TH className="hidden lg:table-cell">MFA</TH>
                    <TH className="hidden xl:table-cell">Último acesso</TH>
                    <TH>Validade</TH>
                    <TH className="w-10">
                      <span className="sr-only">Ações</span>
                    </TH>
                  </tr>
                </THead>
                <TBody>
                  {users.data?.items.map((user) => (
                    <TR key={user.id}>
                      <TD>
                        <Link href={`/users/${user.id}`} className="group flex items-center gap-2.5">
                          <Avatar name={user.name} />
                          <span className="min-w-0">
                            <span className="block truncate text-[12.5px] font-medium text-fg group-hover:text-accent">
                              {user.name}
                            </span>
                            <span className="block truncate text-mono text-[10.5px] text-dim">{user.login}</span>
                          </span>
                        </Link>
                      </TD>
                      <TD>
                        <GroupsCell user={user} groupNames={groupNames} />
                      </TD>
                      <TD>
                        <UserStatusBadge status={user.status} />
                      </TD>
                      <TD className="hidden lg:table-cell">
                        <span className={cn("text-[11px]", user.mfa ? "text-muted" : "text-warn")}>
                          {user.mfa ? "Ativo" : "Inativo"}
                        </span>
                      </TD>
                      <TD className="hidden xl:table-cell">
                        <span className="text-mono text-[11px] text-dim">{relativeTime(user.lastAuthAt)}</span>
                      </TD>
                      <TD>
                        <Validity date={user.validUntil} />
                      </TD>
                      <TD>
                        <RowActions user={user} onDelete={setPendingDelete} permission={allow} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>

            <ul className="divide-y divide-line/70 md:hidden">
              {users.data?.items.map((user) => (
                <li key={user.id} className="px-3 py-3">
                  <div className="flex items-start gap-2.5">
                    <Link href={`/users/${user.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                      <Avatar name={user.name} />
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-medium text-fg">{user.name}</span>
                        <span className="block truncate text-mono text-[10.5px] text-dim">{user.login}</span>
                      </span>
                    </Link>
                    <RowActions user={user} onDelete={setPendingDelete} permission={allow} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <UserStatusBadge status={user.status} />
                    <GroupsCell user={user} groupNames={groupNames} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-[10.5px] text-dim">
                    <span>Acesso {relativeTime(user.lastAuthAt)}</span>
                    <Validity date={user.validUntil} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2">
          <span className="text-[11px] text-dim">
            {total === 0 ? "Sem resultados" : `Mostrando ${start}-${end} de ${total}`}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page <= 1 || users.isFetching}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              aria-label="Pagina anterior"
            >
              <ArrowLeft size={13} />
            </Button>
            <span className="min-w-10 text-center text-mono text-[11px] text-muted">
              {page} / {Math.max(1, Math.ceil(total / pageSize))}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={end >= total || users.isFetching}
              onClick={() => setPage((value) => value + 1)}
              aria-label="Próxima pagina"
            >
              <ArrowRight size={13} />
            </Button>
          </div>
        </div>
      </Panel>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={pendingDelete ? `Excluir ${pendingDelete.name}?` : "Excluir identidade"}
        description="A conta sai do diretório e perde acesso aos equipamentos. O histórico de auditoria é preservado."
        confirmLabel="Excluir identidade"
        onConfirm={onConfirmDelete}
        loading={remove.isPending}
      />
    </div>
  );
}
