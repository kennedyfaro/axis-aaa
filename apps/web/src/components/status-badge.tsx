import type { DeviceStatus, SessionStatus, UserStatus } from "@aaa/contracts";
import { Badge } from "@/components/ui/badge";
import { DEVICE_STATUS_LABEL, USER_STATUS_LABEL } from "@/lib/format";

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const tone = status === "active" ? "ok" : status === "blocked" ? "danger" : status === "expired" ? "warn" : "neutral";
  return (
    <Badge tone={tone} dot>
      {USER_STATUS_LABEL[status]}
    </Badge>
  );
}

export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  const tone = status === "online" ? "ok" : status === "degraded" ? "warn" : status === "offline" ? "danger" : "neutral";
  return (
    <Badge tone={tone} dot>
      {DEVICE_STATUS_LABEL[status]}
    </Badge>
  );
}

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  return (
    <Badge tone={status === "active" ? "ok" : "neutral"} dot>
      {status === "active" ? "Ativa" : "Encerrada"}
    </Badge>
  );
}

export function ResultBadge({ result }: { result: "success" | "failure" | "accepted" | "rejected" }) {
  const ok = result === "success" || result === "accepted";
  return (
    <Badge tone={ok ? "ok" : "danger"}>
      {ok ? (result === "accepted" ? "Aceita" : "Sucesso") : result === "rejected" ? "Rejeitada" : "Falha"}
    </Badge>
  );
}
