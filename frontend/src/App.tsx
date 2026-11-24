import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Home, Sparkles, Clapperboard, MessageCircle, UserRound, ArrowUpRight,
  ChefHat, Wrench, Package, CalendarDays, CheckCircle2, Clock3, Plus,
  Search, X, History, ArrowRight, ShieldCheck, Orbit, LogOut,
} from "lucide-react";
import { Drawer } from "vaul";

type User = { id?: string | number; username?: string; display_name?: string; role?: string };
type Conversation = { id: string; kind?: string; title?: string; updated_at?: string; content?: any };
declare global {
  interface Window {
    showPage?: (page: string) => void;
    renderToday?: () => void;
    renderTasks?: () => void;
  }
}

const WORKER_URL = location.hostname.endsWith(".workers.dev")
  ? location.origin
  : "https://admin-panel-chef-api.bosstayson24.workers.dev";

const navItems = [
  { id: "home", label: "Главная", Icon: Home },
  { id: "helpers", label: "Агенты", Icon: Sparkles },
  { id: "video", label: "Видео", Icon: Clapperboard },
  { id: "community", label: "Чаты", Icon: MessageCircle },
  { id: "profile", label: "Профиль", Icon: UserRound },
];

const agents = [
  { id: "chef", title: "ИИ-Шеф", subtitle: "Рецепты, меню и питание", status: "Доступен", Icon: ChefHat, tone: "red" },
  { id: "mechanic", title: "ИИ-Механик", subtitle: "Диагностика и обслуживание авто", status: "Доступен", Icon: Wrench, tone: "gold" },
  { id: "invoice", title: "Учёт и инвентаризация", subtitle: "Товары, остатки и склад", status: "В разработке", Icon: Package, tone: "neutral" },
];

function readUser(): User | null {
  try { return JSON.parse(localStorage.getItem("ai_bragina_user") || "null"); } catch { return null; }
}
function userDataKey(user: User | null) {
  const identity = String(user?.id || user?.username || "").trim().toLowerCase();
  return identity ? "ai_bragina_data_v2_user_" + encodeURIComponent(identity) : "";
}
function openPage(page: string) { window.showPage?.(page); }
function classifyQuery(query: string) {
  const q = query.toLowerCase();
  if (/машин|авто|двигател|механик|тормоз|аккумулятор|не завод/.test(q)) return "mechanic";
  if (/рецепт|еда|приготов|ужин|завтрак|обед|продукт|шеф/.test(q)) return "chef";
  if (/уч[её]т|товар|склад|остат|инвентар|наклад|закуп/.test(q)) return "invoice";
  return "helpers";
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [firstAccount, setFirstAccount] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== "register") return;
    let alive = true;
    fetch(WORKER_URL + "/auth/setup-status", { cache: "no-store" })
      .then(async r => { if (!r.ok) throw new Error("status"); return r.json(); })
      .then(d => { if (alive) setFirstAccount(!!d.first_account); })
      .catch(() => { if (alive) setFirstAccount(true); });
    return () => { alive = false; };
  }, [mode]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setStatus("Проверяем данные…"); setError(false);
    try {
      if (!username.trim() || !password) throw new Error("Заполни логин и пароль.");
      const path = mode === "register" ? "/auth/register" : "/auth/login";
      const body = mode === "register"
        ? { username: username.trim(), password, display_name: displayName.trim() || username.trim(), setup_code: setupCode }
        : { username: username.trim(), password };
      const response = await fetch(WORKER_URL + path, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), cache: "no-store",
      });
      const data = await response.json().catch(() => ({ error: "Сервер вернул неверный ответ" }));
      if (!response.ok) {
        const raw = data.error ?? data.message ?? data;
        throw new Error(typeof raw === "string" ? raw : raw?.message || raw?.error || JSON.stringify(raw));
      }
      if (!data.token || !data.user) throw new Error("Сервер не вернул данные аккаунта.");
      localStorage.setItem("ai_bragina_token", data.token);
      localStorage.setItem("ai_bragina_user", JSON.stringify(data.user));
      setStatus("Вход выполнен. Открываем СОЮЗ…");
      onAuthenticated(data.user);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Не удалось войти.");
      setError(true);
    } finally { setBusy(false); }
  }

  return (
    <motion.div className="soyuz-auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="soyuz-auth__stars" />
      <motion.div className="soyuz-auth__card" initial={{ y: 22, opacity: 0, scale: .98 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 180, damping: 22 }}>
        <div className="soyuz-emblem"><Orbit size={38} strokeWidth={1.25} /><span /></div>
        <div className="soyuz-kicker">СОЮЗ // ОС 2.6</div>
        <h1>{mode === "login" ? "С возвращением" : "Создать аккаунт"}</h1>
        <p className="soyuz-muted">Единое пространство для идей, задач и умных помощников.</p>
        <form onSubmit={submit} className="soyuz-form">
          <label>Логин<input autoComplete="username" maxLength={24} value={username} onChange={e => setUsername(e.target.value)} placeholder="Например, sever_27" /></label>
          <AnimatePresence initial={false}>
            {mode === "register" && <motion.label initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>Отображаемое имя<input maxLength={50} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Как к тебе обращаться" /></motion.label>}
          </AnimatePresence>
          <label>Пароль<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} placeholder="Не менее 8 символов" /></label>
          {mode === "register" && firstAccount && <label>Код первого владельца<input type="password" autoComplete="off" value={setupCode} onChange={e => setSetupCode(e.target.value)} placeholder="Код из настроек Cloudflare" /></label>}
          <motion.button className="soyuz-primary" type="submit" disabled={busy} whileTap={{ scale: .97 }}>{busy ? "Подождите…" : mode === "login" ? "Войти в СОЮЗ" : "Создать аккаунт"} <ArrowRight size={17} /></motion.button>
        </form>
        {status && <div className={`soyuz-auth__status ${error ? "is-error" : ""}`}>{status}</div>}
        <button className="soyuz-text-button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setStatus(""); setError(false); }}>
          {mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
        </button>
        <div className="soyuz-auth__foot"><ShieldCheck size={13} /> Защищённый вход в личное пространство</div>
      </motion.div>
    </motion.div>
  );
}

