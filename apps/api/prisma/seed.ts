import "dotenv/config";
import { PrismaClient, type GroupKind } from "@prisma/client";
import { decryptSecret, encryptSecret, randomToken } from "../src/common/crypto";
import { errorSummary } from "../src/common/error";
import { ALL_PERMISSIONS } from "../src/common/permissions";

const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;
const encryptionKey = process.env.ENCRYPTION_KEY ?? "";

type GroupSeed = {
  name: string;
  slug: string;
  description: string;
  kind: GroupKind;
  permissions: string[];
  radiusGroupName?: string;
  radiusAttributes?: Record<string, string>;
};

const GROUPS: GroupSeed[] = [
  {
    name: "Administradores",
    slug: "administradores",
    description: "Acesso total ao plano de gerenciamento, incluindo configurações e chaves.",
    kind: "SYSTEM",
    permissions: ALL_PERMISSIONS,
  },
  {
    name: "Auditoria",
    slug: "auditoria",
    description: "Somente leitura sobre eventos, políticas e identidades. Exportação autorizada.",
    kind: "SYSTEM",
    permissions: [
      "users.read",
      "groups.read",
      "policies.read",
      "devices.read",
      "sessions.read",
      "audit.read",
      "audit.export",
    ],
  },
  {
    name: "Acesso Full",
    slug: "acesso-full",
    description: "Acesso completo, com permissão para executar comandos nos equipamentos.",
    kind: "CUSTOM",
    permissions: [
      "self.profile.read",
      "self.profile.write",
      "self.sessions.read",
      "self.sessions.revoke",
    ],
    radiusGroupName: "acesso-full",
    radiusAttributes: {
      "Mikrotik-Group": "full",
      "Cisco-AVPair": "shell:priv-lvl=15",
      "Huawei-Exec-Privilege": "15",
    },
  },
  {
    name: "VPN PPTP",
    slug: "vpn-pptp",
    description: "Acesso VPN PPTP. Atributos PPP para o NAS; pool e timeouts ficam no profile do equipamento.",
    kind: "CUSTOM",
    permissions: [],
    radiusGroupName: "vpn-pptp",
    radiusAttributes: {
      "Framed-Protocol": "PPP",
      "Acct-Interim-Interval": "300",
    },
  },
  {
    name: "VPN L2TP",
    slug: "vpn-l2tp",
    description: "Acesso VPN L2TP. Atributos PPP para o NAS; pool e timeouts ficam no profile do equipamento.",
    kind: "CUSTOM",
    permissions: [],
    radiusGroupName: "vpn-l2tp",
    radiusAttributes: {
      "Framed-Protocol": "PPP",
      "Acct-Interim-Interval": "300",
    },
  },
  {
    name: "Prestadores",
    slug: "prestadores",
    description: "Acesso restrito a janelas de manutenção e redes de laboratório.",
    kind: "CUSTOM",
    permissions: [],
    radiusGroupName: "prestadores",
    radiusAttributes: {
      "Session-Timeout": "14400",
      "Idle-Timeout": "900",
      "Acct-Interim-Interval": "300",
    },
  },
  {
    name: "Acesso de Visualização",
    slug: "acesso-visualizacao",
    description: "Somente leitura, sem permissão de edição nos equipamentos.",
    kind: "CUSTOM",
    permissions: [
      "self.profile.read",
      "self.profile.write",
      "self.sessions.read",
      "self.sessions.revoke",
    ],
    radiusGroupName: "acesso-visualizacao",
    radiusAttributes: {
      "Mikrotik-Group": "read",
      "Cisco-AVPair": "shell:priv-lvl=1",
      "Huawei-Exec-Privilege": "1",
      "Session-Timeout": "28800",
      "Idle-Timeout": "1800",
      "Acct-Interim-Interval": "300",
    },
  },
];

