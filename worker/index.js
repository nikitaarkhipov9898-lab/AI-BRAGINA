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


async function ensureAuthSchema(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      avatar_url TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      device_label TEXT NOT NULL DEFAULT 'Устройство',
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    )
  `).run();

  const userCols = await env.DB.prepare("PRAGMA table_info(users)").all();
  const userNames = new Set((userCols.results || []).map(x => x.name));
  const userAdds = [
    ["password_hash", "TEXT"],
    ["display_name", "TEXT"],
    ["role", "TEXT NOT NULL DEFAULT 'user'"],
    ["avatar_url", "TEXT"],
    ["status", "TEXT NOT NULL DEFAULT 'active'"],
    ["created_at", "TEXT"]
  ];
  for (const [name, type] of userAdds) {
    if (!userNames.has(name)) await env.DB.prepare(`ALTER TABLE users ADD COLUMN ${name} ${type}`).run();
  }

  const sessionCols = await env.DB.prepare("PRAGMA table_info(user_sessions)").all();
  const sessionNames = new Set((sessionCols.results || []).map(x => x.name));
  const sessionAdds = [
    ["user_id", "TEXT"],
    ["token_hash", "TEXT"],
    ["device_label", "TEXT"],
    ["expires_at", "TEXT"],
    ["revoked_at", "TEXT"]
  ];
  for (const [name, type] of sessionAdds) {
    if (!sessionNames.has(name)) await env.DB.prepare(`ALTER TABLE user_sessions ADD COLUMN ${name} ${type}`).run();
  }
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)").run();
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_token_hash ON user_sessions(token_hash)").run();
}

async function ensureAdminSchema(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_audit (
    id TEXT PRIMARY KEY, actor_user_id TEXT, actor_username TEXT,
    action TEXT NOT NULL, target_user_id TEXT, target_username TEXT,
    created_at TEXT NOT NULL
  )`).run();
}
async function writeAdminAudit(env, actor, action, target) {
  await ensureAdminSchema(env);
  await env.DB.prepare(`INSERT INTO admin_audit
    (id,actor_user_id,actor_username,action,target_user_id,target_username,created_at)
    VALUES (?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),actor.id,actor.username,action,
    target?.id||null,target?.username||null,new Date().toISOString()).run();
}

async function ensureConversationSchema(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `).run();
}

async function adminOnly(request, env) {
  const user = await currentUser(request, env);
  if (!user) return { error: json({ error: "Необходим вход в аккаунт" }, 401) };
  if (user.role !== "owner") return { error: json({ error: "Недостаточно прав" }, 403) };
  return { user };
}

async function syncConversations(request, env, user) {
  const body = await request.json();
  const items = Array.isArray(body.items) ? body.items.slice(0, 250) : [];
  await ensureConversationSchema(env);
  const now = new Date().toISOString();
  const statements = [];
  for (const item of items) {
    const id = String(item?.id || "").slice(0, 120);
    const kind = String(item?.kind || "chat").slice(0, 32);
    const title = String(item?.title || "Диалог").slice(0, 240);
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) continue;
    const content = JSON.stringify(item?.content ?? {});
    if (content.length > 200000) continue;
    const created = String(item?.created_at || now).slice(0, 40);
    statements.push(env.DB.prepare(`
      INSERT INTO conversations (id,user_id,kind,title,content_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(user_id,id) DO UPDATE SET
        kind=excluded.kind,title=excluded.title,
        content_json=excluded.content_json,updated_at=excluded.updated_at
    `).bind(id, user.id, kind, title, content, created, now));
  }
  if (statements.length) await env.DB.batch(statements);
  return json({ success: true, saved: statements.length });
}

