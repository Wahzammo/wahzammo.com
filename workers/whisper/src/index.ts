/**
 * Whisper Worker — Self-destructing encrypted message storage
 *
 * POST /api/store  — Store encrypted blob, return UUID
 * GET  /api/read/:id — Return encrypted blob, then delete (one-time read)
 */

interface Env {
  WHISPER_KV: KVNamespace;
}

const ALLOWED_ORIGINS = [
  "https://wahzammo.com",
  "https://www.wahzammo.com",
];

const MAX_PAYLOAD = 50 * 1024; // 50 KB
const TTL_SECONDS = 86400; // 24 hours

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin") || "";
  const referer = request.headers.get("Referer") || "";
  const originOk = ALLOWED_ORIGINS.includes(origin);
  const refererOk = ALLOWED_ORIGINS.some((o) => referer.startsWith(o));
  // Allow localhost for dev
  const isLocal =
    origin.includes("localhost") || referer.includes("localhost");
  return originOk || refererOk || isLocal;
}

function json(data: unknown, status = 200, request?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(request ? corsHeaders(request) : {}),
    },
  });
}

function uuid(): string {
  return crypto.randomUUID();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    // Health check
    if (pathname === "/" && request.method === "GET") {
      return json({ status: "ok" });
    }

    // Origin check for API routes
    if (pathname.startsWith("/api/") && !isAllowedOrigin(request)) {
      return json({ error: "Forbidden." }, 403, request);
    }

    // POST /api/store
    if (pathname === "/api/store" && request.method === "POST") {
      try {
        const body = (await request.json()) as { data?: string };
        if (!body.data || typeof body.data !== "string") {
          return json({ error: "Missing 'data' field." }, 400, request);
        }

        if (body.data.length > MAX_PAYLOAD) {
          return json(
            { error: `Payload too large. Max ${MAX_PAYLOAD / 1024} KB.` },
            413,
            request
          );
        }

        const id = uuid();
        await env.WHISPER_KV.put(id, body.data, {
          expirationTtl: TTL_SECONDS,
        });

        return json({ id }, 201, request);
      } catch {
        return json({ error: "Invalid request body." }, 400, request);
      }
    }

    // GET /api/read/:id
    const readMatch = pathname.match(/^\/api\/read\/([a-f0-9-]+)$/);
    if (readMatch && request.method === "GET") {
      const id = readMatch[1];
      const data = await env.WHISPER_KV.get(id);

      if (data === null) {
        return json(
          { error: "This whisper has already been read or has expired." },
          404,
          request
        );
      }

      // Delete immediately (one-time read)
      await env.WHISPER_KV.delete(id);

      return json({ data }, 200, request);
    }

    return json({ error: "Not found." }, 404, request);
  },
};
