import { useEffect, useId, useRef, useState } from "react";
import type { UsagePoint } from "@/lib/api/user";
import {
  compact,
  metricValue,
  pointLabel,
  type UsageMetric,
} from "@/lib/usage-stats";

export function UsageSparkline({ values }: { values: number[] }) {
  if (values.length < 2 || values.every((v) => v === 0)) return null;
  const min = Math.min(...values),
    range = Math.max(...values) - min || 1;
  return (
    <svg
      viewBox="0 0 80 30"
      className="h-8 w-20 shrink-0 text-primary"
      aria-hidden="true"
    >
      <polyline
        points={values
          .map(
            (v, i) =>
              `${(i / (values.length - 1)) * 78 + 1},${28 - ((v - min) / range) * 25}`,
          )
          .join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UsageTrendChart({
  points,
  metric,
  bucket,
}: {
  points: UsagePoint[];
  metric: UsageMetric;
  bucket: "hour" | "day";
}) {
  const [hover, setHover] = useState<number | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, entry.contentRect.width)),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const id = useId();
  const max = Math.max(1, ...points.map((p) => p[metric]));
  const min = Math.min(0, ...points.map((p) => p[metric]));
  const span = max - min;
  const chartWidth = width - 82;
  const x = (i: number) =>
    62 + (i / Math.max(points.length - 1, 1)) * chartWidth;
  const y = (v: number) => 222 - ((v - min) / span) * 190;
  const path = points
    .map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[metric])}`)
    .join(" ");
  const active =
    hover == null ? null : points[Math.min(hover, points.length - 1)];
  const step = Math.max(1, Math.ceil(points.length / (width < 500 ? 4 : 7)));
  return (
    <div ref={container} className="relative min-w-0" data-testid="usage-trend">
      <svg
        viewBox={`0 0 ${width} 270`}
        className="h-[270px] w-full"
        role="img"
        aria-label="使用趋势，使用下方滑块逐点查看数据"
      >
        <defs>
          <clipPath id={id}>
            <rect x="59" y="24" width={chartWidth + 9} height="202" />
          </clipPath>
        </defs>
        {[0, 1, 2, 3].map((i) => {
          const value = min + (span * i) / 3;
          return (
            <g key={i}>
              <line
                x1="62"
                x2={width - 20}
                y1={y(value)}
                y2={y(value)}
                stroke="var(--border)"
              />
              <text
                x="50"
                y={y(value) + 4}
                textAnchor="end"
                fill="var(--muted-foreground)"
                fontSize="11"
              >
                {metric === "credits"
                  ? `¥${compact.format(value / 1e6)}`
                  : compact.format(Math.round(value))}
              </text>
            </g>
          );
        })}
        {points.length > 0 ? (
          <g clipPath={`url(#${id})`}>
            <path
              d={`${path} L${x(points.length - 1)},${y(0)} L62,${y(0)} Z`}
              fill="var(--primary)"
              opacity="0.08"
            />
            <path
              d={path}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.length <= 31
              ? points.map((p, i) => (
                  <circle
                    key={p.at}
                    cx={x(i)}
                    cy={y(p[metric])}
                    r="3"
                    fill="var(--card)"
                    stroke="var(--primary)"
                    strokeWidth="2"
                  />
                ))
              : null}
          </g>
        ) : null}
        {points.map((p, i) =>
          (i % step === 0 && i < points.length - Math.max(1, step / 2)) ||
          i === points.length - 1 ? (
            <text
              key={p.at}
              x={x(i)}
              y="253"
              textAnchor="middle"
              fill="var(--muted-foreground)"
              fontSize="11"
            >
              {pointLabel(p.at, bucket)}
            </text>
          ) : null,
        )}
        {active && hover != null ? (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1="25"
            y2="222"
            stroke="var(--primary)"
            opacity="0.35"
            strokeDasharray="3 3"
          />
        ) : null}
        <rect
          x="62"
          y="24"
          width={chartWidth}
          height="202"
          fill="transparent"
          onPointerMove={(e) => {
            const bounds = e.currentTarget.getBoundingClientRect();
            setHover(
              Math.max(
                0,
                Math.min(
                  points.length - 1,
                  Math.round(
                    ((e.clientX - bounds.left) / bounds.width) *
                      (points.length - 1),
                  ),
                ),
              ),
            );
          }}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {active ? (
        <div
          role="status"
          className="pointer-events-none absolute right-5 top-2 rounded-lg border bg-popover px-4 py-3 text-sm text-popover-foreground shadow-sm"
        >
          <p className="text-xs text-muted-foreground">
            {pointLabel(active.at, bucket, true)}
          </p>
          <p className="mt-1 font-semibold tabular-nums">
            {metricValue(active[metric], metric, true)}
          </p>
        </div>
      ) : null}
      {points.length > 1 ? (
        <input
          className="sr-only focus:not-sr-only focus:w-full"
          type="range"
          min={0}
          max={points.length - 1}
          value={hover ?? 0}
          aria-label="查看趋势数据点"
          aria-valuetext={
            active
              ? `${pointLabel(active.at, bucket, true)} ${metricValue(active[metric], metric, true)}`
              : undefined
          }
          onChange={(e) => setHover(Number(e.target.value))}
          onFocus={() => setHover(0)}
          onBlur={() => setHover(null)}
        />
      ) : null}
    </div>
  );
}
