import { expect, it } from "vitest";
import { createClient, userAgent } from "./http.ts";
it("checks exclusions, redirects, agent, retries and robots failures before reading a listing", async () => {
  const requests: string[] = [];
  let count = 0;
  const client = createClient(["https://example.test", "https://other.test", "https://forbidden.test"], async (input, init) => {
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

it.each(["/robots.txt", "/events"])("checks the source origin before following %s redirects", async (redirectAt) => {
  const calls: URL[] = [];
  const get = createClient(["https://organizer.test"], async (url) => {
    const u = new URL(String(url));
    calls.push(u);
    return u.pathname === redirectAt
      ? Response.redirect("https://venue.test/elsewhere")
      : new Response("");
  }, 0);
  const signal = AbortSignal.timeout(1000);
  await expect(get("https://venue.test/detail", signal)).rejects.toThrow("Origin");
  await expect(get("https://organizer.test:8443/detail", signal)).rejects.toThrow("Origin");
  expect(calls).toEqual([]);
  await expect(get("https://organizer.test/events", signal)).rejects.toThrow("Origin");
  expect(calls.every((u) => u.origin === "https://organizer.test")).toBe(true);
});

it("cancels redirects, error bodies and oversized chunked responses", async () => {
  const cancelled: string[] = [];
  const get = createClient(["https://calendar.test"], async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === "/robots.txt") return new Response("");
    const status = path === "/start" ? 302 : path === "/large" ? 200 : 403;
    return new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); },
      cancel() { cancelled.push(path); },
    }), { status, headers: { location: "/large" } });
  }, 0);
  const signal = AbortSignal.timeout(2000);
  await expect(get("https://calendar.test/start", signal)).rejects.toThrow("byte limit");
  await expect(get("https://calendar.test/error", signal)).rejects.toThrow("403");
  expect(cancelled).toEqual(["/start", "/large", "/error"]);
});
