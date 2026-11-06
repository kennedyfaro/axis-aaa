"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Key, PencilSimple, ShieldCheck } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { Session, UpdateSelfInput } from "@aaa/contracts";
import { updateSelfSchema } from "@aaa/contracts";
import { Avatar } from "@/components/avatar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { EmptyState, ErrorState } from "@/components/states";
import { SessionStatusBadge, UserStatusBadge } from "@/components/status-badge";
import { SelfPasswordDialog } from "@/components/me/self-password-dialog";
import { TotpSecretDialog } from "@/components/users/totp-secret-dialog";
import { TotpSetupDialog } from "@/components/users/totp-setup-dialog";
import { Badge } from "@/components/ui/badge";
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
import { Field, Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { formatDate, formatDateTime, formatDuration, relativeTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { useRevokeSelfSession, useSelfProfile, useSession, useUpdateSelfProfile } from "@/lib/queries";

export function SelfProfileView() {
  const { data, isPending, isError, error, refetch } = useSelfProfile();
  const { data: session } = useSession();
  const update = useUpdateSelfProfile();
  const revoke = useRevokeSelfSession();
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [totpSetupOpen, setTotpSetupOpen] = useState(false);
  const [totpInfo, setTotpInfo] = useState<{
    login: string;
    email: string;
    secret: string;
    uri: string;
  } | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<Session | null>(null);

  const canWrite = can(session, "self.profile.write");
  const canRevoke = can(session, "self.sessions.revoke");

  const form = useForm<UpdateSelfInput>({
    resolver: zodResolver(updateSelfSchema),
    defaultValues: { name: "", email: "", notes: "" },
    mode: "onBlur",
  });

  useEffect(() => {
    if (editOpen && data) {
      form.reset({
        name: data.user.name,
        email: data.user.email,
        notes: data.user.notes ?? "",
      });
    }
  }, [editOpen, data, form]);

  const submit = form.handleSubmit((values) => {
    update.mutate(
      { name: values.name, email: values.email, notes: values.notes ?? "" },
      {
        onSuccess: () => {
          toast.success("Perfil atualizado.");
          setEditOpen(false);
        },
        onError: (mutationError) =>
          toast.error(mutationError instanceof ApiError ? mutationError.message : "Falha ao salvar o perfil."),
      },
    );
  });

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-40" />
        <Panel>
          <div className="space-y-3">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </Panel>
      </div>
    );
  }

  if (isError) {
    return (
      <Panel>
        <ErrorState onRetry={() => refetch()} message={error.message} />
      </Panel>
    );
  }

  const { user, groups, sessions } = data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Meu perfil"
        description="Seus dados, grupos e sessões. Grupos e atributos RADIUS são definidos pelo administrador."
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setPasswordOpen(true)}>
                <Key size={14} />
                Alterar senha
              </Button>
              <Button variant="outline" onClick={() => setTotpSetupOpen(true)}>
                <ShieldCheck size={14} />
                Configurar 2FA
              </Button>
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <PencilSimple size={14} />
                Editar perfil
              </Button>
            </div>
          ) : null
        }
      />

      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={user.name} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-medium text-fg">{user.name}</p>
                <UserStatusBadge status={user.status} />
              </div>
              <p className="mt-0.5 text-mono text-[11.5px] text-dim">{user.login} / {user.email}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {groups.map((group) => (
              <Badge key={group.id} tone="neutral">
                {group.name}
              </Badge>
            ))}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="label">E-mail</p>
            <p className="mt-1 text-[12px] text-fg">{user.email}</p>
          </div>
          <div>
            <p className="label">Login</p>
            <p className="mt-1 text-mono text-[12px] text-fg">{user.login}</p>
          </div>
          <div>
            <p className="label">Validade</p>
            <p className="mt-1 text-[12px] text-fg">{formatDate(user.validUntil)}</p>
          </div>
          <div>
            <p className="label">Segundo fator</p>
            <p className="mt-1 text-[12px] text-fg">{user.mfa ? "Exigido no painel" : "Não exigido"}</p>
          </div>
        </dl>
      </Panel>

      <Panel title="Meus grupos" hint="Definidos pelo administrador" flush>
        <ul className="divide-y divide-line/70">
          {groups.map((group) => (
            <li key={group.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="text-[12.5px] text-fg">{group.name}</p>
                <p className="mt-0.5 text-[11px] text-dim">{group.description}</p>
              </div>
              <span className="text-mono text-[10px] text-dim">
                {group.permissions.filter((permission) => permission.startsWith("self.")).length} permissões próprias
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-4 py-2.5 text-[10.5px] leading-4 text-dim">
          Você pode editar seus dados de perfil, mas não pode alterar grupos, validade ou atributos
          RADIUS. Fale com um administrador para mudanças de acesso.
        </p>
      </Panel>

      <Panel title="Minhas sessões" hint="Sessões RADIUS vinculadas ao seu login" flush>
        {sessions.length === 0 ? (
          <EmptyState
            title="Nenhuma sessão registrada"
            description="Quando você autenticar em um equipamento e o NAS enviar accounting, a sessão aparece aqui."
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Equipamento</TH>
                <TH>Início</TH>
                <TH>Fim</TH>
                <TH className="hidden lg:table-cell">Duração</TH>
                <TH className="hidden xl:table-cell">IP atribuido</TH>
                <TH>Status</TH>
                <TH className="w-24">
                  <span className="sr-only">Ações</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {sessions.map((item) => (
                <TR key={item.id}>
                  <TD>
                    <span className="block text-mono text-[11.5px] text-fg">
                      {item.nasIdentifier ?? item.deviceName}
                    </span>
                    <span className="block text-mono text-[10px] text-dim">{item.nasIp}</span>
                  </TD>
                  <TD>
                    <span className="block text-[11px] text-muted">{formatDateTime(item.startedAt)}</span>
                    <span className="block text-[10px] text-dim">{relativeTime(item.startedAt)}</span>
                  </TD>
                  <TD>
                    {item.endedAt ? (
                      <span className="text-[11px] text-muted">{formatDateTime(item.endedAt)}</span>
                    ) : (
                      <span className="text-[11px] text-dim">em aberto</span>
                    )}
                  </TD>
                  <TD className="hidden lg:table-cell">
                    <span className="text-mono text-[11px] text-dim">
                      {formatDuration(item.startedAt, item.endedAt)}
                    </span>
                  </TD>
                  <TD className="hidden xl:table-cell">
                    <span className="text-mono text-[11px] text-dim">{item.assignedIp ?? "dinamico"}</span>
                  </TD>
                  <TD>
                    <SessionStatusBadge status={item.status} />
                  </TD>
                  <TD>
                    {item.status === "active" && canRevoke ? (
                      <Button variant="ghost" size="sm" onClick={() => setPendingRevoke(item)}>
                        Encerrar
                      </Button>
                    ) : (
                      <span className="text-[10px] text-dim">{item.terminateCause ?? "encerrada"}</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar meu perfil</DialogTitle>
            <DialogDescription>
              Alterações de nome, e-mail e observações. Login, grupos, validade e atributos RADIUS
              permanecem sob controle do administrador.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} noValidate>
            <DialogBody className="space-y-3">
              <Field label="Nome completo" htmlFor="self-name" error={form.formState.errors.name?.message}>
                <Input id="self-name" {...form.register("name")} />
              </Field>
              <Field label="E-mail" htmlFor="self-email" error={form.formState.errors.email?.message}>
                <Input id="self-email" type="email" {...form.register("email")} />
              </Field>
              <Field label="Observações" htmlFor="self-notes" error={form.formState.errors.notes?.message}>
                <Textarea id="self-notes" rows={3} {...form.register("notes")} />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={update.isPending}>
                Salvar perfil
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <SelfPasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />

      <TotpSetupDialog
        userId={user.id}
        login={user.login}
        endpoint="self"
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
        open={Boolean(pendingRevoke)}
        onOpenChange={(open) => {
          if (!open) setPendingRevoke(null);
        }}
        title="Encerrar esta sessão?"
        description="O painel envia um Disconnect-Request (CoA) ao NAS e encerra o accounting. Se o equipamento não suportar ou não responder, a sessão pode permanecer ativa."
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
            onError: (mutationError) =>
              toast.error(mutationError instanceof ApiError ? mutationError.message : "Falha ao encerrar a sessão."),
          });
        }}
      />
    </div>
  );
}
