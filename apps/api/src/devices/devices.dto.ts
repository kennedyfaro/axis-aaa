import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, Length, Matches } from "class-validator";

const SECRET_PATTERN = /^[\x21-\x7E][\x20-\x7E]{14,58}[\x21-\x7E]$/;
const SECRET_MESSAGE = "Use de 16 a 60 caracteres imprimíveis, sem espaço no início ou no fim.";

export class CreateDeviceDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9.-]{2,47}$/, { message: "Nome de equipamento inválido." })
  name!: string;

  @IsString()
  @Length(3, 120)
  description!: string;

  @IsIn(["mikrotik", "huawei", "nokia", "zte", "cisco", "other"])
  vendor!: "mikrotik" | "huawei" | "nokia" | "zte" | "cisco" | "other";

  @IsString()
  @Length(2, 80)
  model!: string;

  @IsIn(["switch", "router", "olt", "firewall", "wireless-controller"])
  kind!: "switch" | "router" | "olt" | "firewall" | "wireless-controller";

  @Matches(/^(?:(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)|0\.0\.0\.0\/0)$/, {
    message: "Informe um IPv4 válido ou 0.0.0.0/0 para o NAS padrão.",
  })
  ip!: string;

  @IsString()
  @Length(3, 64)
  nasIdentifier!: string;

  @IsString()
  @Length(2, 80)
  site!: string;

  @IsIn(["production", "staging", "lab"])
  environment!: "production" | "staging" | "lab";

  @IsArray()
  @ArrayNotEmpty()
  authorizedGroupIds!: string[];

  @IsOptional()
  @Matches(SECRET_PATTERN, { message: SECRET_MESSAGE })
  secret?: string;
}

export class RotateDeviceSecretDto {
  @IsOptional()
  @Matches(SECRET_PATTERN, { message: SECRET_MESSAGE })
  secret?: string;
}

export class UpdateDeviceDto {
  @IsOptional()
  @IsString()
  @Length(3, 120)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(2, 80)
  site?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  authorizedGroupIds?: string[];
}
