-- Alguns NAS, incluindo Huawei, enviam NAS-Port-Id, Service-Type e causas de
-- encerramento maiores que o padrão de 32 caracteres do schema FreeRADIUS.
-- Sem isso, o INSERT em radacct falha e o NAS encerra a sessão por timeout.

ALTER TABLE "radacct"
    ALTER COLUMN "nasportid" TYPE varchar(128),
    ALTER COLUMN "nasporttype" TYPE varchar(64),
    ALTER COLUMN "acctauthentic" TYPE varchar(64),
    ALTER COLUMN "acctterminatecause" TYPE varchar(128),
    ALTER COLUMN "servicetype" TYPE varchar(64),
    ALTER COLUMN "framedprotocol" TYPE varchar(64),
    ALTER COLUMN "calledstationid" TYPE varchar(128),
    ALTER COLUMN "callingstationid" TYPE varchar(128);
