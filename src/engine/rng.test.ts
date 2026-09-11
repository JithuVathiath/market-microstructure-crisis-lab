import { describe, expect, it } from "vitest";

import { SeededRandom } from "./rng";

describe("SeededRandom", () => {
  it("repeats the same sequence for the same seed", () => {
    const left = new SeededRandom(42);
    const right = new SeededRandom(42);
    expect(Array.from({ length: 20 }, () => left.next())).toEqual(
      Array.from({ length: 20 }, () => right.next()),
    );
  });

  it("keeps generated values in the requested range", () => {
    const random = new SeededRandom(7);
    for (let index = 0; index < 100; index += 1) {
      expect(random.between(-2, 3)).toBeGreaterThanOrEqual(-2);
      expect(random.integer(4, 8)).toBeGreaterThanOrEqual(4);
      expect(random.integer(4, 8)).toBeLessThanOrEqual(8);
    }
  });

  it("handles probability boundaries and collection choices", () => {
    const random = new SeededRandom(1);
    expect(random.chance(0)).toBe(false);
    expect(random.chance(1)).toBe(true);
    expect(["a", "b", "c"]).toContain(random.choose(["a", "b", "c"]));
    expect(() => random.choose([])).toThrow(
      "Cannot choose from an empty collection",
    );
  });
});