function HomeScreen({ user }: { user: User | null }) {
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);
  useEffect(() => {
    const load = () => {
      try {
        const key = userDataKey(user);
        const data = key ? JSON.parse(localStorage.getItem(key) || "{}") : {};
        setTasks(Array.isArray(data.tasks) ? data.tasks.filter((t: any) => !t.done).slice(0, 4) : []);
      } catch { setTasks([]); }
    };
    load();
    const timer = window.setInterval(load, 1800);
    return () => window.clearInterval(timer);
  }, [user?.id, user?.username]);

  function launch() {
    const page = classifyQuery(query);
    if (page === "helpers") { openPage("helpers"); return; }
    if (page === "chef") {
      openPage("chef");
      window.setTimeout(() => {
        const input = document.getElementById("chef-dish") as HTMLInputElement | null;
        if (input) input.value = query;
      }, 80);
    } else if (page === "mechanic") {
      openPage("mechanic");
      window.setTimeout(() => {
        const input = document.getElementById("quick-problem") as HTMLTextAreaElement | null;
        if (input) { input.value = query; input.dispatchEvent(new Event("input", { bubbles: true })); }
      }, 80);
    } else openPage(page);
  }

  const shortcuts = [
    { id: "helpers", title: "Все агенты", sub: "Каталог помощников", Icon: Sparkles, tone: "red" },
    { id: "chef", title: "ИИ-Шеф", sub: "Еда и рецепты", Icon: ChefHat, tone: "gold" },
    { id: "mechanic", title: "ИИ-Механик", sub: "Авто и диагностика", Icon: Wrench, tone: "neutral" },
    { id: "tasks", title: "Мои задачи", sub: "Планы на день", Icon: CheckCircle2, tone: "neutral" },
  ];

  return (
    <motion.div className="soyuz-screen" key="home" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
      <header className="soyuz-topbar">
        <div className="soyuz-brand"><div className="soyuz-brand__mark"><Orbit size={24} /></div><div><strong>СОЮЗ</strong><small>ЛЮДИ · ИДЕИ · ДЕЙСТВИЯ</small></div></div>
        <button className="soyuz-icon-button" aria-label="Профиль" onClick={() => openPage("profile")}><UserRound size={19} /></button>
      </header>
      <div className="soyuz-greeting"><div><span className="soyuz-kicker">ВАША СРЕДА // 2026</span><h1>Добро пожаловать{user?.display_name ? `, ${user.display_name.split(" ")[0]}` : ""}</h1><p>Что создадим сегодня?</p></div><span className="soyuz-live-dot" /></div>

      <div className="soyuz-stories">
        {[
          { id: "helpers", label: "Агенты", Icon: Sparkles, color: "red" },
          { id: "chef", label: "Шеф", Icon: ChefHat, color: "gold" },
          { id: "mechanic", label: "Механик", Icon: Wrench, color: "silver" },
          { id: "video", label: "Видео", Icon: Clapperboard, color: "silver" },
          { id: "community", label: "Чаты", Icon: MessageCircle, color: "silver" },
        ].map(({ id, label, Icon, color }) => <motion.button key={id} className="soyuz-story" onClick={() => openPage(id)} whileTap={{ scale: .94 }}><span className={`soyuz-story__ring ${color}`}><Icon size={21} /></span><small>{label}</small></motion.button>)}
      </div>

      <section className="soyuz-prompt-card">
        <div className="soyuz-prompt-heading"><span className="soyuz-prompt-sigil"><Sparkles size={18} /></span><div><strong>Что нужно сделать?</strong><small>Опиши задачу — найдём подходящего агента</small></div></div>
        <div className="soyuz-prompt-input"><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && launch()} placeholder="Спроси о чём угодно…" /><motion.button onClick={launch} whileTap={{ scale: .92 }} aria-label="Открыть помощника"><ArrowRight size={19} /></motion.button></div>
        <button className="soyuz-inline-link" onClick={() => openPage("helpers")}>Открыть каталог AI-агентов <ArrowUpRight size={14} /></button>
      </section>

      <div className="soyuz-section-head"><div><span className="soyuz-kicker">ПЛАНИРОВАНИЕ</span><h2>Сегодня</h2></div><button onClick={() => openPage("tasks")}>Все задачи <ArrowUpRight size={14} /></button></div>
      <section className="soyuz-today-card">
        <div className="soyuz-today-top"><span><CalendarDays size={16} /> На повестке</span><span>{tasks.length} активных</span></div>
        {tasks.length ? tasks.map((task, i) => <div className="soyuz-task-row" key={task.id || i}><span className="soyuz-task-dot" /><div><strong>{String(task.title || task.text || "Задача")}</strong>{task.due && <small>{task.due}</small>}</div><Clock3 size={15} /></div>) : <div className="soyuz-empty-tasks"><CheckCircle2 size={22} /><div><strong>Пока всё спокойно</strong><small>Добавь задачу — и она появится здесь.</small></div><button onClick={() => openPage("tasks")}><Plus size={16} /></button></div>}
      </section>

      <div className="soyuz-section-head"><div><span className="soyuz-kicker">БЫСТРЫЙ ДОСТУП</span><h2>Инструменты</h2></div></div>
      <div className="soyuz-shortcuts">{shortcuts.map(({ id, title, sub, Icon, tone }) => <motion.button key={id} className="soyuz-shortcut" onClick={() => openPage(id)} whileTap={{ scale: .975 }}><span className={`soyuz-shortcut__icon ${tone}`}><Icon size={20} /></span><span><strong>{title}</strong><small>{sub}</small></span><ArrowUpRight size={16} /></motion.button>)}</div>
    </motion.div>
  );
}

