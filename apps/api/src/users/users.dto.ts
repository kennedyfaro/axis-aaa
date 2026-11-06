import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
} from "class-validator";

export class CreateUserDto {
  @IsString()
  @Length(3, 80)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9._-]{3,32}$/, { message: "Login inválido." })
  login!: string;

  @IsEmail({}, { message: "Informe um e-mail válido." })
  email!: string;

  @IsArray()
  @ArrayNotEmpty({ message: "Selecione ao menos um grupo." })
  groupIds!: string[];

  @IsOptional()
  @IsDateString({}, { message: "Data de validade inválida." })
  validUntil?: string | null;

  @IsBoolean()
  mfa!: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 280)
  notes?: string | null;

  @IsString()
  @MinLength(14, { message: "A senha RADIUS deve ter ao menos 14 caracteres." })
  password!: string;
}

export class ConfigureTotpDto {
  @IsOptional()
  @IsString()
  @Length(16, 120)
  secret?: string;
}

export class ChangeOwnPasswordDto {
  @IsString()
  @Length(10, 128)
  currentPassword!: string;

  @IsString()
  @MinLength(14, { message: "A nova senha deve ter ao menos 14 caracteres." })
  newPassword!: string;
}

export class UpdateSelfDto {
  @IsOptional()
  @IsString()
  @Length(3, 80)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: "Informe um e-mail válido." })
  email?: string;

  @IsOptional()
  @IsString()
  @Length(0, 280)
  notes?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(3, 80)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  groupIds?: string[];

  @IsOptional()
  @IsDateString()
  validUntil?: string | null;

  @IsOptional()
  @IsBoolean()
  mfa?: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 280)
  notes?: string | null;

  @IsOptional()
  @IsIn(["active", "blocked", "expired", "pending"])
  status?: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(14, { message: "A senha RADIUS deve ter ao menos 14 caracteres." })
  password!: string;
}
