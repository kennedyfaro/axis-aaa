import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto, MfaDto } from "./auth.dto";
import { CurrentAdmin, Public, type AdminPrincipal } from "../common/auth.decorators";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "Primeiro fator do login administrativo" })
  login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.login(dto, request, response);
  }

  @Public()
  @Post("mfa")
  @HttpCode(200)
  @ApiOperation({ summary: "Valida TOTP e emite cookies de sessão" })
  mfa(@Body() dto: MfaDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.auth.mfa(dto, request, response);
  }

  @Public()
  @Post("mfa/enroll")
  @HttpCode(200)
  @ApiOperation({ summary: "Confirma o primeiro TOTP e emite cookies de sessão" })
  enrollMfa(
    @Body() dto: MfaDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.enrollMfa(dto, request, response);
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  @ApiOperation({ summary: "Rotaciona o refresh token e reemite o access token" })
  refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.auth.refresh(request, response);
  }

  @Public()
  @Post("logout")
  @HttpCode(200)
  logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.auth.logout(request, response);
  }

  @Get("me")
  @ApiOperation({ summary: "Sessão atual e permissões efetivas" })
  me(@CurrentAdmin() admin: AdminPrincipal) {
    return this.auth.me(admin.id);
  }
}
