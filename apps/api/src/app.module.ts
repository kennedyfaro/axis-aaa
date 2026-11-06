import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { CommonModule } from "./common/common.module";
import { RedisModule } from "./common/redis.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { GroupsModule } from "./groups/groups.module";
import { PoliciesModule } from "./policies/policies.module";
import { DevicesModule } from "./devices/devices.module";
import { PoolsModule } from "./pools/pools.module";
import { RadiusModule } from "./radius/radius.module";
import { SessionsModule } from "./sessions/sessions.module";
import { AuditModule } from "./audit/audit.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { SettingsModule } from "./settings/settings.module";
import { HealthModule } from "./health/health.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { MeModule } from "./me/me.module";
import { AuthGuard } from "./common/auth.guard";
import { PermissionsGuard } from "./common/permissions.guard";
import { CsrfGuard } from "./common/csrf.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    RedisModule,
    AuthModule,
    RadiusModule,
    UsersModule,
    GroupsModule,
    PoliciesModule,
    DevicesModule,
    PoolsModule,
    SessionsModule,
    AuditModule,
    DashboardModule,
    SettingsModule,
    HealthModule,
    NotificationsModule,
    MeModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
