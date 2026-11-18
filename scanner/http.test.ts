import { expect, it } from "vitest";
import { createClient, userAgent } from "./http.ts";
it("checks exclusions, redirects, agent, retries and robots failures before reading a listing", async () => {
  const requests: string[] = [];
  let count = 0;
  const client = createClient(async (input, init) => {
    const u = new URL(String(input));
    requests.push(u.href);
    expect(new Headers(init?.headers).get("User-Agent")).toBe(userAgent);
    expect(init?.cache).toBe("no-store");
    if (u.hostname === "forbidden.test")
      return new Response("", { status: 403 });
    if (u.pathname === "/robots.txt")
      return new Response("User-agent: *\nDisallow: /closed");
    if (u.pathname === "/redirect")
      return Response.redirect("https://other.test/closed");
    return ++count === 1
      ? new Response("", { status: 503 })
      : new Response("event");
  }, 0);
  const get = (u: string) => client(u, AbortSignal.timeout(1000));
  await expect(get("https://example.test/public")).resolves.toBe("event");
  await expect(get("https://example.test/redirect")).rejects.toThrow(
    "disallows",
  );
  await expect(get("https://forbidden.test/events")).rejects.toThrow("403");
  expect(requests).toEqual([
    "https://example.test/robots.txt",
    "https://example.test/public",
    "https://example.test/public",
    "https://example.test/redirect",
    "https://other.test/robots.txt",
    "https://forbidden.test/robots.txt",
  ]);
});
