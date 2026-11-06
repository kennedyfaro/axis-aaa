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

export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.filter(
  (permission) => !permission.startsWith("self."),
);
