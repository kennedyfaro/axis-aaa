import { Body, Controller, Get, Patch, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { SettingsService } from "./settings.service";
import { UpdateSettingsDto } from "./settings.dto";
import { CurrentAdmin, RequirePermissions, type AdminPrincipal } from "../common/auth.decorators";

@ApiTags("settings")
@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermissions("settings.read")
  get() {
    return this.settings.get();
  }

  @Patch()
  @RequirePermissions("settings.write")
  update(
    @Body() dto: UpdateSettingsDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
  ) {
    return this.settings.update(dto, admin, request);
  }
}
