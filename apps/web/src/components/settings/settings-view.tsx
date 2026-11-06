"use client";

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { SettingsInput } from "@aaa/contracts";
import { settingsSchema } from "@aaa/contracts";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { useHealth, useSession, useSettings, useUpdateSettings } from "@/lib/queries";
import { cn } from "@/lib/utils";

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Recife",
  "America/Belem",
  "America/Cuiaba",
  "UTC",
];

export function SettingsView() {
  const { data, isPending, isError, error, refetch } = useSettings();
  const health = useHealth();
  const { data: session } = useSession();
  const update = useUpdateSettings();

  const form = useForm<SettingsInput>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      organization: "",
      timezone: "America/Sao_Paulo",
      sessionTimeoutMinutes: 30,
      mfaRequired: true,
      passwordMinLength: 14,
      passwordRotationDays: 90,
      maxLoginAttempts: 5,
      auditRetentionDays: 365,
      sessionRetentionDays: 90,
      notificationsEmail: true,
      notificationsWebhook: false,
      webhookUrl: null,
    },
    mode: "onBlur",
  });

  useEffect(() => {
    if (data) form.reset(data);
  }, [data, form]);

  const onSubmit = form.handleSubmit((values) => {
    update.mutate(values, {
      onSuccess: () => {
        toast.success("Configurações salvas.");
        form.reset(values);
      },
      onError: (mutationError) =>
        toast.error(mutationError instanceof ApiError ? mutationError.message : "Falha ao salvar configurações."),
    });
  });

  const mfa = useWatch({ control: form.control, name: "mfaRequired" }) ?? true;
  const email = useWatch({ control: form.control, name: "notificationsEmail" }) ?? true;
  const webhook = useWatch({ control: form.control, name: "notificationsWebhook" }) ?? false;

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-40" />
        <Panel>
          <div className="space-y-4">
            {[0, 1, 2, 3, 4].map((index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="h-8 w-full max-w-md" />
              </div>
            ))}
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Configurações"
        description="Políticas do plano de controle, retenção de dados e saude dos serviços."
        actions={
          <>
            <span className={cn("hidden text-[11px] sm:inline", form.formState.isDirty ? "text-warn" : "text-dim")}>
              {form.formState.isDirty ? "Alterações não salvas" : "Tudo salvo"}
            </span>
            <Button
              type="button"
              variant="outline"
              disabled={!form.formState.isDirty || update.isPending}
              onClick={() => data && form.reset(data)}
            >
              Descartar
            </Button>
            <Button type="submit" form="settings-form" loading={update.isPending} disabled={!form.formState.isDirty}>
              Salvar alterações
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        <form id="settings-form" onSubmit={onSubmit} noValidate className="col-span-12 xl:col-span-8">
          <Panel flush>
          <Tabs defaultValue="general">
            <div className="border-b border-line px-3 py-2">
              <TabsList aria-label="Seções de configuração">
                <TabsTrigger value="general">Geral</TabsTrigger>
                <TabsTrigger value="security">Segurança</TabsTrigger>
                <TabsTrigger value="retention">Retenção</TabsTrigger>
                <TabsTrigger value="services">Serviços</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="general" className="p-4">
              <div className="grid max-w-[760px] gap-4 sm:grid-cols-2">
                <Field
                  label="Organização"
                  htmlFor="settings-org"
                  error={form.formState.errors.organization?.message}
                  className="sm:col-span-2"
                >
                  <Input id="settings-org" {...form.register("organization")} />
                </Field>
                <Field label="Fuso horário" htmlFor="settings-tz">
                  <Select id="settings-tz" {...form.register("timezone")}>
                    {TIMEZONES.map((timezone) => (
                      <option key={timezone} value={timezone}>
                        {timezone}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Timeout de sessão (min)"
                  htmlFor="settings-timeout"
                  hint="Efetivo entre 5 e 15 minutos; valores maiores são limitados pelo backend."
                  error={form.formState.errors.sessionTimeoutMinutes?.message}
                >
                  <Input
                    id="settings-timeout"
                    type="number"
                    min={5}
                    max={1440}
                    className="text-mono"
                    {...form.register("sessionTimeoutMinutes", { valueAsNumber: true })}
                  />
                </Field>
              </div>

              <div className="mt-5 max-w-[760px] border-t border-line pt-4">
                <p className="text-[12px] font-medium text-fg">Notificações</p>
                <p className="mt-0.5 text-[11px] text-dim">Alertas de falha de autenticação e expiração de credenciais.</p>
                <div className="mt-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-4 rounded-sm border border-line bg-[#0b0e11] px-3 py-2.5">
                    <div>
                      <p className="text-[12px] text-fg">Resumo por e-mail</p>
                      <p className="text-[11px] text-dim">Canal de e-mail não configurado neste ambiente; use webhook.</p>
                    </div>
                    <Switch
                      checked={email}
                      onCheckedChange={(checked) => form.setValue("notificationsEmail", checked, { shouldDirty: true })}
                      aria-label="Resumo por e-mail"
                    />
                  </div>
                  <div className="rounded-sm border border-line bg-[#0b0e11] px-3 py-2.5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[12px] text-fg">Webhook</p>
                        <p className="text-[11px] text-dim">POST assinado para o endpoint informado.</p>
                      </div>
                      <Switch
                        checked={webhook}
                        onCheckedChange={(checked) => form.setValue("notificationsWebhook", checked, { shouldDirty: true })}
                        aria-label="Webhook"
                      />
                    </div>
                    {webhook ? (
                      <div className="mt-3">
                        <Field
                          label="URL do webhook"
                          htmlFor="settings-webhook"
                          error={form.formState.errors.webhookUrl?.message}
                        >
                          <Input
                            id="settings-webhook"
                            type="url"
                            placeholder="https://noc.empresa.com/hooks/aaa"
                            className="text-mono"
                            {...form.register("webhookUrl")}
                          />
                        </Field>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="security" className="p-4">
              <div className="grid max-w-[760px] gap-4 sm:grid-cols-2">
                <div className="flex items-start justify-between gap-4 rounded-sm border border-line bg-[#0b0e11] px-3 py-2.5 sm:col-span-2">
                  <div>
                    <p className="text-[12px] text-fg">MFA obrigatório para administradores</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-dim">
                      Aplica segundo fator a todo login do painel. Identidades de rede seguem a política
                      do grupo.
                    </p>
                  </div>
                  <Switch
                    checked={mfa}
                    onCheckedChange={(checked) => form.setValue("mfaRequired", checked, { shouldDirty: true })}
                    aria-label="MFA obrigatório"
                  />
                </div>

                <Field
                  label="Tamanho mínimo da senha"
                  htmlFor="settings-password"
                  hint="Mínimo efetivo de 14 caracteres; valores menores são elevados a 14."
                  error={form.formState.errors.passwordMinLength?.message}
                >
                  <Input
                    id="settings-password"
                    type="number"
                    min={12}
                    max={64}
                    className="text-mono"
                    {...form.register("passwordMinLength", { valueAsNumber: true })}
                  />
                </Field>
                <Field
                  label="Rotação de senha (dias)"
                  htmlFor="settings-rotation"
                  hint="Indicador operacional; a rotação ainda não bloqueia login automaticamente."
                  error={form.formState.errors.passwordRotationDays?.message}
                >
                  <Input
                    id="settings-rotation"
                    type="number"
                    min={0}
                    max={365}
                    className="text-mono"
                    {...form.register("passwordRotationDays", { valueAsNumber: true })}
                  />
                </Field>
                <Field
                  label="Tentativas antes do bloqueio"
                  htmlFor="settings-attempts"
                  hint="Aplicado por conta e por IP de origem."
                  error={form.formState.errors.maxLoginAttempts?.message}
                >
                  <Input
                    id="settings-attempts"
                    type="number"
                    min={3}
                    max={20}
                    className="text-mono"
                    {...form.register("maxLoginAttempts", { valueAsNumber: true })}
                  />
                </Field>
              </div>

              <div className="mt-5 max-w-[760px] rounded-sm border border-line bg-[#0b0e11] px-3 py-2.5">
                <p className="text-[11px] font-medium text-muted">Sessão administrativa</p>
                <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-[11px] sm:grid-cols-2">
                  <div className="flex justify-between gap-3">
                    <dt className="text-dim">Conta</dt>
                    <dd className="truncate text-fg">{session?.email ?? "-"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-dim">Perfil</dt>
                    <dd className="text-fg">{session?.role ?? "-"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-dim">Permissões</dt>
                    <dd className="text-mono text-fg">{session?.permissions.length ?? 0}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-dim">Cookie</dt>
                    <dd className="text-fg">httpOnly / SameSite Lax</dd>
                  </div>
                </dl>
              </div>
            </TabsContent>

            <TabsContent value="retention" className="p-4">
              <div className="grid max-w-[760px] gap-4 sm:grid-cols-2">
                <Field
                  label="Retenção de autenticações RADIUS (dias)"
                  htmlFor="settings-audit"
                  hint="Aplica-se ao histórico RADIUS. A trilha audit_events é imutável."
                  error={form.formState.errors.auditRetentionDays?.message}
                >
                  <Input
                    id="settings-audit"
                    type="number"
                    min={30}
                    max={3650}
                    className="text-mono"
                    {...form.register("auditRetentionDays", { valueAsNumber: true })}
                  />
                </Field>
                <Field
                  label="Retenção de sessões (dias)"
                  htmlFor="settings-sessions"
                  hint="Sessões encerradas saem deste prazo. Sessões ativas nunca expiram por retenção."
                  error={form.formState.errors.sessionRetentionDays?.message}
                >
                  <Input
                    id="settings-sessions"
                    type="number"
                    min={7}
                    max={365}
                    className="text-mono"
                    {...form.register("sessionRetentionDays", { valueAsNumber: true })}
                  />
                </Field>
              </div>
              <p className="mt-4 max-w-[760px] text-[11px] leading-5 text-dim">
                A exportação de auditoria é permitida a perfis com a permissão <span className="text-mono">audit.export</span>.
                Cada exportação gera um evento próprio, com autor, filtros aplicados e horário.
              </p>
            </TabsContent>

            <TabsContent value="services" className="p-4">
              {health.isPending ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3].map((index) => (
                    <Skeleton key={index} className="h-8 w-full" />
                  ))}
                </div>
              ) : health.isError ? (
                <ErrorState compact onRetry={() => health.refetch()} message={health.error.message} />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] border-collapse text-[12px]">
                    <thead>
                      <tr>
                        <th className="border-b border-line py-2 pr-4 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-dim">Serviço</th>
                        <th className="border-b border-line px-3 py-2 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-dim">Versão</th>
                        <th className="border-b border-line px-3 py-2 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-dim">Latência</th>
                        <th className="border-b border-line px-3 py-2 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-dim">Estado</th>
                        <th className="border-b border-line px-3 py-2 text-left text-[10px] font-medium uppercase tracking-[0.06em] text-dim">Detalhe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/70">
                      {health.data?.services.map((service) => (
                        <tr key={service.id}>
                          <td className="py-2.5 pr-4 text-fg">{service.name}</td>
                          <td className="px-3 py-2.5 text-mono text-[11px] text-dim">{service.version}</td>
                          <td className="px-3 py-2.5 text-mono text-[11px] text-dim">
                            {service.latencyMs !== null ? `${service.latencyMs} ms` : "-"}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge
                              tone={service.status === "operational" ? "ok" : service.status === "degraded" ? "warn" : "danger"}
                              dot
                            >
                              {service.status === "operational" ? "Operacional" : service.status === "degraded" ? "Degradado" : "Fora"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-[11px] text-dim">{service.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-[10.5px] text-dim">
                <span className="flex items-center gap-1.5">
                  <CheckCircle size={13} className="text-ok" />
                  Última leitura {health.data ? relativeTime(health.data.checkedAt).toLowerCase() : "indisponível"}.
                </span>
                <span>
                  Uptime do processo:{" "}
                  {health.data?.uptimeSeconds !== undefined
                    ? Math.floor(health.data.uptimeSeconds / 60)
                    : "-"}{" "}
                  min
                </span>
              </div>
            </TabsContent>
          </Tabs>
          </Panel>
        </form>

        <div className="col-span-12 space-y-4 xl:col-span-4">
          <Panel title="Ambiente" action={<Badge tone="outline">Local</Badge>}>
            <dl className="space-y-2.5 text-[12px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-dim">Organização</dt>
                <dd className="truncate text-fg">{data?.organization ?? "-"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-dim">Versão do painel</dt>
                <dd className="text-mono text-fg">0.1.0</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-dim">Versão da API</dt>
                <dd className="text-mono text-fg">
                  {health.data?.services.find((service) => service.id === "api")?.version ?? "0.1.0"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-dim">Uptime</dt>
                <dd className="text-mono text-fg">
                  {health.data?.uptimeSeconds !== undefined
                    ? `${Math.floor(health.data.uptimeSeconds / 60)} min`
                    : "-"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-dim">Retenção de auditoria</dt>
                <dd className="text-mono text-fg">{data?.auditRetentionDays ?? 365} d</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-dim">Última leitura</dt>
                <dd className="text-mono text-[11px] text-muted">
                  {health.data ? relativeTime(health.data.checkedAt) : "-"}
                </dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-line pt-3 text-[10.5px] leading-4 text-dim">
              Dados persistidos no PostgreSQL. As sondas consultam a API, o Redis e o banco em tempo real.
            </p>
          </Panel>

          <Panel title="Integrações pendentes" action={<Badge tone="warn">Backlog</Badge>}>
            <div className="space-y-3">
              <div>
                <p className="text-[12px] text-fg">Chaves de API</p>
                <p className="mt-0.5 text-[11px] leading-4 text-dim">
                  Emissão e revogação de chaves para o app Flutter ainda não estão implementadas.
                </p>
              </div>
              <div className="border-t border-line pt-3">
                <p className="text-[12px] text-fg">Webhooks assinados</p>
                <p className="mt-0.5 text-[11px] leading-4 text-dim">
                  A entrega por e-mail e webhook ainda não existe. As notificações ficam no banco e são visíveis na API.
                </p>
              </div>
              <div className="border-t border-line pt-3">
                <p className="text-[12px] text-fg">Métricas e tracing</p>
                <p className="mt-0.5 text-[11px] leading-4 text-dim">
                  Endpoints de métricas serão publicados em rede interna na fase de observabilidade.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
