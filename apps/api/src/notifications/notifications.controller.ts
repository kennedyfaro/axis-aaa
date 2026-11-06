import { Controller, Get, Param, Patch } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../common/prisma.service";
import { RequirePermissions } from "../common/auth.decorators";

@ApiTags("notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions("users.read")
  async list() {
    const items = await this.prisma.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return {
      items: items.map((item) => ({
        ...item,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
      unread: items.filter((item) => !item.readAt).length,
    };
  }

  @Patch(":id/read")
  @RequirePermissions("settings.write")
  async read(@Param("id") id: string) {
    await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    return { ok: true };
  }
}
