import { useMemo, useState } from "react";
import {
  ArrowDownUpIcon,
  BarChart3Icon,
  DownloadIcon,
  InfoIcon,
  RefreshCwIcon,
} from "lucide-react";
import { ToggleGroup as TogglePrimitive } from "radix-ui";
import { TableEmpty } from "@/components/shared/TableEmpty";
import { TablePagination } from "@/components/shared/TablePagination";
import {
  UsageSparkline,
  UsageTrendChart,
} from "@/components/shared/UsageTrendChart";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAsync } from "@/hooks/use-async";
import { userApi } from "@/lib/api/user";
import {
  beijingInput,
  cacheRate,
  changeLabel,
  compact,
  emptyUsage,
  exportUsage,
  fullNumber,
  metrics,
  metricValue,
  percent,
  successRate,
  usageRange,
  type UsageMetric,
  type UsagePreset,
} from "@/lib/usage-stats";

const presets: { key: UsagePreset; label: string }[] = [
  { key: "today", label: "今天" },
  { key: "yesterday", label: "昨天" },
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
  { key: "custom", label: "自定义" },
];
const pageSize = 10;
function MetricSwitch({
  value,
  onChange,
  label,
}: {
  value: UsageMetric;
  onChange: (v: UsageMetric) => void;
  label: string;
}) {
  return (
    <TogglePrimitive.Root
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v as UsageMetric);
      }}
      aria-label={label}
      className="usage-segment"
    >
      {metrics.map((m) => (
        <TogglePrimitive.Item key={m.key} value={m.key}>
          {m.label}
        </TogglePrimitive.Item>
      ))}
    </TogglePrimitive.Root>
  );
}

