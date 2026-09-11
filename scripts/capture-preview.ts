import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  deviceScaleFactor: 1,
});

await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
await page.getByLabel("Playback speed").selectOption("8");
await page.getByRole("button", { name: "Run experiment" }).click();
await page.waitForTimeout(3_900);
await page.getByRole("button", { name: "Pause market" }).click();
await page.screenshot({ path: "docs/lab-preview.png", fullPage: false });

await browser.close();
