import { Module } from "@nestjs/common";
import { AuditController } from "./audit.controller";
import { ExportController } from "./export.controller";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [UsersModule],
  controllers: [AuditController, ExportController],
})
export class AuditModule {}
