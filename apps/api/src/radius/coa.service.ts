import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../common/prisma.service";
import { decryptSecret } from "../common/crypto";
import { sendDisconnect, type CoaResult, type CoaSession } from "./coa";

export interface CoaServiceResult extends CoaResult {
  disconnected: boolean;
}

@Injectable()
export class CoaService {
  private readonly logger = new Logger(CoaService.name);
  private readonly encryptionKey: string;
  private readonly port: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.encryptionKey = config.get<string>("ENCRYPTION_KEY") ?? "";
    const configuredPort = Number(config.get<string>("RADIUS_COA_PORT") ?? "3799");
    this.port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535
      ? configuredPort
      : 3799;
    const configuredTimeout = Number(config.get<string>("RADIUS_COA_TIMEOUT_MS") ?? "2000");
    this.timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 200
      ? configuredTimeout
      : 2000;
  }

  async disconnect(session: CoaSession): Promise<CoaServiceResult> {
    const device =
      (await this.prisma.device.findFirst({ where: { nasIp: session.nasIp } })) ??
      (await this.prisma.device.findFirst({ where: { nasIp: "0.0.0.0/0" } }));

    if (!device) {
      return {
        status: "error",
        disconnected: false,
        message: "NAS não cadastrado. CoA/Disconnect não enviado.",
      };
    }

    let secret: string;
    try {
      secret = decryptSecret(device.secretCipher, this.encryptionKey);
    } catch {
      return {
        status: "error",
        disconnected: false,
        message: "Não foi possível ler o shared secret do NAS. CoA/Disconnect não enviado.",
      };
    }

    const result = await sendDisconnect({
      ...session,
      secret,
      port: this.port,
      timeoutMs: this.timeoutMs,
    });

    if (result.status !== "ack") {
      this.logger.warn(
        `CoA/Disconnect ${result.status} para ${session.username} em ${session.nasIp}: ${result.message}`,
      );
    }

    return {
      ...result,
      disconnected: result.status === "ack",
    };
  }
}
