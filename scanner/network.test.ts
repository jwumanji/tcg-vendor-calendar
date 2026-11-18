import { it, expect, vi } from "vitest";
import { publicAddress, publicLookup } from "./network.ts";
import type { lookup } from "node:dns/promises";

it("accepts global unicast and excludes special-purpose DNS answers", () => {
  for (const address of ["8.8.8.8", "2606:4700:4700::1111"]) expect(publicAddress(address)).toBe(true);
  for (const address of ["127.0.0.1", "0.0.0.0", "192.168.1.1", "100.64.0.1",
    "192.0.2.1", "224.0.0.1", "169.254.2.3", "::1", "::ffff:127.0.0.1", "fc00::1",
    "fe80::1", "2001:db8::1", "2002::1", "3fff::1", "64:ff9b::1"]) expect(publicAddress(address)).toBe(false);
});

it("hands the checked answers to each new connection and rejects a later mixed result", async () => {
  const first = [{ address: "8.8.8.8", family: 4 }];
  const resolve = vi.fn().mockResolvedValueOnce(first)
    .mockResolvedValueOnce([...first, { address: "::1", family: 6 }]);
  const connect = publicLookup(resolve as typeof lookup);
  const dial = () => new Promise((ok, fail) => connect("schedule.test", { all: true },
    (error, addresses) => error ? fail(error) : ok(addresses)));
  await expect(dial()).resolves.toEqual(first);
  await expect(dial()).rejects.toThrow("Non-public");
});
