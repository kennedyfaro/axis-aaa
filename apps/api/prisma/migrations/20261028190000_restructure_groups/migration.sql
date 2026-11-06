-- Reorganiza os grupos: mantem Administradores, Auditoria e Prestadores,
-- renomeia os dois grupos de rede e remove os demais.
-- A API ressincroniza radgroupreply/radusergroup na inicializacao.

UPDATE "groups"
SET "name" = 'Acesso de Visualização',
    "slug" = 'acesso-visualizacao',
    "radiusGroupName" = 'acesso-visualizacao',
    "description" = 'Somente leitura, sem permissão de edição nos equipamentos.',
    "radiusAttributes" = '{
        "Mikrotik-Group": "read",
        "Cisco-AVPair": "shell:priv-lvl=1",
        "Huawei-Exec-Privilege": "1",
        "Session-Timeout": "28800",
        "Idle-Timeout": "1800",
        "Acct-Interim-Interval": "300"
    }'::jsonb
WHERE "slug" = 'campo-e-instalacoes';

UPDATE "groups"
SET "name" = 'Acesso Full',
    "slug" = 'acesso-full',
    "radiusGroupName" = 'acesso-full',
    "description" = 'Acesso completo, com permissão para executar comandos nos equipamentos.',
    "radiusAttributes" = '{
        "Mikrotik-Group": "full",
        "Cisco-AVPair": "shell:priv-lvl=15",
        "Huawei-Exec-Privilege": "15"
    }'::jsonb
WHERE "slug" = 'acesso-rede';

-- Identidades ativas dos grupos removidos passam para visualizacao.
INSERT INTO "_UserGroups" ("A", "B")
SELECT visual.id, membership."B"
FROM "_UserGroups" membership
JOIN "groups" removed ON removed."id" = membership."A"
JOIN "users" identity ON identity."id" = membership."B" AND identity."deletedAt" IS NULL
JOIN "groups" visual ON visual."slug" = 'acesso-visualizacao'
WHERE removed."slug" IN ('noc', 'suporte', 'engenharia-de-redes')
ON CONFLICT DO NOTHING;

DELETE FROM "groups" WHERE "slug" IN ('noc', 'suporte', 'engenharia-de-redes');

-- Remove as associacoes antigas do FreeRADIUS. A API recria as atuais.
DELETE FROM "radusergroup"
WHERE "groupname" IN ('acesso-rede', 'campo', 'noc', 'suporte', 'engenharia-de-redes');
DELETE FROM "radgroupreply"
WHERE "groupname" IN ('acesso-rede', 'campo', 'noc', 'suporte', 'engenharia-de-redes');
DELETE FROM "radgroupcheck"
WHERE "groupname" IN ('acesso-rede', 'campo', 'noc', 'suporte', 'engenharia-de-redes');
