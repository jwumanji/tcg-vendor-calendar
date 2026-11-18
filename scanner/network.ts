// 198.18.0.0/15 (benchmarking space) is deliberately NOT excluded: the egress proxy on the
// box answers DNS with addresses from it, and it is not routable to private services.
import { lookup } from "node:dns/promises";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { Agent } from "undici";

// IANA special-purpose assignments, plus multicast and reserved space.
// For IPv6 only globally allocated unicast space is eligible.
const excluded = new BlockList();
for (const subnet of [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
  "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24",
  "192.31.196.0/24", "192.52.193.0/24", "192.88.99.0/24", "192.168.0.0/16",
  "192.175.48.0/24", "198.51.100.0/24", "203.0.113.0/24",
  "224.0.0.0/4", "240.0.0.0/4",
  "2001::/23", "2001:db8::/32", "2002::/16", "2620:4f:8000::/48", "3fff::/20",
]) {
  const [address, prefix] = subnet.split("/");
  excluded.addSubnet(address, Number(prefix), isIP(address) === 6 ? "ipv6" : "ipv4");
}
const unicast6 = new BlockList();
unicast6.addSubnet("2000::", 3, "ipv6");

export function publicAddress(address: string) {
  switch (isIP(address)) {
    case 4: return !excluded.check(address, "ipv4");
    case 6: return unicast6.check(address, "ipv6") && !excluded.check(address, "ipv6");
    default: return false;
  }
}

// Supply the validated DNS answer directly to the socket. A separate DNS
// preflight would let the address change between validation and connection.
export function publicLookup(resolve = lookup): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, { ...options, all: true }).then((answers) => {
      if (!answers.length || answers.some(({ address }) => !publicAddress(address)))
        throw Error(`Non-public address for ${hostname}`);
      if (options.all) callback(null, answers);
      else callback(null, answers[0].address, answers[0].family);
    }).catch((error: Error) => callback(error, ""));
  };
}
export const dispatcher = new Agent({ connect: { lookup: publicLookup() } });
