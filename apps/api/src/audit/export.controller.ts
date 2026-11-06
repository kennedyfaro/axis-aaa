import { Controller, Get, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { AuditService } from "../common/audit.service";
import { UsersService } from "../users/users.service";
import { CurrentAdmin, RequirePermissions, type AdminPrincipal } from "../common/auth.decorators";

@Controller("export")
export class ExportController {
  constructor(
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  @Get("users")
  @RequirePermissions("users.export")
  async usersExport(@Res() response: Response) {
    const csv = await this.users.exportCsv();
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="identidades-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.send(csv);
  }

  @Get("audit")
  @RequirePermissions("audit.export")
  async auditExport(
    @Query("period") period: string | undefined,
    @Query("result") result: string | undefined,
    @Query("query") query: string | undefined,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const events = await this.audit.list({ period: period ?? "30d", result, query });
    const csv = await this.audit.exportCsv(events);
    await this.audit.record({
      admin,
      action: "audit.exported",
      target: `periodo:${period ?? "30d"}`,
      request,
      metadata: { rows: events.length },
    });
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="auditoria-${new Date().toISOString().slice(0, 10)}.csv"`);
    response.send(csv);
  }
}
