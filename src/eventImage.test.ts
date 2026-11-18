import { describe, expect, it } from "vitest";
import { decideImageKind } from "./eventImage";

describe("event artwork fit", () => {
  const photo = { transparent: 0, flatEdge: 0.15 };
  it("fills the box for opaque photos and posters", () => {
    expect(decideImageKind(1, photo)).toBe("cover");
    expect(
      decideImageKind(0.65, { ...photo, flatEdge: 0.8 }, "poster_or_photo"),
    ).toBe("cover");
  });
  it("protects wide art, transparency and flat or identified logos", () => {
    expect(decideImageKind(1.45, photo, "poster_or_photo")).toBe("logo");
    expect(decideImageKind(0.85, { ...photo, transparent: 0.02 })).toBe("logo");
    expect(decideImageKind(1, { ...photo, flatEdge: 0.72 })).toBe("logo");
    expect(decideImageKind(1, photo, "logo")).toBe("logo");
  });
});
