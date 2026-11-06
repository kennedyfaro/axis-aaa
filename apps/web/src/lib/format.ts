const number = new Intl.NumberFormat("pt-BR");
const numberOne = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export const formatNumber = (value: number) => number.format(value);
export const formatPercent = (value: number) => `${numberOne.format(value)}%`;

export function formatDateTime(value: string | null) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDate(value: string | null) {
  if (!value) return "Sem prazo";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );
}

export function relativeTime(value: string | null) {
  if (!value) return "Nunca";
  const diff = Date.now() - new Date(value).getTime();
  const future = diff < 0;
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);

  let label: string;
  if (minutes < 1) return "Agora";
  if (minutes < 60) label = `${minutes} min`;
  else if (hours < 24) label = `${hours} h`;
  else if (days < 30) label = `${days} d`;
  else label = `${Math.round(days / 30)} mes${Math.round(days / 30) > 1 ? "es" : ""}`;

  return future ? `em ${label}` : `há ${label}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${numberOne.format(value)} ${units[unit]}`;
}

export function formatDuration(start: string, end: string | null) {
  const ms = Math.max(0, (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime());
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return `${hours} h ${rest} min`;
  return `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

export function daysUntil(date: string | null) {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export const USER_STATUS_LABEL = {
  active: "Ativo",
  blocked: "Bloqueado",
  expired: "Expirado",
  pending: "Pendente",
} as const;

export const DEVICE_STATUS_LABEL = {
  online: "Online",
  offline: "Offline",
  degraded: "Degradado",
  pending: "Aguardando",
} as const;

export const PROTOCOL_LABEL = {
  radius: "RADIUS",
  ssh: "SSH",
} as const;

export const VENDOR_LABEL = {
  mikrotik: "MikroTik",
  huawei: "Huawei",
  nokia: "Nokia",
  zte: "ZTE",
  cisco: "Cisco",
  other: "Outro",
} as const;

export const DEVICE_KIND_LABEL = {
  switch: "Switch",
  router: "Roteador",
  olt: "OLT",
  firewall: "Firewall",
  "wireless-controller": "Controladora Wi-Fi",
} as const;

export const AUDIT_ACTION_LABEL = {
  "user.created": "Usuário criado",
  "user.updated": "Usuário atualizado",
  "user.blocked": "Usuário bloqueado",
  "user.unblocked": "Usuário desbloqueado",
  "user.deleted": "Usuário removido",
  "user.sessions.revoked": "Sessões revogadas",
  "session.revoked": "Sessão encerrada pelo painel",
  "group.updated": "Grupo atualizado",
  "policy.created": "Política criada",
  "policy.updated": "Política atualizada",
  "device.created": "Equipamento criado",
  "device.deleted": "Equipamento removido",
  "device.updated": "Acesso do equipamento atualizado",
  "device.secret.rotated": "Segredo NAS rotacionado",
  "pool.created": "Pool de IP criado",
  "pool.deleted": "Pool de IP removido",
  "pool.address.assigned": "IP fixo vinculado",
  "pool.address.released": "IP fixo liberado",
  "settings.updated": "Configurações alteradas",
  "auth.login": "Login administrativo",
  "auth.mfa.failed": "Falha de MFA",
  "radius.auth.accept": "Login RADIUS aceito",
  "radius.auth.reject": "Login RADIUS rejeitado",
  "radius.session.start": "Sessão RADIUS iniciada",
  "radius.session.stop": "Sessão RADIUS encerrada",
  "audit.exported": "Auditoria exportada",
} as const;

export const PERMISSION_LABEL = {
  "users.read": "Ver usuários",
  "users.write": "Editar usuários",
  "users.block": "Bloquear contas",
  "users.export": "Exportar usuários",
  "groups.read": "Ver grupos",
  "groups.write": "Editar grupos",
  "policies.read": "Ver políticas",
  "policies.write": "Editar políticas",
  "devices.read": "Ver equipamentos",
  "devices.write": "Editar equipamentos",
  "pools.read": "Ver pools de IP",
  "pools.write": "Editar pools de IP",
  "sessions.read": "Ver sessões",
  "sessions.revoke": "Revogar sessões",
  "audit.read": "Ver auditoria",
  "audit.export": "Exportar auditoria",
  "settings.read": "Ver configurações",
  "settings.write": "Editar configurações",
  "self.profile.read": "Ver o próprio perfil",
  "self.profile.write": "Editar o próprio perfil",
  "self.sessions.read": "Ver as próprias sessões",
  "self.sessions.revoke": "Encerrar as próprias sessões",
} as const;
