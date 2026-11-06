-- Acelera a resolucao do NAS-Identifier por IP de origem nas sessoes.
CREATE INDEX IF NOT EXISTS "radpostauth_nasipaddress_authdate_idx"
    ON "radpostauth" ("nasipaddress", "authdate" DESC);
