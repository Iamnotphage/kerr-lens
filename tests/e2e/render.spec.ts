import { expect, test } from "@playwright/test";

test("compiles the WebGL renderer and draws an interactive frame", async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden();
  await expect(page.locator("#fatal-error")).toBeHidden();
  await expect(page.locator("#scene")).toBeVisible();
  await expect(page.locator("#fps")).not.toHaveText(/--/);
  await expect(page.locator("#render-scale")).toContainText("×");
  await expect(page.locator("#toggle-panel")).toHaveAttribute("aria-expanded", "false");

  await page.locator("#toggle-panel").click();
  await expect(page.locator("#toggle-panel")).toHaveAttribute("aria-expanded", "true");
  await page.locator("#inclination").fill("42");
  await expect(page.locator("#inclination-value")).toHaveText("42°");
  await page.locator("#doppler-enabled").uncheck({ force: true });
  await expect(page.locator("#doppler-enabled")).not.toBeChecked();
  await page.locator("#doppler-enabled").check({ force: true });
  await expect(page.locator("#doppler-enabled")).toBeChecked();
  await page.locator("#reset-view").click();
  await expect(page.locator("#inclination-value")).toHaveText("68°");
  await expect(page.locator("#distance-value")).toHaveText("26.0 rₛ");
  await page.locator("#toggle-panel").click();
  await expect(page.locator("#toggle-panel")).toHaveAttribute("aria-expanded", "false");

  const canvasBounds = await page.locator("#scene").boundingBox();
  expect(canvasBounds?.width).toBeGreaterThan(600);
  expect(canvasBounds?.height).toBeGreaterThan(400);
  expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);

  await page.screenshot({ path: testInfo.outputPath("kerr-lens-v1.1.png"), fullPage: true });
});
