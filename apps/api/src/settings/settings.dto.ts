import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, Max, Min } from "class-validator";

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  organization?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  sessionTimeoutMinutes?: number;

  @IsOptional()
  @IsBoolean()
  mfaRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(12)
  @Max(64)
  passwordMinLength?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  passwordRotationDays?: number;

  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(20)
  maxLoginAttempts?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3650)
  auditRetentionDays?: number;

  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(365)
  sessionRetentionDays?: number;

  @IsOptional()
  @IsBoolean()
  notificationsEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  notificationsWebhook?: boolean;

  @IsOptional()
  @IsUrl({ require_tld: false })
  webhookUrl?: string | null;
}
