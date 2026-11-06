import { Controller, Get, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { HealthService } from "./health.service";
import { Public, RequirePermissions } from "../common/auth.decorators";
import { RateLimitService } from "../common/rate-limit.service";
import { clientIp } from "../common/request";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Public()
  @Get()
  async check(@Req() request: Request) {
    // O endpoint é público e usado pela tela de login: rate limit + cache
    // curto evitam que cada request execute consultas no PostgreSQL/Redis.
    await this.rateLimit.health(clientIp(request));
    return this.health.summary();
  }

  @Get("details")
  @RequirePermissions("settings.read")
  details() {
    return this.health.check();
  }
}
