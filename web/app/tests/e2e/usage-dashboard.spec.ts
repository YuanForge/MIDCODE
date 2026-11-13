import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  cacheRate,
  emptyMetrics,
  percent,
  successRate,
  usageRange,
} from "../../src/lib/usage-stats";

async function setup(page: Page) {
  const state = { calls: [] as URL[], fail: false, empty: false };
  await page.addInitScript(() =>
    localStorage.setItem("token", "usage-test-token"),
  );
  const models = Array.from({ length: 24 }, (_, i) => ({
    ...emptyMetrics,
    model:
      ["claude-sonnet", "gpt-5", "gemini-pro", "deepseek-v3"][i] ??
      `model-${i}`,
    requests: (24 - i) * 100,
    success: (24 - i) * 99,
    failed: 24 - i,
    credits: (24 - i) * 1_000_000,
    non_cached_input_tokens: 100_000,
    cache_read_tokens: 200_000,
    cache_creation_tokens: 10_000,
    output_tokens: 40_000,
    total_tokens: 350_000,
  }));
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const respond = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname.endsWith("/stats/usage")) {
      state.calls.push(url);
      if (state.fail)
        return respond({ error: "统计暂时不可用，请稍后重试" }, 500);
      const chosen = state.empty
        ? []
        : models.filter(
            (m) =>
              !url.searchParams.get("model") ||
              m.model === url.searchParams.get("model"),
          );
      const summary = chosen.reduce(
        (sum, m) =>
          Object.fromEntries(
            Object.keys(emptyMetrics).map((k) => [
              k,
              sum[k as keyof typeof sum] + m[k as keyof typeof emptyMetrics],
            ]),
          ) as typeof emptyMetrics,
        { ...emptyMetrics },
      );
      return respond({
        summary,
        previous: { ...summary, requests: summary.requests / 2 },
        models: chosen,
        available_models: models.map((m) => m.model),
        bucket: url.searchParams.get("bucket"),
        start_at: url.searchParams.get("start_at"),
        end_at: url.searchParams.get("end_at"),
        points: Array.from({ length: 7 }, (_, i) => ({
          ...emptyMetrics,
          requests: state.empty
            ? 0
            : [900, 1420, 1200, 1850, 2486, 1630, 2120][i],
          credits: state.empty ? 0 : (i + 1) * 1_000_000,
          at: `2026-11-${String(7 + i).padStart(2, "0")}T00:00:00+08:00`,
        })),
      });
    }
    if (url.pathname.endsWith("/settings"))
      return respond({ settings: { site_name: "MIDCODE", logo_url: "" } });
    if (url.pathname.endsWith("/profile"))
      return respond({ id: 1, username: "开发者账户" });
    if (url.pathname.endsWith("/balance"))
      return respond({ balance_credits: 100_000_000 });
    if (url.pathname.endsWith("/received-latest"))
      return respond({ gift: null });
    return respond({});
  });
  return state;
}

test("range-wide metrics survive paging; filters, sorting, CSV and responsive layout work", async ({
  page,
}) => {
  const state = await setup(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1600, height: 1120 });
  await page.goto("/stats");
  await expect(
    page.getByRole("heading", { name: "使用统计", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("共 24 个模型", { exact: true })).toBeVisible();
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await expect(page).toHaveURL(/\/stats$/);
  await expect(page).toHaveTitle(/MIDCODE/i);
  const count = state.calls.length;
  const trend = page.getByTestId("usage-trend");
  const before = await trend.innerHTML();
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page.getByRole("table").getByText("claude-sonnet")).toHaveCount(
    0,
  );
  expect(state.calls).toHaveLength(count);
  expect(await trend.innerHTML()).toBe(before);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  const file = await download;
  const stream = await file.createReadStream();
  let csv = "";
  for await (const chunk of stream!) csv += chunk.toString();
  expect(csv).toContain("claude-sonnet");
  expect(csv).toContain("model-23");
  expect(csv.trim().split("\r\n")).toHaveLength(25);
  await page.getByRole("combobox", { name: "筛选模型" }).selectOption("gpt-5");
  await expect(page.getByText("共 1 个模型", { exact: true })).toBeVisible();
  expect(state.calls.at(-1)?.searchParams.get("model")).toBe("gpt-5");
  await page.getByRole("radio", { name: "今天", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "统计粒度" })).toHaveValue(
    "hour",
  );
  await page.getByRole("radio", { name: "自定义", exact: true }).click();
  await page.getByLabel("开始时间", { exact: true }).fill("2026-11-10T00:00");
  await page.getByLabel("结束时间", { exact: true }).fill("2026-11-09T00:00");
  await page.getByRole("button", { name: "应用", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("有效的起止时间");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("radio", { name: "近 7 天", exact: true }).click();
  await page.getByRole("combobox", { name: "筛选模型" }).selectOption("");
  await expect(page.getByText("共 24 个模型", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "调用次数", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: "调用次数" }),
  ).toHaveAttribute("aria-sort", "descending");
  const out = process.env.USAGE_QA_DIR;
  if (out) {
    await mkdir(out, { recursive: true });
    await page.screenshot({ path: `${out}/usage-desktop.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "刷新", exact: true }),
  ).toBeVisible();
  if (out)
    await page.screenshot({ path: `${out}/usage-mobile.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("errors hide stale totals and retry recovers; empty range is explicit", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/stats");
  await expect(page.getByText("共 24 个模型", { exact: true })).toBeVisible();
  state.fail = true;
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("统计暂时不可用");
  await expect(
    page.getByRole("button", { name: "导出", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("table").getByText("claude-sonnet")).toHaveCount(
    0,
  );
  state.fail = false;
  state.empty = true;
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.getByText("暂无使用记录", { exact: true })).toBeVisible();
});

test("date presets are Beijing calendar days and undefined rates are not fake zero", () => {
  const now = new Date("2026-11-12T17:23:00Z");
  expect(usageRange("today", now).start_at).toBe("2026-11-12T16:00:00.000Z");
  expect(usageRange("7d", now).start_at).toBe("2026-11-06T16:00:00.000Z");
  expect(usageRange("yesterday", now).end_at).toBe("2026-11-12T16:00:00.000Z");
  expect(successRate(emptyMetrics)).toBeNull();
  expect(percent(cacheRate(emptyMetrics))).toBe("—");
});
