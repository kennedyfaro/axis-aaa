import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { UsersService } from "./users.service";
import { ConfigureTotpDto, CreateUserDto, ResetPasswordDto, UpdateUserDto } from "./users.dto";
import { CurrentAdmin, RequirePermissions, type AdminPrincipal } from "../common/auth.decorators";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions("users.read")
  list(
    @Query("query") query?: string,
    @Query("status") status?: string,
    @Query("group") group?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.users.list({ query, status, group, page: Number(page), pageSize: Number(pageSize) });
  }

  @Post()
  @RequirePermissions("users.write")
  @ApiOperation({ summary: "Cria identidade e credencial RADIUS (NT-Password)" })
  create(
    @Body() dto: CreateUserDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
  ) {
    return this.users.create(dto, admin, request);
  }

  @Get(":id")
  @RequirePermissions("users.read")
  detail(@Param("id") id: string) {
    return this.users.detail(id);
  }

  @Patch(":id")
  @RequirePermissions("users.write")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
  ) {
    return this.users.update(id, dto, admin, request);
  }

  @Delete(":id")
  @RequirePermissions("users.write")
  remove(@Param("id") id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() request: Request) {
    return this.users.remove(id, admin, request);
  }

  @Post(":id/block")
  @RequirePermissions("users.block")
  block(@Param("id") id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() request: Request) {
    return this.users.block(id, admin, request);
  }

  @Post(":id/unblock")
  @RequirePermissions("users.block")
  unblock(@Param("id") id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() request: Request) {
    return this.users.unblock(id, admin, request);
  }

  @Post(":id/revoke-sessions")
  @RequirePermissions("sessions.revoke")
  revokeSessions(
    @Param("id") id: string,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
  ) {
    return this.users.revokeSessions(id, admin, request);
  }

  @Post(":id/reset-password")
  @RequirePermissions("users.write")
  @ApiOperation({ summary: "Redefine a credencial RADIUS sem armazenar a senha" })
  resetPassword(
    @Param("id") id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
  ) {
    return this.users.resetPassword(id, dto, admin, request);
  }

  @Post(":id/totp")
  @RequirePermissions("users.write")
  @ApiOperation({ summary: "Gera novo segredo TOTP para a conta de painel da identidade" })
  configureTotp(
    @Param("id") id: string,
    @Body() dto: ConfigureTotpDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
  ) {
    return this.users.configureTotp(id, dto, admin, request);
  }
}
