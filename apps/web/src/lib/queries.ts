"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AssignIpInput,
  AuditEvent,
  CreateDeviceInput,
  CreateIpPoolInput,
  CreatePolicyInput,
  CreateUserInput,
  DashboardSummary,
  Device,
  EligibleVpnUser,
  Group,
  IpPool,
  IpPoolDetail,
  LoginInput,
  LoginResponse,
  MfaInput,
  Paginated,
  Permission,
  Policy,
  ServiceHealth,
  Session,
  SessionUser,
  Settings,
  SettingsInput,
  UpdateDeviceInput,
  UpdateGroupInput,
  UpdateUserInput,
  User,
  UserDetail,
} from "@aaa/contracts";
import { apiFetch } from "@/lib/api";

export type AuthPoint = { t: string; accepted: number; rejected: number };
export type UserWithTotp = User & { totpSecret?: string; totpUri?: string };

export const queryKeys = {
  session: ["session"] as const,
  dashboard: ["dashboard"] as const,
  series: (range: string) => ["auth-series", range] as const,
  users: (params: Record<string, string | number>) => ["users", params] as const,
  user: (id: string) => ["user", id] as const,
  groups: ["groups"] as const,
  devices: ["devices"] as const,
  ipPools: ["ip-pools"] as const,
  ipPoolAddresses: (id: string) => ["ip-pool-addresses", id] as const,
  eligibleVpnUsers: ["ip-pool-eligible-users"] as const,
  policies: ["policies"] as const,
  sessions: (params: Record<string, string>) => ["sessions", params] as const,
  audit: (params: Record<string, string>) => ["audit", params] as const,
  settings: ["settings"] as const,
  health: ["health"] as const,
};

export function useSession() {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: () => apiFetch<SessionUser>("/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => apiFetch<DashboardSummary>("/dashboard/summary"),
    refetchInterval: 30_000,
  });
}

export function useAuthSeries(range: "24h" | "7d" | "30d") {
  return useQuery({
    queryKey: queryKeys.series(range),
    queryFn: () => apiFetch<{ range: string; points: AuthPoint[] }>(`/dashboard/auth-series?range=${range}`),
  });
}

export function useUsers(params: { query: string; status: string; group: string; page: number; pageSize: number }) {
  return useQuery({
    queryKey: queryKeys.users(params),
    queryFn: () => {
      const search = new URLSearchParams();
      if (params.query) search.set("query", params.query);
      if (params.status !== "all") search.set("status", params.status);
      if (params.group !== "all") search.set("group", params.group);
      search.set("page", String(params.page));
      search.set("pageSize", String(params.pageSize));
      return apiFetch<Paginated<User>>(`/users?${search.toString()}`);
    },
    placeholderData: (previous) => previous,
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: queryKeys.user(id),
    queryFn: () => apiFetch<UserDetail>(`/users/${id}`),
    enabled: Boolean(id),
  });
}

