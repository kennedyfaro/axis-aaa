import { expect, test, type Page } from "@playwright/test";
import { authenticator } from "otplib";

authenticator.options = { window: 1 };

async function login(page: Page) {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "debug@aaa.local";
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
  const secret = process.env.BOOTSTRAP_ADMIN_TOTP_SECRET ?? "";
  if (!password || !secret) {
    throw new Error("Defina BOOTSTRAP_ADMIN_PASSWORD e BOOTSTRAP_ADMIN_TOTP_SECRET para os testes e2e.");
  }

  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Continuar" }).click();

  const digits = page.locator('input[inputmode="numeric"]');
  await digits.first().waitFor({ state: "visible" });
  const code = authenticator.generate(secret);
  for (let index = 0; index < 6; index += 1) {
    await digits.nth(index).fill(code[index]);
  }

  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard");
}

test.describe("fluxo administrativo", () => {
  test("login com TOTP leva ao dashboard e gerencia pools de IP", async ({ page }) => {
    const poolName = `Pool E2E ${Date.now()}`;
    const second = 10 + Math.floor(Math.random() * 200);
    await login(page);
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
    await expect(page.getByText("Identidades ativas")).toBeVisible();
    await expect(page.getByText("Saúde dos serviços")).toBeVisible();

    await page.goto("/pools");
    await expect(page.getByRole("heading", { name: "Pools de IP" })).toBeVisible();
    await expect(page.getByText("Pool VPN", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Novo pool" }).click();
    const createDialog = page.getByRole("dialog");
    await createDialog.locator("#pool-name").fill(poolName);
    await createDialog.locator("#pool-description").fill("Faixa temporária do teste");
    await createDialog.locator("#pool-start").fill(`10.${second}.0.2`);
    await createDialog.locator("#pool-end").fill(`10.${second}.0.5`);
    await createDialog.getByRole("button", { name: "Criar pool" }).click();
    await expect(page.getByText(`Pool ${poolName} criado com 4 endereços.`)).toBeVisible();
    await expect(page.getByText(poolName, { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: `Excluir ${poolName}` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Excluir pool" }).click();
    await expect(page.getByText(`Pool ${poolName} excluído.`)).toBeVisible();
    await expect(page.getByText(poolName, { exact: true })).toHaveCount(0);

    const tempLogin = `poole2e${Date.now().toString().slice(-8)}`;
    const tempPassword = "Pool!E2e2026Seguro";
    const created = await page.evaluate(
      async ({ login, password }) => {
        const csrf =
          document.cookie
            .split("; ")
            .find((item) => item.startsWith("aaa_csrf="))
            ?.slice("aaa_csrf=".length) ?? "";
        const groups = await (await fetch("/api/v1/groups")).json();
        const vpn = groups.items.find((group: { slug: string }) => group.slug === "vpn-pptp");
        const response = await fetch("/api/v1/users", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
          body: JSON.stringify({
            name: "Pool E2E",
            login,
            email: `${login}@aaa.local`,
            groupIds: [vpn.id],
            mfa: false,
            password,
          }),
        });
        const body = await response.json();
        return { status: response.status, id: body.id, login: body.login };
      },
      { login: tempLogin, password: tempPassword },
    );
    expect(created.status).toBe(201);

    try {
      await page.reload();
      await page.getByRole("button", { name: "Vincular IP" }).click();
      const assignDialog = page.getByRole("dialog");
      await assignDialog.locator("#assign-user").selectOption(created.id);
      const address = await assignDialog.locator("#assign-address").inputValue();
      await assignDialog.getByRole("button", { name: "Vincular endereço" }).click();
      await expect(page.getByText(`IP ${address} vinculado a Pool E2E.`)).toBeVisible();

      const addressPattern = new RegExp(`${address.replace(/\./g, "\\.")}\\b`);
      const row = page.getByRole("row", { name: addressPattern });
      await expect(row.getByText("Em uso")).toBeVisible();
      await expect(row.getByText("Pool E2E")).toBeVisible();

      await page.goto(`/users/${created.id}`);
      await expect(page.getByText("IP VPN", { exact: true })).toBeVisible();
      await expect(page.getByText(address, { exact: true })).toBeVisible();

      await page.goto("/pools");
      const assignedRow = page.getByRole("row", { name: addressPattern });
      await assignedRow.getByRole("button", { name: "Liberar" }).click();
      await expect(page.getByText(`IP ${address} liberado.`)).toBeVisible();
      await expect(assignedRow.getByText("Livre")).toBeVisible();
    } finally {
      await page.evaluate(async (id) => {
        const csrf =
          document.cookie
            .split("; ")
            .find((item) => item.startsWith("aaa_csrf="))
            ?.slice("aaa_csrf=".length) ?? "";
        await fetch(`/api/v1/users/${id}`, {
          method: "DELETE",
          headers: { "X-CSRF-Token": csrf },
        });
      }, created.id);
    }
  });

  test("lista de usuários filtra e valida o formulário de criação", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Usuários" }).first().click();
    await page.waitForURL("**/users");
    await expect(page.getByRole("heading", { name: "Usuários" })).toBeVisible();

    await page.getByLabel("Buscar identidades").fill("kennedy.matos");
    await expect(page.getByRole("link", { name: /Kennedy Matos/ })).toBeVisible();

    await page.getByRole("button", { name: "Novo usuário" }).click();
    await page.getByRole("button", { name: "Criar identidade" }).click();
    await expect(page.getByText("Informe o nome completo.")).toBeVisible();
    await page.getByLabel("Nome completo").fill("Teste Sem Senha");
    await page.getByRole("button", { name: "Criar identidade" }).click();
    await expect(page.getByText("A senha RADIUS deve ter ao menos 14 caracteres.")).toBeVisible();
  });

  test("edita os grupos de uma identidade", async ({ page }) => {
    await login(page);

    const usersResponse = await page.request.get("/api/v1/users?query=kennedy.matos&limit=10");
    const users = await usersResponse.json();
    const user = users.items.find((item: { login: string }) => item.login === "kennedy.matos");
    expect(user).toBeTruthy();

    const groupsResponse = await page.request.get("/api/v1/groups");
    const groups = await groupsResponse.json();
    const viewGroup = groups.items.find((item: { name: string }) => item.name === "Acesso de Visualização");
    expect(viewGroup).toBeTruthy();
    const initiallySelected = user.groupIds.includes(viewGroup.id);

    await page.goto(`/users/${user.id}`);
    await page.getByRole("button", { name: "Editar" }).first().click();
    await page.getByRole("checkbox", { name: "Acesso de Visualização" }).setChecked(!initiallySelected);
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const groupState = async () => {
      const response = await page.request.get("/api/v1/users?query=kennedy.matos&limit=10");
      const body = await response.json();
      const current = body.items.find((item: { login: string }) => item.login === "kennedy.matos");
      return current?.groupIds.includes(viewGroup.id) ?? null;
    };

    await expect.poll(groupState).toBe(!initiallySelected);

    await page.getByRole("button", { name: "Editar" }).first().click();
    await page.getByRole("checkbox", { name: "Acesso de Visualização" }).setChecked(initiallySelected);
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(groupState).toBe(initiallySelected);
  });

  test("login no painel com credencial RADIUS", async ({ page }) => {
    await login(page);

    const loginName = `panel${Date.now().toString().slice(-8)}`;
    const created = await page.evaluate(async (name) => {
      const csrf = document.cookie.split("; ").find((c) => c.startsWith("aaa_csrf="))?.slice(9) ?? "";
      const groups = await (await fetch("/api/v1/groups")).json();
      const adminGroup = groups.items.find((group: { slug: string }) => group.slug === "administradores");
      const response = await fetch("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({
          name: "Painel E2E",
          login: name,
          email: `${name}@aaa.local`,
          groupIds: [adminGroup.id],
          mfa: false,
          password: "Panel!E2e2026Seguro",
        }),
      });
      const body = await response.json();
      return { status: response.status, id: body.id, login: body.login };
    }, loginName);
    expect(created.status).toBe(201);

    await page.context().clearCookies();
    await page.goto("/login");
    await page.locator("#email").fill(created.login);
    await page.locator("#password").fill("Panel!E2e2026Seguro");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.waitForURL("**/dashboard");
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();

    await page.evaluate(async (id) => {
      const csrf = document.cookie.split("; ").find((c) => c.startsWith("aaa_csrf="))?.slice(9) ?? "";
      await fetch(`/api/v1/users/${id}`, { method: "DELETE", headers: { "X-CSRF-Token": csrf } });
    }, created.id);
    await page.context().clearCookies();
  });

  test("redefinição de credencial oculta a senha e exige confirmação", async ({ page }) => {
    await login(page);

    const usersResponse = await page.request.get("/api/v1/users?query=kennedy.matos&limit=10");
    const users = await usersResponse.json();
    const user = users.items.find((item: { login: string }) => item.login === "kennedy.matos");
    expect(user).toBeTruthy();

    await page.goto(`/users/${user.id}`);
    await page.getByRole("button", { name: "Mais ações" }).click();
    await page.getByRole("menuitem", { name: "Redefinir credencial RADIUS" }).click();

    await expect(page.locator("#reset-password")).toHaveAttribute("type", "password");
    await expect(page.locator("#reset-password-confirm")).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Mostrar senha" }).click();
    await expect(page.locator("#reset-password")).toHaveAttribute("type", "text");
    await expect(page.locator("#reset-password-confirm")).toHaveAttribute("type", "text");

    await page.locator("#reset-password-confirm").fill("senha-diferente");
    await expect(page.getByText("As senhas não coincidem.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Redefinir credencial" })).toBeDisabled();

    await page.getByRole("button", { name: "Cancelar" }).click();
  });

  test("identidade RADIUS vê apenas o próprio perfil", async ({ page }) => {
    await login(page);

    const loginName = `self${Date.now().toString().slice(-8)}`;
    const created = await page.evaluate(async (name) => {
      const csrf = document.cookie.split("; ").find((c) => c.startsWith("aaa_csrf="))?.slice(9) ?? "";
      const groups = await (await fetch("/api/v1/groups")).json();
      const full = groups.items.find((group: { slug: string }) => group.slug === "acesso-full");
      const response = await fetch("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({
          name: "Self E2E",
          login: name,
          email: `${name}@aaa.local`,
          groupIds: [full.id],
          mfa: false,
          password: "Self!E2e2026Seguro",
        }),
      });
      const body = await response.json();
      return { status: response.status, id: body.id, login: body.login };
    }, loginName);
    expect(created.status).toBe(201);

    await page.context().clearCookies();
    await page.goto("/login");
    await page.locator("#email").fill(created.login);
    await page.locator("#password").fill("Self!E2e2026Seguro");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.waitForURL("**/me");
    await expect(page.getByRole("heading", { name: "Meu perfil" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Usuários" })).toHaveCount(0);

    const statuses = await page.evaluate(async () => ({
      users: (await fetch("/api/v1/users")).status,
      dashboard: (await fetch("/api/v1/dashboard/summary")).status,
    }));
    expect(statuses.users).toBe(403);
    expect(statuses.dashboard).toBe(403);

    await page.context().clearCookies();
    await login(page);
    await page.evaluate(async (id) => {
      const csrf = document.cookie.split("; ").find((c) => c.startsWith("aaa_csrf="))?.slice(9) ?? "";
      await fetch(`/api/v1/users/${id}`, { method: "DELETE", headers: { "X-CSRF-Token": csrf } });
    }, created.id);
    await page.context().clearCookies();
  });

  test("auditoria expande metadados de um evento", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Auditoria" }).first().click();
    await page.waitForURL("**/audit");
    await page.getByRole("button", { name: "Expandir evento" }).first().click();
    await expect(page.getByText("Request ID")).toBeVisible();
  });
});

