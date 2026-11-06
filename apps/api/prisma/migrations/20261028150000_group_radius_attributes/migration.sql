-- Atributos RADIUS passam a ser definidos por grupo.
-- Migra os atributos que existiam por equipamento para todos os grupos
-- autorizados naquele NAS, garantindo continuidade das sessoes existentes.
WITH attrs AS (
    SELECT dg."B" AS group_id,
           jsonb_object_agg(da."attribute", da."value") AS attributes
    FROM "device_attributes" da
    JOIN "_DeviceGroups" dg ON dg."A" = da."deviceId"
    GROUP BY dg."B"
)
UPDATE "groups" g
SET "radiusAttributes" = COALESCE(g."radiusAttributes", '{}'::jsonb) || attrs.attributes,
    "radiusGroupName" = COALESCE(g."radiusGroupName", g."slug")
FROM attrs
WHERE g."id" = attrs.group_id;

DROP VIEW IF EXISTS "radius_device_attributes";
DROP TABLE "device_attributes";
