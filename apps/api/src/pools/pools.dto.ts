import { IsOptional, IsString, Length, Matches } from "class-validator";

const IPV4 =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

export class CreateIpPoolDto {
  @IsString()
  @Length(3, 60)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 180)
  description?: string;

  @Matches(IPV4, { message: "Informe o IPv4 inicial." })
  startIp!: string;

  @Matches(IPV4, { message: "Informe o IPv4 final." })
  endIp!: string;
}

export class AssignIpDto {
  @IsString()
  @Length(1, 64)
  userId!: string;

  @IsOptional()
  @Matches(IPV4, { message: "Informe um IPv4 válido." })
  address?: string;
}
