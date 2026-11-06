import { Module } from "@nestjs/common";
import { MeController } from "./me.controller";
import { MeService } from "./me.service";
import { UsersModule } from "../users/users.module";
import { SessionsModule } from "../sessions/sessions.module";

@Module({
  imports: [UsersModule, SessionsModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
