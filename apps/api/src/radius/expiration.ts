const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Formato aceito pelo módulo `expiration` do FreeRADIUS.
 * Usamos UTC porque os containers operam em UTC e `validUntil` é
 * persistido como timestamp absoluto.
 */
export function radiusExpiration(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    `${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`,
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`,
  ].join(" ");
}
