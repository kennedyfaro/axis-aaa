-- P2: endurecimento de auditoria, NAS e credenciais padrão.
-- Esta migration é aditiva e não altera migrations já aplicadas.

-- 1) TRUNCATE também é mutação: a trilha de auditoria é append-only.
CREATE OR REPLACE FUNCTION prevent_audit_truncate() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_truncate
BEFORE TRUNCATE ON "audit_events"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_truncate();

-- 2) Segredos de NAS não podem usar o default 'secret' nem ser curtos.
ALTER TABLE "nas" ALTER COLUMN "secret" DROP DEFAULT;
UPDATE "nas"
SET "secret" = substr(md5(random()::text) || md5(random()::text), 1, 48)
WHERE char_length("secret") < 16;
ALTER TABLE "nas"
ADD CONSTRAINT "nas_secret_length"
CHECK (char_length("secret") BETWEEN 16 AND 60);

-- 3) A conta de demonstração radius.test não pode voltar ativa.
UPDATE "users"
SET "status" = 'BLOCKED',
    "radiusNtHash" = NULL,
    "deletedAt" = COALESCE("deletedAt", now())
WHERE "login" = 'radius.test';

UPDATE "admins"
SET "status" = 'BLOCKED'
WHERE "userId" IN (SELECT "id" FROM "users" WHERE "login" = 'radius.test');

UPDATE "refresh_tokens"
SET "revokedAt" = COALESCE("revokedAt", now())
WHERE "adminId" IN (
  SELECT a."id" FROM "admins" a
  JOIN "users" u ON u."id" = a."userId"
  WHERE u."login" = 'radius.test'
);

DELETE FROM "radcheck" WHERE "username" = 'radius.test';
DELETE FROM "radreply" WHERE "username" = 'radius.test';
DELETE FROM "radusergroup" WHERE "username" = 'radius.test';
