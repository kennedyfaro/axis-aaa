-- CreateEnum
CREATE TYPE "GroupKind" AS ENUM ('SYSTEM', 'CUSTOM');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'EXPIRED', 'PENDING');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "DeviceVendor" AS ENUM ('MIKROTIK', 'HUAWEI', 'NOKIA', 'ZTE', 'CISCO', 'OTHER');

-- CreateEnum
CREATE TYPE "DeviceKind" AS ENUM ('SWITCH', 'ROUTER', 'OLT', 'FIREWALL', 'WIRELESS_CONTROLLER');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'DEGRADED', 'PENDING');

-- CreateEnum
CREATE TYPE "DeviceEnvironment" AS ENUM ('PRODUCTION', 'STAGING', 'LAB');

-- CreateEnum
CREATE TYPE "PolicyScope" AS ENUM ('IDENTITY', 'DEVICE', 'SESSION');

-- CreateEnum
CREATE TYPE "PolicyAction" AS ENUM ('ALLOW', 'DENY', 'CHALLENGE');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateTable
CREATE TABLE "admins" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "totpSecret" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "AdminStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" "GroupKind" NOT NULL DEFAULT 'CUSTOM',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "radiusGroupName" TEXT,
    "radiusAttributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "mfa" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "radiusNtHash" TEXT,
    "passwordUpdatedAt" TIMESTAMP(3),
    "lastAuthAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "vendor" "DeviceVendor" NOT NULL,
    "model" TEXT NOT NULL,
    "kind" "DeviceKind" NOT NULL,
    "ip" TEXT NOT NULL,
    "nasIdentifier" TEXT NOT NULL,
    "nasIp" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "environment" "DeviceEnvironment" NOT NULL DEFAULT 'PRODUCTION',
    "status" "DeviceStatus" NOT NULL DEFAULT 'PENDING',
    "lastSeenAt" TIMESTAMP(3),
    "secretCipher" TEXT NOT NULL,
    "secretRotatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "scope" "PolicyScope" NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "action" "PolicyAction" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminId" TEXT,
    "actor" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "result" "AuditResult" NOT NULL,
    "ip" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "organization" TEXT NOT NULL DEFAULT 'Aurora Redes',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "sessionTimeoutMinutes" INTEGER NOT NULL DEFAULT 30,
    "mfaRequired" BOOLEAN NOT NULL DEFAULT true,
    "passwordMinLength" INTEGER NOT NULL DEFAULT 14,
    "passwordRotationDays" INTEGER NOT NULL DEFAULT 90,
    "maxLoginAttempts" INTEGER NOT NULL DEFAULT 5,
    "auditRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "sessionRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "notificationsEmail" BOOLEAN NOT NULL DEFAULT true,
    "notificationsWebhook" BOOLEAN NOT NULL DEFAULT false,
    "webhookUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AdminGroups" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AdminGroups_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_UserGroups" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_UserGroups_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_DeviceGroups" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DeviceGroups_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_adminId_revokedAt_idx" ON "refresh_tokens"("adminId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "groups_slug_key" ON "groups"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "groups_radiusGroupName_key" ON "groups"("radiusGroupName");

-- CreateIndex
CREATE UNIQUE INDEX "users_login_key" ON "users"("login");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_deletedAt_idx" ON "users"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "users_name_idx" ON "users"("name");

-- CreateIndex
CREATE UNIQUE INDEX "devices_name_key" ON "devices"("name");

-- CreateIndex
CREATE UNIQUE INDEX "devices_nasIdentifier_key" ON "devices"("nasIdentifier");

