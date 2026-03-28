/**
 * Wormhole Worker — Temporary file dead drop with R2 storage
 *
 * POST /api/upload      — Upload file, return UUID + expiry
 * GET  /api/info/:id    — Return file metadata (name, size, expiry)
 * GET  /api/download/:id — Stream file, then delete (one-time download)
 */

interface Env {
  WORMHOLE_BUCKET: R2Bucket;
}

interface FileMeta {
  name: string;
  size: number;
  contentType: string;
  expiresAt: string; // ISO timestamp
}

const ALLOWED_ORIGINS = [
  "https://wahzammo.com",
  "https://www.wahzammo.com",
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const TTL_MS = 60 * 60 * 1000; // 1 hour

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

function isExpired(meta: FileMeta): boolean {
  return Date.now() > new Date(meta.expiresAt).getTime();
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

    // POST /api/upload
    if (pathname === "/api/upload" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file || !(file instanceof File)) {
          return json({ error: "Missing 'file' field." }, 400, request);
        }

        if (file.size > MAX_FILE_SIZE) {
          return json(
            {
              error: `File too large. Max ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
            },
            413,
            request
          );
        }

        const id = uuid();
        const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

        const meta: FileMeta = {
          name: file.name || "unnamed",
          size: file.size,
          contentType: file.type || "application/octet-stream",
          expiresAt,
        };

        // Store file in R2 with metadata
        await env.WORMHOLE_BUCKET.put(id, file.stream(), {
          customMetadata: {
            meta: JSON.stringify(meta),
          },
          httpMetadata: {
            contentType: meta.contentType,
          },
        });

        return json({ id, expiresAt }, 201, request);
      } catch {
        return json({ error: "Upload failed." }, 500, request);
      }
    }

    // GET /api/info/:id
    const infoMatch = pathname.match(/^\/api\/info\/([a-f0-9-]+)$/);
    if (infoMatch && request.method === "GET") {
      const id = infoMatch[1];
      const obj = await env.WORMHOLE_BUCKET.head(id);

      if (!obj || !obj.customMetadata?.meta) {
        return json(
          { error: "This wormhole has collapsed or never existed." },
          404,
          request
        );
      }

      const meta: FileMeta = JSON.parse(obj.customMetadata.meta);

      if (isExpired(meta)) {
        // Clean up expired file
        await env.WORMHOLE_BUCKET.delete(id);
        return json(
          { error: "This wormhole has expired." },
          410,
          request
        );
      }

      return json(
        { name: meta.name, size: meta.size, expiresAt: meta.expiresAt },
        200,
        request
      );
    }

    // GET /api/download/:id
    const dlMatch = pathname.match(/^\/api\/download\/([a-f0-9-]+)$/);
    if (dlMatch && request.method === "GET") {
      const id = dlMatch[1];
      const obj = await env.WORMHOLE_BUCKET.get(id);

      if (!obj || !obj.customMetadata?.meta) {
        return json(
          { error: "This wormhole has collapsed or never existed." },
          404,
          request
        );
      }

      const meta: FileMeta = JSON.parse(obj.customMetadata.meta);

      if (isExpired(meta)) {
        await env.WORMHOLE_BUCKET.delete(id);
        return json({ error: "This wormhole has expired." }, 410, request);
      }

      // Delete after retrieving (one-time download)
      // We schedule deletion but return the file first
      const headers = new Headers(corsHeaders(request));
      headers.set("Content-Type", meta.contentType);
      headers.set(
        "Content-Disposition",
        `attachment; filename="${meta.name}"`
      );
      headers.set("Content-Length", String(meta.size));

      // Read the body before deleting
      const body = obj.body;

      // Delete in the background (non-blocking)
      // Use waitUntil if available via ExecutionContext, otherwise delete after response
      env.WORMHOLE_BUCKET.delete(id);

      return new Response(body, { status: 200, headers });
    }

    return json({ error: "Not found." }, 404, request);
  },
};
