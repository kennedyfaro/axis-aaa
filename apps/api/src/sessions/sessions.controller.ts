import { Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { SessionsService } from "./sessions.service";
import { AuditService } from "../common/audit.service";
import { RequirePermissions } from "../common/auth.decorators";
import { CurrentAdmin, type AdminPrincipal } from "../common/auth.decorators";

@ApiTags("sessions")
@Controller("sessions")
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions("sessions.read")
  @ApiOperation({ summary: "Sessões RADIUS ativas e encerradas" })
  async list(@Query("status") status?: string, @Query("query") query?: string) {
    return { items: await this.sessions.list({ status, query }) };
  }

  @Post(":id/revoke")
  @RequirePermissions("sessions.revoke")
  @ApiOperation({ summary: "Envia Disconnect-Request (CoA) e encerra o accounting" })
  async revoke(
    @Param("id") id: string,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
  ) {
    const result = await this.sessions.revoke(id);
    await this.audit.record({
      admin,
      action: "session.revoked",
      target: result.username ?? `radacct:${id}`,
      result: result.revoked ? "SUCCESS" : "FAILURE",
      metadata: {
        disconnected: result.disconnected,
        coa: result.coaStatus,
      },
      request,
    });
    return result;
  }
}
