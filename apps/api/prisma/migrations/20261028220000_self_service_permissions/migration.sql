-- Acesso ao painel para as identidades de rede, restrito aos proprios dados.
UPDATE "groups"
SET "permissions" = ARRAY[
    'self.profile.read',
    'self.profile.write',
    'self.sessions.read',
    'self.sessions.revoke'
]::text[]
WHERE "slug" IN ('acesso-full', 'acesso-visualizacao');