async function handleFetch(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (
    path.startsWith("/auth/") ||
    path.startsWith("/conversations") ||
    path.startsWith("/admin/")
  ) {
    await ensureAuthSchema(env);
  }

  const pwaFiles = {
    "/manifest.webmanifest": {
      file: "manifest.webmanifest",
      type: "application/manifest+json; charset=utf-8"
    },
    "/sw.js": {
      file: "sw.js",
      type: "application/javascript; charset=utf-8"
    },
    "/icon.svg": {
      file: "icon.svg",
      type: "image/svg+xml"
    }
  };
  if (pwaFiles[path] && request.method === "GET") {
    const asset = pwaFiles[path];
    const response = await fetch(
      "https://raw.githubusercontent.com/nikitaarkhipov9898-lab/AI-BRAGINA/admin-panel/" + asset.file,
      { headers: { "Accept": "*/*" }, cf: { cacheTtl: path === "/sw.js" ? 0 : 300 } }
    );
    if (!response.ok) return new Response("Файл приложения не найден", { status: 502 });
    const headers = {
      "Content-Type": asset.type,
      "Cache-Control": path === "/sw.js" ? "no-cache" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff"
    };
    if (path === "/sw.js") headers["Service-Worker-Allowed"] = "/";
    return new Response(response.body, { status: 200, headers });
  }

  if (path === "/app" && request.method === "GET") {
    const page = await fetch("https://raw.githubusercontent.com/nikitaarkhipov9898-lab/AI-BRAGINA/admin-panel/index.html", {
      headers: { "Accept": "text/html" },
      cf: { cacheTtl: 60, cacheEverything: true }
    });
    if (!page.ok) return new Response("Не удалось загрузить тестовую страницу", { status: 502 });
    return new Response(await page.text(), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow"
      }
    });
  }

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


  if (path === "/conversations/sync" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Необходим вход в аккаунт" }, 401);
    return syncConversations(request, env, user);
  }
  if (path === "/conversations" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Необходим вход в аккаунт" }, 401);
    await ensureConversationSchema(env);
    const rows = await env.DB.prepare(`
      SELECT id,kind,title,content_json,created_at,updated_at
      FROM conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 250
    `).bind(user.id).all();
    return json({ conversations: (rows.results || []).map(x => ({
      id:x.id,kind:x.kind,title:x.title,content:JSON.parse(x.content_json || "{}"),
      created_at:x.created_at,updated_at:x.updated_at
    })) });
  }
  if (path === "/admin/overview" && request.method === "GET") {
    const auth = await adminOnly(request, env); if (auth.error) return auth.error;
    await ensureConversationSchema(env);
    const users = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
    const active = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE status='active'").first();
    const blocked = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE status='blocked'").first();
    const chats = await env.DB.prepare("SELECT COUNT(*) AS n FROM conversations").first();
    return json({users:Number(users?.n||0),active_users:Number(active?.n||0),blocked_users:Number(blocked?.n||0),conversations:Number(chats?.n||0)});
  }
  if (path === "/admin/users/action" && request.method === "POST") {
    const auth = await adminOnly(request, env); if (auth.error) return auth.error;
    const body = await request.json(); const id=String(body.user_id||""); const action=String(body.action||"");
    if (!id || !["block","unblock","delete"].includes(action)) return json({error:"Некорректное действие"},400);
    const target=await env.DB.prepare("SELECT id,username,role,status FROM users WHERE id=?").bind(id).first();
    if(!target)return json({error:"Пользователь не найден"},404);
    if(target.role==="owner")return json({error:"Защищённый аккаунт владельца нельзя блокировать или удалять"},403);
    if(action==="block"){
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET status='blocked' WHERE id=?").bind(id),
        env.DB.prepare("UPDATE user_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL").bind(new Date().toISOString(),id)
      ]);
    } else if(action==="unblock"){
      await env.DB.prepare("UPDATE users SET status='active' WHERE id=?").bind(id).run();
    } else {
      await ensureConversationSchema(env);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM conversations WHERE user_id=?").bind(id),
        env.DB.prepare("DELETE FROM user_sessions WHERE user_id=?").bind(id),
        env.DB.prepare("DELETE FROM users WHERE id=?").bind(id)
      ]);
    }
    await writeAdminAudit(env,auth.user,action,target);
    return json({success:true});
  }
  if (path === "/admin/audit" && request.method === "GET") {
    const auth = await adminOnly(request, env); if (auth.error) return auth.error;
    await ensureAdminSchema(env);
    const rows=await env.DB.prepare("SELECT action,actor_username,target_username,created_at FROM admin_audit ORDER BY created_at DESC LIMIT 100").all();
    return json({items:rows.results||[]});
  }

  if (path === "/admin/users" && request.method === "GET") {
    const auth = await adminOnly(request, env);
    if (auth.error) return auth.error;
    await ensureConversationSchema(env);
    const rows = await env.DB.prepare(`
      SELECT u.id,u.username,u.display_name,u.role,u.status,u.created_at,
        (SELECT COUNT(*) FROM conversations c WHERE c.user_id=u.id) AS conversations_count
      FROM users u ORDER BY u.rowid DESC LIMIT 500
    `).all();
    return json({ users: rows.results || [] });
  }
  if (path === "/admin/conversations" && request.method === "GET") {
    const auth = await adminOnly(request, env);
    if (auth.error) return auth.error;
    const userId = String(url.searchParams.get("user_id") || "");
    if (!userId) return json({ error: "Не указан аккаунт" }, 400);
    await ensureConversationSchema(env);
    const rows = await env.DB.prepare(`
      SELECT id,kind,title,content_json,created_at,updated_at
      FROM conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 250
    `).bind(userId).all();
    return json({ conversations: (rows.results || []).map(x => ({
      id:x.id,kind:x.kind,title:x.title,content:JSON.parse(x.content_json || "{}"),
      created_at:x.created_at,updated_at:x.updated_at
    })) });
  }

  if (path === "/auth/setup-status" && request.method === "GET") {
    await ensureAuthSchema(env);
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM users").first();
    return json({ first_account: Number(count?.total || 0) === 0 });
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