export function UserStatsPage() {
  const [preset, setPreset] = useState<UsagePreset>("7d");
  const [range, setRange] = useState(() => usageRange("7d"));
  const [model, setModel] = useState("");
  const [bucket, setBucket] = useState<"hour" | "day">("day");
  const [metric, setMetric] = useState<UsageMetric>("requests");
  const [rankMetric, setRankMetric] = useState<UsageMetric>("credits");
  const [sort, setSort] = useState<{ key: UsageMetric; descending: boolean }>({
    key: "credits",
    descending: true,
  });
  const [page, setPage] = useState(1);
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState({ start: "", end: "" });
  const [dateError, setDateError] = useState("");
  const { data, loading, error, reload } = useAsync(
    () =>
      userApi.getUsageStats({ ...range, bucket, model: model || undefined }),
    emptyUsage,
    [range.start_at, range.end_at, bucket, model],
  );
  const unavailable = loading || !!error;
  const sorted = useMemo(
    () =>
      [...data.models].sort(
        (a, b) =>
          (sort.descending
            ? b[sort.key] - a[sort.key]
            : a[sort.key] - b[sort.key]) || a.model.localeCompare(b.model),
      ),
    [data.models, sort],
  );
  const ranks = useMemo(
    () =>
      [...data.models]
        .sort(
          (a, b) =>
            b[rankMetric] - a[rankMetric] || a.model.localeCompare(b.model),
        )
        .slice(0, 5),
    [data.models, rankMetric],
  );
  const maxRank = Math.max(1, ...ranks.map((m) => Math.abs(m[rankMetric])));
  const actualPage = Math.min(
    page,
    Math.max(1, Math.ceil(sorted.length / pageSize)),
  );
  const rows = sorted.slice((actualPage - 1) * pageSize, actualPage * pageSize);
  const summaries = [
    {
      label: "实际消耗",
      value: metricValue(data.summary.credits, "credits"),
      change: changeLabel(data.summary.credits, data.previous.credits),
      values: data.points.map((p) => p.credits),
      hint: "已结束 API 调用的净扣费（含模型积分），已扣除退款，按调用发起时间归属。处理中预扣不计入。",
    },
    {
      label: "请求次数",
      value: compact.format(data.summary.requests),
      change: changeLabel(data.summary.requests, data.previous.requests),
      values: data.points.map((p) => p.requests),
      hint: `包含已记录的成功、失败和处理中调用。成功 ${fullNumber.format(data.summary.success)} 次，失败 ${fullNumber.format(data.summary.failed)} 次，其余 ${fullNumber.format(data.summary.requests - data.summary.success - data.summary.failed)} 次。`,
    },
    {
      label: "成功率",
      value: percent(successRate(data.summary)),
      change: changeLabel(
        successRate(data.summary),
        successRate(data.previous),
        true,
      ),
      values: data.points.map((p) => successRate(p) ?? 0),
      hint: "成功次数 ÷（成功次数＋失败次数）；未结束或结果未知的调用不参与分母。",
    },
    {
      label: "总 Token",
      value: compact.format(data.summary.total_tokens),
      change: changeLabel(
        data.summary.total_tokens,
        data.previous.total_tokens,
      ),
      values: data.points.map((p) => p.total_tokens),
      hint: `成功调用的非缓存输入＋缓存读取＋缓存写入＋输出，共 ${fullNumber.format(data.summary.total_tokens)} Token。`,
    },
    {
      label: "缓存命中率",
      value: percent(cacheRate(data.summary)),
      change: changeLabel(
        cacheRate(data.summary),
        cacheRate(data.previous),
        true,
      ),
      values: data.points.map((p) => cacheRate(p) ?? 0),
      hint: "缓存读取 ÷（非缓存输入＋缓存读取＋缓存写入），按 Token 总量加权。",
    },
  ];
  function choosePreset(value: UsagePreset) {
    if (value === "custom") {
      setDraft({
        start: beijingInput(new Date(range.start_at)),
        end: beijingInput(new Date(range.end_at)),
      });
      setDateError("");
      setCustomOpen(true);
      return;
    }
    setPreset(value);
    setRange(usageRange(value));
    setBucket(value === "today" || value === "yesterday" ? "hour" : "day");
    setPage(1);
  }
  function applyCustom() {
    const start = new Date(`${draft.start}+08:00`),
      end = new Date(`${draft.end}+08:00`);
    const duration = end.getTime() - start.getTime();
    if (
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 90 * 86400_000
    ) {
      setDateError("请选择有效的起止时间，最多支持 90 天。");
      return;
    }
    if (end.getTime() > Date.now() + 60_000) {
      setDateError("结束时间不能晚于当前时间。");
      return;
    }
    setRange({ start_at: start.toISOString(), end_at: end.toISOString() });
    setPreset("custom");
    setBucket(duration <= 86400_000 ? "hour" : "day");
    setPage(1);
    setCustomOpen(false);
  }
  function refresh() {
    if (preset !== "custom" && preset !== "yesterday")
      setRange(usageRange(preset));
    else reload();
  }
  function sortBy(key: UsageMetric) {
    setSort({ key, descending: sort.key === key ? !sort.descending : true });
    setPage(1);
  }

  return (
    <section
      className="usage-dashboard flex min-w-0 flex-col gap-5"
      aria-busy={loading}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            使用统计
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            了解每一次调用与消耗，掌握你的 API 使用情况。
          </p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCwIcon data-icon="inline-start" />
          刷新
        </Button>
      </header>
      <Card className="py-3">
        <CardContent className="flex flex-wrap items-center gap-3">
          <TogglePrimitive.Root
            type="single"
            value={preset}
            onValueChange={(v) => {
              if (v) choosePreset(v as UsagePreset);
            }}
            aria-label="统计时间范围"
            className="usage-presets"
          >
            {presets.map((p) => (
              <TogglePrimitive.Item
                key={p.key}
                value={p.key}
                onClick={() => {
                  if (p.key === "custom" && preset === "custom")
                    choosePreset("custom");
                }}
              >
                {p.label}
              </TogglePrimitive.Item>
            ))}
          </TogglePrimitive.Root>
          <span
            className="text-xs text-muted-foreground"
            title={`${beijingInput(new Date(range.start_at)).replace("T", " ")} 至 ${beijingInput(new Date(range.end_at)).replace("T", " ")}`}
          >
            {beijingInput(new Date(range.start_at))
              .slice(0, 10)
              .replaceAll("-", "/")}{" "}
            —{" "}
            {beijingInput(new Date(range.end_at))
              .slice(0, 10)
              .replaceAll("-", "/")}
          </span>
          <NativeSelect
            aria-label="筛选模型"
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setPage(1);
            }}
            className="w-full sm:ml-auto sm:w-48"
          >
            <option value="">全部模型</option>
            {[
              ...new Set([...data.available_models, ...(model ? [model] : [])]),
            ].map((m) => (
              <option key={m} value={m}>
                {m || "未记录模型"}
              </option>
            ))}
          </NativeSelect>
          <span className="text-xs text-muted-foreground">北京时间 UTC+8</span>
        </CardContent>
      </Card>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            {error}
            <Button variant="outline" size="sm" onClick={reload}>
              重试
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {summaries.map((s, i) => (
          <Card
            key={s.label}
            className={i === 4 ? "col-span-2 md:col-span-1" : ""}
          >
            <CardHeader>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {s.label}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button aria-label={`${s.label}统计口径`} type="button">
                      <InfoIcon className="size-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-72">{s.hint}</TooltipContent>
                </Tooltip>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {loading ? (
                <Skeleton className="h-9 w-28" />
              ) : (
                <p className="text-3xl font-semibold tracking-tight tabular-nums">
                  {error ? "—" : s.value}
                </p>
              )}
              <div className="flex min-h-8 items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {unavailable ? "—" : s.change}
                </span>
                {!unavailable ? <UsageSparkline values={s.values} /> : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(300px,1fr)]">
        <Card className="min-w-0">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>
                <h2>使用趋势</h2>
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                按{bucket === "hour" ? "小时" : "日"}查看
                {metrics.find((m) => m.key === metric)?.label}变化
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <MetricSwitch
                value={metric}
                onChange={setMetric}
                label="趋势指标"
              />
              <NativeSelect
                value={bucket}
                aria-label="统计粒度"
                className="w-24"
                onChange={(e) => setBucket(e.target.value as "hour" | "day")}
              >
                <option value="day">按天</option>
                <option
                  value="hour"
                  disabled={
                    new Date(range.end_at).getTime() -
                      new Date(range.start_at).getTime() >
                    7 * 86400_000
                  }
                >
                  按小时
                </option>
              </NativeSelect>
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-4">
            {loading ? (
              <Skeleton className="h-[270px] w-full" />
            ) : error ? (
              <p className="flex h-[270px] items-center justify-center text-sm text-muted-foreground">
                趋势暂不可用
              </p>
            ) : (
              <UsageTrendChart
                key={`${range.start_at}-${bucket}-${model}`}
                points={data.points}
                metric={metric}
                bucket={bucket}
              />
            )}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>
              <h2>
                模型
                {rankMetric === "credits"
                  ? "消耗"
                  : rankMetric === "requests"
                    ? "调用"
                    : "Token"}
                排行
              </h2>
            </CardTitle>
            <MetricSwitch
              value={rankMetric}
              onChange={setRankMetric}
              label="排行指标"
            />
          </CardHeader>
          <CardContent className="flex min-h-[270px] flex-col gap-5 pt-2">
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))
            ) : error ? (
              <p className="m-auto text-sm text-muted-foreground">
                排行暂不可用
              </p>
            ) : ranks.length ? (
              ranks.map((m, i) => (
                <div key={m.model} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate" title={m.model}>
                      {m.model || "未记录模型"}
                    </span>
                    <span
                      className="shrink-0 font-semibold tabular-nums"
                      title={metricValue(m[rankMetric], rankMetric, true)}
                    >
                      {metricValue(m[rankMetric], rankMetric)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${(Math.abs(m[rankMetric]) / maxRank) * 100}%`,
                        opacity: 1 - i * 0.14,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="m-auto text-sm text-muted-foreground">
                当前范围暂无调用记录
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="min-w-0 pb-0">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CardTitle>
              <h2>模型使用明细</h2>
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {unavailable ? "—" : `共 ${data.models.length} 个模型`}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportUsage(sorted)}
            disabled={unavailable || !sorted.length}
          >
            <DownloadIcon data-icon="inline-start" />
            导出
          </Button>
        </CardHeader>
        <CardContent className="px-0">
          <Table className="usage-table">
            <TableHeader>
              <TableRow>
                <TableHead>模型</TableHead>
                {(
                  [
                    { key: "requests", label: "调用次数" },
                    { key: "credits", label: "消耗" },
                  ] as const
                ).map((col) => (
                  <TableHead
                    key={col.key}
                    className="text-right"
                    aria-sort={
                      sort.key === col.key
                        ? sort.descending
                          ? "descending"
                          : "ascending"
                        : "none"
                    }
                  >
                    <button
                      className="inline-flex items-center gap-1"
                      onClick={() => sortBy(col.key)}
                    >
                      {col.label}
                      <ArrowDownUpIcon className="size-3" />
                    </button>
                  </TableHead>
                ))}
                <TableHead className="hidden text-right lg:table-cell">
                  非缓存输入
                </TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  缓存读取
                </TableHead>
                <TableHead className="hidden text-right xl:table-cell">
                  缓存写入
                </TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  输出
                </TableHead>
                <TableHead
                  className="text-right"
                  aria-sort={
                    sort.key === "total_tokens"
                      ? sort.descending
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                >
                  <button
                    className="inline-flex items-center gap-1"
                    onClick={() => sortBy("total_tokens")}
                  >
                    总 Token
                    <ArrowDownUpIcon className="size-3" />
                  </button>
                </TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  缓存命中率
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unavailable ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    {loading ? (
                      <Skeleton className="my-4 h-36 w-full" />
                    ) : (
                      <p className="py-12 text-center text-muted-foreground">
                        数据加载失败，请重试
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              ) : rows.length ? (
                rows.map((m) => (
                  <TableRow key={m.model}>
                    <TableCell
                      className="max-w-36 truncate font-medium sm:max-w-64"
                      title={m.model}
                    >
                      {m.model || "未记录模型"}
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums"
                      title={fullNumber.format(m.requests)}
                    >
                      {compact.format(m.requests)}
                    </TableCell>
                    <TableCell className="text-right text-primary tabular-nums">
                      {metricValue(m.credits, "credits")}
                    </TableCell>
                    {(
                      [
                        "non_cached_input_tokens",
                        "cache_read_tokens",
                        "cache_creation_tokens",
                        "output_tokens",
                      ] as const
                    ).map((key) => (
                      <TableCell
                        key={key}
                        className={`hidden text-right tabular-nums ${key === "cache_creation_tokens" ? "xl:table-cell" : "lg:table-cell"}`}
                        title={fullNumber.format(m[key])}
                      >
                        {compact.format(m[key])}
                      </TableCell>
                    ))}
                    <TableCell
                      className="text-right tabular-nums"
                      title={fullNumber.format(m.total_tokens)}
                    >
                      {compact.format(m.total_tokens)}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {percent(cacheRate(m))}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableEmpty
                  cols={9}
                  Icon={BarChart3Icon}
                  title="暂无使用记录"
                  description="试试其他时间范围或模型。"
                />
              )}
            </TableBody>
          </Table>
        </CardContent>
        {!unavailable && sorted.length > 0 ? (
          <TablePagination
            current={actualPage}
            total={sorted.length}
            pageSize={pageSize}
            onChange={setPage}
            className="rounded-none border-x-0 border-b-0"
          />
        ) : null}
      </Card>
      <p className="text-xs leading-6 text-muted-foreground">
        统计范围：API
        调用日志；独立图片、视频等异步任务以任务记录和账单为准。消耗包含模型积分，退款回溯到原调用时间；与按流水发生时间展示的账单可能不同。对比上一个等长时间段。
      </p>
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>自定义时间范围</DialogTitle>
            <DialogDescription>
              使用北京时间，最多查询 90 天。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="usage-start">开始时间</Label>
              <Input
                id="usage-start"
                type="datetime-local"
                step="1"
                value={draft.start}
                onChange={(e) => setDraft({ ...draft, start: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="usage-end">结束时间</Label>
              <Input
                id="usage-end"
                type="datetime-local"
                step="1"
                value={draft.end}
                onChange={(e) => setDraft({ ...draft, end: e.target.value })}
              />
            </div>
            {dateError ? (
              <p role="alert" className="text-sm text-destructive">
                {dateError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomOpen(false)}>
              取消
            </Button>
            <Button onClick={applyCustom}>应用</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
