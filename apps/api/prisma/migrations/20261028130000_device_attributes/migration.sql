CREATE TABLE "device_attributes" (
    "id" serial PRIMARY KEY,
    "deviceId" text NOT NULL,
    "attribute" varchar(64) NOT NULL,
    "op" varchar(2) NOT NULL DEFAULT '=',
    "value" varchar(253) NOT NULL,
    CONSTRAINT "device_attributes_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "device_attributes_deviceId_attribute_key" UNIQUE ("deviceId", "attribute")
);

CREATE VIEW "radius_device_inventory" AS
SELECT d."nasIp" AS nas_ip
FROM "devices" d;

CREATE VIEW "radius_device_access" AS
SELECT d."nasIp" AS nas_ip, u."login" AS login
FROM "devices" d
JOIN "_DeviceGroups" dg ON dg."A" = d."id"
JOIN "_UserGroups" ug ON ug."A" = dg."B"
JOIN "users" u ON u."id" = ug."B"
WHERE u."deletedAt" IS NULL AND u."status" = 'ACTIVE';

CREATE VIEW "radius_device_attributes" AS
SELECT da."id", d."nasIp" AS nas_ip, da."attribute", da."op", da."value"
FROM "device_attributes" da
JOIN "devices" d ON d."id" = da."deviceId";
