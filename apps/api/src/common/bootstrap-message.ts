/**
 * Mensagem de saída do bootstrap. Não recebe o segredo TOTP de propósito:
 * o segredo nunca deve ser impresso em console/log.
 */
export function bootstrapMessage(email: string, totpOutputPath: string | null): string {
  const lines = ["Administrador criado.", `E-mail: ${email}`];
  if (totpOutputPath) {
    lines.push(
      `Segredo TOTP gravado em ${totpOutputPath} (modo 600).`,
      "Leia o arquivo em canal seguro e remova-o após configurar o autenticador.",
    );
  } else {
    lines.push(
      "Segredo TOTP fornecido por BOOTSTRAP_ADMIN_TOTP_SECRET; não foi impresso.",
    );
  }
  lines.push("", "Guarde o segredo em local seguro. Ele não será exibido novamente.");
  return lines.join("\n");
}
