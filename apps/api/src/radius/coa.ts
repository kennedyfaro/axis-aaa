import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { createSocket } from "node:dgram";
import { ipv4ToNumber } from "../common/ip";

const DISCONNECT_REQUEST = 40;
const DISCONNECT_ACK = 41;
const DISCONNECT_NAK = 42;
const DEFAULT_COA_PORT = 3799;
const DEFAULT_TIMEOUT_MS = 2000;

const ATTR_USER_NAME = 1;
const ATTR_NAS_IP_ADDRESS = 4;
const ATTR_FRAMED_IP_ADDRESS = 8;
const ATTR_NAS_IDENTIFIER = 32;
const ATTR_ACCT_SESSION_ID = 44;
const ATTR_ERROR_CAUSE = 101;

const ERROR_CAUSE_LABEL: Record<number, string> = {
  401: "atributo não suportado",
  402: "atributo obrigatório ausente",
  403: "NAS não corresponde",
  404: "requisição inválida",
  405: "serviço não suportado",
  406: "extensão não suportada",
  407: "valor de atributo inválido",
  501: "ação proibida pelo NAS",
  503: "sessão não encontrada no NAS",
  504: "sessão não pode ser removida",
  508: "seleção de múltiplas sessões não suportada",
};

export type CoaStatus = "ack" | "nak" | "timeout" | "error";

export interface CoaResult {
  status: CoaStatus;
  message: string;
  errorCause?: number;
}

export interface CoaSession {
  username: string;
  acctSessionId: string;
  nasIp: string;
  nasIdentifier?: string | null;
  framedIpAddress?: string | null;
}

export interface CoaRequest extends CoaSession {
  secret: string;
  port?: number;
  timeoutMs?: number;
}

function ipv4Buffer(value: string): Buffer | null {
  const parsed = ipv4ToNumber(value);
  if (parsed === null) return null;
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(parsed, 0);
  return buffer;
}

function attribute(type: number, value: string | Buffer): Buffer {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  if (data.length === 0 || data.length > 253) {
    throw new Error(`Atributo RADIUS ${type} com tamanho inválido.`);
  }
  const packet = Buffer.alloc(2 + data.length);
  packet.writeUInt8(type, 0);
  packet.writeUInt8(2 + data.length, 1);
  data.copy(packet, 2);
  return packet;
}

function buildAttributes(session: CoaSession): Buffer {
  const attributes: Buffer[] = [];
  if (session.username) attributes.push(attribute(ATTR_USER_NAME, session.username));
  const nasIp = session.nasIp ? ipv4Buffer(session.nasIp) : null;
  if (nasIp) attributes.push(attribute(ATTR_NAS_IP_ADDRESS, nasIp));
  if (session.framedIpAddress) {
    const framed = ipv4Buffer(session.framedIpAddress.replace(/\/\d+$/, ""));
    if (framed) attributes.push(attribute(ATTR_FRAMED_IP_ADDRESS, framed));
  }
  if (session.nasIdentifier) attributes.push(attribute(ATTR_NAS_IDENTIFIER, session.nasIdentifier));
  if (session.acctSessionId) attributes.push(attribute(ATTR_ACCT_SESSION_ID, session.acctSessionId));
  return Buffer.concat(attributes);
}

export function buildDisconnectPacket(
  session: CoaSession,
  secret: string,
  identifier = randomInt(0, 256),
) {
  const attributes = buildAttributes(session);
  const length = 20 + attributes.length;
  const header = Buffer.alloc(20);
  header.writeUInt8(DISCONNECT_REQUEST, 0);
  header.writeUInt8(identifier, 1);
  header.writeUInt16BE(length, 2);

  const packet = Buffer.concat([header, attributes]);
  const authenticator = createHash("md5")
    .update(Buffer.concat([packet, Buffer.from(secret, "utf8")]))
    .digest();
  authenticator.copy(packet, 4);
  return { packet, identifier, authenticator };
}

export function parseDisconnectResponse(
  packet: Buffer,
  identifier: number,
  requestAuthenticator: Buffer,
  secret: string,
): CoaResult | null {
  if (packet.length < 20) return null;
  const code = packet.readUInt8(0);
  const responseIdentifier = packet.readUInt8(1);
  const length = packet.readUInt16BE(2);
  if (responseIdentifier !== identifier || length < 20 || length > packet.length) {
    return null;
  }
  if (code !== DISCONNECT_ACK && code !== DISCONNECT_NAK) return null;

  const responseAuthenticator = packet.subarray(4, 20);
  const expected = createHash("md5")
    .update(
      Buffer.concat([
        packet.subarray(0, 4),
        requestAuthenticator,
        packet.subarray(20, length),
        Buffer.from(secret, "utf8"),
      ]),
    )
    .digest();
  if (
    responseAuthenticator.length !== expected.length ||
    !timingSafeEqual(responseAuthenticator, expected)
  ) {
    return null;
  }

  let errorCause: number | undefined;
  let offset = 20;
  while (offset + 2 <= length) {
    const type = packet.readUInt8(offset);
    const size = packet.readUInt8(offset + 1);
    if (size < 2 || offset + size > length) break;
    if (type === ATTR_ERROR_CAUSE && size === 6) {
      errorCause = packet.readUInt32BE(offset + 2);
    }
    offset += size;
  }

  if (code === DISCONNECT_ACK) {
    return {
      status: "ack",
      message: "O NAS confirmou o encerramento da sessão.",
    };
  }

  const cause = errorCause
    ? ` Causa ${errorCause}: ${ERROR_CAUSE_LABEL[errorCause] ?? "erro informado pelo NAS"}.`
    : "";
  return {
    status: "nak",
    message: `O NAS recusou o Disconnect-Request.${cause}`,
    errorCause,
  };
}

export async function sendDisconnect(request: CoaRequest): Promise<CoaResult> {
  const port = request.port ?? DEFAULT_COA_PORT;
  const timeoutMs = Math.max(200, request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const { packet, identifier, authenticator } = buildDisconnectPacket(
    request,
    request.secret,
  );
  const socket = createSocket("udp4");

  return new Promise<CoaResult>((resolve) => {
    let settled = false;
    let retryTimer: NodeJS.Timeout | undefined;
    let timeoutTimer: NodeJS.Timeout | undefined;

    const finish = (result: CoaResult) => {
      if (settled) return;
      settled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      try {
        socket.close();
      } catch {
        // socket já fechado
      }
      resolve(result);
    };

    socket.on("error", (error) => {
      finish({
        status: "error",
        message: `Falha ao enviar Disconnect-Request: ${error.message}`,
      });
    });

    socket.on("message", (message) => {
      const result = parseDisconnectResponse(message, identifier, authenticator, request.secret);
      if (result) finish(result);
    });

    const send = () => {
      if (settled) return;
      try {
        socket.send(packet, port, request.nasIp, (error) => {
          if (error) {
            finish({
              status: "error",
              message: `Falha ao enviar Disconnect-Request: ${error.message}`,
            });
          }
        });
      } catch (error) {
        finish({
          status: "error",
          message: `Falha ao enviar Disconnect-Request: ${(error as Error).message}`,
        });
      }
    };

    send();
    retryTimer = setTimeout(send, Math.floor(timeoutMs / 2));
    timeoutTimer = setTimeout(() => {
      finish({
        status: "timeout",
        message:
          "O NAS não respondeu ao Disconnect-Request. Verifique CoA/3799 e o shared secret.",
      });
    }, timeoutMs);
  });
}
