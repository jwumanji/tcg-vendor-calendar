import sharp from "sharp";
import events from "../data/events.json";
import { describe, expect, it } from "vitest";
import { decideImageKind, hintedImageKind } from "./eventImage";

describe("event artwork fit", () => {
  it("uses a reviewed fit before the first image decode", () => {
    expect(hintedImageKind("poster_or_photo")).toBe("cover");
    expect(hintedImageKind("logo")).toBe("logo");
    expect(hintedImageKind(null)).toBeUndefined();
  });

  it.each(["awardx", "mtg"])("ships the complete wide %s wordmark without square padding", async (name) => {
    const path = `logos/${name}.webp`;
    const metadata = await sharp("public/" + path).metadata();
    expect(metadata.width / metadata.height).toBeGreaterThan(2);
    expect(metadata.hasAlpha).toBe(true);
    const uses = events.filter((event) => event.logo === path);
    expect(uses.length).toBeGreaterThan(0);
    expect(uses.every((event) => hintedImageKind(event.logo_kind) === "logo")).toBe(true);
  });

  it("distinguishes a landscape photograph from a wide wordmark without a hint", () => {
    expect(decideImageKind(2, { transparent: 0, flatEdge: 0.15 })).toBe("cover");
    expect(decideImageKind(2, { transparent: 0, flatEdge: 0.6 })).toBe("logo");
  });

  it("protects transparent and flat-edged unlabelled logos", () => {
    expect(decideImageKind(0.85, { transparent: 0.02, flatEdge: 0 })).toBe("logo");
    expect(decideImageKind(1, { transparent: 0, flatEdge: 0.72 })).toBe("logo");
  });
});
