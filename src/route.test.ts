import { describe, expect, it } from "vitest";
import { eventPath, parseRoute } from "./route";

describe("event URLs", () => {
  it("recognizes the list and event paths", () => {
    expect(parseRoute("/")).toEqual({ page: "events" });
    expect(eventPath("show-27")).toBe("/event/show-27");
    expect(parseRoute("/event/show-27/")).toEqual({ page: "event", id: "show-27" });
  });

  it.each(["Tokyo / 東京", "SG?2027#May", "%2F", "A+B"])("round-trips %s as one path segment", (id) => {
    const path = eventPath(id);
    expect(path.slice("/event/".length)).not.toMatch(/[/#? ]/);
    expect(parseRoute(path)).toEqual({ page: "event", id });
  });

  it.each(["/event/", "/event/%zz", "/event/a/b"])("handles invalid event path %s", (path) => {
    expect(parseRoute(path)).toEqual({ page: "event", id: null });
  });
});
