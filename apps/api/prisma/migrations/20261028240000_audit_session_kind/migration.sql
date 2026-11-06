-- Classifica sessoes RADIUS como VPN ou gerencia na trilha.
-- A classificacao usa os atributos de accounting enviados pelo NAS:
-- PPP/Virtual => VPN; Login-User/sem PPP => gerencia.

CREATE OR REPLACE FUNCTION audit_radius_acct() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    action_name text;
    event_id text;
    nas_name text;
    session_kind text;
BEGIN
    IF TG_OP = 'INSERT' THEN
        action_name := CASE WHEN NEW.acctstoptime IS NULL THEN 'radius.session.start' ELSE 'radius.session.stop' END;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.acctstoptime IS NOT NULL OR NEW.acctstoptime IS NULL THEN
            RETURN NEW;
        END IF;
        action_name := 'radius.session.stop';
    END IF;

    session_kind := CASE
        WHEN NEW.framedprotocol = 'PPP'
          OR NEW.servicetype = 'Framed-User'
          OR NEW.nasporttype = 'Virtual'
        THEN 'vpn'
        ELSE 'management'
    END;

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
            'sessionTime', COALESCE(NEW.acctsessiontime, 0),
            'sessionKind', session_kind,
            'serviceType', COALESCE(NEW.servicetype, ''),
            'framedProtocol', COALESCE(NEW.framedprotocol, ''),
            'nasPortType', COALESCE(NEW.nasporttype, '')
        )
    )
    ON CONFLICT ("requestId") DO NOTHING;

    RETURN NEW;
END;
$$;
