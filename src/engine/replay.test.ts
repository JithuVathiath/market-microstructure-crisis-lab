import { describe, expect, it } from "vitest";

import {
  createIncidentReport,
  createReplay,
  DISCLAIMER,
  parseReplay,
} from "./replay";
import { createDefaultConfig, MarketSimulation } from "./simulation";

describe("replay and report exports", () => {
  const config = { ...createDefaultConfig("stable"), maxTicks: 3 };
  const snapshot = new MarketSimulation(config).runToEnd();

  it("round-trips versioned replay data", () => {
    const replay = createReplay(
      config,
      snapshot,
      [],
      [],
      "2026-01-01T00:00:00.000Z",
    );
    expect(parseReplay(JSON.stringify(replay))).toEqual(replay);
    expect(replay.disclaimer).toBe(DISCLAIMER);
  });

  it("rejects invalid or unsupported files", () => {
    expect(() => parseReplay("{}")).toThrow(
      "Unsupported or invalid replay file",
    );
    expect(() => parseReplay("{broken")).toThrow();
    const replay = createReplay(config, snapshot);
    expect(() =>
      parseReplay(JSON.stringify({ ...replay, eventStreamHash: "tampered" })),
    ).toThrow("Replay integrity check failed");
  });

  it("creates a standalone, escaped incident report", () => {
    const altered = {
      ...snapshot,
      alerts: [
        {
          id: "x",
          tick: 1,
          severity: "critical" as const,
          title: "<shock>",
          detail: "A & B",
        },
      ],
    };
    const report = createIncidentReport(config, altered);
    expect(report).toContain("<!doctype html>");
    expect(report).toContain("&lt;shock&gt;");
    expect(report).toContain("A &amp; B");
    expect(report).toContain(DISCLAIMER);
  });
});
