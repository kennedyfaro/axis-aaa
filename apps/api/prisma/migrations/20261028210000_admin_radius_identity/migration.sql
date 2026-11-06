-- Conta de painel vinculada a uma identidade RADIUS.
-- A senha e validada pelo NT-Password da identidade, permitindo que a mesma
-- credencial do equipamento autentique no painel.
ALTER TABLE "admins" ADD COLUMN "userId" TEXT;
CREATE UNIQUE INDEX "admins_userId_key" ON "admins"("userId");
ALTER TABLE "admins" ADD CONSTRAINT "admins_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
