-- Grupo para autenticação de VPN PPTP via RADIUS.
-- O pool de IPs, MPPE e timeouts do PPP ficam no profile do equipamento.
INSERT INTO "groups" (
    "id", "name", "slug", "description", "kind", "permissions",
    "radiusGroupName", "radiusAttributes", "updatedAt"
)
VALUES (
    'grp-vpn-pptp',
    'VPN PPTP',
    'vpn-pptp',
    'Acesso VPN PPTP. Atributos PPP para o NAS; pool e timeouts ficam no profile do equipamento.',
    'CUSTOM',
    ARRAY[]::text[],
    'vpn-pptp',
    '{"Framed-Protocol":"PPP","Acct-Interim-Interval":"300"}'::jsonb,
    NOW()
)
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "_UserGroups" ("A", "B")
SELECT g."id", u."id"
FROM "groups" g, "users" u
WHERE g."slug" = 'vpn-pptp' AND u."login" = 'kennedy.matos'
ON CONFLICT DO NOTHING;
