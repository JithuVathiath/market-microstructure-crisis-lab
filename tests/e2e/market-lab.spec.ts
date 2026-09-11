import { expect, test } from "@playwright/test";

test("runs the market and exposes interactive research controls", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Build the market/i }),
  ).toBeVisible();
  await expect(page.getByText("Synthetic data")).toBeVisible();
  await page.getByRole("button", { name: "Run experiment" }).click();
  await expect(page.getByText(/Tick [1-9]/)).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: "Pause market" }).click();
  await page.getByRole("button", { name: "Advance one tick" }).click();
  await page.getByRole("button", { name: "Methodology" }).click();
  await expect(page.getByRole("dialog")).toContainText("price-time priority");
  await page.getByRole("button", { name: "Close methodology" }).click();
});

test("changes governance rules and produces a counterfactual", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Speed bump").fill("3");
  await page
    .getByRole("button", { name: /Compare against unregulated market/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Same shock, different rules" }),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Unregulated", { exact: true })).toBeVisible();
  await expect(page.getByText("Policy lab", { exact: true })).toBeVisible();
});

test("submits a human order and supports deterministic replay navigation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Order quantity").fill("7");
  await page.getByRole("button", { name: "Submit buy order" }).click();
  await expect(page.getByText("Manual participant")).toBeVisible();
  await page.getByRole("button", { name: "Run experiment" }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Pause market" }).click();
  await page.getByLabel("Replay tick").fill("0");
  await expect(
    page.getByText(/Viewing historical state at tick 0/),
  ).toBeVisible();
});
