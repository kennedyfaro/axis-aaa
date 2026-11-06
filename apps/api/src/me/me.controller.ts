import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { MeService } from "./me.service";
import { ChangeOwnPasswordDto, ConfigureTotpDto, UpdateSelfDto } from "../users/users.dto";
import { CurrentAdmin, RequirePermissions } from "../common/auth.decorators";
import type { AdminPrincipal } from "../common/auth.decorators";

@ApiTags("me")
@Controller("me")
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  @RequirePermissions("self.profile.read")
  @ApiOperation({ summary: "Perfil, grupos e sessões da própria identidade" })
  profile(@CurrentAdmin() admin: AdminPrincipal) {
    return this.me.profile(admin);
  }

  @Patch()
  @RequirePermissions("self.profile.write")
  @ApiOperation({ summary: "Atualiza nome, e-mail e observações da própria identidade" })
  update(
    @Body() dto: UpdateSelfDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
  ) {
    return this.me.update(admin, dto, request);
  }

  @Get("sessions")
  @RequirePermissions("self.sessions.read")
  sessions(@CurrentAdmin() admin: AdminPrincipal) {
    return this.me.listSessions(admin);
  }

  @Post("sessions/:id/revoke")
  @RequirePermissions("self.sessions.revoke")
  revoke(@Param("id") id: string, @CurrentAdmin() admin: AdminPrincipal) {
    return this.me.revokeSession(admin, id);
  }

  @Post("password")
  @RequirePermissions("self.profile.write")
  @ApiOperation({ summary: "Troca a própria senha RADIUS, com validação da senha atual" })
  changePassword(
    @Body() dto: ChangeOwnPasswordDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
  ) {
    return this.me.changePassword(admin, dto, request);
  }

  @Post("totp")
  @RequirePermissions("self.profile.write")
  @ApiOperation({ summary: "Gera ou aceita segredo TOTP para a própria conta" })
  totp(
    @Body() dto: ConfigureTotpDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
  ) {
    return this.me.configureTotp(admin, dto, request);
  }
}
