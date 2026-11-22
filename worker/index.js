const ALLOWED_ORIGIN = "https://nikitaarkhipov9898-lab.github.io";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Keep this at 100000: Cloudflare rejected 120000 in the deployed runtime.
const PBKDF2_ITERATIONS = 100000;
const SESSION_DAYS = 30;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function toB64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromB64(s) {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(
    atob(b + "=".repeat((4 - b.length % 4) % 4)),
    c => c.charCodeAt(0)
  );
}

function randomToken() {
  return toB64(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256(s) {
  return toB64(new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))
  ));
}

async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt,
    iterations: PBKDF2_ITERATIONS,
    hash: "SHA-256"
  }, key, 256);
  return toB64(new Uint8Array(bits));
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) {
    return false;
  }
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    n |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return n === 0;
}

function username(v) {
  return String(v || "").trim().replace(/^@/, "").toLowerCase();
}

async function createSession(env, userId, label = "Устройство") {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const id = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();

  await env.DB.prepare(
    "INSERT INTO user_sessions (id,user_id,token_hash,device_label,expires_at) VALUES (?,?,?,?,?)"
  ).bind(
    id,
    userId,
    tokenHash,
    String(label).slice(0, 100),
    expires
  ).run();

  return { token, expires_at: expires };
}

async function currentUser(request, env) {
  const m = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;

  const hash = await sha256(m[1]);
  return env.DB.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_url, u.role,
           s.id AS session_id
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > ?
      AND u.status = 'active'
    LIMIT 1
  `).bind(hash, new Date().toISOString()).first();
}

async function register(request, env) {
  const b = await request.json();
  const name = username(b.username);
  const password = String(b.password || "");
  const display = String(b.display_name || name).trim();

  if (!/^[a-z0-9_]{3,24}$/.test(name)) {
    return json({ error: "Логин: от 3 до 24 символов, латинские буквы, цифры и _" }, 400);
  }
  if (password.length < 8 || password.length > 128) {
    return json({ error: "Пароль должен содержать от 8 до 128 символов" }, 400);
  }
  if (!display || display.length > 50) {
    return json({ error: "Проверь отображаемое имя" }, 400);
  }

  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM users").first();
  const isFirst = Number(count?.total || 0) === 0;

  if (isFirst) {
    if (!env.OWNER_SETUP_CODE) {
      return json({
        error: "Первичная настройка владельца не завершена. Добавьте секрет OWNER_SETUP_CODE в Worker."
      }, 503);
    }
    if (!safeEqual(String(b.setup_code || ""), env.OWNER_SETUP_CODE)) {
      return json({ error: "Неверный код первого владельца" }, 403);
    }
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await passwordHash(password, salt);
  const stored = `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${hash}`;
  const id = crypto.randomUUID();
  let user;

  try {
    user = await env.DB.prepare(`
      INSERT INTO users (id, username, password_hash, display_name, role)
      SELECT ?, ?, ?, ?, CASE WHEN NOT EXISTS (SELECT 1 FROM users) THEN 'owner' ELSE 'user' END
      RETURNING id, username, display_name, role, avatar_url
    `).bind(id, name, stored, display).first();
  } catch (e) {
    if (/unique|constraint/i.test(String(e.message || e))) {
      return json({ error: "Такой логин уже занят" }, 409);
    }
    throw e;
  }

  if (!user) return json({ error: "Не удалось создать аккаунт" }, 500);

  const session = await createSession(env, user.id, b.device_label || "Устройство");
  return json({
    success: true,
    user,
    token: session.token,
    expires_at: session.expires_at
  }, 201);
}

async function login(request, env) {
  const b = await request.json();
  const name = username(b.username);
  const password = String(b.password || "");

  const u = await env.DB.prepare(`
    SELECT id, username, display_name, avatar_url, role, password_hash, status
    FROM users
    WHERE username = ?
    LIMIT 1
  `).bind(name).first();

  if (!u || u.status !== "active") {
    return json({ error: "Неверный логин или пароль" }, 401);
  }

  const p = String(u.password_hash || "").split("$");
  if (p.length !== 4 || p[0] !== "pbkdf2") {
    return json({ error: "Не удалось проверить пароль" }, 500);
  }

  const check = await passwordHash(password, fromB64(p[2]));
  if (!safeEqual(check, p[3])) {
    return json({ error: "Неверный логин или пароль" }, 401);
  }

  const session = await createSession(env, u.id, b.device_label || "Устройство");
  delete u.password_hash;
  delete u.status;

  return json({
    success: true,
    user: u,
    token: session.token,
    expires_at: session.expires_at
  });
}

async function handleFetch(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (path === "/health" && request.method === "GET") {
    try {
      await env.DB.prepare("SELECT 1").first();
      return json({ worker: "ok", database: "connected" });
    } catch (e) {
      return json({ worker: "ok", database: "error" }, 500);
    }
  }

  if (path === "/auth/register" && request.method === "POST") {
    return register(request, env);
  }
  if (path === "/auth/login" && request.method === "POST") {
    return login(request, env);
  }
  if (path === "/auth/me" && request.method === "GET") {
    const user = await currentUser(request, env);
    return user ? json({ user }) : json({ error: "Необходим вход" }, 401);
  }
  if (path === "/auth/logout" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (user) {
      await env.DB.prepare(
        "UPDATE user_sessions SET revoked_at = ? WHERE id = ?"
      ).bind(new Date().toISOString(), user.session_id).run();
    }
    return json({ success: true });
  }

  if (path === "/" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Необходим вход в аккаунт" }, 401);

    if (!env.GROQ_API_KEY) {
      return json({ error: { message: "На сервере не настроен GROQ_API_KEY" } }, 503);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: { message: "Некорректный JSON" } }, 400);
    }

    const upstream = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + env.GROQ_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const responseText = await upstream.text();
    return new Response(responseText, {
      status: upstream.status,
      headers: {
        ...corsHeaders(),
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-store"
      }
    });
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      return await handleFetch(request, env);
    } catch (e) {
      console.error("WORKER_ERROR", JSON.stringify({
        message: e?.message || String(e),
        name: e?.name || "Error",
        stack: e?.stack || null,
        path: url.pathname,
        method: request.method,
        timestamp: new Date().toISOString()
      }));
      return json({ error: { message: "Внутренняя ошибка сервера" } }, 500);
    }
  }
};
