// Preview build trigger: verifies the React shell can be deployed independently of production.
const ALLOWED_ORIGIN = "https://nikitaarkhipov9898-lab.github.io";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Keep this at 100000: Cloudflare rejected 120000 in the deployed runtime.
const PBKDF2_ITERATIONS = 100000;
const SESSION_DAYS = 30;

function corsHeaders(origin = "") {
  const allowedOrigins = [ALLOWED_ORIGIN, "https://admin-panel-chef-api.bosstayson24.workers.dev"];
  const responseOrigin = allowedOrigins.includes(origin) ? origin : ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": responseOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}

function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
async function ensureAiUsageSchema(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ai_usage_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider_model TEXT NOT NULL,
    page TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage_events(user_id, created_at DESC)").run();
}
async function aiUsageGet(env, user) {
  await ensureAiUsageSchema(env);
  const totals = await env.DB.prepare("SELECT COUNT(*) AS requests, COALESCE(SUM(prompt_tokens),0) AS prompt_tokens, COALESCE(SUM(completion_tokens),0) AS completion_tokens, COALESCE(SUM(total_tokens),0) AS total_tokens FROM ai_usage_events WHERE user_id=?").bind(user.id).first();
  const rows = await env.DB.prepare("SELECT provider_model,page,prompt_tokens,completion_tokens,total_tokens,created_at FROM ai_usage_events WHERE user_id=? ORDER BY created_at DESC LIMIT 200").bind(user.id).all();
  return json({ usage: { requests:Number(totals?.requests||0), prompt_tokens:Number(totals?.prompt_tokens||0), completion_tokens:Number(totals?.completion_tokens||0), total_tokens:Number(totals?.total_tokens||0), history:rows.results||[] }, unlimited:user.role==="owner" });
}
async function aiUsagePost(request, env, user) {
  const b=await request.json(),u=b.usage||{};
  const prompt=Math.max(0,Math.floor(Number(u.prompt_tokens)||0)),completion=Math.max(0,Math.floor(Number(u.completion_tokens)||0)),total=Math.max(0,Math.floor(Number(u.total_tokens)||prompt+completion));
  if(!total || total>10000000 || prompt>10000000 || completion>10000000) return json({error:"Некорректная статистика токенов"},400);
  await ensureAiUsageSchema(env);
  await env.DB.prepare("INSERT INTO ai_usage_events (id,user_id,provider_model,page,prompt_tokens,completion_tokens,total_tokens,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),user.id,String(b.model||"ИИ-помощник").slice(0,120),String(b.page||"unknown").slice(0,40),prompt,completion,total,new Date().toISOString()).run();
  return json({success:true,unlimited:user.role==="owner"});
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


let chatSchemaReady = false;
async function ensureChatSchema(env) {
  if (chatSchemaReady) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS chat_threads (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'direct',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS chat_members (
    thread_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_at TEXT NOT NULL,
    last_read_at TEXT, typing_until TEXT, PRIMARY KEY(thread_id,user_id)
  )`).run();
  try { await env.DB.prepare("ALTER TABLE chat_members ADD COLUMN typing_until TEXT").run(); } catch (e) { /* column already exists */ }
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, sender_id TEXT NOT NULL,
    body TEXT NOT NULL, created_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_members(user_id,thread_id)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_time ON chat_messages(thread_id,created_at DESC)").run();
  chatSchemaReady = true;
}
async function chatMember(env, threadId, userId) {
  return env.DB.prepare("SELECT 1 AS ok FROM chat_members WHERE thread_id=? AND user_id=?")
    .bind(threadId,userId).first();
}
async function chatSearchUsers(request, env, user) {
  const q=String(new URL(request.url).searchParams.get("q")||"").trim().replace(/^@/,"").toLowerCase();
  if(q.length<2)return json({users:[]});
  const rows=await env.DB.prepare(`SELECT id,username,display_name,avatar_url FROM users
    WHERE status='active' AND id<>? AND (username LIKE ? OR display_name LIKE ?)
    ORDER BY username LIMIT 20`).bind(user.id,"%"+q+"%","%"+q+"%").all();
  return json({users:rows.results||[]});
}
async function chatCreateDirect(request, env, user) {
  const b=await request.json();
  const targetName=username(b.username);
  if(!/^[a-z0-9_]{3,24}$/.test(targetName))return json({error:"Укажи корректный логин пользователя"},400);
  const target=await env.DB.prepare("SELECT id,username,display_name,avatar_url FROM users WHERE username=? AND status='active'").bind(targetName).first();
  if(!target)return json({error:"Пользователь не найден"},404);
  if(target.id===user.id)return json({error:"Нельзя создать чат с самим собой"},400);
  await ensureChatSchema(env);
  const pair=[user.id,target.id].sort();
  const id="dm_"+(await sha256(pair.join(":"))).slice(0,32);
  const now=new Date().toISOString();
  await env.DB.prepare("INSERT OR IGNORE INTO chat_threads (id,kind,created_at,updated_at) VALUES (?,'direct',?,?)").bind(id,now,now).run();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO chat_members (thread_id,user_id,joined_at) VALUES (?,?,?)").bind(id,user.id,now),
    env.DB.prepare("INSERT OR IGNORE INTO chat_members (thread_id,user_id,joined_at) VALUES (?,?,?)").bind(id,target.id,now)
  ]);
  return json({thread:{id,kind:"direct",created_at:now,updated_at:now,peer:target}});
}
async function chatList(env,user) {
  await ensureChatSchema(env);
  const rows=await env.DB.prepare(`SELECT t.id,t.kind,t.created_at,t.updated_at,
    u.id AS peer_id,u.username AS peer_username,u.display_name AS peer_display_name,u.avatar_url AS peer_avatar,
    (SELECT body FROM chat_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
    (SELECT created_at FROM chat_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at,
    (SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id=t.id AND m.sender_id<>? AND m.created_at>COALESCE(me.last_read_at,'1970-01-01T00:00:00.000Z')) AS unread
    FROM chat_members me JOIN chat_threads t ON t.id=me.thread_id
    JOIN chat_members other ON other.thread_id=t.id AND other.user_id<>me.user_id
    JOIN users u ON u.id=other.user_id
    WHERE me.user_id=? ORDER BY COALESCE(last_message_at,t.updated_at) DESC LIMIT 100`)
    .bind(user.id,user.id).all();
  return json({chats:rows.results||[]});
}
async function chatUnread(env,user) {
  await ensureChatSchema(env);
  const row=await env.DB.prepare(`SELECT COALESCE(SUM((SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id=me.thread_id AND m.sender_id<>me.user_id AND m.created_at>COALESCE(me.last_read_at,'1970-01-01T00:00:00.000Z'))),0) AS unread FROM chat_members me WHERE me.user_id=?`).bind(user.id).first();
  return json({unread:Number(row?.unread||0)});
}
async function chatGetMessages(request,env,user) {
  const url=new URL(request.url),threadId=String(url.searchParams.get("thread_id")||"");
  if(!threadId)return json({error:"Не указан диалог"},400);
  await ensureChatSchema(env);
  if(!await chatMember(env,threadId,user.id))return json({error:"Нет доступа к этому диалогу"},403);
  const limit=Math.min(50,Math.max(1,Number.parseInt(url.searchParams.get("limit")||"50",10)||50));
  const before=String(url.searchParams.get("before")||"");
  const after=String(url.searchParams.get("after")||"");
  let rows;
  if(after){
    rows=await env.DB.prepare("SELECT id,sender_id,body,created_at FROM chat_messages WHERE thread_id=? AND created_at>? ORDER BY created_at ASC LIMIT ?").bind(threadId,after,limit).all();
  } else if(before){
    rows=await env.DB.prepare("SELECT id,sender_id,body,created_at FROM chat_messages WHERE thread_id=? AND created_at<? ORDER BY created_at DESC LIMIT ?").bind(threadId,before,limit).all();
  } else {
    rows=await env.DB.prepare("SELECT id,sender_id,body,created_at FROM chat_messages WHERE thread_id=? ORDER BY created_at DESC LIMIT ?").bind(threadId,limit).all();
  }
  const messages=after?(rows.results||[]):(rows.results||[]).reverse();
  const peer=await env.DB.prepare(`SELECT u.id,u.username,u.display_name,u.avatar_url,m.typing_until FROM chat_members m JOIN users u ON u.id=m.user_id WHERE m.thread_id=? AND m.user_id<>? LIMIT 1`).bind(threadId,user.id).first();
  const peerTyping=!!(peer?.typing_until && Date.parse(peer.typing_until)>Date.now());
  return json({messages,peer,peer_typing:peerTyping,has_more:messages.length===limit});
}
async function chatSendMessage(request,env,user) {
  let b;try{b=await request.json();}catch{return json({error:"Некорректное сообщение"},400);}
  const threadId=String(b.thread_id||"");
  const body=String(b.body||"").trim();
  if(!threadId||!body)return json({error:"Сообщение пустое"},400);
  if(body.length>4000)return json({error:"Максимальная длина сообщения — 4000 символов"},400);
  await ensureChatSchema(env);
  if(!await chatMember(env,threadId,user.id))return json({error:"Нет доступа к этому диалогу"},403);
  const now=new Date().toISOString();
  const recent=await env.DB.prepare("SELECT created_at FROM chat_messages WHERE thread_id=? AND sender_id=? ORDER BY created_at DESC LIMIT 1").bind(threadId,user.id).first();
  if(recent&&Date.now()-Date.parse(recent.created_at)<350)return json({error:"Подожди немного перед следующим сообщением"},429);
  const id=crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO chat_messages (id,thread_id,sender_id,body,created_at) VALUES (?,?,?,?,?)").bind(id,threadId,user.id,body,now),
    env.DB.prepare("UPDATE chat_threads SET updated_at=? WHERE id=?").bind(now,threadId)
  ]);
  return json({message:{id,thread_id:threadId,sender_id:user.id,body,created_at:now}},201);
}
async function chatSetTyping(request,env,user) {
  let b;try{b=await request.json();}catch{return json({error:"Некорректный запрос"},400);}
  const threadId=String(b.thread_id||"");
  await ensureChatSchema(env);
  if(!threadId||!await chatMember(env,threadId,user.id))return json({error:"Нет доступа к этому диалогу"},403);
  const until=b.typing?new Date(Date.now()+7000).toISOString():null;
  await env.DB.prepare("UPDATE chat_members SET typing_until=? WHERE thread_id=? AND user_id=?").bind(until,threadId,user.id).run();
  return json({success:true});
}
async function chatMarkRead(request,env,user) {
  let b;try{b=await request.json();}catch{return json({error:"Некорректный запрос"},400);}
  const threadId=String(b.thread_id||"");
  await ensureChatSchema(env);
  if(!threadId||!await chatMember(env,threadId,user.id))return json({error:"Нет доступа к этому диалогу"},403);
  await env.DB.prepare("UPDATE chat_members SET last_read_at=? WHERE thread_id=? AND user_id=?").bind(new Date().toISOString(),threadId,user.id).run();
  return json({success:true});
}
async function adminChatThreads(env,userId) {
  await ensureChatSchema(env);
  const rows=await env.DB.prepare(`SELECT t.id,t.kind,t.created_at,t.updated_at,
    (SELECT body FROM chat_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
    (SELECT created_at FROM chat_messages m WHERE m.thread_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_at
    FROM chat_members mine JOIN chat_threads t ON t.id=mine.thread_id
    WHERE mine.user_id=? ORDER BY t.updated_at DESC LIMIT 100`).bind(userId).all();
  return json({chats:rows.results||[]});
}
async function adminChatMessages(request,env) {
  const url=new URL(request.url),threadId=String(url.searchParams.get("thread_id")||"");
  if(!threadId)return json({error:"Не указан диалог"},400);
  await ensureChatSchema(env);
  const rows=await env.DB.prepare(`SELECT m.id,m.sender_id,u.username,u.display_name,m.body,m.created_at
    FROM chat_messages m JOIN users u ON u.id=m.sender_id
    WHERE m.thread_id=? ORDER BY m.created_at DESC LIMIT 200`).bind(threadId).all();
  return json({messages:(rows.results||[]).reverse()});
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
    path.startsWith("/chat/") ||
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

  // Static app files are bundled with this Worker as Cloudflare Assets.
  // This avoids fetching the frontend from a public GitHub repository at runtime.
  if (pwaFiles[path] && request.method === "GET") {
    if (!env.ASSETS) return new Response("Статические файлы приложения не настроены", { status: 503 });
    const asset = pwaFiles[path];
    const assetUrl = new URL("/" + asset.file, request.url);
    const response = await env.ASSETS.fetch(new Request(assetUrl, { method: "GET" }));
    if (!response.ok) return new Response("Файл приложения не найден", { status: 404 });
    const headers = new Headers(response.headers);
    headers.set("Content-Type", asset.type);
    headers.set("Cache-Control", path === "/sw.js" ? "no-cache" : "public, max-age=300");
    headers.set("X-Content-Type-Options", "nosniff");
    if (path === "/sw.js") headers.set("Service-Worker-Allowed", "/");
    return new Response(response.body, { status: 200, headers });
  }

  if (path === "/app" && request.method === "GET") {
    if (!env.ASSETS) return new Response("Статические файлы приложения не настроены", { status: 503 });
    const response = await env.ASSETS.fetch(new Request(new URL("/index.html", request.url), { method: "GET" }));
    if (!response.ok) return new Response("Не удалось загрузить приложение", { status: 404 });
    const headers = new Headers(response.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Cache-Control", "no-store");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    return new Response(response.body, { status: 200, headers });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("Origin") || "") });
  }

  // Public video discovery: proxy metadata only, never video streams. Cache upstream responses at the edge.
  if (path === "/video/feed" && request.method === "GET") {
    const topics = {
      trending: "популярные клипы тренды лучшие короткие видео",
      fun: "смешные приколы юмор скетчи смешные ситуации",
      animals: "кошки собаки животные питомцы смешные видео",
      auto: "автомобили машины тюнинг дрифт тест драйв",
      useful: "лайфхаки полезные советы обучение как сделать самому"
    };
    const topic = url.searchParams.get("topic") || "trending";
    const page = Math.min(5, Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1));
    const origin = request.headers.get("Origin") || "";
    if (!topics[topic]) return json({ error: "Неизвестная тема" }, 400, origin);
    const upstreamUrl = "https://rutube.ru/api/search/video/?query=" +
      encodeURIComponent(topics[topic]) + "&page=" + page + "&format=json";
    const upstream = await fetch(upstreamUrl, {
      headers: {
        "Accept": "application/json",
        "Referer": "https://rutube.ru/",
        "User-Agent": "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36"
      },
      cf: { cacheTtl: 300, cacheEverything: true }
    });
    if (!upstream.ok) return json({ error: "Каталог RUTUBE временно недоступен", upstream_status: upstream.status }, 502, origin);
    const data = await upstream.json();
    return json(data, 200, origin);
  }

  if (path === "/health" && request.method === "GET") {
    try {
      await env.DB.prepare("SELECT 1").first();
      return json({ worker: "ok", database: "connected" });
    } catch (e) {
      return json({ worker: "ok", database: "error" }, 500);
    }
  }


  if (path === "/usage" && request.method === "GET") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Необходим вход в аккаунт" }, 401);
    return aiUsageGet(env, user);
  }
  if (path === "/usage" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "Необходим вход в аккаунт" }, 401);
    return aiUsagePost(request, env, user);
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

  if (path === "/chat/users" && request.method === "GET") {
    const user=await currentUser(request,env); if(!user)return json({error:"Необходим вход в аккаунт"},401);
    return chatSearchUsers(request,env,user);
  }
  if (path === "/chat/direct" && request.method === "POST") {
    const user=await currentUser(request,env); if(!user)return json({error:"Необходим вход в аккаунт"},401);
    return chatCreateDirect(request,env,user);
  }
  if (path === "/chat/unread" && request.method === "GET") {
    const user=await currentUser(request,env); if(!user)return json({error:"Необходим вход в аккаунт"},401);
    return chatUnread(env,user);
  }
  if (path === "/chat/list" && request.method === "GET") {
    const user=await currentUser(request,env); if(!user)return json({error:"Необходим вход в аккаунт"},401);
    return chatList(env,user);
  }
  if (path === "/chat/typing" && request.method === "POST") {
    const user=await currentUser(request,env); if(!user)return json({error:"Необходим вход в аккаунт"},401);
    return chatSetTyping(request,env,user);
  }
  if (path === "/chat/messages" && request.method === "GET") {
    const user=await currentUser(request,env); if(!user)return json({error:"Необходим вход в аккаунт"},401);
    return chatGetMessages(request,env,user);
  }
  if (path === "/chat/messages" && request.method === "POST") {
    const user=await currentUser(request,env); if(!user)return json({error:"Необходим вход в аккаунт"},401);
    return chatSendMessage(request,env,user);
  }
  if (path === "/chat/read" && request.method === "POST") {
    const user=await currentUser(request,env); if(!user)return json({error:"Необходим вход в аккаунт"},401);
    return chatMarkRead(request,env,user);
  }
  if (path === "/admin/chat/threads" && request.method === "GET") {
    const auth=await adminOnly(request,env);if(auth.error)return auth.error;
    const userId=String(url.searchParams.get("user_id")||"");
    if(!userId)return json({error:"Не указан аккаунт"},400);
    return adminChatThreads(env,userId);
  }
  if (path === "/admin/chat/messages" && request.method === "GET") {
    const auth=await adminOnly(request,env);if(auth.error)return auth.error;
    return adminChatMessages(request,env);
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
      await ensureChatSchema(env);
      await env.DB.batch([
        env.DB.prepare("DELETE FROM conversations WHERE user_id=?").bind(id),
        env.DB.prepare("DELETE FROM chat_messages WHERE thread_id IN (SELECT thread_id FROM chat_members WHERE user_id=?)").bind(id),
        env.DB.prepare("DELETE FROM chat_members WHERE user_id=?").bind(id),
        env.DB.prepare("DELETE FROM chat_threads WHERE id NOT IN (SELECT DISTINCT thread_id FROM chat_members)"),
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

  // React frontend preview route. The legacy /app remains untouched.
  // Preview deployment is isolated to non-production branches.
  if (env.ASSETS && request.method === "GET" && (url.pathname === "/app-next" || url.pathname === "/app-next/")) {
    const assetUrl = new URL(request.url);
    assetUrl.pathname = "/next/index.html";
    return env.ASSETS.fetch(new Request(assetUrl, request));
  }

  // Let Cloudflare Assets serve any remaining static files after API routes.
  if (env.ASSETS && request.method === "GET") {
    return env.ASSETS.fetch(request);
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