const USERS: {
  name: string;
  login: string;
  email?: string;
  groups: string[];
  status?: "ACTIVE" | "BLOCKED" | "EXPIRED" | "PENDING";
  mfa?: boolean;
  validUntilDays?: number | null;
}[] = [
  { name: "Marina Duarte", login: "marina.duarte", groups: ["administradores"], mfa: true },
  { name: "Rafael Okamoto", login: "rafael.okamoto", groups: ["acesso-visualizacao"], mfa: true, validUntilDays: 114 },
  { name: "Beatriz Nogueira", login: "beatriz.nogueira", groups: ["acesso-visualizacao"], mfa: true, validUntilDays: 44 },
  { name: "Henrique Salles", login: "henrique.salles", groups: ["administradores"], mfa: true, validUntilDays: 122 },
  { name: "Larissa Campos", login: "larissa.campos", groups: ["auditoria"], mfa: true, validUntilDays: 47 },
  { name: "Otávio Bandeira", login: "otavio.bandeira", groups: ["acesso-visualizacao"], mfa: true, validUntilDays: 156 },
  { name: "Camila Rezende", login: "camila.rezende", groups: ["acesso-visualizacao"], mfa: true, validUntilDays: 160 },
  { name: "Renata Vasconcelos", login: "renata.vasconcelos", groups: ["administradores"], mfa: true, validUntilDays: 95 },
  { name: "Igor Menezes", login: "igor.menezes", groups: ["acesso-visualizacao"], mfa: true, validUntilDays: 57 },
  { name: "Alice Tavares", login: "alice.tavares", groups: ["acesso-visualizacao"], mfa: true, validUntilDays: 97 },
  { name: "Bruno Salgado", login: "bruno.salgado", groups: ["acesso-visualizacao"], mfa: true, validUntilDays: 72 },
  { name: "Débora Antunes", login: "debora.antunes", groups: ["acesso-visualizacao"], mfa: true, validUntilDays: 30 },
  { name: "João Nogueira", login: "joao.nogueira", groups: ["acesso-full"], validUntilDays: 7 },
  { name: "Fernanda Bittencourt", login: "fernanda.bittencourt", groups: ["prestadores"], validUntilDays: 7 },
  { name: "Marcelo Salles", login: "marcelo.salles", groups: ["acesso-full"], validUntilDays: 8 },
  { name: "Leandro Fontes", login: "leandro.fontes", groups: ["acesso-full"], validUntilDays: 10 },
  { name: "Sofia Andrade", login: "sofia.andrade", groups: ["auditoria"], mfa: true, validUntilDays: 60 },
  { name: "Gustavo Prado", login: "gustavo.prado", groups: ["acesso-visualizacao"], mfa: true, validUntilDays: 90 },
  { name: "Helena Arruda", login: "helena.arruda", groups: ["acesso-visualizacao"], validUntilDays: 80 },
  { name: "Tiago Bastos", login: "tiago.bastos", groups: ["acesso-full"], status: "PENDING", validUntilDays: 45 },
  { name: "Vanessa Coelho", login: "vanessa.coelho", groups: ["acesso-full"], status: "BLOCKED", validUntilDays: 30 },
  { name: "Wagner Bittencourt", login: "wagner.bittencourt", groups: ["acesso-full"], status: "BLOCKED", validUntilDays: 25 },
  { name: "Isabela Fontes", login: "isabela.fontes", groups: ["acesso-full"], status: "EXPIRED", validUntilDays: -9 },
];