test.describe("navegação mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("abre o menu lateral e navega para sessões", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "Abrir navegação" }).click();
    await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
    await page.getByRole("link", { name: "Sessões" }).click();
    await page.waitForURL("**/sessions");
    await expect(page.getByRole("heading", { name: "Sessões" })).toBeVisible();
  });
});

test.describe("equipamentos", () => {
  test("cadastra e exclui um NAS temporário", async ({ page }) => {
    const name = `e2e-del-${Date.now()}`;
    await login(page);
    await page.goto("/devices");
    await page.getByRole("button", { name: "Novo equipamento" }).click();
    await page.getByLabel("Nome do equipamento").fill(name);
    await page.getByLabel("Modelo").fill("CRS326");
    await page.getByLabel("Descrição").fill("Equipamento temporário do teste");
    await page.getByLabel("Endereço IP").fill("10.99.0.9");
    await page.getByLabel("NAS-Identifier").fill(name);
    await page.getByLabel("Localidade").fill("Laboratório");
    await page.getByRole("checkbox", { name: "Acesso Full" }).check();
    await page.getByRole("button", { name: "Cadastrar equipamento" }).click();
    await page.getByRole("button", { name: "Concluir" }).click();

    await page.getByLabel("Buscar equipamentos").fill(name);
    await page.getByRole("button", { name: `Ações para ${name}` }).click();
    await page.getByRole("menuitem", { name: "Excluir equipamento" }).click();
    await page.getByRole("button", { name: "Excluir equipamento" }).last().click();
    await expect(page.getByText("Nenhum equipamento neste filtro")).toBeVisible();
  });
});
