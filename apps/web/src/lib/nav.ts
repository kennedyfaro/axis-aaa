import {
  GearSix,
  HardDrives,
  Pulse,
  Scroll,
  ShieldCheck,
  SquaresFour,
  Stack,
  UserCircle,
  UsersFour,
  UsersThree,
} from "@phosphor-icons/react";
import type { Permission } from "@aaa/contracts";

export const NAV_SECTIONS = [
  {
    label: "Operação",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: SquaresFour, permission: "users.read" },
      { href: "/sessions", label: "Sessões", icon: Pulse, permission: "sessions.read" },
      { href: "/audit", label: "Auditoria", icon: Scroll, permission: "audit.read" },
    ],
  },
  {
    label: "Identidades",
    items: [
      { href: "/users", label: "Usuários", icon: UsersThree, permission: "users.read" },
      { href: "/groups", label: "Grupos", icon: UsersFour, permission: "groups.read" },
      { href: "/policies", label: "Políticas", icon: ShieldCheck, permission: "policies.read" },
    ],
  },
  {
    label: "Rede",
    items: [
      { href: "/devices", label: "Equipamentos", icon: HardDrives, permission: "devices.read" },
      { href: "/pools", label: "Pools de IP", icon: Stack, permission: "pools.read" },
    ],
  },
  {
    label: "Sistema",
    items: [{ href: "/settings", label: "Configurações", icon: GearSix, permission: "settings.read" }],
  },
  {
    label: "Minha conta",
    items: [{ href: "/me", label: "Meu perfil", icon: UserCircle, permission: "self.profile.read" }],
  },
] as const satisfies ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{
    href: string;
    label: string;
    icon: typeof SquaresFour;
    permission: Permission;
  }>;
}>;

export const NAV_ITEMS = NAV_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({ ...item, section: section.label })),
);

export function findNavItem(pathname: string) {
  return (
    NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ??
    NAV_ITEMS[0]
  );
}
