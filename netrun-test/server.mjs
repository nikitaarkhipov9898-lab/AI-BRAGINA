import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 3000);
const WORKER_ORIGIN = "https://chef-api.bosstayson24.workers.dev";
const MAX_PROXY_BODY = 10 * 1024 * 1024;

const page = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#101827">
  <title>СОЮЗ — проверка соединения</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;background:#101827;color:#f4f7fb;font:16px system-ui,sans-serif;display:grid;place-items:center;padding:24px}
    main{width:min(100%,440px);background:#1b293b;border:1px solid #34465e;border-radius:20px;padding:26px}
    h1{margin:0 0 8px;font-size:28px}p{color:#bdc9d8;line-height:1.5}
    button{width:100%;border:0;border-radius:12px;padding:14px;background:#4b83e6;color:white;font-weight:700;font-size:16px;margin-top:12px}
    #result{margin-top:18px;padding:14px;border-radius:12px;background:#111d2c;overflow-wrap:anywhere;white-space:pre-wrap}
    .muted{font-size:13px;color:#9cacc0}
  </style>
</head>
<body><main>
  <h1>СОЮЗ</h1>
  <p>Тестовая площадка. Проверяем доступность Netrun и Cloudflare API.</p>
  <div id="result">Проверяем соединение…</div>
  <button id="check">Проверить ещё раз</button>
  <p class="muted">Тестовая площадка. Настоящие пользовательские данные здесь не отображаются.</p>
</main>
<script>
async function check(){
 const el=document.getElementById('result');
 el.textContent='Проверяем Netrun…';
 try{
  const a=await fetch('/health',{cache:'no-store'});
  const ad=await a.json();
  el.textContent='Netrun: '+JSON.stringify(ad)+'\\nПроверяем Cloudflare через прокси…';
  const b=await fetch('/proxy/health',{cache:'no-store'});
  const bd=await b.json();
  el.textContent+='\\n\\nПрокси: HTTP '+b.status+'\\n'+JSON.stringify(bd);
  const c=await fetch('/cloudflare-health',{cache:'no-store'});
  const cd=await c.json();
  el.textContent+='\\n\\nПрямой серверный тест: '+JSON.stringify(cd);
 }catch(e){el.textContent='Ошибка проверки: '+String(e)}
}
document.getElementById('check').addEventListener('click',check);
check();
</script></body></html>`;

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

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", "http://localhost");
  const path = requestUrl.pathname;

  if (req.method === "GET" && path === "/health") {
    return sendJson(res, 200, {
      status: "ok",
      service: "soyuz-netrun-connectivity-test",
      timestamp: new Date().toISOString()
    });
  }

  if (req.method === "GET" && path === "/cloudflare-health") {
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

  if (req.method === "GET" && (path === "/" || path === "/index.html")) {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    });
    return res.end(page);
  }

  if (path.startsWith("/proxy/") || path === "/proxy") {
    const upstreamPath = path === "/proxy" ? "/" : path.slice("/proxy".length);
    try {
      return await proxyRequest(req, res, upstreamPath);
    } catch (error) {
      console.error("PROXY_ERROR", methodSafe(req), path, String(error?.message || error));
      return sendJson(res, 502, {
        error: "Не удалось связаться с API СОЮЗ",
        detail: String(error?.message || error)
      });
    }
  }

  return sendJson(res, 404, { error: "Not found" });
});

function methodSafe(req) {
  return String(req.method || "GET").slice(0, 12);
}

server.listen(PORT, "0.0.0.0", () => {
  console.log("Soyuz Netrun connectivity test listening on " + PORT);
});
