# Certificados TLS

Coloque aqui os certificados de produção:

- `fullchain.pem`
- `privkey.pem`

Os arquivos são ignorados pelo Git. Para o teste automatizado de TLS, gere um
par autoassinado temporariamente:

```bash
openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
  -subj "/CN=localhost" \
  -keyout infra/nginx/tls/privkey.pem \
  -out infra/nginx/tls/fullchain.pem
```
