import { describe, expect, it } from "vitest";
import { coverHash, coverNameSize, coverPalette } from "./cover";

describe("generated event covers", () => {
  it("uses a stable unsigned hash and a repeatable design per event ID", () => {
    expect(coverHash("hello")).toBe(0x4f9f2cab);
    expect(coverPalette("scan-sg")).toEqual(coverPalette("scan-sg"));
    expect(coverPalette("scan-sg")).not.toEqual(coverPalette("scan-hk"));
  });
  it("selects only violet hues across motif variants", () => {
    const motifs = new Set<number>();
    for (let i = 0; i < 512; i++) {
      const { hue, motif } = coverPalette("event-" + i);
      expect(hue).toBeGreaterThanOrEqual(245);
      expect(hue).toBeLessThanOrEqual(285);
      motifs.add(motif);
    }
    expect([...motifs].sort()).toEqual([0, 1, 2, 3]);
  });
  it("scales titles for long names and long individual words", () => {
    const short = coverNameSize("Card Fest");
    expect(coverNameSize("Card Fest ".repeat(5))).toBeLessThan(short);
    expect(coverNameSize("Championship")).toBeLessThan(short);
    expect(coverNameSize("Card   Fest ")).toBe(short);
    expect(coverNameSize("A".repeat(200))).toBeGreaterThanOrEqual(10);
  });
});
