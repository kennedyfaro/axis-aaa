import { Body, Controller, Get, Param, Patch, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { GroupsService } from "./groups.service";
import { UpdateGroupDto } from "./groups.dto";
import { CurrentAdmin, RequirePermissions } from "../common/auth.decorators";
import type { AdminPrincipal } from "../common/auth.decorators";

@ApiTags("groups")
@Controller("groups")
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  @RequirePermissions("groups.read")
  async list() {
    return { items: await this.groups.list() };
  }

  @Patch(":id")
  @RequirePermissions("groups.write")
  @ApiOperation({ summary: "Atualiza os atributos RADIUS aplicados pelo grupo" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateGroupDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
  ) {
    return this.groups.update(id, dto, admin, request);
  }
}
