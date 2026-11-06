"use client";

import { useMemo, useRef, useState } from "react";
import type { AuthPoint } from "@/lib/queries";
import { formatNumber } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";

const W = 760;
const H = 300;
const PAD = { top: 14, right: 10, bottom: 10, left: 0 };

function niceMax(value: number) {
  if (value <= 10) return Math.max(4, Math.ceil(value));
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function linePath(points: { x: number; y: number }[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function AuthChart({
  points,
  range,
  loading,
}: {
  points: AuthPoint[];
  range: "24h" | "7d" | "30d";
  loading?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const max = useMemo(
    () => niceMax(Math.max(...points.map((point) => point.accepted), 1) * 1.18),
    [points],
  );

  const coords = useMemo(() => {
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const x = (index: number) =>
      PAD.left + (points.length <= 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
    const y = (value: number) => PAD.top + plotH - (value / max) * plotH;
    return {
      accepted: points.map((point, index) => ({ x: x(index), y: y(point.accepted) })),
      rejected: points.map((point, index) => ({ x: x(index), y: y(point.rejected) })),
      baseY: PAD.top + plotH,
      plotH,
    };
  }, [points, max]);

  const acceptedLine = linePath(coords.accepted);
  const rejectedLine = linePath(coords.rejected);
  const area = acceptedLine
    ? `${acceptedLine} L ${coords.accepted[coords.accepted.length - 1]?.x ?? 0} ${coords.baseY} L ${coords.accepted[0]?.x ?? 0} ${coords.baseY} Z`
    : "";

  const active = hover !== null ? points[hover] : null;
  const activeX = hover !== null ? coords.accepted[hover]?.x : null;
  const activeY = hover !== null ? coords.accepted[hover]?.y : null;
  const activeRejectedY = hover !== null ? coords.rejected[hover]?.y : null;

  const tickValues = [0, max * 0.25, max * 0.5, max * 0.75, max];
  const yTicks = tickValues.map((value) => ({
    value,
    y: PAD.top + coords.plotH - (value / max) * coords.plotH,
  }));

  const xLabelIndexes = points.length > 1 ? [0, Math.floor((points.length - 1) / 3), Math.floor(((points.length - 1) * 2) / 3), points.length - 1] : [0];

  const label = (iso: string) => {
    const date = new Date(iso);
    if (range === "24h") {
      return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
    }
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
  };

  const acceptTotal = points.reduce((sum, point) => sum + point.accepted, 0);
  const rejectTotal = points.reduce((sum, point) => sum + point.rejected, 0);

  if (loading || points.length === 0) {
    return (
      <div className="flex h-[356px] flex-col justify-end gap-3 p-4" aria-busy>
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="h-[260px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className="flex items-center gap-1.5 text-muted">
          <span aria-hidden className="h-0.5 w-3 bg-accent" />
          Aceitas
          <span className="text-mono text-dim">{formatNumber(acceptTotal)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-muted">
          <span aria-hidden className="h-px w-3 border-t border-dashed border-danger" />
          Rejeitadas
          <span className="text-mono text-dim">{formatNumber(rejectTotal)}</span>
        </span>
      </div>

      <div className="flex">
        <div className="relative h-[210px] w-[34px] shrink-0 sm:h-[300px]" aria-hidden>
          {yTicks.map((tick) => (
            <span
              key={tick.value}
              className="absolute right-1.5 -translate-y-1/2 text-mono text-[9px] text-dim"
              style={{ top: `${(tick.y / H) * 100}%` }}
            >
              {Math.round(tick.value)}
            </span>
          ))}
        </div>

        <div
          ref={container}
          className="relative h-[210px] flex-1 sm:h-[300px]"
          onPointerMove={(event) => {
            const rect = container.current?.getBoundingClientRect();
            if (!rect) return;
            const ratio = (event.clientX - rect.left) / rect.width;
            const index = Math.round(ratio * (points.length - 1));
            setHover(Math.min(points.length - 1, Math.max(0, index)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-full w-full"
            role="img"
            aria-label={`Série de autenticações nos últimos ${range}. ${formatNumber(acceptTotal)} aceitas e ${formatNumber(rejectTotal)} rejeitadas.`}
          >
            {yTicks.map((tick) => (
              <line
                key={tick.value}
                x1={0}
                x2={W - PAD.right}
                y1={tick.y}
                y2={tick.y}
                stroke="var(--line)"
                strokeWidth="1"
                strokeDasharray={tick.value === 0 ? undefined : "1 4"}
                opacity={tick.value === 0 ? 0.9 : 0.55}
                vectorEffect="non-scaling-stroke"
              />
            ))}

            <path d={area} fill="rgb(226 101 63 / 0.10)" />
            <path
              d={acceptedLine}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={rejectedLine}
              fill="none"
              stroke="var(--danger)"
              strokeWidth="1.2"
              strokeDasharray="3 3"
              strokeLinecap="round"
              opacity="0.85"
              vectorEffect="non-scaling-stroke"
            />

          {activeX !== null ? (
            <g>
              <line
                x1={activeX}
                x2={activeX}
                y1={PAD.top}
                y2={coords.baseY}
                stroke="var(--line-strong)"
                strokeWidth="1"
              />
              {activeY !== null ? (
                <circle cx={activeX} cy={activeY} r="3" fill="var(--accent)" stroke="var(--bg)" strokeWidth="1.5" />
              ) : null}
              {activeRejectedY !== null ? (
                <circle cx={activeX} cy={activeRejectedY} r="2.4" fill="var(--danger)" stroke="var(--bg)" strokeWidth="1.2" />
              ) : null}
            </g>
          ) : null}
          </svg>

          {active && activeX !== null ? (
            <div
              className="pointer-events-none absolute top-0 z-10 min-w-[136px] -translate-x-1/2 rounded-sm border border-line-strong bg-panel-3 px-2.5 py-2 shadow-[0_6px_18px_rgb(0_0_0/0.35)]"
              style={{ left: `clamp(70px, ${(activeX / W) * 100}%, calc(100% - 70px))` }}
            >
              <p className="text-[10px] text-dim">{label(active.t)}</p>
              <p className="mt-1 flex items-center justify-between gap-3 text-[11px] text-fg">
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-accent" />
                  Aceitas
                </span>
                <span className="text-mono">{formatNumber(active.accepted)}</span>
              </p>
              <p className="mt-0.5 flex items-center justify-between gap-3 text-[11px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-danger" />
                  Rejeitadas
                </span>
                <span className="text-mono">{formatNumber(active.rejected)}</span>
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="ml-[34px] mt-1 flex justify-between pr-[10px] text-[10px] text-dim">
        {xLabelIndexes.map((index) => (
          <span key={index} className="text-mono">
            {points[index] ? label(points[index].t) : ""}
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>Autenticações por período</caption>
        <thead>
          <tr>
            <th scope="col">Período</th>
            <th scope="col">Aceitas</th>
            <th scope="col">Rejeitadas</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.t}>
              <td>{label(point.t)}</td>
              <td>{point.accepted}</td>
              <td>{point.rejected}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
