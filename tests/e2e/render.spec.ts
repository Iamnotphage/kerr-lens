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
  await expect(page.locator("#disk-appearance")).toHaveValue("cinematic");
  await expect(page.locator("#color-temperature-value")).toHaveText("4,500 K");
  await expect(page.locator("#mass")).toBeDisabled();
  await expect(page.locator("#doppler-enabled")).not.toBeChecked();
  await page.locator("#disk-appearance").selectOption("scientific");
  await expect(page.locator("#mass")).toBeEnabled();
  await expect(page.locator("#doppler-enabled")).toBeChecked();
  await expect(page.locator("#color-temperature-value")).toHaveText("37,800 K");
  await page.locator("#inclination").fill("42");
  await expect(page.locator("#inclination-value")).toHaveText("42°");
  await page.locator("#mass").fill("9");
  await page.locator("#eddington-ratio").fill("-1");
  await expect(page.locator("#mass-value")).toHaveText("10⁹ M☉");
  await expect(page.locator("#eddington-ratio-value")).toHaveText("0.100 L_Edd");
  await expect(page.locator("#color-temperature-value")).toHaveText("67,100 K");
  await page.locator("#mass").fill("9.5");
  await page.locator("#eddington-ratio").fill("-1.5");
  await expect(page.locator("#color-temperature-value")).toHaveText("37,800 K");
  await page.locator("#doppler-enabled").uncheck({ force: true });
  await expect(page.locator("#doppler-enabled")).not.toBeChecked();
  await page.locator("#doppler-enabled").check({ force: true });
  await expect(page.locator("#doppler-enabled")).toBeChecked();
  await page.locator("#disk-appearance").selectOption("cinematic");
  await expect(page.locator("#mass")).toBeDisabled();
  await expect(page.locator("#color-temperature-value")).toHaveText("4,500 K");
  await expect(page.locator("#doppler-enabled")).not.toBeChecked();
  await page.locator("#reset-view").click();
  await expect(page.locator("#inclination-value")).toHaveText("85°");
  await expect(page.locator("#distance-value")).toHaveText("26.0 rₛ");
  await page.locator("#toggle-panel").click();
  await expect(page.locator("#toggle-panel")).toHaveAttribute("aria-expanded", "false");

  const canvasBounds = await page.locator("#scene").boundingBox();
  expect(canvasBounds?.width).toBeGreaterThan(600);
  expect(canvasBounds?.height).toBeGreaterThan(400);
  expect(runtimeErrors, runtimeErrors.join("\n")).toEqual([]);

  await page.screenshot({ path: testInfo.outputPath("kerr-lens-v1.2.1.png"), fullPage: true });
});
