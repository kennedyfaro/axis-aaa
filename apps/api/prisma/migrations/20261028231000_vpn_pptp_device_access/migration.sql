-- Autoriza o grupo VPN PPTP no NAS padrao (0.0.0.0/0).
-- Sem isso, uma identidade apenas no grupo VPN PPTP e recusada pela politica
-- de acesso por equipamento antes mesmo de receber os atributos PPP.
INSERT INTO "_DeviceGroups" ("A", "B")
SELECT d."id", g."id"
FROM "devices" d, "groups" g
WHERE g."slug" = 'vpn-pptp' AND d."nasIp" = '0.0.0.0/0'
ON CONFLICT DO NOTHING;
