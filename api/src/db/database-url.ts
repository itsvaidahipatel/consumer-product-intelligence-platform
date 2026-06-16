/**
 * Postgres connection strings are parsed with WHATWG `URL`.
 * Characters like `#`, `@`, `:`, `/`, `?`, `&` in the password must be percent-encoded
 * or the URL is invalid (common with Supabase auto-generated passwords).
 */
export function assertParsableDatabaseUrl(databaseUrl: string): void {
  const trimmed = databaseUrl.trim();
  if (!trimmed) {
    throw new Error("DATABASE_URL is empty.");
  }

  if (!/^postgres(ql)?:\/\//i.test(trimmed)) {
    throw new Error('DATABASE_URL must start with "postgres://" or "postgresql://".');
  }

  try {
    new URL(trimmed);
  } catch {
    const hint =
      "If your password contains reserved URL characters, encode them in the connection string " +
      "(e.g. `#` → `%23`, `@` → `%40`, `:` → `%3A`, `/` → `%2F`, `?` → `%3F`, `&` → `%26`, space → `%20`). " +
      "Supabase often shows the URI with `[YOUR-PASSWORD]` — paste the encoded form, not raw symbols.";
    throw new Error(`DATABASE_URL is not a valid URL. ${hint}`);
  }
}
