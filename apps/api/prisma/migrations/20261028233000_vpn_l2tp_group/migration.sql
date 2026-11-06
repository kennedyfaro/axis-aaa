-- Grupo para autenticação de VPN L2TP via RADIUS.
-- Usa os mesmos atributos PPP do PPTP; o pool, MPPE, DNS e o servidor L2TP
-- ficam no profile do equipamento.
INSERT INTO "groups" (
    "id", "name", "slug", "description", "kind", "permissions",
    "radiusGroupName", "radiusAttributes", "updatedAt"
)
VALUES (
    'grp-vpn-l2tp',
    'VPN L2TP',
    'vpn-l2tp',
    'Acesso VPN L2TP. Atributos PPP para o NAS; pool e timeouts ficam no profile do equipamento.',
    'CUSTOM',
    ARRAY[]::text[],
    'vpn-l2tp',
    '{"Framed-Protocol":"PPP","Acct-Interim-Interval":"300"}'::jsonb,
    NOW()
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "_UserGroups" ("A", "B")
SELECT g."id", u."id"
FROM "groups" g, "users" u
WHERE g."slug" = 'vpn-l2tp' AND u."login" = 'kennedy.matos'
ON CONFLICT DO NOTHING;

-- Autoriza o grupo no NAS padrao (0.0.0.0/0); sem isso a politica de acesso
-- por equipamento recusa a identidade antes de entregar os atributos PPP.
INSERT INTO "_DeviceGroups" ("A", "B")
SELECT d."id", g."id"
FROM "devices" d, "groups" g
WHERE g."slug" = 'vpn-l2tp' AND d."nasIp" = '0.0.0.0/0'
ON CONFLICT DO NOTHING;
