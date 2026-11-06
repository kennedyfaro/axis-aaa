-- Registra autenticacoes e sessoes RADIUS na trilha de auditoria.
-- O painel nao escreve nesses eventos: eles vem diretamente do FreeRADIUS
-- via radpostauth (Access-Accept/Reject) e radacct (Start/Stop).

CREATE OR REPLACE FUNCTION audit_radius_postauth() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    accepted boolean;
    nas_name text;
BEGIN
    accepted := NEW.reply = 'Access-Accept';
    nas_name := COALESCE(NULLIF(NEW.nasidentifier, ''), host(NEW.nasipaddress), 'RADIUS');

    INSERT INTO audit_events (
        "id", "at", "adminId", "actor", "actorRole", "action", "target",
        "result", "ip", "requestId", "metadata"
    ) VALUES (
        'radpostauth-' || NEW.id,
        NEW.authdate,
        NULL,
        COALESCE(NULLIF(NEW.username, ''), 'desconhecido'),
        'RADIUS',
        CASE WHEN accepted THEN 'radius.auth.accept' ELSE 'radius.auth.reject' END,
        nas_name,
        CASE WHEN accepted THEN 'SUCCESS'::"AuditResult" ELSE 'FAILURE'::"AuditResult" END,
        COALESCE(host(NEW.nasipaddress), ''),
        'radpostauth-' || NEW.id,
        jsonb_build_object(
            'nasIp', COALESCE(host(NEW.nasipaddress), ''),
            'nasIdentifier', COALESCE(NEW.nasidentifier, ''),
            'authMethod', COALESCE(NEW.auth_method, ''),
            'reply', NEW.reply
        )
    )
    ON CONFLICT ("requestId") DO NOTHING;

    RETURN NEW;
END;
$$;

CREATE TRIGGER radpostauth_audit
AFTER INSERT ON radpostauth
FOR EACH ROW EXECUTE FUNCTION audit_radius_postauth();

CREATE OR REPLACE FUNCTION audit_radius_acct() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    action_name text;
    event_id text;
    nas_name text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        action_name := CASE WHEN NEW.acctstoptime IS NULL THEN 'radius.session.start' ELSE 'radius.session.stop' END;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.acctstoptime IS NOT NULL OR NEW.acctstoptime IS NULL THEN
            RETURN NEW;
        END IF;
        action_name := 'radius.session.stop';
    END IF;

    event_id := 'radacct-' ||
        CASE WHEN action_name = 'radius.session.start' THEN 'start-' ELSE 'stop-' END ||
        NEW.radacctid;

    nas_name := COALESCE(
        (
            SELECT NULLIF(p.nasidentifier, '')
            FROM radpostauth p
            WHERE p.nasipaddress = NEW.nasipaddress
              AND p.nasidentifier IS NOT NULL
              AND p.nasidentifier <> ''
            ORDER BY p.authdate DESC
            LIMIT 1
        ),
        host(NEW.nasipaddress),
        'RADIUS'
    );

    INSERT INTO audit_events (
        "id", "at", "adminId", "actor", "actorRole", "action", "target",
        "result", "ip", "requestId", "metadata"
    ) VALUES (
        event_id,
        COALESCE(NEW.acctstoptime, NEW.acctstarttime, now()),
        NULL,
        COALESCE(NULLIF(NEW.username, ''), 'desconhecido'),
        'RADIUS',
        action_name,
        nas_name,
        'SUCCESS'::"AuditResult",
        COALESCE(host(NEW.nasipaddress), ''),
        event_id,
        jsonb_build_object(
            'nasIp', COALESCE(host(NEW.nasipaddress), ''),
            'sessionId', COALESCE(NEW.acctsessionid, ''),
            'assignedIp', COALESCE(NEW.framedipaddress, ''),
            'terminateCause', COALESCE(NEW.acctterminatecause, ''),
            'sessionTime', COALESCE(NEW.acctsessiontime, 0)
        )
    )
    ON CONFLICT ("requestId") DO NOTHING;

    RETURN NEW;
END;
$$;

CREATE TRIGGER radacct_audit_insert
AFTER INSERT ON radacct
FOR EACH ROW EXECUTE FUNCTION audit_radius_acct();

