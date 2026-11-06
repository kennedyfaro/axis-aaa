import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { PoliciesService } from "./policies.service";
import { CreatePolicyDto, TogglePolicyDto } from "./policies.dto";
import { CurrentAdmin, RequirePermissions, type AdminPrincipal } from "../common/auth.decorators";

@ApiTags("policies")
@Controller("policies")
export class PoliciesController {
  constructor(private readonly policies: PoliciesService) {}

  @Get()
  @RequirePermissions("policies.read")
  async list() {
    return { items: await this.policies.list() };
  }

  @Post()
  @RequirePermissions("policies.write")
  create(@Body() dto: CreatePolicyDto, @CurrentAdmin() admin: AdminPrincipal, @Req() request: Request) {
    return this.policies.create(dto, admin, request);
  }

  @Post(":id/toggle")
  @RequirePermissions("policies.write")
  toggle(
    @Param("id") id: string,
    @Body() dto: TogglePolicyDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
  ) {
    return this.policies.toggle(id, dto.enabled, admin, request);
  }
}
