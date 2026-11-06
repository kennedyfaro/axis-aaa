"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowsClockwise,
  DotsThree,
  Key,
  Prohibit,
  ShieldCheck,
  SignIn,
  Trash,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import type { Permission } from "@aaa/contracts";
import { Avatar } from "@/components/avatar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Panel } from "@/components/panel";
import { EmptyState, ErrorState, InlineNote } from "@/components/states";
import { SessionStatusBadge, UserStatusBadge } from "@/components/status-badge";
import { EditUserDialog } from "@/components/users/edit-user-dialog";
import { ResetPasswordDialog } from "@/components/users/reset-password-dialog";
import { TotpSecretDialog } from "@/components/users/totp-secret-dialog";
import { TotpSetupDialog } from "@/components/users/totp-setup-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import {
  AUDIT_ACTION_LABEL,
  formatDate,
  formatDateTime,
  formatDuration,
  PERMISSION_LABEL,
  PROTOCOL_LABEL,
  relativeTime,
} from "@/lib/format";
import { can } from "@/lib/permissions";
import { useDeleteUser, useSession, useUser, useUserAction } from "@/lib/queries";
import { cn } from "@/lib/utils";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 py-2.5">
      <dt className="label">{label}</dt>
      <dd className="mt-1 truncate text-[12.5px] text-fg">{children}</dd>
    </div>
  );
}