-- CreateIndex
CREATE INDEX "policies_priority_enabled_idx" ON "policies"("priority", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "audit_events_requestId_key" ON "audit_events"("requestId");

-- CreateIndex
CREATE INDEX "audit_events_at_idx" ON "audit_events"("at");

-- CreateIndex
CREATE INDEX "audit_events_target_idx" ON "audit_events"("target");

-- CreateIndex
CREATE INDEX "notifications_readAt_createdAt_idx" ON "notifications"("readAt", "createdAt");

-- CreateIndex
CREATE INDEX "_AdminGroups_B_index" ON "_AdminGroups"("B");

-- CreateIndex
CREATE INDEX "_UserGroups_B_index" ON "_UserGroups"("B");

-- CreateIndex
CREATE INDEX "_DeviceGroups_B_index" ON "_DeviceGroups"("B");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AdminGroups" ADD CONSTRAINT "_AdminGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AdminGroups" ADD CONSTRAINT "_AdminGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserGroups" ADD CONSTRAINT "_UserGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserGroups" ADD CONSTRAINT "_UserGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DeviceGroups" ADD CONSTRAINT "_DeviceGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DeviceGroups" ADD CONSTRAINT "_DeviceGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- FreeRADIUS 3.x SQL schema (rlm_sql_postgresql). Tabelas gerenciadas fora do
-- Prisma porque o schema e propriedade do FreeRADIUS.
-- ---------------------------------------------------------------------------

CREATE TABLE "radcheck" (
    "id" serial PRIMARY KEY,
    "username" varchar(64) NOT NULL DEFAULT '',
    "attribute" varchar(64) NOT NULL DEFAULT '',
    "op" varchar(2) NOT NULL DEFAULT '==',
    "value" varchar(253) NOT NULL DEFAULT ''
);
CREATE INDEX "radcheck_username" ON "radcheck" ("username");

CREATE TABLE "radreply" (
    "id" serial PRIMARY KEY,
    "username" varchar(64) NOT NULL DEFAULT '',
    "attribute" varchar(64) NOT NULL DEFAULT '',
    "op" varchar(2) NOT NULL DEFAULT '=',
    "value" varchar(253) NOT NULL DEFAULT ''
);
CREATE INDEX "radreply_username" ON "radreply" ("username");

CREATE TABLE "radgroupcheck" (
    "id" serial PRIMARY KEY,
    "groupname" varchar(64) NOT NULL DEFAULT '',
    "attribute" varchar(64) NOT NULL DEFAULT '',
    "op" varchar(2) NOT NULL DEFAULT '==',
    "value" varchar(253) NOT NULL DEFAULT ''
);
CREATE INDEX "radgroupcheck_groupname" ON "radgroupcheck" ("groupname");

CREATE TABLE "radgroupreply" (
    "id" serial PRIMARY KEY,
    "groupname" varchar(64) NOT NULL DEFAULT '',
    "attribute" varchar(64) NOT NULL DEFAULT '',
    "op" varchar(2) NOT NULL DEFAULT '=',
    "value" varchar(253) NOT NULL DEFAULT ''
);
CREATE INDEX "radgroupreply_groupname" ON "radgroupreply" ("groupname");

CREATE TABLE "radusergroup" (
    "id" serial PRIMARY KEY,
    "username" varchar(64) NOT NULL DEFAULT '',
    "groupname" varchar(64) NOT NULL DEFAULT '',
    "priority" integer NOT NULL DEFAULT 1
);
CREATE INDEX "radusergroup_username" ON "radusergroup" ("username");

CREATE TABLE "radacct" (
    "radacctid" bigserial PRIMARY KEY,
    "acctsessionid" varchar(64) NOT NULL DEFAULT '',
    "acctuniqueid" varchar(32) NOT NULL DEFAULT '',
    "username" varchar(64) NOT NULL DEFAULT '',
    "groupname" varchar(64) NOT NULL DEFAULT '',
    "realm" varchar(64) DEFAULT '',
    "nasipaddress" inet NOT NULL,
    "nasportid" varchar(32) DEFAULT NULL,
    "nasporttype" varchar(32) DEFAULT NULL,
    "acctstarttime" timestamptz DEFAULT NULL,
    "acctupdatetime" timestamptz DEFAULT NULL,
    "acctstoptime" timestamptz DEFAULT NULL,
    "acctinterval" bigint DEFAULT NULL,
    "acctsessiontime" bigint DEFAULT NULL,
    "acctauthentic" varchar(32) DEFAULT NULL,
    "connectinfo_start" varchar(128) DEFAULT NULL,
    "connectinfo_stop" varchar(128) DEFAULT NULL,
    "acctinputoctets" bigint DEFAULT NULL,
    "acctoutputoctets" bigint DEFAULT NULL,
    "calledstationid" varchar(64) NOT NULL DEFAULT '',
    "callingstationid" varchar(64) NOT NULL DEFAULT '',
    "acctterminatecause" varchar(32) DEFAULT NULL,
    "servicetype" varchar(32) DEFAULT NULL,
    "framedprotocol" varchar(32) DEFAULT NULL,
    "framedipaddress" varchar(45) DEFAULT NULL,
    "framedipv6address" varchar(45) DEFAULT NULL,
    "framedipv6prefix" varchar(45) DEFAULT NULL,
    "framedinterfaceid" varchar(44) DEFAULT NULL,
    "delegatedipv6prefix" varchar(45) DEFAULT NULL,
    "class" varchar(64) DEFAULT NULL
);
CREATE UNIQUE INDEX "radacct_acctuniqueid" ON "radacct" ("acctuniqueid");
CREATE INDEX "radacct_username" ON "radacct" ("username");
CREATE INDEX "radacct_acctstarttime" ON "radacct" ("acctstarttime");
CREATE INDEX "radacct_acctstoptime" ON "radacct" ("acctstoptime");
CREATE INDEX "radacct_nasipaddress" ON "radacct" ("nasipaddress");
CREATE INDEX "radacct_acctsessionid" ON "radacct" ("acctsessionid");

CREATE TABLE "radpostauth" (
    "id" bigserial PRIMARY KEY,
    "username" varchar(64) NOT NULL DEFAULT '',
    "pass" varchar(64) NOT NULL DEFAULT '',
    "reply" varchar(32) NOT NULL DEFAULT '',
    "authdate" timestamptz NOT NULL DEFAULT now(),
    "nasipaddress" inet DEFAULT NULL,
    "nasidentifier" varchar(64) DEFAULT NULL,
    "auth_method" varchar(32) DEFAULT NULL
);
CREATE INDEX "radpostauth_username" ON "radpostauth" ("username");
CREATE INDEX "radpostauth_authdate" ON "radpostauth" ("authdate");

CREATE TABLE "nas" (
    "id" serial PRIMARY KEY,
    "nasname" varchar(128) NOT NULL,
    "shortname" varchar(32) NOT NULL,
    "type" varchar(30) NOT NULL DEFAULT 'other',
    "ports" integer DEFAULT NULL,
    "secret" varchar(60) NOT NULL DEFAULT 'secret',
    "server" varchar(64) DEFAULT NULL,
    "community" varchar(50) DEFAULT NULL,
    "description" varchar(200) NOT NULL DEFAULT 'RADIUS Client'
);
CREATE INDEX "nas_nasname" ON "nas" ("nasname");

-- A trilha de auditoria e append-only no nivel do banco.
CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_update
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
