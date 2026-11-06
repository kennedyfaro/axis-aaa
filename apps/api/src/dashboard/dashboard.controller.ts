import { Controller, Get, Query } from "@nestjs/common";
import { RequirePermissions } from "../common/auth.decorators";
import { ApiTags } from "@nestjs/swagger";
import { DashboardService } from "./dashboard.service";

@ApiTags("dashboard")
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("summary")
  @RequirePermissions("users.read")
  summary() {
    return this.dashboard.summary();
  }

  @Get("auth-series")
  @RequirePermissions("users.read")
  series(@Query("range") range?: string) {
    return this.dashboard.series(range ?? "24h");
  }
}
