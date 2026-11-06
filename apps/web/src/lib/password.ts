const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*+-?";

function pick(source: string) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return source[values[0] % source.length];
}

/** Senha aleatoria para credencial RADIUS. Deve ser copiada no momento da criacao. */
export function generatePassword(length = 20) {
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => pick(all));
  const chars = [...required, ...rest];
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    const swap = values[0] % (index + 1);
    [chars[index], chars[swap]] = [chars[swap], chars[index]];
  }
  return chars.join("");
}