export function useGroups() {
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => apiFetch<{ items: Group[] }>("/groups"),
    staleTime: 60_000,
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateGroupInput }) =>
      apiFetch<Group>(`/groups/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.groups });
    },
  });
}

export function useDevices() {
  return useQuery({
    queryKey: queryKeys.devices,
    queryFn: () => apiFetch<{ items: Device[] }>("/devices"),
  });
}

export function useIpPools() {
  return useQuery({
    queryKey: queryKeys.ipPools,
    queryFn: () => apiFetch<{ items: IpPool[] }>("/ip-pools"),
  });
}

export function useIpPoolAddresses(id: string) {
  return useQuery({
    queryKey: queryKeys.ipPoolAddresses(id),
    queryFn: () => apiFetch<IpPoolDetail>(`/ip-pools/${id}/addresses`),
    enabled: Boolean(id),
  });
}

export function useEligibleVpnUsers() {
  return useQuery({
    queryKey: queryKeys.eligibleVpnUsers,
    queryFn: () => apiFetch<{ items: EligibleVpnUser[] }>("/ip-pools/eligible-users"),
  });
}

export function usePolicies() {
  return useQuery({
    queryKey: queryKeys.policies,
    queryFn: () => apiFetch<{ items: Policy[] }>("/policies"),
  });
}

export function useSessions(params: { status: string; query: string }) {
  return useQuery({
    queryKey: queryKeys.sessions(params),
    queryFn: () => {
      const search = new URLSearchParams();
      if (params.status !== "all") search.set("status", params.status);
      if (params.query) search.set("query", params.query);
      return apiFetch<{ items: Session[] }>(`/sessions?${search.toString()}`);
    },
    placeholderData: (previous) => previous,
  });
}

export function useAudit(params: { query: string; result: string; period: string }) {
  return useQuery({
    queryKey: queryKeys.audit(params),
    queryFn: () => {
      const search = new URLSearchParams({ period: params.period });
      if (params.query) search.set("query", params.query);
      if (params.result !== "all") search.set("result", params.result);
      return apiFetch<{ items: AuditEvent[] }>(`/audit?${search.toString()}`);
    },
    placeholderData: (previous) => previous,
  });
}

export interface SelfGroup {
  id: string;
  name: string;
  slug: string;
  description: string;
  kind: string;
  permissions: Permission[];
  memberCount: number;
}

export interface SelfProfile {
  user: User;
  groups: SelfGroup[];
  sessions: Session[];
  audit: AuditEvent[];
}

export function useSelfProfile() {
  return useQuery({
    queryKey: ["self"],
    queryFn: () => apiFetch<SelfProfile>("/me"),
  });
}

export function useChangeSelfPassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      apiFetch<{ ok: boolean }>("/me/password", { method: "POST", body: JSON.stringify(input) }),
  });
}

export function useConfigureSelfTotp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ secret }: { secret?: string }) =>
      apiFetch<{ secret: string; uri: string; code: string }>("/me/totp", {
        method: "POST",
        body: JSON.stringify(secret ? { secret } : {}),
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["self"] });
      void qc.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}

export function useUpdateSelfProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name?: string; email?: string; notes?: string }) =>
      apiFetch<User>("/me", { method: "PATCH", body: JSON.stringify(input) }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["self"] });
      void qc.invalidateQueries({ queryKey: queryKeys.session });
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useRevokeSelfSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ revoked: boolean; disconnected: boolean; message: string }>(`/me/sessions/${id}/revoke`, {
        method: "POST",
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["self"] });
      void qc.invalidateQueries({ queryKey: queryKeys.sessions({ status: "all", query: "" }) });
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => apiFetch<Settings>("/settings"),
  });
}

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () =>
      apiFetch<{
        status?: string;
        mode?: string;
        checkedAt: string;
        uptimeSeconds?: number;
        services: ServiceHealth[];
      }>("/health"),
    refetchInterval: 30_000,
  });
}

/* ------------------------------- mutations ------------------------------- */

function useInvalidateCore() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    void qc.invalidateQueries({ queryKey: ["users"] });
    void qc.invalidateQueries({ queryKey: ["user"] });
    void qc.invalidateQueries({ queryKey: queryKeys.groups });
    void qc.invalidateQueries({ queryKey: queryKeys.ipPools });
    void qc.invalidateQueries({ queryKey: queryKeys.eligibleVpnUsers });
    void qc.invalidateQueries({ queryKey: ["ip-pool-addresses"] });
    void qc.invalidateQueries({ queryKey: queryKeys.sessions({ status: "all", query: "" }) });
    void qc.invalidateQueries({ queryKey: ["sessions"] });
    void qc.invalidateQueries({ queryKey: ["audit"] });
  };
}

export function useCreateUser() {
  const invalidate = useInvalidateCore();
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      apiFetch<UserWithTotp>("/users", { method: "POST", body: JSON.stringify(input) }),
    onSettled: invalidate,
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserInput) =>
      apiFetch<UserWithTotp>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.user(id) });
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
      void qc.invalidateQueries({ queryKey: queryKeys.ipPools });
      void qc.invalidateQueries({ queryKey: queryKeys.eligibleVpnUsers });
      void qc.invalidateQueries({ queryKey: ["ip-pool-addresses"] });
    },
  });
}

export function useConfigureUserTotp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, secret }: { id: string; secret?: string }) =>
      apiFetch<{ secret: string; uri: string; code: string }>(`/users/${id}/totp`, {
        method: "POST",
        body: JSON.stringify(secret ? { secret } : {}),
      }),
    onSettled: (_, __, variables) => {
      void qc.invalidateQueries({ queryKey: queryKeys.user(variables.id) });
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDeleteUser() {
  const invalidate = useInvalidateCore();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: boolean }>(`/users/${id}`, { method: "DELETE" }),
    onSettled: invalidate,
  });
}

export function useUserAction() {
  const invalidate = useInvalidateCore();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "block" | "unblock" | "revoke-sessions" }) =>
      apiFetch<{ revoked: number; disconnected?: number; user?: User }>(
        `/users/${id}/${action}`,
        { method: "POST" },
      ),
    onSettled: invalidate,
  });
}

export function useResetPassword(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      apiFetch<{ ok: boolean }>(`/users/${id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.user(id) });
      void qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useCreateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDeviceInput) =>
      apiFetch<Device & { secret: string }>("/devices", { method: "POST", body: JSON.stringify(input) }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.devices });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useUpdateDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDeviceInput }) =>
      apiFetch<Device>(`/devices/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.devices });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useDeleteDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: boolean; activeSessions: number }>(`/devices/${id}`, { method: "DELETE" }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.devices });
      void qc.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useRotateDeviceSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, secret }: { id: string; secret?: string }) =>
      apiFetch<Device & { secret: string }>(`/devices/${id}/rotate-secret`, {
        method: "POST",
        body: JSON.stringify(secret ? { secret } : {}),
      }),
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.devices }),
  });
}

function useInvalidatePools() {
  const qc = useQueryClient();
  return (poolId?: string) => {
    void qc.invalidateQueries({ queryKey: queryKeys.ipPools });
    if (poolId) void qc.invalidateQueries({ queryKey: queryKeys.ipPoolAddresses(poolId) });
    void qc.invalidateQueries({ queryKey: queryKeys.eligibleVpnUsers });
    void qc.invalidateQueries({ queryKey: ["users"] });
    void qc.invalidateQueries({ queryKey: ["user"] });
    void qc.invalidateQueries({ queryKey: ["audit"] });
  };
}

export function useCreateIpPool() {
  const invalidate = useInvalidatePools();
  return useMutation({
    mutationFn: (input: CreateIpPoolInput) =>
      apiFetch<IpPool>("/ip-pools", { method: "POST", body: JSON.stringify(input) }),
    onSettled: () => invalidate(),
  });
}

export function useDeleteIpPool() {
  const invalidate = useInvalidatePools();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: boolean }>(`/ip-pools/${id}`, { method: "DELETE" }),
    onSettled: () => invalidate(),
  });
}

export function useAssignIp() {
  const invalidate = useInvalidatePools();
  return useMutation({
    mutationFn: ({ poolId, input }: { poolId: string; input: AssignIpInput }) =>
      apiFetch<{ address: string; user: { id: string; name: string; login: string } }>(
        `/ip-pools/${poolId}/assign`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSettled: (_, __, variables) => invalidate(variables.poolId),
  });
}

export function useReleaseIp() {
  const invalidate = useInvalidatePools();
  return useMutation({
    mutationFn: ({ poolId, userId }: { poolId: string; userId: string }) =>
      apiFetch<{ ok: boolean; address: string }>(`/ip-pools/${poolId}/assignments/${userId}`, {
        method: "DELETE",
      }),
    onSettled: (_, __, variables) => invalidate(variables.poolId),
  });
}

export function useCreatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePolicyInput) =>
      apiFetch<Policy>("/policies", { method: "POST", body: JSON.stringify(input) }),
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.policies }),
  });
}

export function useTogglePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch<Policy>(`/policies/${id}/toggle`, {
        method: "POST",
        body: JSON.stringify({ enabled }),
      }),
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.policies }),
  });
}

export function useRevokeSession() {
  const invalidate = useInvalidateCore();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{
        revoked: boolean;
        disconnected: boolean;
        coaStatus?: string;
        message: string;
        username?: string;
      }>(`/sessions/${id}/revoke`, { method: "POST" }),
    onSettled: invalidate,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<SettingsInput>) =>
      apiFetch<Settings>("/settings", { method: "PATCH", body: JSON.stringify(input) }),
    onSettled: (settings) => {
      qc.setQueryData(queryKeys.settings, settings);
      void qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: (input: LoginInput) =>
      apiFetch<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify(input) }),
  });
}

export function useMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MfaInput) =>
      apiFetch<{ user: SessionUser }>("/auth/mfa", { method: "POST", body: JSON.stringify(input) }),
    onSettled: () => {
      // O retorno do MFA não traz permissões. A sessão canônica vem de /auth/me.
      qc.removeQueries({ queryKey: queryKeys.session });
    },
  });
}

export function useEnrollMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MfaInput) =>
      apiFetch<{ user: SessionUser }>("/auth/mfa/enroll", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSettled: () => {
      qc.removeQueries({ queryKey: queryKeys.session });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" }),
    onSettled: () => {
      qc.clear();
    },
  });
}
