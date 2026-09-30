import { CLERK_PROXY_PATH } from "./clerkProxyShared";

const CLERK_FRONTEND_API = "https://frontend-api.clerk.dev";
const HOP_BY_HOP_HEADERS = [
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

function firstHeaderValue(value: string | null): string | undefined {
  return value?.split(",")[0]?.trim() || undefined;
}

export async function proxyClerkFrontendApi(
  request: Request,
  secretKey: string | undefined,
): Promise<Response> {
  if (!secretKey) {
    return new Response("Clerk proxy is not configured.", { status: 503 });
  }

  const incomingUrl = new URL(request.url);
  const upstreamPath = incomingUrl.pathname.slice(CLERK_PROXY_PATH.length) || "/";
  const upstreamUrl = new URL(
    `${upstreamPath}${incomingUrl.search}`,
    CLERK_FRONTEND_API,
  );
  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP_HEADERS) {
    headers.delete(header);
  }

  const protocol =
    firstHeaderValue(request.headers.get("x-forwarded-proto")) ??
    incomingUrl.protocol.slice(0, -1);
  const host =
    firstHeaderValue(request.headers.get("x-forwarded-host")) ??
    request.headers.get("host") ??
    incomingUrl.host;
  headers.set("Clerk-Proxy-Url", `${protocol}://${host}${CLERK_PROXY_PATH}`);
  headers.set("Clerk-Secret-Key", secretKey);

  const clientIp =
    firstHeaderValue(request.headers.get("x-forwarded-for")) ??
    request.headers.get("cf-connecting-ip");
  if (clientIp) {
    headers.set("X-Forwarded-For", clientIp);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  try {
    return await fetch(
      new Request(upstreamUrl, {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined,
        redirect: "manual",
      }),
    );
  } catch (error) {
    console.error("Clerk frontend API proxy failed:", error);
    return new Response("Clerk frontend API is unavailable.", { status: 502 });
  }
}