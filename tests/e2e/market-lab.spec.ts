import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

test("runs, pauses, reconstructs an event, inspects a queue and opens a decision", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Build the market.*Break the market/i }),
  ).toBeVisible();
  await expect(page.getByText("Synthetic Data")).toBeVisible();

  await page.getByRole("button", { name: "Open instructions" }).click();
  const instructions = page.getByRole("dialog", {
    name: "How to Use the Market Lab",
  });
  await expect(instructions).toBeVisible();
  await expect(
    instructions.getByRole("heading", { name: "Quick-Start Workflow" }),
  ).toBeVisible();
  await expect(
    instructions.getByText("pnpm dev", { exact: true }),
  ).toBeVisible();
  await instructions
    .getByRole("button", { name: "Close instructions" })
    .click();
  await expect(instructions).toBeHidden();

  await page.getByRole("button", { name: "Launch Flash Crash" }).click();
  await expect(page.getByText(/Tick [1-9]/)).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "Stop experiment" }).click();
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await page.getByRole("button", { name: "Advance one tick" }).click();

  const previousEvent = page.getByRole("button", { name: "← Previous event" });
  await previousEvent.click();
  await expect(
    page.getByText(/Reconstructed exchange state at event/),
  ).toBeVisible();

  await page
    .getByRole("region", { name: "Limit Order Book" })
    .getByRole("button", { name: /Inspect (bid|ask) queue/ })
    .first()
    .click();
  await expect(page.locator(".queue-inspector li").first()).toBeVisible();

  const decision = page
    .getByRole("region", { name: "Agent Decision Records" })
    .getByRole("button")
    .first();
  await decision.click();
  await expect(decision).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Synthetic latency")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("runs a paired policy comparison and exposes research batches", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Speed bump").fill("3");
  await page
    .getByRole("button", { name: /Compare with the unregulated market/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Same Shock, Different Rules" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("cell", { name: "Retail slippage" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Paired-Seed Monte Carlo" }),
  ).toBeVisible();
  await expect(page.getByLabel("Batch repetitions")).toHaveValue("25");
});

test("reproduces an identical event hash and exports a valid replay", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Research", exact: true }).click();
  const step = page.getByRole("button", { name: "Advance one tick" });
  for (let index = 1; index <= 4; index += 1) {
    await step.click();
    await expect(page.getByText(new RegExp(`Tick ${index} /`))).toBeVisible();
  }
  const firstHash = await page.locator(".integrity-hash").textContent();

  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText(/Tick 0 \/ 220/)).toBeVisible();
  for (let index = 1; index <= 4; index += 1) {
    await step.click();
    await expect(page.getByText(new RegExp(`Tick ${index} /`))).toBeVisible();
  }
  await expect(page.locator(".integrity-hash")).toHaveText(firstHash ?? "");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download replay JSON" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) throw new Error("Replay download did not produce a file");
  const replay = JSON.parse(await readFile(path, "utf8")) as {
    schemaVersion: number;
    engine: string;
    eventStream: unknown[];
    decisionLog: unknown[];
    eventStreamHash: string;
  };
  expect(replay).toMatchObject({ schemaVersion: 2, engine: "rust-wasm" });
  expect(replay.eventStream.length).toBeGreaterThan(200);
  expect(replay.decisionLog.length).toBeGreaterThan(0);
  expect(replay.eventStreamHash).toMatch(/^[a-f0-9]{16}$/);

  await page.locator('input[type="file"]').setInputFiles(path);
  await expect(
    page.getByText(/Reconstructed exchange state at event/),
  ).toBeVisible();
  await expect(page.locator(".integrity-hash")).toContainText(
    replay.eventStreamHash,
  );
});

test("keeps the instruction guide accessible on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const helpButton = page.getByRole("button", { name: "Open instructions" });
  await expect(helpButton).toBeVisible();
  await helpButton.click();

  const instructions = page.getByRole("dialog", {
    name: "How to Use the Market Lab",
  });
  await expect(instructions).toBeVisible();
  await expect(
    instructions.getByRole("heading", { name: "Run the Project Locally" }),
  ).toBeAttached();
  await page.keyboard.press("Escape");
  await expect(instructions).toBeHidden();
});
