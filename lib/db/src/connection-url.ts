const renderHostSuffix = ".render.com";
const tlsRequiredModes = new Set(["require", "verify-ca", "verify-full"]);

/**
 * Render's external Postgres endpoints require TLS. Ensure their URL enables
 * TLS even if a copied connection string omits sslmode.
 */
export function withRenderExternalPostgresTls(
  connectionString: string,
): string {
  const url = new URL(connectionString);
  if (!url.hostname.toLowerCase().endsWith(renderHostSuffix)) {
    return connectionString;
  }

  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
  if (sslMode && tlsRequiredModes.has(sslMode)) {
    return connectionString;
  }

  url.searchParams.set("sslmode", "require");
  return url.toString();
}