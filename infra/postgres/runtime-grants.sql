-- Privilégios mínimos para os papéis de runtime.
-- Executado como o papel owner/migrador (aaa) após as migrations.
-- Este arquivo é idempotente.

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO aaa_app, aaa_worker, aaa_radius;
GRANT CREATE ON SCHEMA public TO aaa;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM aaa_app, aaa_worker, aaa_radius;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM aaa_app, aaa_worker, aaa_radius;

-- API: identidades, painel, dispositivos, políticas, pools, auditoria.
GRANT SELECT, INSERT, UPDATE ON users, admins, refresh_tokens TO aaa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON groups, "_UserGroups", "_AdminGroups", devices, "_DeviceGroups", ip_pools, policies TO aaa_app;
GRANT SELECT, INSERT, UPDATE ON settings TO aaa_app;
GRANT SELECT, UPDATE ON notifications TO aaa_app;
GRANT SELECT, INSERT ON audit_events TO aaa_app;

-- API: leitura/atualização de sessões e escrita do RADIUS (sync).
GRANT SELECT, UPDATE ON radacct TO aaa_app;
GRANT SELECT ON radpostauth TO aaa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON radcheck, radreply, radusergroup, radgroupcheck, radgroupreply TO aaa_app;
GRANT USAGE, SELECT ON SEQUENCE
    radcheck_id_seq,
    radreply_id_seq,
    radusergroup_id_seq,
    radgroupcheck_id_seq,
    radgroupreply_id_seq,
    nas_id_seq
TO aaa_app;

-- API: a tabela nas guarda o segredo em texto para o FreeRADIUS.
-- O papel da API pode inserir/deletar o registro, mas não pode ler o segredo.
GRANT SELECT (id, nasname, shortname, type, ports, server, community, description) ON nas TO aaa_app;
GRANT INSERT (nasname, shortname, type, secret, description) ON nas TO aaa_app;
GRANT DELETE ON nas TO aaa_app;

-- Worker: manutenção, presença e alertas de segurança.
-- Em users, o worker só precisa de presença/validade e do lastAuthAt.
GRANT SELECT (id, login, name, "lastAuthAt", status, "deletedAt", "validFrom", "validUntil") ON users TO aaa_worker;
GRANT UPDATE ("lastAuthAt") ON users TO aaa_worker;
GRANT SELECT, UPDATE ON devices TO aaa_worker;
GRANT SELECT ON radacct, radpostauth, settings, notifications, audit_events TO aaa_worker;
GRANT DELETE ON radacct, radpostauth TO aaa_worker;
GRANT INSERT ON notifications TO aaa_worker;

-- FreeRADIUS: apenas o schema RADIUS, views de autorização e colunas
-- estritamente necessárias de users/nas.
GRANT SELECT ON radcheck, radreply, radgroupcheck, radgroupreply, radusergroup, radacct TO aaa_radius;
GRANT SELECT (id, login, status, "deletedAt", "validFrom", "validUntil") ON users TO aaa_radius;
GRANT SELECT (nasname, shortname, secret) ON nas TO aaa_radius;
GRANT SELECT ON radius_device_access, radius_device_inventory TO aaa_radius;
GRANT INSERT, UPDATE ON radacct TO aaa_radius;
GRANT INSERT ON radpostauth TO aaa_radius;
GRANT USAGE, SELECT ON SEQUENCE radacct_radacctid_seq, radpostauth_id_seq TO aaa_radius;

-- As triggers de auditoria são SECURITY DEFINER para inserir em
-- audit_events sem conceder SELECT/INSERT de auditoria ao FreeRADIUS.
ALTER FUNCTION public.audit_radius_postauth() SECURITY DEFINER;
ALTER FUNCTION public.audit_radius_postauth() SET search_path = public, pg_temp;
ALTER FUNCTION public.audit_radius_acct() SECURITY DEFINER;
ALTER FUNCTION public.audit_radius_acct() SET search_path = public, pg_temp;