const DEVICES = [
  { name: "edge-rt-sp01", description: "Roteador de borda do core São Paulo", vendor: "MIKROTIK", model: "CCR2004-1G-12S+2XS", kind: "ROUTER", ip: "10.10.0.1", site: "São Paulo - Core", status: "ONLINE", groups: ["administradores", "acesso-full"] },
  { name: "core-sw-cps01", description: "Switch de agregação do datacenter Campinas", vendor: "HUAWEI", model: "CloudEngine 6881-48S6CQ", kind: "SWITCH", ip: "10.10.4.2", site: "Campinas - DC1", status: "ONLINE", groups: ["administradores", "acesso-full"] },
  { name: "sros-pe-rio01", description: "Provider edge Nokia no PoP Rio de Janeiro", vendor: "NOKIA", model: "7750 SR-2s", kind: "ROUTER", ip: "10.10.8.9", site: "Rio de Janeiro - PoP", status: "DEGRADED", groups: ["administradores", "acesso-full"] },
  { name: "olt-bsb-02", description: "OLT de acesso residencial Brasília Norte", vendor: "ZTE", model: "C320", kind: "OLT", ip: "10.20.1.20", site: "Brasília - Acesso", status: "ONLINE", groups: ["administradores", "acesso-visualizacao"] },
  { name: "fw-edge-for01", description: "Firewall de borda Fortaleza", vendor: "CISCO", model: "Secure Firewall 3105", kind: "FIREWALL", ip: "10.10.12.5", site: "Fortaleza - Edge", status: "ONLINE", groups: ["administradores", "acesso-full"] },
  { name: "wlc-poa01", description: "Controladora wireless do PoP Porto Alegre", vendor: "CISCO", model: "Catalyst 9800-L", kind: "WIRELESS_CONTROLLER", ip: "10.10.14.7", site: "Porto Alegre - PoP", status: "ONLINE", groups: ["administradores", "acesso-full"] },
  { name: "lab-crs-rec01", description: "Switch de laboratório para validação de perfis", vendor: "MIKROTIK", model: "CRS520-4XS-16XQ-RM", kind: "SWITCH", ip: "172.20.5.11", site: "Recife - Lab", status: "OFFLINE", groups: ["acesso-visualizacao"] },
] as const;

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_DESTRUCTIVE !== "true") {
    throw new Error(
      "Seed bloqueado em produção. Use SEED_ALLOW_DESTRUCTIVE=true apenas em ambiente de demonstração.",
    );
  }
  if (!encryptionKey) {
    throw new Error("ENCRYPTION_KEY é obrigatória para o seed de NAS.");
  }

  const groups = new Map<string, { id: string }>();
  for (const group of GROUPS) {
    const created = await prisma.group.upsert({
      where: { slug: group.slug },
      update: {
        name: group.name,
        description: group.description,
        kind: group.kind,
        permissions: group.permissions,
        radiusGroupName: group.radiusGroupName ?? null,
        radiusAttributes: group.radiusAttributes ?? undefined,
      },
      create: {
        name: group.name,
        slug: group.slug,
        description: group.description,
        kind: group.kind,
        permissions: group.permissions,
        radiusGroupName: group.radiusGroupName ?? null,
        radiusAttributes: group.radiusAttributes ?? undefined,
      },
    });
    groups.set(group.slug, { id: created.id });
  }

  await prisma.setting.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  for (const user of USERS) {
    const groupIds = user.groups.map((slug) => groups.get(slug)?.id).filter(Boolean) as string[];
    const validUntil =
      user.validUntilDays === null ? null : new Date(Date.now() + (user.validUntilDays ?? 120) * DAY);
    const email = user.email ?? `${user.login}@aaa.local`;
    const mfa = user.mfa ?? false;

    // O seed nunca reativa contas existentes nem redefine credenciais.
    // Em especial, não há usuário de teste com senha conhecida.
    await prisma.user.upsert({
      where: { login: user.login },
      update: {
        name: user.name,
        email,
        mfa,
        validUntil,
        groups: { set: groupIds.map((id) => ({ id })) },
      },
      create: {
        login: user.login,
        name: user.name,
        email,
        status: user.status ?? "ACTIVE",
        mfa,
        validFrom: new Date(Date.now() - 120 * DAY),
        validUntil,
        notes: null,
        radiusNtHash: null,
        passwordUpdatedAt: null,
        groups: { connect: groupIds.map((id) => ({ id })) },
      },
    });
  }

  for (const device of DEVICES) {
    const groupIds = device.groups.map((slug) => groups.get(slug)?.id).filter(Boolean) as string[];
    const existing = await prisma.device.findUnique({ where: { nasIdentifier: device.name } });
    const secret = existing
      ? decryptSecret(existing.secretCipher, encryptionKey)
      : randomToken(18);

    const created = await prisma.device.upsert({
      where: { nasIdentifier: device.name },
      update: {
        name: device.name,
        description: device.description,
        vendor: device.vendor,
        model: device.model,
        kind: device.kind,
        ip: device.ip,
        nasIp: device.ip,
        site: device.site,
        environment: "PRODUCTION",
        status: device.status,
        lastSeenAt: device.status === "OFFLINE" ? new Date(Date.now() - 3 * DAY) : new Date(Date.now() - 5 * 60 * 1000),
        // Não rotaciona o shared secret de um NAS existente. A rotação é
        // uma ação explícita do painel, não um efeito colateral do seed.
        authorizedGroups: { set: groupIds.map((id) => ({ id })) },
      },
      create: {
        name: device.name,
        description: device.description,
        vendor: device.vendor,
        model: device.model,
        kind: device.kind,
        ip: device.ip,
        nasIdentifier: device.name,
        nasIp: device.ip,
        site: device.site,
        environment: "PRODUCTION",
        status: device.status,
        lastSeenAt: device.status === "OFFLINE" ? new Date(Date.now() - 3 * DAY) : new Date(Date.now() - 5 * 60 * 1000),
        secretCipher: encryptSecret(secret, encryptionKey),
        authorizedGroups: { connect: groupIds.map((id) => ({ id })) },
      },
    });
    await prisma.$executeRaw`DELETE FROM nas WHERE shortname = ${created.nasIdentifier}`;
    await prisma.$executeRaw`
      INSERT INTO nas (nasname, shortname, type, secret, description)
      VALUES (${created.nasIp}, ${created.nasIdentifier}, 'other', ${secret}, ${created.description})`;
  }

  await prisma.policy.deleteMany();
  await prisma.policy.createMany({
    data: [
      {
        name: "MFA obrigatório para administradores",
        description: "Exige segundo fator em todo login administrativo, independente da origem.",
        scope: "IDENTITY",
        conditions: [
          { attribute: "group", operator: "in", value: "administradores" },
          { attribute: "mfa", operator: "equals", value: "false" },
        ],
        action: "CHALLENGE",
        priority: 10,
      },
      {
        name: "Negar autenticação para contas expiradas",
        description: "Remove a credencial RADIUS de identidades com validade vencida.",
        scope: "IDENTITY",
        conditions: [{ attribute: "account.status", operator: "equals", value: "expired" }],
        action: "DENY",
        priority: 20,
      },
      {
        name: "Janela de manutenção para prestadores",
        description: "Prestadores autenticam apenas entre 22h e 5h, com duração máxima de 4 horas.",
        scope: "SESSION",
        conditions: [
          { attribute: "group", operator: "equals", value: "prestadores" },
          { attribute: "time.hour", operator: "not_between", value: "05:00-22:00" },
        ],
        action: "CHALLENGE",
        priority: 30,
      },
      {
        name: "Acesso Full nos roteadores de borda",
        description: "Permite acesso do grupo Acesso Full nos equipamentos marcados como core.",
        scope: "DEVICE",
        conditions: [
          { attribute: "group", operator: "equals", value: "acesso-full" },
          { attribute: "device.role", operator: "equals", value: "core" },
        ],
        action: "ALLOW",
        priority: 40,
      },
    ],
  });

  // Reconstrói o estado RADIUS a partir das identidades com credencial.
  await prisma.$executeRaw`DELETE FROM radcheck`;
  await prisma.$executeRaw`DELETE FROM radreply`;
  await prisma.$executeRaw`DELETE FROM radusergroup`;
  await prisma.$executeRaw`DELETE FROM radgroupreply`;
  await prisma.$executeRaw`DELETE FROM radgroupcheck`;

  for (const group of GROUPS) {
    if (!group.radiusGroupName) continue;
    for (const [attribute, value] of Object.entries(group.radiusAttributes ?? {})) {
      await prisma.$executeRaw`
        INSERT INTO radgroupreply (groupname, attribute, op, value)
        VALUES (${group.radiusGroupName}, ${attribute}, '=', ${value})`;
    }
  }

  const radiusUsers = await prisma.user.findMany({
    where: { radiusNtHash: { not: null }, deletedAt: null, status: "ACTIVE" },
    include: { groups: true },
    orderBy: { login: "asc" },
  });
  for (const user of radiusUsers) {
    await prisma.$executeRaw`
      INSERT INTO radcheck (username, attribute, op, value)
      VALUES (${user.login}, 'NT-Password', ':=', ${user.radiusNtHash})`;
    for (const group of user.groups.filter((item) => item.radiusGroupName)) {
      await prisma.$executeRaw`
        INSERT INTO radusergroup (username, groupname, priority)
        VALUES (${user.login}, ${group.radiusGroupName}, 1)`;
    }
  }

  if ((await prisma.notification.count()) === 0) {
    await prisma.notification.create({
      data: {
        type: "system",
        title: "Ambiente inicializado",
        body: "Execute o bootstrap do administrador e valide uma autenticação com radtest.",
      },
    });
  }

  console.log(
    [
      `Seed concluído.`,
      `Grupos: ${GROUPS.length}`,
      `Identidades: ${USERS.length}`,
      `NAS: ${DEVICES.length}`,
      `Credenciais RADIUS ativas: ${radiusUsers.length}`,
      "Nenhum usuário de teste com senha padrão foi criado.",
    ].join("\n"),
  );
}

main()
  .catch((error) => {
    console.error(`Seed falhou (${errorSummary(error)}).`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
