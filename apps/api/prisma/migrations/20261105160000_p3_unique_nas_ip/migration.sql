-- P3 Bloco B: um IP de NAS só pode pertencer a um equipamento.
-- A checagem explícita evita que a migration falhe sem contexto em bases
-- que já tenham duplicidade.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "devices" GROUP BY "nasIp" HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Existem devices com nasIp duplicado; resolva antes de aplicar a constraint';
  END IF;
  IF EXISTS (SELECT 1 FROM "nas" GROUP BY "nasname" HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Existem clientes nas com nasname duplicado; resolva antes de aplicar a constraint';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "devices_nasIp_unique" ON "devices" ("nasIp");
CREATE UNIQUE INDEX IF NOT EXISTS "nas_nasname_unique" ON "nas" ("nasname");
