import type {
  UsageMetrics,
  UsageModel,
  UsageStatsResponse,
} from "@/lib/api/user";
import { formatCredits } from "@/lib/formatters/credits";

export type UsageMetric = "credits" | "requests" | "total_tokens";
export type UsagePreset = "today" | "yesterday" | "7d" | "30d" | "custom";
export const metrics: { key: UsageMetric; label: string }[] = [
  { key: "credits", label: "消耗" },
  { key: "requests", label: "请求数" },
  { key: "total_tokens", label: "Token" },
];
export const emptyMetrics: UsageMetrics = {
  requests: 0,
  success: 0,
  failed: 0,
  credits: 0,
  non_cached_input_tokens: 0,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
  output_tokens: 0,
  total_tokens: 0,
};
export const emptyUsage: UsageStatsResponse = {
  start_at: "",
  end_at: "",
  bucket: "day",
  summary: emptyMetrics,
  previous: emptyMetrics,
  points: [],
  models: [],
  available_models: [],
};
export const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});
export const fullNumber = new Intl.NumberFormat("zh-CN");
export function metricValue(value: number, metric: UsageMetric, full = false) {
  return metric === "credits"
    ? `¥${formatCredits(value)}`
    : (full ? fullNumber : compact).format(value);
}
export function successRate(m: UsageMetrics) {
  const completed = m.success + m.failed;
  return completed ? (m.success / completed) * 100 : null;
}
export function cacheRate(m: UsageMetrics) {
  const input =
    m.non_cached_input_tokens + m.cache_read_tokens + m.cache_creation_tokens;
  return input ? (m.cache_read_tokens / input) * 100 : null;
}
export function percent(value: number | null) {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}
export function changeLabel(
  current: number | null,
  previous: number | null,
  rate = false,
) {
  if (previous == null || current == null || (!rate && previous === 0))
    return "上期无可比数据";
  const delta = rate
    ? current - previous
    : ((current - previous) / Math.abs(previous)) * 100;
  return `较上期 ${delta > 0 ? "+" : ""}${delta.toFixed(1)}${rate ? " 个百分点" : "%"}`;
}
// datetime-local has no timezone: always interpret and display these as UTC+8.
export function beijingInput(date: Date) {
  return new Date(date.getTime() + 8 * 3600_000).toISOString().slice(0, 19);
}
export function usageRange(
  preset: Exclude<UsagePreset, "custom">,
  now = new Date(),
) {
  const day = beijingInput(now).slice(0, 10);
  const midnight = new Date(`${day}T00:00:00+08:00`).getTime();
  const days =
    preset === "7d"
      ? 6
      : preset === "30d"
        ? 29
        : preset === "yesterday"
          ? 1
          : 0;
  return {
    start_at: new Date(midnight - days * 86400_000).toISOString(),
    end_at:
      preset === "yesterday"
        ? new Date(midnight).toISOString()
        : now.toISOString(),
  };
}
export function pointLabel(at: string, bucket: "hour" | "day", full = false) {
  const s = beijingInput(new Date(at));
  return bucket === "hour"
    ? full
      ? `${s.slice(5, 10)} ${s.slice(11, 16)}`
      : s.slice(11, 16)
    : s.slice(5, 10).replace("-", "/");
}
export function exportUsage(models: UsageModel[]) {
  const escape = (value: string | number) =>
    `"${String(value)
      .replace(/^[=+\-@\t\r]/, "'$&")
      .replaceAll('"', '""')}"`;
  const rows = [
    [
      "模型",
      "调用次数",
      "消耗（元）",
      "非缓存输入",
      "缓存读取",
      "缓存写入",
      "输出",
      "总Token",
      "缓存命中率",
    ],
    ...models.map((m) => [
      m.model,
      m.requests,
      m.credits / 1e6,
      m.non_cached_input_tokens,
      m.cache_read_tokens,
      m.cache_creation_tokens,
      m.output_tokens,
      m.total_tokens,
      percent(cacheRate(m)),
    ]),
  ];
  const blob = new Blob(
    ["\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8;" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `使用统计-${beijingInput(new Date()).slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
