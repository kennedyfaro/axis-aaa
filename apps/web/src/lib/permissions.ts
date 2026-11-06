import type { Permission, SessionUser } from "@aaa/contracts";

export function can(user: SessionUser | undefined, permission: Permission) {
  return Boolean(user?.permissions?.includes(permission));
}
