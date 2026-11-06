import { ForbiddenException, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { UsersService } from "../users/users.service";
import { SessionsService } from "../sessions/sessions.service";
import type { AdminPrincipal } from "../common/auth.decorators";
import type { ChangeOwnPasswordDto, ConfigureTotpDto, UpdateSelfDto } from "../users/users.dto";

@Injectable()
export class MeService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
  ) {}

  async profile(admin: AdminPrincipal) {
    return this.users.detail(await this.selfUserId(admin));
  }

  async update(admin: AdminPrincipal, dto: UpdateSelfDto, request: Request) {
    return this.users.updateSelf(await this.selfUserId(admin), dto, admin, request);
  }

  async listSessions(admin: AdminPrincipal) {
    const login = await this.selfLogin(admin);
    return { items: await this.sessions.listForUser(login) };
  }

  async revokeSession(admin: AdminPrincipal, id: string) {
    const login = await this.selfLogin(admin);
    return this.sessions.revoke(id, login);
  }

  async changePassword(admin: AdminPrincipal, dto: ChangeOwnPasswordDto, request: Request) {
    return this.users.changeOwnPassword(await this.selfUserId(admin), dto, admin, request);
  }

  async configureTotp(admin: AdminPrincipal, dto: ConfigureTotpDto, request: Request) {
    return this.users.configureTotp(await this.selfUserId(admin), dto, admin, request);
  }

  private async selfUserId(admin: AdminPrincipal) {
    if (!admin.userId) {
      throw new ForbiddenException("Esta conta não está vinculada a uma identidade.");
    }
    return admin.userId;
  }

  private async selfLogin(admin: AdminPrincipal) {
    const login = await this.users.findLogin(await this.selfUserId(admin));
    if (!login) throw new ForbiddenException("Identidade não encontrada.");
    return login;
  }
}