CREATE TRIGGER radacct_audit_update
AFTER UPDATE ON radacct
FOR EACH ROW EXECUTE FUNCTION audit_radius_acct();

-- Historico existente: autenticacoes.
INSERT INTO audit_events (
    "id", "at", "adminId", "actor", "actorRole", "action", "target",
    "result", "ip", "requestId", "metadata"
)
SELECT
    'radpostauth-' || p.id,
    p.authdate,
    NULL,
    COALESCE(NULLIF(p.username, ''), 'desconhecido'),
    'RADIUS',
    CASE WHEN p.reply = 'Access-Accept' THEN 'radius.auth.accept' ELSE 'radius.auth.reject' END,
    COALESCE(NULLIF(p.nasidentifier, ''), host(p.nasipaddress), 'RADIUS'),
    CASE WHEN p.reply = 'Access-Accept' THEN 'SUCCESS'::"AuditResult" ELSE 'FAILURE'::"AuditResult" END,
    COALESCE(host(p.nasipaddress), ''),
    'radpostauth-' || p.id,
    jsonb_build_object(
        'nasIp', COALESCE(host(p.nasipaddress), ''),
        'nasIdentifier', COALESCE(p.nasidentifier, ''),
        'authMethod', COALESCE(p.auth_method, ''),
        'reply', p.reply
    )
FROM radpostauth p
ON CONFLICT ("requestId") DO NOTHING;

-- Historico existente: inicio das sessoes.
INSERT INTO audit_events (
    "id", "at", "adminId", "actor", "actorRole", "action", "target",
    "result", "ip", "requestId", "metadata"
)
SELECT
    'radacct-start-' || a.radacctid,
    COALESCE(a.acctstarttime, now()),
    NULL,
    COALESCE(NULLIF(a.username, ''), 'desconhecido'),
    'RADIUS',
    'radius.session.start',
    COALESCE(
        (
            SELECT NULLIF(p.nasidentifier, '')
            FROM radpostauth p
            WHERE p.nasipaddress = a.nasipaddress
              AND p.nasidentifier IS NOT NULL
              AND p.nasidentifier <> ''
            ORDER BY p.authdate DESC
            LIMIT 1
        ),
        host(a.nasipaddress),
        'RADIUS'
    ),
    'SUCCESS'::"AuditResult",
    COALESCE(host(a.nasipaddress), ''),
    'radacct-start-' || a.radacctid,
    jsonb_build_object(
        'nasIp', COALESCE(host(a.nasipaddress), ''),
        'sessionId', COALESCE(a.acctsessionid, ''),
        'assignedIp', COALESCE(a.framedipaddress, '')
    )
FROM radacct a
ON CONFLICT ("requestId") DO NOTHING;

-- Historico existente: encerramento das sessoes.
INSERT INTO audit_events (
    "id", "at", "adminId", "actor", "actorRole", "action", "target",
    "result", "ip", "requestId", "metadata"
)
SELECT
    'radacct-stop-' || a.radacctid,
    a.acctstoptime,
    NULL,
    COALESCE(NULLIF(a.username, ''), 'desconhecido'),
    'RADIUS',
    'radius.session.stop',
    COALESCE(
        (
            SELECT NULLIF(p.nasidentifier, '')
            FROM radpostauth p
            WHERE p.nasipaddress = a.nasipaddress
              AND p.nasidentifier IS NOT NULL
              AND p.nasidentifier <> ''
            ORDER BY p.authdate DESC
            LIMIT 1
        ),
        host(a.nasipaddress),
        'RADIUS'
    ),
    'SUCCESS'::"AuditResult",
    COALESCE(host(a.nasipaddress), ''),
    'radacct-stop-' || a.radacctid,
    jsonb_build_object(
        'nasIp', COALESCE(host(a.nasipaddress), ''),
        'sessionId', COALESCE(a.acctsessionid, ''),
        'assignedIp', COALESCE(a.framedipaddress, ''),
        'terminateCause', COALESCE(a.acctterminatecause, ''),
        'sessionTime', COALESCE(a.acctsessiontime, 0)
    )
FROM radacct a
WHERE a.acctstoptime IS NOT NULL
ON CONFLICT ("requestId") DO NOTHING;