function AgentsScreen({ onOpenHistory }: { onOpenHistory: () => void }) {
  return (
    <motion.div className="soyuz-screen" key="agents" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
      <div className="soyuz-page-heading"><span className="soyuz-kicker">СОЮЗ // ИНТЕЛЛЕКТ</span><h1>AI-Агенты</h1><p>Специализированные помощники. Каждый решает свою задачу.</p></div>
      <button className="soyuz-history-banner" onClick={onOpenHistory}><span><History size={18} /></span><div><strong>История диалогов</strong><small>Продолжить предыдущую работу</small></div><ArrowUpRight size={17} /></button>
      <div className="soyuz-agent-grid">
        {agents.map(({ id, title, subtitle, status, Icon, tone }, i) => <motion.button key={id} className="soyuz-agent-card" onClick={() => openPage(id)} whileTap={{ scale: .975 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .055 }}>
          <div className="soyuz-agent-card__top"><span className={`soyuz-agent-card__icon ${tone}`}><Icon size={23} /></span><span className={status === "Доступен" ? "soyuz-status live" : "soyuz-status"}>{status}</span></div>
          <strong>{title}</strong><p>{subtitle}</p><span className="soyuz-agent-card__action">{status === "Доступен" ? "Открыть помощника" : "Посмотреть" } <ArrowUpRight size={14} /></span>
        </motion.button>)}
      </div>
      <div className="soyuz-note"><ShieldCheck size={16} /><span>Шеф и Механик используют существующие проверенные сценарии и системные инструкции. Новые агенты подключаются после настройки.</span></div>
    </motion.div>
  );
}

