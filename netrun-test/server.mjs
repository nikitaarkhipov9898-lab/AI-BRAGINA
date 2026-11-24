import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 3000);

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
    #result{margin-top:18px;padding:14px;border-radius:12px;background:#111d2c;overflow-wrap:anywhere}
    .muted{font-size:13px;color:#9cacc0}
  </style>
</head>
<body><main>
  <h1>СОЮЗ</h1>
  <p>Тестовая площадка. Проверяем, доступен ли сайт и API без VPN.</p>
  <div id="result">Проверяем соединение с сервером…</div>
  <button id="check">Проверить ещё раз</button>
  <p class="muted">Это отдельная тестовая версия. Здесь нет регистрации и настоящих пользовательских данных.</p>
</main>
<script>
async function check(){
 const el=document.getElementById('result');
 el.textContent='Проверяем API…';
 const started=Date.now();
 try{
  const r=await fetch('/health',{cache:'no-store'});
  const data=await r.json();
  el.textContent='API отвечает: '+JSON.stringify(data)+' · '+(Date.now()-started)+' мс';
 }catch(e){
  el.textContent='Ошибка связи с API: '+String(e);
 }
}
document.getElementById('check').addEventListener('click',check);
check();
</script></body></html>`;

const server = createServer((req, res) => {
  const path = new URL(req.url || "/", "http://localhost").pathname;
  if (req.method === "GET" && path === "/health") {
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    });
    res.end(JSON.stringify({
      status: "ok",
      service: "soyuz-netrun-connectivity-test",
      timestamp: new Date().toISOString()
    }));
    return;
  }
  if (req.method === "GET" && path === "/cloudflare-health") {
    const started = Date.now();
    try {
      const upstream = await fetch("https://chef-api.bosstayson24.workers.dev/health", {
        headers: { "accept": "application/json" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store"
      });
      const body = await upstream.text();
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      });
      res.end(JSON.stringify({
        reachable: upstream.ok,
        upstream_status: upstream.status,
        elapsed_ms: Date.now() - started,
        response: body.slice(0, 1000)
      }));
    } catch (error) {
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      });
      res.end(JSON.stringify({
        reachable: false,
        elapsed_ms: Date.now() - started,
        error: String(error?.message || error)
      }));
    }
    return;
  }
  if (req.method === "GET" && (path === "/" || path === "/index.html")) {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    });
    res.end(page);
    return;
  }
  res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Soyuz Netrun connectivity test listening on " + PORT);
});
