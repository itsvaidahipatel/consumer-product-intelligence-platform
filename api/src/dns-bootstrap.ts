/**
 * Supabase `db.<ref>.supabase.co` is often **IPv6-only** (AAAA, no A record).
 * On some macOS / Node combinations, the default resolver path used by `postgres`
 * can return `getaddrinfo ENOTFOUND` even though `dig AAAA` works.
 *
 * Set resolver / socket defaults **before** opening DB connections (see Node
 * `dns.setDefaultResultOrder`, `net.setDefaultAutoSelectFamily`).
 *
 * Prefer Supabase **Transaction pooler** (IPv4) in production when possible;
 * this bootstrap still helps direct URIs in development.
 */
import dns from "node:dns";
import net from "node:net";

dns.setDefaultResultOrder("verbatim");

if ("setDefaultAutoSelectFamily" in net && typeof net.setDefaultAutoSelectFamily === "function") {
  try {
    net.setDefaultAutoSelectFamily(true);
  } catch {
    /* ignore */
  }
}
