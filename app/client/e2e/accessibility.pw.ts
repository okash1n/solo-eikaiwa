import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const practiceDays = ["2026-07-09", "2026-07-10"];
const metricsDay = (ymd: string, speakingSec: number, avgArticulationWpm: number) => ({
  ymd,
  utterances: 1,
  words: 20,
  speechMs: speakingSec * 1_000,
  totalMs: speakingSec * 1_100,
  pauseMs: speakingSec * 100,
  repetitionWords: 0,
  repetitionWeightedWords: 0,
  speakingSec,
  avgArticulationWpm,
  avgPauseRatio: 0.1,
  repetitionRatio: 0,
});
const metrics = [metricsDay("2026-07-09", 480, 90), metricsDay("2026-07-10", 720, 110)];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("lang", "en");
  });
  await page.route((url) => url.pathname.startsWith("/api/"), async (route) => {
    const { pathname } = new URL(route.request().url());
    const json = (body: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });

    if (pathname === "/api/health") {
      return json({ ok: true, whisper: true, ffmpeg: true, claude: true, ttsKey: true, modelFile: true, app: "solo-eikaiwa", version: "test", llmReady: true });
    }
    if (pathname === "/api/progress/days") {
      return json({ days: practiceDays, xpByDay: { "2026-07-09": 20, "2026-07-10": 45 } });
    }
    if (pathname === "/api/progress/summary") {
      return json({ level: 1, xp: 65, xpIntoLevel: 65, xpToNext: 35, stage: 1, difficultyMaxed: false, proposal: null });
    }
    if (pathname === "/api/placement/latest") return json({ result: null });
    if (pathname === "/api/metrics/summary") {
      return json({
        days: metrics,
        weekly: { current: metrics[1], previous: metrics[0] },
        level: { current: 1, history: [] },
      });
    }
    if (pathname === "/api/assessment/latest") return json({ report: null });
    if (pathname === "/api/assessment/list") return json({ reports: [] });
    return json({});
  });
});

async function expectNoSeriousViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
  expect(serious).toEqual([]);
}

test("言語・状態・代替テキストを支援技術へ伝える", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
  const github = page.getByRole("link", { name: "GitHub repository (opens in a new tab)", exact: true });
  const website = page.getByRole("link", { name: "Official website (opens in a new tab)", exact: true });
  await expect(github).toHaveAttribute("href", "https://github.com/btajp/solo-eikaiwa");
  await expect(website).toHaveAttribute("href", "https://btajp.github.io/solo-eikaiwa/");
  for (const link of [github, website]) {
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
  await expect(page.getByText("© 2026 BTAJP. All Rights Reserved. Licensed under the MIT License.", { exact: true })).toBeVisible();
  await expect(page.getByText("Practice recorded on 2 days.", { exact: true })).toBeAttached();
  await expect(page.getByText("July 9, 2026 · 20 XP", { exact: true })).toBeAttached();
  await expectNoSeriousViolations(page);

  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page.getByRole("button", { name: "日本語", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: "GitHub リポジトリ（新しいタブで開く）", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "公式ウェブサイト（新しいタブで開く）", exact: true })).toBeVisible();
  await expect(page.getByText("練習を記録した日: 2日。", { exact: true })).toBeAttached();
  await expectNoSeriousViolations(page);

  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "EN", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.getByRole("button", { name: "Home" })).toBeVisible();
  await expectNoSeriousViolations(page);

  await page.getByRole("button", { name: "Progress" }).click();
  await expect(page.getByText("July 9, 2026: 8.0 minutes of speaking", { exact: true })).toBeAttached();
  await expect(page.locator(".visually-hidden").nth(1)).toContainText("July 10, 2026: 110 words per minute");
  await expectNoSeriousViolations(page);
});

test("狭幅でもすべての主ナビゲーションをキーボードで操作できる", async ({ page }) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  const navigationLabels = ["Home", "Free Talk", "390 Sentences", "Listening", "Level Check", "Model Talks", "Progress", "Practice reactions", "Settings"];

  for (const width of [320, 375, 640, 860]) {
    await page.setViewportSize({ width, height: 800 });
    for (const label of navigationLabels) {
      const item = navigation.getByRole("button", { name: label, exact: true });
      await expect(item).toBeVisible();
      await item.focus();
      await expect(item).toBeFocused();
      await expect(item).toBeInViewport();
    }
    for (const label of ["GitHub repository (opens in a new tab)", "Official website (opens in a new tab)"]) {
      const link = page.getByRole("link", { name: label, exact: true });
      await expect(link).toBeVisible();
      await link.focus();
      await expect(link).toBeFocused();
      await expect(link).toBeInViewport();
    }
  }
});
