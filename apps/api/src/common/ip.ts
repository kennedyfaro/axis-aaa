export const MAX_POOL_ADDRESSES = 1024;

export function ipv4ToNumber(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    result = result * 256 + octet;
  }
  return result;
}

export function numberToIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join(".");
}

export function ipv4Range(startIp: string, endIp: string): string[] {
  const start = ipv4ToNumber(startIp);
  const end = ipv4ToNumber(endIp);
  if (start === null || end === null || end < start) return [];
  return Array.from({ length: end - start + 1 }, (_, index) => numberToIpv4(start + index));
}
