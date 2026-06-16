import { lookup, resolve4, resolve6 } from "node:dns/promises";
import net from "node:net";

/**
 * Supabase Postgres hostnames (`db.<ref>.supabase.co`, `*.pooler.supabase.com`, etc.).
 * Direct `db.*` is often **IPv6-only** (AAAA). The `postgres` package uses
 * `socket.connect(port, hostname)` which on some macOS/Node stacks yields
 * `getaddrinfo ENOTFOUND` even when `dig AAAA` works. It also breaks IPv6 literals
 * in its URL host parser (`split(':')[0]`).
 *
 * For these hosts we supply a custom `socket` factory: resolve with `dns.lookup`
 * and fall back to `resolve6` / `resolve4` (same family of answers as `dig`),
 * prefer **IPv4 when both exist** (many networks cannot route outbound IPv6 to
 * Supabase even when DNS returns AAAA — `EHOSTUNREACH`), then connect with explicit `family`.
 */
export function isSupabasePostgresHost(hostname: string): boolean {
  return /\.supabase\.(co|com)$/i.test(hostname);
}

export type DnsAddress = { address: string; family: 4 | 6 };

/**
 * Resolve all usable addresses; tries the same resolution path as `dig` when `lookup` fails.
 */
export async function resolveSupabaseAddresses(hostname: string): Promise<DnsAddress[]> {
  const merged: DnsAddress[] = [];
  const push = (recs: { address: string; family: number }[]) => {
    for (const r of recs) {
      if (r.family !== 4 && r.family !== 6) continue;
      merged.push({ address: r.address, family: r.family as 4 | 6 });
    }
  };

  try {
    const raw = await lookup(hostname, { all: true, verbatim: true });
    push(Array.isArray(raw) ? raw : [raw]);
  } catch {
    /* continue to resolve6 / resolve4 */
  }

  if (merged.length === 0) {
    try {
      const v6 = await resolve6(hostname);
      push(v6.map((address) => ({ address, family: 6 })));
    } catch {
      /* ignore */
    }
  }

  if (merged.length === 0) {
    try {
      const v4 = await resolve4(hostname);
      push(v4.map((address) => ({ address, family: 4 })));
    } catch {
      /* ignore */
    }
  }

  if (merged.length === 0) {
    const err = new Error(`DNS_NO_RECORDS_FOR_HOST ${hostname}`);
    throw err;
  }

  return merged;
}

/** Prefer IPv4 when both exist — outbound IPv6 to Supabase often returns EHOSTUNREACH on consumer networks. */
export function sortAddressesPreferIpv4First(records: DnsAddress[]): DnsAddress[] {
  return [...records].sort((a, b) => {
    if (a.family === 4 && b.family !== 4) return -1;
    if (b.family === 4 && a.family !== 4) return 1;
    return 0;
  });
}

export function createSupabasePostgresSocketFactory(hostname: string, port: number) {
  return async (_options: object): Promise<net.Socket> => {
    let records: DnsAddress[];
    try {
      records = sortAddressesPreferIpv4First(await resolveSupabaseAddresses(hostname));
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      err.message = `${err.message} (${hostname})`;
      throw err;
    }

    let lastErr: Error | undefined;
    for (const r of records) {
      const s = new net.Socket();
      try {
        await new Promise<void>((resolve, reject) => {
          s.once("error", reject);
          s.connect({ port, host: r.address, family: r.family }, () => {
            s.removeListener("error", reject);
            resolve();
          });
        });
        Object.assign(s, { host: hostname });
        return s;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        s.destroy();
      }
    }
    if (!lastErr) {
      throw new Error(`Could not connect to ${hostname}:${port}`);
    }
    const onlyIpv6InDns = records.length > 0 && records.every((r) => r.family === 6);
    if (
      onlyIpv6InDns &&
      /EHOSTUNREACH|ENETUNREACH|network is unreachable/i.test(lastErr.message)
    ) {
      throw new Error(
        `${lastErr.message}\n` +
          "This database hostname only has IPv6 in DNS, but this machine/network cannot reach it over IPv6 (very common on home Wi-Fi or with some VPNs). " +
          "Fix: in Supabase → Settings → Database, copy the **Transaction pooler** connection string (port **6543**, host `*.pooler.supabase.com`) into DATABASE_URL — it almost always includes IPv4. " +
          "Alternatively use Supabase's IPv4 add-on for direct connections.",
      );
    }
    throw lastErr;
  };
}