export function UserDetailView({ id }: { id: string }) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [totpSetupOpen, setTotpSetupOpen] = useState(false);
  const [totpInfo, setTotpInfo] = useState<{
    login: string;
    email: string;
    secret: string;
    uri: string;
  } | null>(null);
  const { data: session } = useSession();
  const { data, isPending, isError, error, refetch } = useUser(id);
  const action = useUserAction();
  const remove = useDeleteUser();

  const allow = (permission: Permission) => can(session, permission);

  if (isPending) {
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-3 w-20" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-11 w-11" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 xl:col-span-8">
            <Panel>
              <div className="grid gap-4 sm:grid-cols-2">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <div key={index}>
                    <Skeleton className="h-2.5 w-16" />
                    <Skeleton className="mt-2 h-3.5 w-36" />
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          <div className="col-span-12 xl:col-span-4">
            <Panel>
              <TableSkeleton rows={4} cols={2} />
            </Panel>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Panel>
        <ErrorState
          title="Identidade não encontrada"
          message={error?.message ?? "O registro pode ter sido removido do diretório."}
          onRetry={() => refetch()}
        />
      </Panel>
    );
  }

  const { user, groups, sessions, audit } = data;
  const permissions = [...new Set(groups.flatMap((group) => group.permissions))];
  const hasPanelAccess = groups.some((group) => group.permissions.length > 0);
  const activeSessions = sessions.filter((item) => item.status === "active");

  const runAction = (name: "block" | "unblock" | "revoke-sessions") => {
    action.mutate(
      { id: user.id, action: name },
      {
        onSuccess: (result) => {
          const disconnected = result.disconnected ?? 0;
          if (name === "revoke-sessions") {
            toast.success(`${result.revoked} sessões encerradas, ${disconnected} desconectadas no NAS.`);
          } else if (name === "block") {
            toast.success(`Conta bloqueada. ${result.revoked} sessões encerradas, ${disconnected} desconectadas no NAS.`);
          } else {
            toast.success("Conta desbloqueada.");
          }
        },
        onError: (mutationError) =>
          toast.error(mutationError instanceof ApiError ? mutationError.message : "Falha na operação."),
      },
    );
  };

  return (
    <div className="space-y-4">
      <Link
        href="/users"
        className="inline-flex items-center gap-1.5 text-[11.5px] text-dim transition-colors duration-150 hover:text-fg"
      >
        <ArrowLeft size={13} />
        Usuários
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar name={user.name} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[22px] font-semibold tracking-[-0.025em] text-fg">{user.name}</h1>
              <UserStatusBadge status={user.status} />
            </div>
            <p className="mt-0.5 text-mono text-[11.5px] text-dim">{user.login} / {user.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {groups.map((group) => (
                <Badge key={group.id} tone="neutral">
                  {group.name}
                </Badge>
              ))}
              {user.deletedAt ? <Badge tone="danger">Removida</Badge> : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {allow("users.write") ? <EditUserDialog user={user} /> : null}
          {allow("users.block") ? (
            <Button
              variant="outline"
              size="md"
              loading={action.isPending}
              onClick={() => runAction(user.status === "blocked" ? "unblock" : "block")}
            >
              {user.status === "blocked" ? <SignIn size={14} /> : <Prohibit size={14} />}
              {user.status === "blocked" ? "Desbloquear" : "Bloquear"}
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Mais ações">
                <DotsThree size={17} weight="bold" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                disabled={!allow("sessions.revoke") || activeSessions.length === 0}
                onSelect={() => runAction("revoke-sessions")}
              >
                <ArrowsClockwise size={14} />
                Revogar {activeSessions.length} sessões
              </DropdownMenuItem>
              {hasPanelAccess ? (
                <DropdownMenuItem
                  disabled={!allow("users.write")}
                  onSelect={() => setTotpSetupOpen(true)}
                >
                  <ShieldCheck size={14} />
                  Configurar 2FA
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem disabled={!allow("users.write")} onSelect={() => setResetOpen(true)}>
                <Key size={14} />
                Redefinir credencial RADIUS
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem danger disabled={!allow("users.write")} onSelect={() => setConfirmDelete(true)}>
                <Trash size={14} />
                Excluir identidade
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 space-y-4 xl:col-span-8">
          <Panel title="Informacoes da identidade">
            <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
              <Fact label="E-mail">{user.email}</Fact>
              <Fact label="Login">
                <span className="text-mono">{user.login}</span>
              </Fact>
              <Fact label="MFA">{user.mfa ? "Obrigatório" : "Desativado"}</Fact>
              <Fact label="IP VPN">
                {user.framedIpAddress ? (
                  <span className="text-mono">{user.framedIpAddress}</span>
                ) : (
                  <span className="text-dim">Não vinculado</span>
                )}
              </Fact>
              <Fact label="Validade">{user.validUntil ? formatDate(user.validUntil) : "Sem prazo"}</Fact>
              <Fact label="Criada em">{formatDate(user.createdAt)}</Fact>
              <Fact label="Último acesso">{user.lastAuthAt ? formatDateTime(user.lastAuthAt) : "Nunca"}</Fact>
              <Fact label="Atualizada em">{relativeTime(user.updatedAt)}</Fact>
              <Fact label="Identificador">
                <span className="text-mono">{user.id}</span>
              </Fact>
              <Fact label="Origem">Diretório local</Fact>
            </dl>
            {user.notes ? (
              <div className="mt-3 border-t border-line pt-3">
                <p className="label">Observações</p>
                <p className="mt-1 max-w-[75ch] text-[12px] leading-5 text-muted">{user.notes}</p>
              </div>
            ) : null}
          </Panel>

          <Panel title="Sessões" hint="Sessões RADIUS e SSH desta identidade" flush>
            {sessions.length === 0 ? (
              <EmptyState
                compact
                title="Nenhuma sessão registrada"
                description="A primeira autenticação aceita cria uma sessão vinculada a esta identidade."
              />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Equipamento</TH>
                    <TH>Protocolo</TH>
                    <TH>Início</TH>
                    <TH>Fim</TH>
                    <TH className="hidden md:table-cell">Duração</TH>
                    <TH className="hidden lg:table-cell">IP atribuido</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {sessions.map((item) => (
                    <TR key={item.id}>
                      <TD>
                        <span className="text-mono text-[11.5px] text-fg">
                          {item.nasIdentifier ?? item.deviceName}
                        </span>
                        <span className="block text-mono text-[10px] text-dim">{item.nasIp}</span>
                      </TD>
                      <TD>
                        <span className="text-[11px] text-muted">{PROTOCOL_LABEL[item.protocol]}</span>
                      </TD>
                      <TD>
                        <span className="text-[11px] text-muted">{formatDateTime(item.startedAt)}</span>
                      </TD>
                      <TD>
                        {item.endedAt ? (
                          <span className="text-[11px] text-muted">{formatDateTime(item.endedAt)}</span>
                        ) : (
                          <span className="text-[11px] text-dim">em aberto</span>
                        )}
                      </TD>
                      <TD className="hidden md:table-cell">
                        <span className="text-mono text-[11px] text-dim">{formatDuration(item.startedAt, item.endedAt)}</span>
                      </TD>
                      <TD className="hidden lg:table-cell">
                        <span className="text-mono text-[11px] text-dim">{item.assignedIp ?? "dinamico"}</span>
                      </TD>
                      <TD>
                        <SessionStatusBadge status={item.status} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            <InlineNote>
              Sessões encerradas permanecem consultaveis conforme a retenção configurada.
            </InlineNote>
          </Panel>

          <Panel title="Atividade recente" hint="Eventos de auditoria que apontam para esta identidade" flush>
            {audit.length === 0 ? (
              <EmptyState
                compact
                title="Sem eventos para esta identidade"
                description="Alterações administrativas e autenticações aparecem aqui assim que ocorrerem."
              />
            ) : (
              <ul className="divide-y divide-line/70">
                {audit.map((event) => (
                  <li key={event.id} className="flex items-start gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-fg">
                        {AUDIT_ACTION_LABEL[event.action]}
                        <span className="text-dim"> por </span>
                        {event.actor}
                      </p>
                      <p className="mt-0.5 text-mono text-[10px] text-dim">{event.requestId}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {event.result === "failure" ? <Badge tone="danger">Falha</Badge> : null}
                      <span className="text-mono text-[10px] text-dim">{relativeTime(event.at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="col-span-12 space-y-4 xl:col-span-4">
          <Panel title="Acesso" hint={`${permissions.length} permissões efetivas`} flush>
            {groups.length === 0 ? (
              <EmptyState compact title="Sem grupo associado" description="Esta identidade não herda permissões." />
            ) : (
              <ul className="divide-y divide-line/70">
                {groups.map((group) => (
                  <li key={group.id} className="px-4 py-2.5">
                    <p className="text-[12px] text-fg">{group.name}</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-dim">{group.description}</p>
                  </li>
                ))}
              </ul>
            )}
            {permissions.length > 0 ? (
              <div className="border-t border-line px-4 py-3">
                <p className="label mb-2">Permissões</p>
                <div className="flex flex-wrap gap-1">
                  {permissions.slice(0, 8).map((permission) => (
                    <Badge key={permission} tone="outline">
                      {PERMISSION_LABEL[permission]}
                    </Badge>
                  ))}
                  {permissions.length > 8 ? (
                    <span className="self-center text-[10px] text-dim">+{permissions.length - 8}</span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </Panel>

          <Panel title="Segurança">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] text-fg">Segundo fator</p>
                  <p className="text-[11px] text-dim">{user.mfa ? "Exigido em todo acesso" : "Não exigido"}</p>
                </div>
                <Badge tone={user.mfa ? "ok" : "warn"}>{user.mfa ? "Ativo" : "Inativo"}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                <div>
                  <p className="text-[12px] text-fg">Sessões ativas</p>
                  <p className="text-[11px] text-dim">{activeSessions.length} abertas agora</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!allow("sessions.revoke") || activeSessions.length === 0}
                  loading={action.isPending}
                  onClick={() => runAction("revoke-sessions")}
                >
                  Revogar
                </Button>
              </div>
              <p className="border-t border-line pt-3 text-[10.5px] leading-4 text-dim">
                Revogar envia um Disconnect-Request (CoA) ao NAS e encerra o accounting. Se o
                equipamento não suportar CoA, a sessão é encerrada apenas no painel. A conta continua
                válida.
              </p>
            </div>
          </Panel>

          <Panel title="Zona restrita">
            <p className="text-[11.5px] leading-5 text-muted">
              A exclusão remove a identidade do diretório e encerra o acesso aos equipamentos. A
              trilha de auditoria é preservada por obrigação de retenção.
            </p>
            <Button
              variant="danger"
              size="sm"
              className="mt-3"
              disabled={!allow("users.write")}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash size={13} />
              Excluir identidade
            </Button>
          </Panel>
        </div>
      </div>

      <ResetPasswordDialog
        key={resetOpen ? "reset-open" : "reset-closed"}
        userId={user.id}
        login={user.login}
        open={resetOpen}
        onOpenChange={setResetOpen}
      />

      <TotpSetupDialog
        userId={user.id}
        login={user.login}
        open={totpSetupOpen}
        onOpenChange={setTotpSetupOpen}
        onConfigured={({ secret, uri }) =>
          setTotpInfo({ login: user.login, email: user.email, secret, uri })
        }
      />

      {totpInfo ? (
        <TotpSecretDialog
          login={totpInfo.login}
          email={totpInfo.email}
          secret={totpInfo.secret}
          uri={totpInfo.uri}
          open
          onOpenChange={(next) => {
            if (!next) setTotpInfo(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Excluir ${user.name}?`}
        description="A conta sai do diretório imediatamente. O histórico de auditoria permanece consultavel."
        confirmLabel="Excluir identidade"
        loading={remove.isPending}
        onConfirm={() => {
          remove.mutate(user.id, {
            onSuccess: () => {
              toast.success("Identidade removida do diretório.");
              router.push("/users");
            },
            onError: (mutationError) =>
              toast.error(mutationError instanceof ApiError ? mutationError.message : "Falha ao excluir."),
          });
        }}
      />

      <p className={cn("text-[10px] text-dim", user.deletedAt && "text-danger")}>
        Registro criado em {formatDate(user.createdAt)}. Alterações são atribuídas ao administrador autenticado.
      </p>
    </div>
  );
}
