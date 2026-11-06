import { z } from "zod";

/**
 * Contratos HTTP compartilhados entre web, API NestJS e futuros clientes mobile.
 * Versionados em /api/v1. Nenhum segredo ou regra de autorização vive aqui.
 */

export const USER_STATUSES = ["active", "blocked", "expired", "pending"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PERMISSIONS = [
  "users.read",
  "users.write",
  "users.block",
  "users.export",
  "groups.read",
  "groups.write",
  "policies.read",
  "policies.write",
  "devices.read",
  "devices.write",
  "pools.read",
  "pools.write",
  "sessions.read",
  "sessions.revoke",
  "audit.read",
  "audit.export",
  "settings.read",
  "settings.write",
  "self.profile.read",
  "self.profile.write",
  "self.sessions.read",
  "self.sessions.revoke",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export type GroupKind = "system" | "custom";

export interface Group {
  id: string;
  name: string;
  slug: string;
  description: string;
  kind: GroupKind;
  memberCount: number;
  permissions: Permission[];
  radiusGroupName: string | null;
  radiusAttributes: Record<string, string> | null;
}

export interface User {
  id: string;
  name: string;
  login: string;
  email: string;
  status: UserStatus;
  groupIds: string[];
  mfa: boolean;
  validFrom: string;
  validUntil: string | null;
  lastAuthAt: string | null;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
  deletedAt: string | null;
  framedIpAddress: string | null;
  ipPoolId: string | null;
}

export type DeviceVendor = "mikrotik" | "huawei" | "nokia" | "zte" | "cisco" | "other";
export type DeviceStatus = "online" | "offline" | "degraded" | "pending";
export type DeviceKind = "switch" | "router" | "olt" | "firewall" | "wireless-controller";

export interface Device {
  id: string;
  name: string;
  description: string;
  vendor: DeviceVendor;
  model: string;
  kind: DeviceKind;
  ip: string;
  nasIdentifier: string;
  nasIp: string;
  site: string;
  environment: "production" | "staging" | "lab";
  status: DeviceStatus;
  lastSeenAt: string | null;
  secretRotatedAt: string;
  authorizedGroupIds: string[];
}

export interface IpPool {
  id: string;
  name: string;
  description: string | null;
  startIp: string;
  endIp: string;
  total: number;
  used: number;
  free: number;
  createdAt: string;
  updatedAt: string;
}

export interface IpPoolAddress {
  address: string;
  status: "free" | "used";
  user: { id: string; name: string; login: string } | null;
}

export interface IpPoolDetail {
  pool: IpPool;
  items: IpPoolAddress[];
  total: number;
  used: number;
  free: number;
}

export interface EligibleVpnUser {
  id: string;
  name: string;
  login: string;
  email: string;
  groups: string[];
}

export type SessionProtocol = "radius" | "ssh";
export type SessionStatus = "active" | "closed";

export interface Session {
  id: string;
  userId: string;
  userName: string;
  userLogin: string;
  deviceId: string;
  deviceName: string;
  nasIdentifier: string | null;
  nasIp: string;
  assignedIp: string | null;
  protocol: SessionProtocol;
  startedAt: string;
  endedAt: string | null;
  status: SessionStatus;
  bytesIn: number;
  bytesOut: number;
  mfa: boolean;
  terminateCause: string | null;
}

export type AuthResult = "accepted" | "rejected";
export type AuthMethod = "pap" | "eap-ttls" | "mschapv2" | "admin-jwt";

export interface AuthEvent {
  id: string;
  at: string;
  login: string;
  userId: string | null;
  result: AuthResult;
  method: AuthMethod;
  deviceName: string;
  nasIdentifier: string | null;
  nasIp: string;
  reason: string | null;
}

export type AuditAction =
  | "user.created"
  | "user.updated"
  | "user.blocked"
  | "user.unblocked"
  | "user.deleted"
  | "user.sessions.revoked"
  | "session.revoked"
  | "group.updated"
  | "policy.created"
  | "policy.updated"
  | "device.created"
  | "device.updated"
  | "device.deleted"
  | "device.secret.rotated"
  | "pool.created"
  | "pool.deleted"
  | "pool.address.assigned"
  | "pool.address.released"
  | "settings.updated"
  | "auth.login"
  | "auth.mfa.failed"
  | "radius.auth.accept"
  | "radius.auth.reject"
  | "radius.session.start"
  | "radius.session.stop"
  | "audit.exported";

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  actorRole: string;
  action: AuditAction;
  target: string;
  result: "success" | "failure";
  ip: string;
  requestId: string;
  metadata: Record<string, string | number | boolean> | null;
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  scope: "identity" | "device" | "session";
  conditions: { attribute: string; operator: string; value: string }[];
  action: "allow" | "deny" | "challenge";
  priority: number;
  enabled: boolean;
  updatedAt: string;
}

export interface ServiceHealth {
  id: string;
  name: string;
  status: "operational" | "degraded" | "down";
  latencyMs?: number | null;
  version?: string;
  detail?: string;
}

export interface AuthPoint {
  t: string;
  accepted: number;
  rejected: number;
}

export interface DashboardSummary {
  activeUsers: number;
  blockedUsers: number;
  pendingUsers: number;
  authAccepted24h: number;
  authRejected24h: number;
  successRate: number;
  activeSessions: number;
  devicesOnline: number;
  devicesTotal: number;
  mfaCoverage: number;
  expiringSoon: number;
  lastSyncAt: string;
}

export interface Settings {
  organization: string;
  timezone: string;
  sessionTimeoutMinutes: number;
  mfaRequired: boolean;
  passwordMinLength: number;
  passwordRotationDays: number;
  maxLoginAttempts: number;
  auditRetentionDays: number;
  sessionRetentionDays: number;
  notificationsEmail: boolean;
  notificationsWebhook: boolean;
  webhookUrl: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UserDetail {
  user: User;
  groups: Group[];
  sessions: Session[];
  audit: AuditEvent[];
}

export interface LoginResponse {
  mfaRequired: boolean;
  mfaEnrollmentRequired?: boolean;
  challengeId: string | null;
  secret?: string;
  uri?: string;
  user: { name: string; email: string; role: string; permissions?: Permission[]; selfService?: boolean } | null;
}

export interface SessionUser {
  name: string;
  email: string;
  role: string;
  permissions: Permission[];
  selfService: boolean;
}

/* ------------------------------------------------------------------ */
/* Schemas de entrada (class-validator espelha estes campos na API)    */
/* ------------------------------------------------------------------ */

export const loginSchema = z.object({
  email: z.string().min(3, "Informe o e-mail ou login.").max(120),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const mfaSchema = z.object({
  challengeId: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, "Informe os 6 dígitos."),
});
export type MfaInput = z.infer<typeof mfaSchema>;

export const updateSelfSchema = z.object({
  name: z.string().min(3, "Informe o nome completo.").max(80),
  email: z.email("Informe um e-mail válido."),
  notes: z.string().max(280).optional(),
});
export type UpdateSelfInput = z.infer<typeof updateSelfSchema>;

export const createUserSchema = z.object({
  name: z.string().min(3, "Informe o nome completo.").max(80),
  login: z
    .string()
    .min(3, "Mínimo de 3 caracteres.")
    .max(32)
    .regex(/^[a-z0-9._-]+$/, "Use apenas minusculas, números, ponto, hifen ou sublinhado."),
  email: z.email("Informe um e-mail válido."),
  groupIds: z.array(z.string()).min(1, "Selecione ao menos um grupo."),
  validUntil: z.string().nullable().optional(),
  mfa: z.boolean(),
  notes: z.string().max(280).nullable().optional(),
  password: z.string().min(14, "A senha RADIUS deve ter ao menos 14 caracteres."),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const TOTP_SECRET_PATTERN = /^[A-Z2-7]{16,64}$/;
export const TOTP_SECRET_MESSAGE =
  "Use um segredo Base32 de 16 a 64 caracteres (A-Z e 2-7).";
export const normalizeTotpSecret = (value: string) => value.replace(/[\s-]/g, "").toUpperCase();

export function ipv4ToNumber(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    result = result * 256 + octet;
  }
  return result;
}

export const createIpPoolSchema = z
  .object({
    name: z.string().min(3, "Informe um nome com ao menos 3 caracteres.").max(60),
    description: z.string().max(180).optional(),
    startIp: z.ipv4("Informe o IPv4 inicial."),
    endIp: z.ipv4("Informe o IPv4 final."),
  })
  .refine((value) => {
    const start = ipv4ToNumber(value.startIp);
    const end = ipv4ToNumber(value.endIp);
    return start !== null && end !== null && start <= end;
  }, { message: "O IP final deve ser maior ou igual ao inicial.", path: ["endIp"] })
  .refine((value) => {
    const start = ipv4ToNumber(value.startIp);
    const end = ipv4ToNumber(value.endIp);
    return start !== null && end !== null && end - start + 1 <= 1024;
  }, { message: "O pool pode ter no máximo 1024 endereços.", path: ["endIp"] });
export type CreateIpPoolInput = z.infer<typeof createIpPoolSchema>;

export const assignIpSchema = z.object({
  userId: z.string().min(1, "Selecione uma identidade."),
  address: z.ipv4("Informe um IPv4 válido.").optional(),
});
export type AssignIpInput = z.infer<typeof assignIpSchema>;

export const updateUserSchema = createUserSchema.partial().extend({
  status: z.enum(USER_STATUSES).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const RADIUS_SECRET_PATTERN = /^[\x21-\x7E][\x20-\x7E]{14,58}[\x21-\x7E]$/;
export const RADIUS_SECRET_MESSAGE =
  "Use de 16 a 60 caracteres imprimíveis, sem espaço no início ou no fim.";

export const createDeviceSchema = z.object({
  name: z
    .string()
    .min(3, "Informe um nome.")
    .max(48)
    .regex(/^[a-z0-9][a-z0-9.-]*$/, "Use minusculas, números, ponto e hifen."),
  description: z.string().min(3, "Descreva o equipamento.").max(120),
  vendor: z.enum(["mikrotik", "huawei", "nokia", "zte", "cisco", "other"]),
  model: z.string().min(2, "Informe o modelo."),
  kind: z.enum(["switch", "router", "olt", "firewall", "wireless-controller"]),
  ip: z
    .string()
    .refine(
      (value) => value === "0.0.0.0/0" || z.ipv4().safeParse(value).success,
      "Informe um IPv4 válido ou 0.0.0.0/0 para o NAS padrão.",
    ),
  nasIdentifier: z.string().min(3, "Informe o NAS-Identifier."),
  site: z.string().min(2, "Informe a localidade."),
  environment: z.enum(["production", "staging", "lab"]),
  authorizedGroupIds: z.array(z.string()).min(1, "Associe ao menos um grupo."),
  secret: z.string().regex(RADIUS_SECRET_PATTERN, RADIUS_SECRET_MESSAGE).optional(),
});
export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;

export const updateDeviceSchema = z.object({
  description: z.string().min(3).max(120).optional(),
  site: z.string().min(2).max(80).optional(),
  authorizedGroupIds: z.array(z.string()).min(1).optional(),
});
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;

export const updateGroupSchema = z.object({
  radiusAttributes: z.record(
    z.string().regex(/^[A-Za-z0-9._-]{1,64}$/, "Nome de atributo inválido."),
    z.string().min(1, "Informe o valor.").max(253),
  ),
});
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

export const createPolicySchema = z.object({
  name: z.string().min(3, "Informe um nome."),
  description: z.string().min(3, "Descreva a política."),
  scope: z.enum(["identity", "device", "session"]),
  action: z.enum(["allow", "deny", "challenge"]),
  priority: z.number().int().min(1).max(999),
});
export type CreatePolicyInput = z.infer<typeof createPolicySchema>;

export const settingsSchema = z.object({
  organization: z.string().min(2),
  timezone: z.string().min(3),
  sessionTimeoutMinutes: z.number().int().min(5).max(1440),
  mfaRequired: z.boolean(),
  passwordMinLength: z.number().int().min(12).max(64),
  passwordRotationDays: z.number().int().min(0).max(365),
  maxLoginAttempts: z.number().int().min(3).max(20),
  auditRetentionDays: z.number().int().min(30).max(3650),
  sessionRetentionDays: z.number().int().min(7).max(365),
  notificationsEmail: z.boolean(),
  notificationsWebhook: z.boolean(),
  webhookUrl: z.string().nullable(),
});
export type SettingsInput = z.infer<typeof settingsSchema>;
