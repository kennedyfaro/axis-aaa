import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { PoolsService } from "./pools.service";
import { AssignIpDto, CreateIpPoolDto } from "./pools.dto";
import { CurrentAdmin, RequirePermissions, type AdminPrincipal } from "../common/auth.decorators";

@ApiTags("ip-pools")
@Controller("ip-pools")
export class PoolsController {
  constructor(private readonly pools: PoolsService) {}

  @Get()
  @RequirePermissions("pools.read")
  async list() {
    return { items: await this.pools.list() };
  }

  @Get("eligible-users")
  @RequirePermissions("pools.read")
  @ApiOperation({ summary: "Identidades VPN ativas e sem IP fixo" })
  async eligibleUsers() {
    return { items: await this.pools.eligibleUsers() };
  }

  @Get(":id/addresses")
  @RequirePermissions("pools.read")
  @ApiOperation({ summary: "Endereços do pool com o vínculo atual" })
  addresses(@Param("id") id: string) {
    return this.pools.addresses(id);
  }

  @Post()
  @RequirePermissions("pools.write")
  @ApiOperation({ summary: "Cria uma faixa de IPs para endereços fixos de VPN" })
  create(
    @Body() dto: CreateIpPoolDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
  ) {
    return this.pools.create(dto, admin, request);
  }

  @Delete(":id")
  @RequirePermissions("pools.write")
  @ApiOperation({ summary: "Exclui um pool sem endereços vinculados" })
  remove(@Param("id") id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() request: Request) {
    return this.pools.remove(id, admin, request);
  }

  @Post(":id/assign")
  @RequirePermissions("pools.write")
  @ApiOperation({ summary: "Vincula um IP livre a uma identidade de grupo VPN" })
  assign(
    @Param("id") id: string,
    @Body() dto: AssignIpDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
  ) {
    return this.pools.assign(id, dto, admin, request);
  }

  @Delete(":id/assignments/:userId")
  @RequirePermissions("pools.write")
  @ApiOperation({ summary: "Libera o IP fixo da identidade" })
  release(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
  ) {
    return this.pools.release(id, userId, admin, request);
  }
}
