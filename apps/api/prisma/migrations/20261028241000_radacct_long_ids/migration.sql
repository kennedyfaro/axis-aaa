-- O Huawei envia identificadores de sessão maiores que o padrão do schema
-- FreeRADIUS. O INSERT em radacct falhava com varchar(32), o FreeRADIUS não
-- respondia ao Accounting-Request e o NAS encerrava a sessão por timeout.

ALTER TABLE "radacct"
    ALTER COLUMN "acctuniqueid" TYPE varchar(128);

ALTER TABLE "radacct"
    ALTER COLUMN "acctsessionid" TYPE varchar(128);