function HistoryDrawer({ open, onOpenChange, token }: { open: boolean; onOpenChange: (v: boolean) => void; token: string }) {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true); setError("");
    fetch(WORKER_URL + "/conversations", { headers: { Authorization: "Bearer " + token }, cache: "no-store" })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Не удалось загрузить историю."); return d; })
      .then(d => { if (alive) setItems(Array.isArray(d.conversations) ? d.conversations : []); })
      .catch(e => { if (alive) setError(e.message || "Ошибка загрузки."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, token]);
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="soyuz-drawer-overlay" />
        <Drawer.Content className="soyuz-drawer">
          <div className="soyuz-drawer__handle" />
          <div className="soyuz-drawer__heading"><div><span className="soyuz-kicker">АРХИВ // СОЮЗ</span><Drawer.Title>История диалогов</Drawer.Title></div><button onClick={() => onOpenChange(false)}><X size={19} /></button></div>
          {loading && <p className="soyuz-muted">Загружаем историю…</p>}
          {error && <p className="soyuz-error">{error}</p>}
          {!loading && !error && !items.length && <p className="soyuz-muted">Сохранённых диалогов пока нет. Новые рецепты и диагностики появятся здесь автоматически.</p>}
          <div className="soyuz-history-list">{items.map(item => <button key={item.id} onClick={() => { onOpenChange(false); openPage(item.kind === "mechanic" ? "mechanic" : "chef"); }}><span className="soyuz-history-list__icon">{item.kind === "mechanic" ? <Wrench size={17} /> : <ChefHat size={17} />}</span><span><strong>{item.title || "Диалог"}</strong><small>{item.kind === "mechanic" ? "ИИ-Механик" : item.kind === "recipe" ? "ИИ-Шеф" : "Диалог"} · {item.updated_at ? new Date(item.updated_at).toLocaleString("ru-RU") : "Дата не указана"}</small></span><ArrowRight size={15} /></button>)}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export default function App() {
  const [active, setActive] = useState(document.body.dataset.page || "home");
  const [user, setUser] = useState<User | null>(readUser());
  const [authChecked, setAuthChecked] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const token = localStorage.getItem("ai_bragina_token") || "";
  const authenticated = !!token && !!user;

  useEffect(() => {
    let alive = true;
    const cachedToken = localStorage.getItem("ai_bragina_token") || "";
    if (!cachedToken) { setUser(null); setAuthChecked(true); return; }
    fetch(WORKER_URL + "/auth/me", { headers: { Authorization: "Bearer " + cachedToken }, cache: "no-store" })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!r.ok || !d.user) throw new Error("session"); return d.user as User; })
      .then(u => { if (alive) { setUser(u); localStorage.setItem("ai_bragina_user", JSON.stringify(u)); } })
      .catch(() => { if (alive) { localStorage.removeItem("ai_bragina_token"); localStorage.removeItem("ai_bragina_user"); setUser(null); } })
      .finally(() => { if (alive) setAuthChecked(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const page = document.body.dataset.page;
      if (page) setActive(page);
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ["data-page"] });
    return () => observer.disconnect();
  }, []);

  const isReactPage = active === "home" || active === "helpers";
  const legacyHelper = ["chef", "mechanic", "invoice"].includes(active);
  const showReactShell = authenticated && authChecked && isReactPage;

  return (
    <>
      <AnimatePresence mode="wait">
        {!authChecked ? <motion.div key="loading" className="soyuz-boot"><div className="soyuz-emblem"><Orbit size={34} /></div><span>СОЮЗ // ЗАГРУЗКА</span></motion.div>
        : !authenticated ? <AuthScreen key="auth" onAuthenticated={u => { setUser(u); window.location.reload(); }} />
        : showReactShell ? <motion.div key={active} className="soyuz-app"><AnimatePresence mode="wait">{active === "home" ? <HomeScreen user={user} /> : <AgentsScreen onOpenHistory={() => setHistoryOpen(true)} />}</AnimatePresence></motion.div>
        : legacyHelper ? <div className="soyuz-legacy-intro"><button onClick={() => openPage("helpers")}>← Все агенты</button><span className="soyuz-kicker">СОЮЗ // AI-АГЕНТ</span><h1>{active === "chef" ? "ИИ-Шеф" : active === "mechanic" ? "ИИ-Механик" : "Учёт и инвентаризация"}</h1><p>Рабочий сценарий помощника сохранён без изменения системных инструкций.</p></div>
        : <div className="soyuz-legacy-intro"><span className="soyuz-kicker">СОЮЗ // РАЗДЕЛ</span><h1>{active === "video" ? "Видео" : active === "community" ? "Чаты" : "Профиль"}</h1></div>}
      </AnimatePresence>
      {authenticated && authChecked && (
        <nav className="soyuz-dock" aria-label="Основная навигация">
          {navItems.map(({ id, label, Icon }) => <button key={id} type="button" className={`soyuz-dock__item ${(id === active || (id === "helpers" && legacyHelper)) ? "is-active" : ""}`} onClick={() => openPage(id)} aria-current={id === active ? "page" : undefined}>
            {(id === active || (id === "helpers" && legacyHelper)) && <motion.span className="soyuz-dock__indicator" layoutId="soyuz-active-tab" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
            <motion.span className="soyuz-dock__icon" whileTap={{ scale: .86 }}><Icon size={19} strokeWidth={id === active ? 2.2 : 1.7} /></motion.span><span className="soyuz-dock__label">{label}</span>
          </button>)}
        </nav>
      )}
      <HistoryDrawer open={historyOpen} onOpenChange={setHistoryOpen} token={token} />
    </>
  );
}
