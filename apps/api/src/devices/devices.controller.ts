import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { DevicesService } from "./devices.service";
import { CreateDeviceDto, RotateDeviceSecretDto, UpdateDeviceDto } from "./devices.dto";
import { CurrentAdmin, RequirePermissions, type AdminPrincipal } from "../common/auth.decorators";

@ApiTags("devices")
@Controller("devices")
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  @RequirePermissions("devices.read")
  async list() {
    return { items: await this.devices.list() };
  }

  @Post()
  @RequirePermissions("devices.write")
  @ApiOperation({ summary: "Cadastra NAS e retorna o shared secret uma única vez" })
  create(@Body() dto: CreateDeviceDto, @CurrentAdmin() admin: AdminPrincipal, @Req() request: Request) {
    return this.devices.create(dto, admin, request);
  }

  @Patch(":id")
  @RequirePermissions("devices.write")
  @ApiOperation({ summary: "Atualiza grupos autorizados e atributos RADIUS do NAS" })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateDeviceDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
  ) {
    return this.devices.update(id, dto, admin, request);
  }

  @Delete(":id")
  @RequirePermissions("devices.write")
  @ApiOperation({ summary: "Remove o equipamento do inventário e da tabela nas" })
  remove(@Param("id") id: string, @CurrentAdmin() admin: AdminPrincipal, @Req() request: Request) {
    return this.devices.remove(id, admin, request);
  }

  @Post(":id/rotate-secret")
  @RequirePermissions("devices.write")
  @ApiOperation({ summary: "Rotaciona o shared secret e retorna o novo valor uma única vez" })
  rotate(
    @Param("id") id: string,
    @Body() dto: RotateDeviceSecretDto,
    @CurrentAdmin() admin: AdminPrincipal,
    @Req() request: Request,
  ) {
    return this.devices.rotateSecret(id, dto ?? {}, admin, request);
  }
}
