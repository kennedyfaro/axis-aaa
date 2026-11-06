"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Eye, EyeSlash, LockKey } from "@phosphor-icons/react";
import { toast } from "sonner";
import type { LoginInput } from "@aaa/contracts";
import { loginSchema } from "@aaa/contracts";
import { Brand } from "@/components/brand";
import { OtpInput } from "@/components/auth/otp-input";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { useEnrollMfa, useHealth, useLogin, useMfa, useSession } from "@/lib/queries";
import { cn } from "@/lib/utils";

function ServiceList({ services }: { services?: { id: string; name: string; status: string }[] }) {
  if (!services) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-3 w-40" />
        ))}
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {services
        .filter((service) => ["radius", "postgres", "redis", "api"].includes(service.id))
        .map((service) => (
          <li key={service.id} className="flex items-center justify-between gap-6 text-[11.5px]">
            <span className="text-dim">{service.name}</span>
            <span
              className={cn(
                "flex items-center gap-1.5",
                service.status === "operational" ? "text-muted" : "text-warn",
              )}
            >
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
  );
}

function homeFor(user: { permissions?: string[]; selfService?: boolean } | null | undefined) {
  const permissions = user?.permissions ?? [];
  if (user?.selfService && permissions.length > 0 && permissions.every((permission) => permission.startsWith("self."))) {
    return "/me";
  }
  return "/dashboard";
}

export function LoginScreen() {
  const router = useRouter();
  const { data: health } = useHealth();
  const { data: session } = useSession();
  const login = useLogin();
  const mfa = useMfa();
  const enroll = useEnrollMfa();

  const [step, setStep] = useState<"credentials" | "mfa" | "enroll">("credentials");
  const [challengeId, setChallengeId] = useState("");
  const [email, setEmail] = useState("");
  const [enrollSecret, setEnrollSecret] = useState("");
  const [enrollUri, setEnrollUri] = useState("");
  const [code, setCode] = useState<string[]>(Array(6).fill(""));
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      router.replace(homeFor(session));
      router.refresh();
    }
  }, [session, router]);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  const onCredentials = form.handleSubmit((values) => {
    setFormError(null);
    login.mutate(values, {
      onSuccess: (data) => {
        setEmail(values.email);
        if (data.mfaEnrollmentRequired && data.challengeId) {
          setChallengeId(data.challengeId);
          setEnrollSecret(data.secret ?? "");
          setEnrollUri(data.uri ?? "");
          setCode(Array(6).fill(""));
          setStep("enroll");
          return;
        }
        if (data.mfaRequired && data.challengeId) {
          setChallengeId(data.challengeId);
          setCode(Array(6).fill(""));
          setStep("mfa");
          return;
        }
        toast.success("Sessão iniciada.");
        router.replace(homeFor(data.user));
        router.refresh();
      },
      onError: (error) => setFormError(error instanceof ApiError ? error.message : "Falha ao iniciar sessão."),
    });
  });

  const onMfa = () => {
    setFormError(null);
    mfa.mutate(
      { challengeId, code: code.join("") },
      {
        onSuccess: (data) => {
          toast.success("Sessão iniciada.");
          router.replace(homeFor(data.user));
          router.refresh();
        },
        onError: (error) => {
          setCode(Array(6).fill(""));
          setFormError(error instanceof ApiError ? error.message : "Código incorreto.");
        },
      },
    );
  };

  const onEnroll = () => {
    setFormError(null);
    enroll.mutate(
      { challengeId, code: code.join("") },
      {
        onSuccess: (data) => {
          toast.success("Segundo fator ativado. Sessão iniciada.");
          router.replace(homeFor(data.user));
          router.refresh();
        },
        onError: (error) => {
          setCode(Array(6).fill(""));
          setFormError(error instanceof ApiError ? error.message : "Código incorreto.");
        },
      },
    );
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.02fr_1fr]">
      <section className="relative hidden flex-col justify-between border-r border-line bg-[#0b0e11] p-10 lg:flex">
        <Brand />

        <div className="max-w-[420px]">
          <p className="text-[11px] font-medium uppercase tracking-[0.07em] text-dim">Plano de controle AAA</p>
          <h1 className="mt-3 text-[40px] font-semibold leading-[1.08] tracking-[-0.035em] text-fg">
            Toda autenticação deixa rastro.
          </h1>
          <p className="mt-4 max-w-[38ch] text-[13.5px] leading-6 text-muted">
            Identidades, políticas e sessões RADIUS no mesmo lugar. Cada ação administrativa
            fica registrada com autor e origem.
          </p>
          <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-[12px]">
            <dt className="text-dim">Autenticação</dt>
            <dd className="text-muted">RADIUS 3.2 com MS-CHAPv2 e NT-Password</dd>
            <dt className="text-dim">Autorização</dt>
            <dd className="text-muted">RBAC por grupo e política de sessão</dd>
            <dt className="text-dim">Auditoria</dt>
            <dd className="text-muted">Trilha imutável com retenção configurável</dd>
          </dl>
        </div>

        <div className="max-w-[320px]">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.07em] text-dim">Serviços</p>
          <ServiceList services={health?.services} />
          <p className="mt-3 text-[10px] leading-4 text-dim">
            Sondas de saúde da API e do banco. Autenticações RADIUS são reais.
          </p>
        </div>
      </section>

      <section className="flex flex-col p-5 sm:p-8">
        <div className="flex items-center justify-between lg:hidden">
          <Brand />
          <span className="text-[10px] text-dim">demonstração</span>
        </div>

        <div className="m-auto w-full max-w-[344px] py-10">
          {step === "credentials" ? (
            <>
              <p className="text-[11px] font-medium uppercase tracking-[0.07em] text-dim">Acesso administrativo</p>
              <h2 className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em] text-fg">Entrar no painel</h2>
              <p className="mt-1 text-[12.5px] leading-5 text-muted">
                Contas administrativas não autenticam em equipamentos de rede.
              </p>

              <form onSubmit={onCredentials} className="mt-6 space-y-3.5" noValidate>
                <Field label="E-mail ou login" htmlFor="email" error={form.formState.errors.email?.message}>
                  <Input
                    id="email"
                    type="text"
                    autoComplete="username"
                    placeholder="nome@empresa.com ou seu.login"
                    aria-invalid={Boolean(form.formState.errors.email)}
                    {...form.register("email")}
                  />
                </Field>

                <Field label="Senha" htmlFor="password" error={form.formState.errors.password?.message}>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Mínimo de 10 caracteres"
                      className="pr-9"
                      aria-invalid={Boolean(form.formState.errors.password)}
                      {...form.register("password")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      className="absolute right-0 top-0 grid h-8 w-8 place-items-center rounded-sm text-dim transition-colors duration-150 hover:text-fg"
                    >
                      {showPassword ? <EyeSlash size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </Field>

                {formError ? (
                  <p className="text-[11.5px] leading-4 text-danger" role="alert">
                    {formError}
                  </p>
                ) : null}

                <Button type="submit" size="lg" className="w-full" loading={login.isPending}>
                  Continuar
                  <ArrowRight size={14} />
                </Button>
              </form>

              <div className="mt-5 flex items-start gap-2 border-t border-line pt-4 text-[11px] leading-4 text-dim">
                <LockKey size={13} className="mt-px shrink-0" />
                <span>
                  Sessão em cookie httpOnly. MFA obrigatório para administradores.
                </span>
              </div>

              <div className="mt-3 rounded-sm border border-line bg-panel px-3 py-2.5 text-[11px] leading-4 text-dim">
                <span className="font-medium text-muted">Acesso restrito.</span> Use a conta criada no
                bootstrap e o código do autenticador TOTP.
              </div>
            </>
          ) : step === "mfa" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setStep("credentials");
                  setCode(Array(6).fill(""));
                  setFormError(null);
                }}
                className="mb-5 flex items-center gap-1.5 text-[11.5px] text-dim transition-colors duration-150 hover:text-fg"
              >
                <ArrowLeft size={13} />
                Voltar
              </button>

              <p className="text-[11px] font-medium uppercase tracking-[0.07em] text-dim">Segundo fator</p>
              <h2 className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em] text-fg">Verificar código</h2>
              <p className="mt-1 text-[12.5px] leading-5 text-muted">
                Informe os 6 dígitos do autenticador para <span className="text-fg">{email}</span>.
              </p>

              <div className="mt-6">
                <OtpInput value={code} onChange={setCode} disabled={mfa.isPending} />
              </div>

              {formError ? (
                <p className="mt-3 text-[11.5px] leading-4 text-danger" role="alert">
                  {formError}
                </p>
              ) : null}

              <Button
                type="button"
                size="lg"
                className="mt-4 w-full"
                loading={mfa.isPending}
                disabled={code.join("").length !== 6}
                onClick={onMfa}
              >
                Entrar
                <ArrowRight size={14} />
              </Button>

              <p className="mt-4 text-[11px] leading-4 text-dim">
                O código expira em 30 segundos. Tentativas são limitadas e o desafio expira em 5 minutos.
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setStep("credentials");
                  setCode(Array(6).fill(""));
                  setEnrollSecret("");
                  setEnrollUri("");
                  setFormError(null);
                }}
                className="mb-5 flex items-center gap-1.5 text-[11.5px] text-dim transition-colors duration-150 hover:text-fg"
              >
                <ArrowLeft size={13} />
                Voltar
              </button>

              <p className="text-[11px] font-medium uppercase tracking-[0.07em] text-dim">
                Segundo fator obrigatório
              </p>
              <h2 className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em] text-fg">
                Configurar autenticador
              </h2>
              <p className="mt-1 text-[12.5px] leading-5 text-muted">
                {enrollSecret
                  ? "Adicione a chave abaixo ao seu autenticador TOTP e informe o código gerado."
                  : `Informe o código do autenticador já configurado para ${email}.`}
              </p>

              {enrollSecret ? (
                <div className="mt-4 rounded-sm border border-line bg-panel px-3 py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-[0.07em] text-dim">
                    Chave TOTP
                  </p>
                  <code className="mt-1 block break-all font-mono text-[12px] text-fg">
                    {enrollSecret}
                  </code>
                  {enrollUri ? (
                    <p className="mt-2 break-all text-[10px] leading-4 text-dim">{enrollUri}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-5">
                <OtpInput value={code} onChange={setCode} disabled={enroll.isPending} />
              </div>

              {formError ? (
                <p className="mt-3 text-[11.5px] leading-4 text-danger" role="alert">
                  {formError}
                </p>
              ) : null}

              <Button
                type="button"
                size="lg"
                className="mt-4 w-full"
                loading={enroll.isPending}
                disabled={code.join("").length !== 6}
                onClick={onEnroll}
              >
                Ativar e entrar
                <ArrowRight size={14} />
              </Button>

              <p className="mt-4 text-[11px] leading-4 text-dim">
                O segredo é exibido apenas uma vez. Guarde-o no autenticador antes de continuar.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
