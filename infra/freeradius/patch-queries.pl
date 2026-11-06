#!/usr/bin/perl
use strict;
use warnings;

my $file = shift or die "usage: patch-queries.pl <queries.conf>\n";
open my $in, "<", $file or die "open $file: $!";
local $/;
my $content = <$in>;
close $in;

# Auditoria de autenticacao sem senha e com origem/NAS.
# Atributos de resposta vem de radreply + radgroupreply (por grupo).
if ($content !~ /nasipaddress, nasidentifier, auth_method/) {
    # User-Name passa por %{SQL-User-Name}, que é escapado pelo módulo SQL.
    # NAS-Identifier não é interpolado: o nome do NAS vem da tabela `nas`
    # pelo IP de origem, evitando SQL injection via atributo controlado
    # pelo equipamento.
    my $query = q~INSERT INTO radpostauth (username, pass, reply, authdate, nasipaddress, nasidentifier, auth_method) VALUES ('%{SQL-User-Name}', '', '%{reply:Packet-Type}', NOW(), NULLIF('%{Packet-Src-IP-Address}', '')::inet, NULLIF((SELECT shortname FROM nas WHERE nasname = '%{Packet-Src-IP-Address}' ORDER BY (nasname = '%{Packet-Src-IP-Address}') DESC LIMIT 1), ''), COALESCE(NULLIF('%{control:Auth-Type}', ''), 'unknown'))~;
    my $replacement = "\npost-auth {\n\tquery = \"$query\"\n}";
    $content =~ s/\npost-auth \{\n\t# Write SQL queries to a logfile.*?\n\}/$replacement/s
        or die "post-auth query block not found in $file\n";
}

# Usa o escape nativo do driver PostgreSQL para todos os valores
# substituídos em consultas SQL. Sem isso, `safe_characters` fica em uso
# e o escape depende de uma lista que não cobre todos os atributos.
if (index($content, "\nauto_escape = yes") < 0) {
    $content =~ s/^#auto_escape = yes$/auto_escape = yes/m
        or die "auto_escape directive not found in $file\n";
}

# O accounting usa o horario de recebimento do servidor FreeRADIUS.
# O Event-Timestamp enviado pelo NAS pode estar errado (por exemplo, 1970)
# e contaminaria AcctStartTime, AcctStopTime e a trilha de auditoria.
{
    my $old_timestamp = 'event_timestamp_epoch = "%{%{integer:Event-Timestamp}:-%l}"';
    my $timestamp_pos = index($content, $old_timestamp);
    if ($timestamp_pos >= 0) {
        my $new_timestamp = "# Horario de recebimento do servidor; nao confia no clock do NAS.\nevent_timestamp_epoch = \"%l\"";
        substr($content, $timestamp_pos, length($old_timestamp)) = $new_timestamp;
    }
}

# A consulta de radcheck tambem valida a janela de vigencia da identidade.
# Assim uma conta expirada/bloqueada/removida deixa de retornar NT-Password
# mesmo que o sync da API ainda nao tenha rodado. Contas criadas apenas em
# radcheck (sem linha em users) continuam funcionando.
if (index($content, 'LEFT JOIN users u ON u.login = rc.UserName') < 0) {
    my $old_check = "authorize_check_query = \"\\\n\tSELECT id, UserName, Attribute, Value, Op \\\n\tFROM \${authcheck_table} \\\n\tWHERE Username = '%{SQL-User-Name}' \\\n\tORDER BY id\"";
    my $new_check = "authorize_check_query = \"\\\n\tSELECT rc.id, rc.UserName, rc.Attribute, rc.Value, rc.Op \\\n\tFROM \${authcheck_table} rc \\\n\tLEFT JOIN users u ON u.login = rc.UserName \\\n\tWHERE rc.Username = '%{SQL-User-Name}' \\\n\t  AND (u.id IS NULL OR (u.status = 'ACTIVE' AND u.\\\"deletedAt\\\" IS NULL \\\n\t    AND (u.\\\"validFrom\\\" IS NULL OR u.\\\"validFrom\\\" <= NOW()) \\\n\t    AND (u.\\\"validUntil\\\" IS NULL OR u.\\\"validUntil\\\" >= NOW()))) \\\n\tORDER BY rc.id\"";
    my $check_pos = index($content, $old_check);
    die "authorize_check_query block not found in $file\n" if $check_pos < 0;
    substr($content, $check_pos, length($old_check)) = $new_check;
}

# Soma os atributos de TODOS os grupos do usuario.
# O padrao usa %{SQL-Group}, que expande apenas o primeiro grupo; assim um
# usuario em "Acesso Full" + "VPN PPTP" recebia apenas os atributos do
# primeiro grupo (sem Framed-Protocol=PPP).
# Quando o mesmo atributo existe em mais de um grupo (ex.: PPTP + L2TP),
# vence o grupo de menor prioridade, sem duplicar o atributo na resposta.
if (index($content, 'SELECT DISTINCT ON (gr.Attribute)') < 0) {
    my $old_check = 'authorize_group_check_query = "\\
	SELECT id, GroupName, Attribute, Value, op \\
	FROM ${groupcheck_table} \\
	WHERE GroupName = \'%{${group_attribute}}\' \\
	ORDER BY id"';
    my $old_reply = 'authorize_group_reply_query = "\\
	SELECT id, GroupName, Attribute, Value, op \\
	FROM ${groupreply_table} \\
	WHERE GroupName = \'%{${group_attribute}}\' \\
	ORDER BY id"';
    my $new_check = 'authorize_group_check_query = "\\
	SELECT DISTINCT ON (gc.Attribute) gc.id, gc.GroupName, gc.Attribute, gc.Value, gc.op \\
	FROM ${groupcheck_table} gc \\
	JOIN ${usergroup_table} ug ON ug.GroupName = gc.GroupName \\
	WHERE ug.UserName = \'%{SQL-User-Name}\' \\
	ORDER BY gc.Attribute, ug.priority, gc.id"';
    my $new_reply = 'authorize_group_reply_query = "\\
	SELECT DISTINCT ON (gr.Attribute) gr.id, gr.GroupName, gr.Attribute, gr.Value, gr.op \\
	FROM ${groupreply_table} gr \\
	JOIN ${usergroup_table} ug ON ug.GroupName = gr.GroupName \\
	WHERE ug.UserName = \'%{SQL-User-Name}\' \\
	ORDER BY gr.Attribute, ug.priority, gr.id"';

    my $check_pos = index($content, $old_check);
    my $reply_pos = index($content, $old_reply);
    die "group check query block not found in $file\n" if $check_pos < 0;
    die "group reply query block not found in $file\n" if $reply_pos < 0;

    substr($content, $reply_pos, length($old_reply)) = $new_reply;
    substr($content, $check_pos, length($old_check)) = $new_check;
}

open my $out, ">", $file or die "write $file: $!";
print $out $content;
close $out;
