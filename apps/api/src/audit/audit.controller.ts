import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AuditService } from "../common/audit.service";
import { RequirePermissions } from "../common/auth.decorators";

@ApiTags("audit")
@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions("audit.read")
  async list(
    @Query("query") query?: string,
    @Query("result") result?: string,
    @Query("period") period?: string,
  ) {
    return { items: await this.audit.list({ query, result, period }) };
  }
}
