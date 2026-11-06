-- Separa autorizacao de VPN da autorizacao de login de gerencia.
-- A view agora expoe o grupo e se ele e um grupo de VPN (slug vpn-* ou
-- Framed-Protocol=PPP). A politica do FreeRADIUS usa isso para exigir um
-- grupo nao-VPN em logins de gerencia, sem bloquear sessoes PPP.

DROP VIEW IF EXISTS "radius_device_access";

CREATE VIEW "radius_device_access" AS
SELECT
    d."nasIp" AS nas_ip,
    u."login" AS login,
    g."slug" AS group_slug,
    (
        g."slug" LIKE 'vpn-%'
        OR COALESCE(g."radiusAttributes" ->> 'Framed-Protocol', '') = 'PPP'
    ) AS is_vpn
FROM "devices" d
JOIN "_DeviceGroups" dg ON dg."A" = d."id"
JOIN "groups" g ON g."id" = dg."B"
JOIN "_UserGroups" ug ON ug."A" = g."id"
JOIN "users" u ON u."id" = ug."B"
WHERE u."deletedAt" IS NULL AND u."status" = 'ACTIVE';
