/**
 * Resolve the allowed CORS origin from configuration.
 *
 * The frontend is served from the same origin via the Replit proxy, so
 * cross-origin access is only allowed when ALLOWED_ORIGIN is deliberately
 * set to a specific, valid origin. Wildcards are rejected at startup so the
 * permissive default this replaces can never be reintroduced via config.
 *
 * Returns `false` (CORS disabled — no Access-Control-Allow-Origin header)
 * when the variable is unset or empty, otherwise a single-element array so
 * the cors package only echoes the header for requests from that origin.
 */
export function resolveAllowedOrigin(raw: string | undefined): string[] | false {
  const value = raw?.trim();
  if (!value) return false;
  if (value === "*" || value.includes("*")) {
    throw new Error(
      "ALLOWED_ORIGIN must be a specific origin (e.g. https://app.example.com); wildcard '*' is not allowed",
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`ALLOWED_ORIGIN is not a valid URL origin: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`ALLOWED_ORIGIN must use http or https: ${value}`);
  }
  // Normalize to a bare origin (strips any path/query the operator included).
  return [url.origin];
}
