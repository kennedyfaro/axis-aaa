-- Pools de IP para endereços fixos de VPN.
-- O endereço vinculado à identidade é publicado no atributo Framed-IP-Address.

CREATE TABLE "ip_pools" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startIp" TEXT NOT NULL,
    "endIp" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ip_pools_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ip_pools_name_key" ON "ip_pools"("name");

ALTER TABLE "users"
    ADD COLUMN "framedIpAddress" TEXT,
    ADD COLUMN "ipPoolId" TEXT,
    ADD COLUMN "ipAssignedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_framedIpAddress_key" ON "users"("framedIpAddress");
CREATE INDEX "users_ipPoolId_idx" ON "users"("ipPoolId");

ALTER TABLE "users"
    ADD CONSTRAINT "users_ipPoolId_fkey"
    FOREIGN KEY ("ipPoolId") REFERENCES "ip_pools"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Faixa inicial solicitada pela operação.
INSERT INTO "ip_pools" (
    "id", "name", "description", "startIp", "endIp", "createdAt", "updatedAt"
)
VALUES (
    'pool-vpn-principal',
    'Pool VPN',
    'Endereços fixos para identidades dos grupos VPN PPTP e L2TP.',
    '192.168.128.2',
    '192.168.128.69',
    NOW(),
    NOW()
);

-- Novas permissões para o grupo Administradores (preserva as existentes).
UPDATE "groups"
SET "permissions" = "permissions" || ARRAY['pools.read'], "updatedAt" = NOW()
WHERE "slug" = 'administradores' AND NOT ('pools.read' = ANY("permissions"));

UPDATE "groups"
SET "permissions" = "permissions" || ARRAY['pools.write'], "updatedAt" = NOW()
WHERE "slug" = 'administradores' AND NOT ('pools.write' = ANY("permissions"));
