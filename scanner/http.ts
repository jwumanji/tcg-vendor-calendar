import robotsParser from "robots-parser";
import { setTimeout as pause } from "node:timers/promises";

export const userAgent =
  "Mozilla/5.0 (compatible; GrailfoxEventScanner/1.0; +https://www.grailfoxtcg.com)";
const agent = "GrailfoxEventScanner";

export function createClient(fetchPage = fetch, interval = 1000) {
  const queues = new Map<string, Promise<void>>();
  const next = new Map<string, number>();
  const delays = new Map<string, number>();
  const policies = new Map<string, Promise<ReturnType<typeof robotsParser>>>();

  function request(url: URL, signal: AbortSignal) {
    const host = url.hostname;
    const job = (queues.get(host) ?? Promise.resolve()).then(async () => {
      signal.throwIfAborted();
      await pause(Math.max(0, (next.get(host) ?? 0) - Date.now()), undefined, {
        signal,
      });
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
      try {
        const res = await fetchPage(url, {
          redirect: "manual",
          signal: deadline,
          cache: "no-store",
          headers: {
            "User-Agent": userAgent,
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        });
        return {
          status: res.status,
          headers: res.headers,
          body: await res.text(),
        };
      } finally {
        next.set(host, Date.now() + (delays.get(host) ?? interval));
      }
    });
    queues.set(
      host,
      job.then(
        () => {},
        () => {},
      ),
    );
    return job;
  }
  async function read(
    url: URL,
    signal: AbortSignal,
    robots = false,
    redirects = 0,
  ): Promise<string> {
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw Error("Invalid public URL");
    if (!robots) {
      let policy = policies.get(url.origin);
      if (!policy) {
        const path = new URL("/robots.txt", url);
        policy = read(path, signal, true).then((body) =>
          robotsParser(path.href, body),
        );
        policies.set(url.origin, policy);
      }
      const rules = await policy;
      if (rules.isAllowed(url.href, agent) === false)
        throw Error(`robots.txt disallows ${url}`);
      const delay = rules.getCrawlDelay(agent);
      if (delay) {
        delays.set(url.hostname, Math.max(interval, delay * 1000));
        next.set(
          url.hostname,
          Math.max(next.get(url.hostname) ?? 0, Date.now() + delay * 1000),
        );
      }
    }
    for (let attempt = 0; ; attempt++) {
      let response;
      try {
        response = await request(url, signal);
      } catch (err) {
        if (!attempt && !signal.aborted) continue;
        throw err;
      }
      const { status, headers, body } = response;
      if (robots && [404, 410].includes(status)) return "";
      if (
        status >= 300 &&
        status < 400 &&
        headers.has("location") &&
        redirects < 5
      )
        return read(
          new URL(headers.get("location")!, url),
          signal,
          robots,
          redirects + 1,
        );
      if ((status === 429 || status >= 500) && !attempt) {
        const after = headers.get("retry-after");
        if (after) {
          const wait = /^\d+$/.test(after)
            ? Number(after) * 1000
            : Date.parse(after) - Date.now();
          if (Number.isFinite(wait))
            next.set(
              url.hostname,
              Math.max(next.get(url.hostname) ?? 0, Date.now() + wait),
            );
        }
        continue;
      }
      if (status < 200 || status >= 300)
        throw Error(`HTTP ${status} at ${url}`);
      if (
        /<title>\s*(?:Just a moment|One moment, please|Access denied)/i.test(
          body,
        )
      )
        throw Error(`Access challenge at ${url}`);
      return body;
    }
  }
  return (url: string, signal: AbortSignal) => read(new URL(url), signal);
}
