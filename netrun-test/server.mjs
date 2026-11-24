import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const PORT = Number(process.env.PORT || 3000);
const WORKER_ORIGIN = "https://chef-api.bosstayson24.workers.dev";
const ASSET_DIR = resolve(fileURLToPath(new URL("../worker/assets/", import.meta.url)));
const MAX_PROXY_BODY = 10 * 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(JSON.stringify(data));
}

async function readRequestBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_PROXY_BODY) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function proxyRequest(req, res, path) {
  const started = Date.now();
  const method = req.method || "GET";
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value == null || ["host", "connection", "content-length", "transfer-encoding", "accept-encoding"].includes(name.toLowerCase())) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  headers.set("x-forwarded-host", req.headers.host || "");
  headers.set("x-forwarded-proto", "https");

  let body;
  if (!["GET", "HEAD"].includes(method)) body = await readRequestBody(req);

  const target = new URL(path + (new URL(req.url || "/", "http://localhost").search || ""), WORKER_ORIGIN);
  const upstream = await fetch(target, {
    method,
    headers,
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(120000)
  });

  const responseHeaders = {};
  upstream.headers.forEach((value, name) => {
    if (!["connection", "transfer-encoding", "content-encoding", "content-length"].includes(name.toLowerCase())) {
      responseHeaders[name] = value;
    }
  });
  responseHeaders["cache-control"] = "no-store";
  responseHeaders["x-soyuz-proxy"] = "netrun";
  const responseBody = ["HEAD", "204", "304"].includes(method) || upstream.status === 204 || upstream.status === 304
    ? null
    : Buffer.from(await upstream.arrayBuffer());
  if (responseBody) responseHeaders["content-length"] = String(responseBody.length);
  res.writeHead(upstream.status, responseHeaders);
  res.end(responseBody);
  console.log("PROXY", method, path, upstream.status, Date.now() - started + "ms");
}

async function serveAsset(req, res, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { return sendJson(res, 400, { error: "Bad path" }); }

  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const filePath = resolve(ASSET_DIR, relative);
  if (filePath !== ASSET_DIR && !filePath.startsWith(ASSET_DIR + sep)) {
    return sendJson(res, 403, { error: "Forbidden" });
  }

  try {
    let data = await readFile(filePath);
    if (relative === "index.html") {
      let html = data.toString("utf8");
      const oldApi = 'ql=location.hostname.endsWith(".workers.dev")?location.origin:"https://chef-api.bosstayson24.workers.dev",Q_=';
      const newApi = 'ql=location.hostname.endsWith(".workers.dev")?location.origin:location.hostname.endsWith(".netrun.io")?location.origin+"/proxy":"https://chef-api.bosstayson24.workers.dev",Q_=';
      if (!html.includes(oldApi)) {
        console.error("FRONTEND_API_BASE_NOT_FOUND");
        return sendJson(res, 500, { error: "Frontend API routing patch could not be applied" });
      }
      html = html.replace(oldApi, newApi);
      data = Buffer.from(html);
    }
    const contentType = MIME[extname(relative).toLowerCase()] || "application/octet-stream";
    const compressible = /^(text\/|application\/(javascript|json|manifest\+json))/.test(contentType);
    const acceptsGzip = /(?:^|,)\\s*gzip\\s*(?:,|$)/i.test(req.headers["accept-encoding"] || "");
    if (compressible && acceptsGzip && data.length > 1024) {
      data = gzipSync(data, { level: 6 });
    }
    const headers = {
      "content-type": contentType,
      "content-length": String(data.length),
      "cache-control": relative === "index.html" ? "no-store" : "public, max-age=300",
      "x-content-type-options": "nosniff",
      "vary": "Accept-Encoding"
    };
    if (compressible && acceptsGzip && data.length > 0) headers["content-encoding"] = "gzip";
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : data);
  } catch (error) {
    if (error?.code === "ENOENT") return sendJson(res, 404, { error: "Asset not found" });
    console.error("ASSET_ERROR", relative, String(error?.message || error));
    return sendJson(res, 500, { error: "Could not serve application files" });
  }
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", "http://localhost");
  const path = requestUrl.pathname;
  const method = req.method || "GET";

  if (method === "GET" && path === "/health") {
    return sendJson(res, 200, {
      status: "ok",
      service: "soyuz-netrun-app",
      timestamp: new Date().toISOString()
    });
  }

  if (method === "GET" && path === "/cloudflare-health") {
    const started = Date.now();
    try {
      const upstream = await fetch(WORKER_ORIGIN + "/health", {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store"
      });
      const body = await upstream.text();
      return sendJson(res, 200, {
        reachable: upstream.ok,
        upstream_status: upstream.status,
        elapsed_ms: Date.now() - started,
        response: body.slice(0, 1000)
      });
    } catch (error) {
      return sendJson(res, 200, {
        reachable: false,
        elapsed_ms: Date.now() - started,
        error: String(error?.message || error)
      });
    }
  }

  if (path === "/proxy" || path.startsWith("/proxy/")) {
    const upstreamPath = path === "/proxy" ? "/" : path.slice("/proxy".length);
    try {
      return await proxyRequest(req, res, upstreamPath);
    } catch (error) {
      console.error("PROXY_ERROR", method.slice(0, 12), path, String(error?.message || error));
      return sendJson(res, 502, {
        error: "Не удалось связаться с API СОЮЗ",
        detail: String(error?.message || error)
      });
    }
  }

  if (method === "GET" || method === "HEAD") {
    return serveAsset(req, res, path);
  }

  return sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Soyuz Netrun app listening on " + PORT);
});
