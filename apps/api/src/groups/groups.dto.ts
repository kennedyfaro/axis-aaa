import { IsObject } from "class-validator";

export class UpdateGroupDto {
  @IsObject()
  radiusAttributes!: Record<string, string>;
}
