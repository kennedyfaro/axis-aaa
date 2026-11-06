import { IsString, Length, Matches } from "class-validator";

export class LoginDto {
  @IsString()
  @Length(3, 120, { message: "Informe o e-mail ou login." })
  email!: string;

  @IsString()
  @Length(6, 128, { message: "Senha inválida." })
  password!: string;
}

export class MfaDto {
  @IsString()
  @Length(10, 120)
  challengeId!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: "Informe os 6 dígitos." })
  code!: string;
}
