-- P3 Bloco A: versão do token para revogar access tokens JWT emitidos
-- antes de reset de senha, bloqueio, exclusão ou mudança de grupos.
ALTER TABLE "admins"
ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
