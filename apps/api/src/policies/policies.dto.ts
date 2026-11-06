import { IsArray, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";

export class CreatePolicyDto {
  @IsString()
  @Length(3, 120)
  name!: string;

  @IsString()
  @Length(3, 400)
  description!: string;

  @IsIn(["identity", "device", "session"])
  scope!: "identity" | "device" | "session";

  @IsIn(["allow", "deny", "challenge"])
  action!: "allow" | "deny" | "challenge";

  @IsInt()
  @Min(1)
  @Max(999)
  priority!: number;

  @IsOptional()
  @IsArray()
  conditions?: { attribute: string; operator: string; value: string }[];
}

export class TogglePolicyDto {
  @IsIn([true, false])
  enabled!: boolean;
}
