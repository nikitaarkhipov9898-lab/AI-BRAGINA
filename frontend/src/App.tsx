import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Home, Sparkles, Clapperboard, MessageCircle, UserRound, ArrowUpRight, Zap, Crown,
  ChefHat, Wrench, Package, CalendarDays, CheckCircle2, Clock3, Plus,
  Search, X, History, ArrowRight, ShieldCheck, Orbit, LogOut, Heart, Volume2, VolumeX, Play, Pause,
} from "lucide-react";
import { Drawer } from "vaul";

type User = { id?: string | number; username?: string; display_name?: string; role?: string; sparks?: number; soyuz_plus_until?: string | null; invisible_until?: string | null };
type Entitlements = { sparks:number; plus_active:boolean; plus_until:string|null; invisible_active:boolean; invisible_until:string|null };
type Conversation = { id: string; kind?: string; title?: string; updated_at?: string; content?: any };
declare global {
  interface Window {
    showPage?: (page: string) => void;
    renderToday?: () => void;
    renderTasks?: () => void;
    generateChef?: (regen?: boolean) => Promise<void>;
    askQuickMechanic?: () => Promise<void>;
    askMechanic?: () => Promise<void>;
    continueMechanic?: (id: string) => Promise<void>;
    activeCase?: () => { id: string } | null;
    restoreConversation?: (row: any) => boolean;
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

function AtomEmblem({size=28}:{size?:number}) { return <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Эмблема СОЮЗ"><defs><linearGradient id="soyuzAtomGold" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffe5b4"/><stop offset="1" stopColor="#bd8d55"/></linearGradient><linearGradient id="soyuzAtomRed" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ff746b"/><stop offset="1" stopColor="#d52d40"/></linearGradient></defs><ellipse cx="32" cy="32" rx="27" ry="10" transform="rotate(-34 32 32)" fill="none" stroke="url(#soyuzAtomGold)" strokeWidth="2.5"/><ellipse cx="32" cy="32" rx="27" ry="10" transform="rotate(34 32 32)" fill="none" stroke="url(#soyuzAtomRed)" strokeWidth="2.5"/><ellipse cx="32" cy="32" rx="27" ry="10" transform="rotate(90 32 32)" fill="none" stroke="url(#soyuzAtomGold)" strokeWidth="1.8" opacity=".8"/><circle cx="32" cy="32" r="8" fill="#171216" stroke="url(#soyuzAtomGold)" strokeWidth="1.8"/><path d="M38 25c-2-2-5-3-8-2-5 1-8 5-8 9s3 8 8 9c3 1 6 0 8-2" fill="none" stroke="url(#soyuzAtomRed)" strokeWidth="3.4" strokeLinecap="round"/><circle cx="53" cy="15" r="2.4" fill="#ff665f"/><circle cx="11" cy="49" r="2" fill="#e0c097"/></svg> }

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
        <div className="soyuz-emblem"><AtomEmblem size={46}/><span /></div>
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

function HomeScreen({ user, token, onPlus }: { user: User | null; token:string; onPlus:()=>void }) {
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<any[]>([]);
  const [account,setAccount]=useState<Entitlements>({sparks:0,plus_active:false,plus_until:null,invisible_active:false,invisible_until:null});
  const [presenceError,setPresenceError]=useState("");
  useEffect(()=>{let live=true;api("/account/entitlements",token).then(d=>live&&setAccount(d)).catch(()=>{});return()=>{live=false}},[token]);
  async function toggleInvisible(){setPresenceError("");try{const d=await api("/account/invisible",token,{method:"POST",body:JSON.stringify({enabled:!account.invisible_active})});setAccount(d);}catch(e){const message=e instanceof Error?e.message:"Не удалось изменить статус";if(/плюс|искр|доступ|невидим/i.test(message))onPlus();else setPresenceError(message)}}
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
    if (page === "chef" || page === "mechanic") {
      sessionStorage.setItem("soyuz_pending_prompt", query);
      openPage(page);
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
        <div className="soyuz-brand"><div className="soyuz-brand__mark"><AtomEmblem size={30}/></div><div><strong>СОЮЗ</strong><small>ЛЮДИ · ИДЕИ · ДЕЙСТВИЯ</small></div></div>
        <div className="soyuz-top-actions"><button className="soyuz-sparks" onClick={onPlus}><Zap size={14}/>{account.sparks} Искр</button><motion.button className={"soyuz-presence "+(account.invisible_active?"hidden-status":"online-status")} onClick={toggleInvisible} whileTap={{scale:.94}}><i/><span>{account.invisible_active?"СКРЫТ":"В СЕТИ"}</span></motion.button><button className="soyuz-icon-button" aria-label="Профиль" onClick={() => openPage("profile")}><UserRound size={19} /></button></div>
      </header>
      {presenceError&&<p className="soyuz-error">{presenceError}</p>}
      <div className="soyuz-greeting"><div><span className="soyuz-kicker">ВАША СРЕДА // 2026</span><h1>Добро пожаловать{user?.display_name ? `, ${user.display_name.split(" ")[0]}` : ""}</h1><p>Что создадим сегодня?</p></div></div>

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
          <div className="soyuz-history-list">{items.map(item => <button key={item.id} onClick={() => { sessionStorage.setItem("soyuz_restore_conversation", JSON.stringify(item)); onOpenChange(false); openPage(item.kind === "mechanic" ? "mechanic" : "chef"); }}><span className="soyuz-history-list__icon">{item.kind === "mechanic" ? <Wrench size={17} /> : <ChefHat size={17} />}</span><span><strong>{item.title || "Диалог"}</strong><small>{item.kind === "mechanic" ? "ИИ-Механик" : item.kind === "recipe" ? "ИИ-Шеф" : "Диалог"} · {item.updated_at ? new Date(item.updated_at).toLocaleString("ru-RU") : "Дата не указана"}</small></span><ArrowRight size={15} /></button>)}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}


function AgentWorkspace({ agent, onBack }: { agent: "chef" | "mechanic"; onBack: () => void }) {
  const [mode, setMode] = useState(agent === "chef" ? "dish" : "quick");
  const [prompt, setPrompt] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [engine, setEngine] = useState("");
  const [mileage, setMileage] = useState("");
  const [when, setWhen] = useState("Постоянно");
  const [code, setCode] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text?: string; html?: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  useEffect(() => {
    const saved = sessionStorage.getItem("soyuz_restore_conversation");
    if (saved) { try { const row = JSON.parse(saved); const data = row.content || {}; const record = data.case || data.entry || data; const summary = typeof record === "string" ? record : JSON.stringify(record, null, 2); setMessages([{ role: "assistant", text: "Восстановленный диалог: " + (row.title || "Без названия") + "\n\n" + summary }]); if (row.kind === "mechanic" && data.case) window.restoreConversation?.(row); } catch {} sessionStorage.removeItem("soyuz_restore_conversation"); }
  }, [agent]);
  useEffect(() => {
    const pending = sessionStorage.getItem("soyuz_pending_prompt");
    if (pending) { setPrompt(pending); sessionStorage.removeItem("soyuz_pending_prompt"); }
  }, [agent]);

  const quickCommands = agent === "chef"
    ? ["Быстрый ужин", "Из того, что есть", "Что приготовить на завтрак?"]
    : ["Двигатель не заводится", "Горит Check Engine", "Стук при движении"];

  async function send() {
    const text = prompt.trim();
    if (!text || busy) return;
    setPrompt(""); setError(""); setBusy(true);
    setMessages(prev => [...prev, { role: "user", text }]);
    try {
      if (agent === "chef") {
        const specific = mode === "dish";
        document.getElementById(specific ? "tab-specific" : "tab-pantry")?.click();
        const field = document.getElementById(specific ? "chef-dish" : "chef-products") as HTMLInputElement | HTMLTextAreaElement | null;
        if (!field) throw new Error("Не удалось открыть форму ИИ-Шефа.");
        field.value = text;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        await window.generateChef?.(false);
        const html = document.getElementById("chef-output")?.innerHTML || "";
        if (!html) throw new Error("ИИ-Шеф не вернул результат. Попробуй ещё раз.");
        setMessages(prev => [...prev, { role: "assistant", html }]);
      } else {
        const existingCase = window.activeCase?.();
        const isFollowup = mode === "deep" && messages.some(m => m.role === "assistant") && !!existingCase?.id;
        if (isFollowup) {
          const hiddenFollowup = document.getElementById("mechanic-followup");
          hiddenFollowup?.querySelectorAll(".question-card").forEach((card, i) => {
            const select = card.querySelector(".question-answer") as HTMLSelectElement | null;
            const extra = card.querySelector(".question-extra") as HTMLTextAreaElement | null;
            if (select) select.value = answers[i] || "";
            if (extra) extra.value = notes[i] || "";
          });
          const info = document.getElementById("mechanic-new-info") as HTMLTextAreaElement | null;
          if (info) info.value = text;
          await window.continueMechanic?.(existingCase.id);
        } else if (mode === "quick") {
          const field = document.getElementById("quick-problem") as HTMLTextAreaElement | null;
          document.getElementById("mechanic-mode-quick")?.click();
          if (!field) throw new Error("Не удалось открыть быструю диагностику.");
          field.value = text;
          field.dispatchEvent(new Event("input", { bubbles: true }));
          await window.askQuickMechanic?.();
        } else {
          document.getElementById("mechanic-mode-deep")?.click();
          const values: Record<string, string> = {
            "car-brand": brand, "car-model": model, "car-year": year,
            "car-engine": engine, "car-mileage": mileage, "car-problem": text,
            "car-when": when, "car-code": code,
          };
          for (const [id, value] of Object.entries(values)) {
            const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
            if (el) { el.value = value; el.dispatchEvent(new Event("input", { bubbles: true })); }
          }
          await window.askMechanic?.();
        }
        const output = document.getElementById("mechanic-output")?.innerHTML || "";
        if (!output) throw new Error("ИИ-Механик не вернул результат. Проверь данные и повтори запрос.");
        const nextQuestions = Array.from(document.querySelectorAll("#mechanic-followup .question-card strong")).map(el => el.textContent || "");
        setQuestions(nextQuestions);
        setAnswers({}); setNotes({});
        setMessages(prev => [...prev, { role: "assistant", html: output }]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить запрос.");
    } finally { setBusy(false); }
  }

  return (
    <motion.div className="soyuz-screen soyuz-agent-workspace" key={agent} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
      <div className="soyuz-workspace-head soyuz-dialog-head"><button onClick={onBack}>← Все агенты</button><span className="soyuz-kicker">СОЮЗ // ДИАЛОГ С ИИ</span></div><div className="soyuz-workspace-head"><h1>{agent === "chef" ? "ИИ-Шеф" : "ИИ-Механик"}</h1><p>{agent === "chef" ? "Рецепты и идеи для кухни" : "Предварительная диагностика автомобиля"}</p></div>
      <div className="soyuz-mode-switch">
        {(agent === "chef" ? [{ id: "dish", label: "Конкретное блюдо" }, { id: "pantry", label: "Из продуктов" }] : [{ id: "quick", label: "Быстрый разбор" }, { id: "deep", label: "Глубокая диагностика" }]).map(x => <button key={x.id} className={mode === x.id ? "active" : ""} onClick={() => setMode(x.id)}>{x.label}</button>)}
      </div>
      {agent === "mechanic" && mode === "deep" && <div className="soyuz-vehicle-grid">
        <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Марка автомобиля" />
        <input value={model} onChange={e => setModel(e.target.value)} placeholder="Модель" />
        <input value={year} onChange={e => setYear(e.target.value)} placeholder="Год" />
        <input value={engine} onChange={e => setEngine(e.target.value)} placeholder="Двигатель" />
        <input value={mileage} onChange={e => setMileage(e.target.value)} placeholder="Пробег, км" />
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="Код ошибки (если есть)" />
        <select value={when} onChange={e => setWhen(e.target.value)}><option>Постоянно</option><option>На холодном двигателе</option><option>После прогрева</option><option>При разгоне</option><option>На холостом ходу</option><option>При торможении</option><option>Периодически</option></select>
      </div>}
      <div className="soyuz-message-list">
        {!messages.length && <div className="soyuz-chat-welcome"><div className="soyuz-emblem">{agent === "chef" ? <ChefHat size={28}/> : <Wrench size={28}/>}</div><strong>{agent === "chef" ? "Что приготовим?" : "Расскажи, что происходит"}</strong><p>{agent === "chef" ? "Напиши название блюда или перечисли продукты — Шеф использует существующий сценарий генерации рецептов." : "Опиши симптомы. Для опасных неисправностей сначала позаботься о безопасности и не продолжай движение."}</p></div>}
        {messages.map((m, i) => <motion.div key={i} className={`soyuz-message ${m.role}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {m.text && <p>{m.text}</p>}
          {m.html && <div className="soyuz-agent-result" dangerouslySetInnerHTML={{ __html: m.html }} />}
        </motion.div>)}
        {busy && <div className="soyuz-thinking"><span /><span /><span /> ИИ готовит ответ…</div>}
      </div>
      {error && <div className="soyuz-error">{error}</div>}
      {agent === "mechanic" && questions.length > 0 && <div className="soyuz-followup-questions"><strong>Уточняющие вопросы</strong>{questions.map((q, i) => <div key={i}><label>{q}</label><select value={answers[i] || ""} onChange={e => setAnswers(prev => ({ ...prev, [i]: e.target.value }))}><option value="">Выбери ответ</option><option>Да</option><option>Нет</option><option>Не знаю / не проверял</option><option>Не относится к моей ситуации</option></select><textarea value={notes[i] || ""} onChange={e => setNotes(prev => ({ ...prev, [i]: e.target.value }))} placeholder="Дополнение (необязательно)" rows={2} /></div>)}</div>}
      <div className="soyuz-command-chips">{quickCommands.map(x => <button key={x} onClick={() => setPrompt(x)}>{x}</button>)}</div>
      <div className="soyuz-chat-compose"><textarea value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={agent === "chef" ? (mode === "dish" ? "Какое блюдо приготовить?" : "Перечисли продукты через запятую…") : "Опиши неисправность…"} rows={2} /><motion.button disabled={busy || !prompt.trim()} onClick={send} whileTap={{ scale: .92 }} aria-label="Отправить запрос"><ArrowRight size={19} /></motion.button></div>

    </motion.div>
  );
}

type ChatThread={id:string;peer_id:string;peer_username:string;peer_display_name?:string;last_message?:string;last_message_at?:string;unread?:number};
type ChatMessage={id:string;sender_id:string;body:string;created_at:string};
async function api(path:string,token:string,options:RequestInit={}){const r=await fetch(WORKER_URL+path,{...options,headers:{...(options.body?{"Content-Type":"application/json"}:{}),...(token?{Authorization:"Bearer "+token}:{}),...(options.headers||{})},cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok){const e=d.error??"Ошибка запроса";throw new Error(typeof e==="string"?e:e.message||JSON.stringify(e))}return d}
function initials(n?:string){return(n||"С").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()}
function clock(v?:string){return v?new Date(v).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}):""}
function ChatsScreen({user,token}:{user:User|null;token:string}){
 const [threads,S]=useState<ChatThread[]>([]),[unread,U]=useState(0),[selected,C]=useState<ChatThread|null>(null),[messages,M]=useState<ChatMessage[]>([]),[draft,D]=useState(""),[search,Q]=useState(""),[results,R]=useState<any[]>([]),[drawer,B]=useState(false),[busy,H]=useState(false),[typing,T]=useState(false),[error,E]=useState("");
 async function load(){try{const [l,u]=await Promise.all([api("/chat/list",token),api("/chat/unread",token)]);S(l.chats||[]);U(Number(u.unread)||0)}catch(e){E(e instanceof Error?e.message:"Ошибка загрузки")}}
 useEffect(()=>{load();const t=setInterval(load,12000);return()=>clearInterval(t)},[token]);
 useEffect(()=>{if(search.trim().length<2){R([]);return}let live=true;const t=setTimeout(()=>api("/chat/users?q="+encodeURIComponent(search.trim()),token).then(d=>live&&R(d.users||[])).catch(e=>live&&E(e.message)),300);return()=>{live=false;clearTimeout(t)}},[search,token]);
 async function open(t:ChatThread){C(t);E("");try{const d=await api("/chat/messages?thread_id="+encodeURIComponent(t.id)+"&limit=50",token);M(d.messages||[]);T(!!d.peer_typing);await api("/chat/read",token,{method:"POST",body:JSON.stringify({thread_id:t.id})});load()}catch(e){E(e instanceof Error?e.message:"Ошибка чата")}}
 const last=messages[messages.length-1]?.created_at||"";
 useEffect(()=>{if(!selected)return;let live=true;const poll=async()=>{try{const q="/chat/messages?thread_id="+encodeURIComponent(selected.id)+"&limit=50"+(last?"&after="+encodeURIComponent(last):"");const d=await api(q,token);if(!live)return;if(d.messages?.length)M(p=>{const ids=new Set(p.map(x=>x.id));return [...p,...d.messages.filter((x:ChatMessage)=>!ids.has(x.id))]});T(!!d.peer_typing);await api("/chat/read",token,{method:"POST",body:JSON.stringify({thread_id:selected.id})})}catch{}};const t=setInterval(poll,3500);return()=>{live=false;clearInterval(t)}},[selected?.id,token,last]);
 async function start(name:string){H(true);try{const d=await api("/chat/direct",token,{method:"POST",body:JSON.stringify({username:name})});B(false);Q("");R([]);await load();const p=d.thread.peer;await open({id:d.thread.id,peer_id:p.id,peer_username:p.username,peer_display_name:p.display_name})}catch(e){E(e instanceof Error?e.message:"Ошибка создания чата")}finally{H(false)}}
 async function send(e:React.FormEvent){e.preventDefault();const body=draft.trim();if(!body||!selected||busy)return;H(true);D("");api("/chat/typing",token,{method:"POST",body:JSON.stringify({thread_id:selected.id,typing:false})}).catch(()=>{});try{await api("/chat/messages",token,{method:"POST",body:JSON.stringify({thread_id:selected.id,body})});const d=await api("/chat/messages?thread_id="+encodeURIComponent(selected.id)+"&limit=50",token);M(d.messages||[]);load()}catch(e){E(e instanceof Error?e.message:"Ошибка отправки");D(body)}finally{H(false)}}
 function input(v:string){D(v);if(selected)api("/chat/typing",token,{method:"POST",body:JSON.stringify({thread_id:selected.id,typing:!!v.trim()})}).catch(()=>{})}
 return <motion.div className="soyuz-screen" key="chats" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}><div className="soyuz-workspace-head"><span className="soyuz-kicker">СОЮЗ // СВЯЗЬ</span><h1>Личные чаты</h1><p>{unread?String(unread)+" непрочитанных":"Ваши личные переписки"}</p></div><div className="soyuz-profile-version">СОЮЗ v2.7.0</div>{error&&<div className="soyuz-error">{error}</div>}
 {!selected?<><div className="soyuz-chat-list-head"><strong>Сообщения</strong><button className="soyuz-primary soyuz-new-chat" onClick={()=>B(true)}><Plus size={16}/> Новый чат</button></div><div className="soyuz-thread-list">{threads.map(t=><motion.button whileTap={{scale:.985}} key={t.id} className="soyuz-thread" onClick={()=>open(t)}><span className="soyuz-avatar">{initials(t.peer_display_name||t.peer_username)}</span><span className="soyuz-thread-main"><strong>{t.peer_display_name||t.peer_username}</strong><small>{t.last_message||"Начните общение"}</small></span><span className="soyuz-thread-meta"><small>{clock(t.last_message_at)}</small>{Number(t.unread)>0&&<b>{t.unread}</b>}</span></motion.button>)}{!threads.length&&<div className="soyuz-chat-welcome"><MessageCircle size={30}/><strong>Здесь пока тихо</strong><p>Найди человека по логину и начни переписку.</p><button className="soyuz-primary" onClick={()=>B(true)}>Найти человека</button></div>}</div></>:<div className="soyuz-chat-room"><header><button className="soyuz-back" onClick={()=>{C(null);M([]);load()}}>‹</button><span className="soyuz-avatar small">{initials(selected.peer_display_name||selected.peer_username)}</span><span className="soyuz-room-title"><strong>{selected.peer_display_name||selected.peer_username}</strong><small>{typing?"печатает…":"@"+selected.peer_username}</small></span></header><div className="soyuz-room-messages">{messages.map(m=><motion.div key={m.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className={"soyuz-chat-bubble "+(String(m.sender_id)===String(user?.id)?"mine":"")}>{m.body}<small>{clock(m.created_at)} {String(m.sender_id)===String(user?.id)?" · ✓✓":""}</small></motion.div>)}{typing&&<div className="soyuz-peer-typing">печатает…</div>}</div><form className="soyuz-chat-compose" onSubmit={send}><textarea value={draft} onChange={e=>input(e.target.value)} placeholder="Сообщение…" rows={1} maxLength={4000}/><button type="submit" disabled={!draft.trim()||busy}><ArrowRight size={19}/></button></form></div>}
 <Drawer.Root open={drawer} onOpenChange={B}><Drawer.Portal><Drawer.Overlay className="soyuz-drawer-overlay"/><Drawer.Content className="soyuz-drawer"><div className="soyuz-drawer__handle"/><div className="soyuz-drawer__heading"><div><span className="soyuz-kicker">СОЮЗ // ПОИСК</span><Drawer.Title>Новый диалог</Drawer.Title></div><button onClick={()=>B(false)}><X size={19}/></button></div><input className="soyuz-search-input" value={search} onChange={e=>Q(e.target.value)} placeholder="Имя пользователя или логин"/><div className="soyuz-search-results">{results.map(p=><button key={p.id} onClick={()=>start(p.username)} disabled={busy}><span className="soyuz-avatar small">{initials(p.display_name||p.username)}</span><span><strong>{p.display_name||p.username}</strong><small>@{p.username}</small></span><Plus size={17}/></button>)}</div></Drawer.Content></Drawer.Portal></Drawer.Root></motion.div>
}
type Reel={id:string;embed:string;url:string;title:string;author:string;duration:number;thumbnail:string;views:number};
function normalizeReel(v:any):Reel|null{const vals=[v?.id,v?.video_id,v?.code,v?.video_url,v?.url,v?.embed_url].filter(Boolean);let id="";for(const x of vals){const m=String(x).match(/[a-f0-9]{32}/i);if(m){id=m[0];break}}if(!id)return null;const raw=v.duration||v.duration_seconds||0;const duration=typeof raw==="string"&&raw.includes(":")?raw.split(":").reduce((n:number,p:string)=>n*60+Number(p||0),0):Number(raw)||0;if(duration>150||(!duration&&!String(v.video_url||v.url||"").includes("/shorts/")))return null;return{id,embed:"https://rutube.ru/play/embed/"+id+"/",url:"https://rutube.ru/video/"+id+"/",title:String(v.title||v.name||"Короткое видео"),author:String(v.author?.name||v.author_name||v.channel_name||"Автор не указан"),duration,thumbnail:v.thumbnail_url||v.picture_url||v.poster_url||v.thumbnail||"",views:Number(v.hits||v.views_count||v.views||0)}}
function VideoScreen(){const [topic,S]=useState("trending"),[items,I]=useState<Reel[]>([]),[index,N]=useState(0),[loading,L]=useState(false),[error,E]=useState(""),[muted,M]=useState(true),[liked,K]=useState<string[]>([]),[playing,P]=useState(true);
 async function load(){L(true);E("");try{const r=await fetch("/video/feed?topic="+encodeURIComponent(topic)+"&page=1&fresh="+Date.now(),{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.error||"Видео недоступны");const rows=Array.isArray(d.results)?d.results:Array.isArray(d)?d:[];const a=rows.map(normalizeReel).filter(Boolean) as Reel[];I(a);N(0);if(!a.length)E("В этой подборке нет коротких роликов")}catch(e){E(e instanceof Error?e.message:"Ошибка загрузки видео")}finally{L(false)}}
 useEffect(()=>{load()},[topic]);const item=items[index];const move=(n:number)=>N(i=>Math.max(0,Math.min(items.length-1,i+n)));
 return <motion.div className="soyuz-screen soyuz-video-screen" key="video" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}><div className="soyuz-video-top"><div><span className="soyuz-kicker">СОЮЗ // ВИДЕО</span><h1>Короткий формат</h1></div><button onClick={load}><Search size={18}/></button></div><div className="soyuz-video-topics">{[{id:"trending",name:"Популярное"},{id:"fun",name:"Юмор"},{id:"animals",name:"Животные"},{id:"auto",name:"Авто"},{id:"useful",name:"Полезное"}].map(t=><button key={t.id} className={topic===t.id?"active":""} onClick={()=>S(t.id)}>{t.name}</button>)}</div><div className="soyuz-reel" onTouchStart={e=>{(window as any).__soyuzTouchY=e.touches[0].clientY}} onTouchEnd={e=>{const d=(window as any).__soyuzTouchY-e.changedTouches[0].clientY;if(Math.abs(d)>55)move(d>0?1:-1)}}>{item?<><iframe key={item.id+String(playing)} src={item.embed+(muted?"?autoplay="+(playing?"1":"0")+"&muted=1":"?autoplay="+(playing?"1":"0"))} allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen title={item.title}/><div className="soyuz-reel-overlay"><div><strong>{item.title}</strong><small>@{item.author} · {item.views.toLocaleString("ru-RU")} просмотров</small></div><div className="soyuz-reel-actions"><button onClick={()=>K(p=>p.includes(item.id)?p.filter(x=>x!==item.id):[...p,item.id])}><Heart size={14} fill={liked.includes(item.id)?"currentColor":"none"}/> {liked.includes(item.id)?"Нравится":"Нравится"}</button><button onClick={()=>M(x=>!x)}>{muted?<VolumeX size={14}/>:<Volume2 size={14}/>}</button><button onClick={()=>P(x=>!x)}>{playing?<Pause size={14}/>:<Play size={14}/>}</button><a href={item.url} target="_blank" rel="noreferrer">Открыть ролик</a></div></div><div className="soyuz-reel-nav"><button onClick={()=>move(-1)} disabled={!index}>↑</button><button onClick={()=>move(1)} disabled={index>=items.length-1}>↓</button></div></>:<div className="soyuz-video-empty">{loading?"Подбираем ролики…":error||"Видео пока нет"}</div>}</div>{error&&item&&<p className="soyuz-muted">{error}</p>}</motion.div>}
function ProfileScreen({user,token,onLogout,onPlus}:{user:User|null;token:string;onLogout:()=>void;onPlus:()=>void}){const [settings,S]=useState<Record<string,any>>(()=>{try{return JSON.parse(localStorage.getItem("ai_bragina_settings_v1")||"{}")}catch{return{}}}),[sheet,B]=useState(""),[stats,T]=useState({tasks:0,recipes:0,diagnostics:0}),[admin,A]=useState<any>(null),[users,U]=useState<any[]>([]),[audit,J]=useState<any[]>([]),[error,E]=useState("");
 useEffect(()=>{try{const d=JSON.parse(localStorage.getItem(userDataKey(user))||"{}");T({tasks:d.tasks?.length||0,recipes:d.history?.length||0,diagnostics:d.mechanicCases?.length||0})}catch{}},[user?.id]);
 function setting(k:string,v:any){const n={...settings,[k]:v};S(n);localStorage.setItem("ai_bragina_settings_v1",JSON.stringify(n))}
 async function openAdmin(){try{const [o,u,a]=await Promise.all([api("/admin/overview",token),api("/admin/users",token),api("/admin/audit",token)]);A(o);U(u.users||[]);J(a.items||[]);B("admin")}catch(e){E(e instanceof Error?e.message:"Нет доступа")}}
 async function logout(){try{await api("/auth/logout",token,{method:"POST"})}catch{}localStorage.removeItem("ai_bragina_token");localStorage.removeItem("ai_bragina_user");onLogout()}
 const groups=[{title:"Внешний вид",rows:[["theme","Тема интерфейса"],["compact","Компактный режим"]]},{title:"Движение и отклик",rows:[["animations","Плавные анимации"],["reduced","Уменьшить движение"],["tap","Звук нажатий"]]},{title:"Уведомления и данные",rows:[["warnings","Предупреждения"],["history","Сохранять историю"],["confirm","Подтверждать действия"]]}],defaults:any={theme:"warm",compact:false,animations:true,reduced:false,tap:false,warnings:true,history:true,confirm:true};
 return <motion.div className="soyuz-screen" key="profile" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}><div className="soyuz-workspace-head"><span className="soyuz-kicker">СОЮЗ // АККАУНТ</span><h1>Профиль</h1><p>Ваше пространство и параметры приложения</p></div><section className="soyuz-profile-card"><div className="soyuz-profile-avatar">{initials(user?.display_name||user?.username)}</div><div><h2>{user?.display_name||user?.username||"Пользователь"}</h2><small>@{user?.username} · {user?.role==="owner"?"Владелец":"Участник"}</small></div><AtomEmblem size={34}/></section><button className="soyuz-plus-card" onClick={onPlus}><span className="soyuz-plus-mark"><Crown size={21}/></span><span><strong>СОЮЗ Плюс</strong><small>{entitlements.plus_active?"Премиальные возможности активны":"Расширенные возможности и привилегии"}</small></span><ArrowRight size={17}/></button><button className="soyuz-setting-link soyuz-recipes-link" onClick={()=>B("recipes")}><ChefHat size={17}/> Мои рецепты и история <ArrowRight size={15}/></button><div className="soyuz-stat-grid">{[["Задачи",stats.tasks],["Рецепты",stats.recipes],["Диагностики",stats.diagnostics]].map(([n,v])=><div><strong>{v}</strong><small>{n}</small></div>)}</div><div className="soyuz-settings-title">Настройки приложения</div>
 {groups.map(g=><section className="soyuz-settings-group"><h3>{g.title}</h3>{g.rows.map(([k,label])=><div className="soyuz-setting-row"><span>{label}</span>{k==="theme"?<button onClick={()=>B("theme")}>{settings.theme||defaults.theme} <ArrowRight size={14}/></button>:<button className={"soyuz-toggle "+((settings[k]??defaults[k])?"on":"")} onClick={()=>setting(k,!((settings[k]??defaults[k])))}><i/></button>}</div>)}</section>)}<section className="soyuz-settings-group"><h3>Системные звуки</h3>{[["start","Начало действия"],["done","Успешное завершение"],["error","Сигнал ошибки"]].map(([k,label])=><div className="soyuz-setting-row"><span>{label}</span><button className={"soyuz-toggle "+((settings[k]??false)?"on":"")} onClick={()=>setting(k,!((settings[k]??false)))}><i/></button></div>)}<div className="soyuz-setting-row"><span>Громкость</span><input type="range" min="0" max="100" value={settings.volume??25} onChange={e=>setting("volume",Number(e.target.value))}/></div></section>
 <section className="soyuz-settings-group"><h3>Аккаунт и безопасность</h3><button className="soyuz-setting-link" onClick={()=>B("account")}>Параметры аккаунта <ArrowRight size={15}/></button>{user?.role==="owner"&&<button className="soyuz-setting-link" onClick={openAdmin}><ShieldCheck size={17}/> Панель администратора <ArrowRight size={15}/></button>}<button className="soyuz-setting-link danger" onClick={logout}><LogOut size={17}/> Выйти из аккаунта</button></section>{error&&<div className="soyuz-error">{error}</div>}
 <Drawer.Root open={!!sheet} onOpenChange={v=>!v&&B("")}><Drawer.Portal><Drawer.Overlay className="soyuz-drawer-overlay"/><Drawer.Content className="soyuz-drawer"><div className="soyuz-drawer__handle"/><div className="soyuz-drawer__heading"><div><span className="soyuz-kicker">СОЮЗ // ПАРАМЕТРЫ</span><Drawer.Title>{sheet==="theme"?"Тема интерфейса":sheet==="admin"?"Администрирование":sheet==="recipes"?"Мои рецепты":"Аккаунт"}</Drawer.Title></div><button onClick={()=>B("")}><X size={19}/></button></div>{sheet==="theme"&&["dark","light","system","warm"].map(v=><button className="soyuz-setting-link" onClick={()=>{setting("theme",v);B("")}}>{({dark:"Обсидиан",light:"Светлая",system:"Как в системе",warm:"Тёплая"} as any)[v]}{settings.theme===v?" · Выбрано":""}</button>)}{sheet==="account"&&<div><p>Логин: @{user?.username}</p><p>Имя: {user?.display_name||"Не задано"}</p><p>Роль: {user?.role==="owner"?"Владелец":"Участник"}</p></div>}{sheet==="recipes"&&<div className="soyuz-history-list">{recipes.length?recipes.map((r:any)=><button key={r.id} onClick={()=>{sessionStorage.setItem("soyuz_restore_conversation",JSON.stringify({id:r.id,kind:"recipe",title:r.title,content:{entry:r}}));B("");openPage("chef")}}><span className="soyuz-history-list__icon"><ChefHat size={17}/></span><span><strong>{r.title||"Рецепт"}</strong><small>{r.date?new Date(r.date).toLocaleString("ru-RU"):"Сохранённый рецепт"}</small></span><ArrowRight size={15}/></button>):<p className="soyuz-muted">Сохранённых рецептов пока нет.</p>}</div>}{sheet==="admin"&&<div className="soyuz-admin-panel"><div className="soyuz-stat-grid">{[["Пользователи",admin?.users],["Активные",admin?.active_users],["Заблокированы",admin?.blocked_users],["Диалоги",admin?.conversations]].map(([n,v])=><div><strong>{v??"—"}</strong><small>{n}</small></div>)}</div><h3>Пользователи</h3>{users.map(u=><div className="soyuz-admin-user"><span><strong>{u.display_name||u.username}</strong><small>@{u.username} · {u.status}</small></span>{u.role!=="owner"&&<><button onClick={async()=>{try{await api("/admin/users/entitlements",token,{method:"POST",body:JSON.stringify({user_id:u.id,action:"add_sparks",amount:100})});const d=await api("/admin/users",token);U(d.users||[])}catch(e){E(e instanceof Error?e.message:"Ошибка начисления")}}}>+100 Искр</button><button onClick={async()=>{try{await api("/admin/users/entitlements",token,{method:"POST",body:JSON.stringify({user_id:u.id,action:u.soyuz_plus_until&&Date.parse(u.soyuz_plus_until)>Date.now()?"remove_plus":"grant_plus",days:30})});const d=await api("/admin/users",token);U(d.users||[])}catch(e){E(e instanceof Error?e.message:"Ошибка СОЮЗ Плюс")}}}>{u.soyuz_plus_until&&Date.parse(u.soyuz_plus_until)>Date.now()?"Снять Plus":"Выдать Plus"}</button><button onClick={async()=>{try{await api("/admin/users/action",token,{method:"POST",body:JSON.stringify({user_id:u.id,action:u.status==="blocked"?"unblock":"block"})});const d=await api("/admin/users",token);U(d.users||[])}catch(e){E(e instanceof Error?e.message:"Ошибка")}}}>{u.status==="blocked"?"Разблокировать":"Блокировать"}</button></>}</div>)}<h3>Журнал действий</h3>{audit.map(a=><p className="soyuz-audit-row">{a.action} · {a.actor_username} → {a.target_username} · {clock(a.created_at)}</p>)}</div>}</Drawer.Content></Drawer.Portal></Drawer.Root></motion.div>}


function PlusDrawer({open,onOpenChange,token}:{open:boolean;onOpenChange:(v:boolean)=>void;token:string}){
 const [tab,T]=useState<"plus"|"sparks">("plus"),[data,D]=useState<Entitlements>({sparks:0,plus_active:false,plus_until:null,invisible_active:false,invisible_until:null}),[error,E]=useState(""),[busy,B]=useState(false);
 useEffect(()=>{if(open)api("/account/entitlements",token).then(D).catch(e=>E(e.message))},[open,token]);
 async function buy(){B(true);E("");try{D(await api("/plus/purchase",token,{method:"POST",body:JSON.stringify({product:"invisible_7d"})}))}catch(e){E(e instanceof Error?e.message:"Не удалось купить опцию")}finally{B(false)}}
 return <Drawer.Root open={open} onOpenChange={onOpenChange}><Drawer.Portal><Drawer.Overlay className="soyuz-drawer-overlay"/><Drawer.Content className="soyuz-drawer soyuz-plus-drawer"><div className="soyuz-drawer__handle"/><div className="soyuz-drawer__heading"><div><span className="soyuz-kicker">ПРЕМИАЛЬНЫЙ ДОСТУП</span><Drawer.Title>СОЮЗ Плюс</Drawer.Title></div><button onClick={()=>onOpenChange(false)}><X size={19}/></button></div><div className="soyuz-plus-balance"><Zap size={17}/> Баланс: <strong>{data.sparks} Искр</strong></div><div className="soyuz-mode-switch"><button className={tab==="plus"?"active":""} onClick={()=>T("plus")}>Подписка Плюс</button><button className={tab==="sparks"?"active":""} onClick={()=>T("sparks")}>За Искры</button></div>{tab==="plus"? <><div className="soyuz-plus-hero"><Crown size={27}/><strong>Все возможности СОЮЗ</strong><p>Режим невидимки, приоритет AI-агентов и значок СОЮЗ + у имени.</p>{data.plus_active?<span>Активна до {data.plus_until?new Date(data.plus_until).toLocaleDateString("ru-RU"):"—"}</span>:<small>Платёжный провайдер пока не подключён. Сейчас подписку можно выдать из панели администратора.</small>}</div></>:<div className="soyuz-plus-option"><div><strong>Невидимка на 7 дней</strong><small>Скрывает онлайн-статус и отключает индикаторы активности</small></div><b>50 ✦</b><button className="soyuz-primary" disabled={busy||data.invisible_active} onClick={buy}>{data.invisible_active?"Уже активно":busy?"Покупаем…":"Купить за 50 Искр"}</button></div>}{error&&<p className="soyuz-error">{error}</p>}</Drawer.Content></Drawer.Portal></Drawer.Root>
}

function App() {
  const [active, setActive] = useState(document.body.dataset.page || "home");
  const [user, setUser] = useState<User | null>(readUser());
  const [authChecked, setAuthChecked] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [plusOpen,setPlusOpen]=useState(false);
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

  const isReactPage = ["home","helpers","chef","mechanic","community","video","profile","settings","admin"].includes(active);
  const legacyHelper = active === "invoice";
  const showReactShell = authenticated && authChecked && isReactPage;

  return (
    <>
      <AnimatePresence mode="wait">
        {!authChecked ? <motion.div key="loading" className="soyuz-boot"><div className="soyuz-emblem"><Orbit size={34} /></div><span>СОЮЗ // ЗАГРУЗКА</span></motion.div>
        : !authenticated ? <AuthScreen key="auth" onAuthenticated={u => { setUser(u); window.location.reload(); }} />
        : showReactShell ? <motion.div key={active} className="soyuz-app"><AnimatePresence mode="wait">{active === "home" ? <HomeScreen user={user} token={token} onPlus={()=>setPlusOpen(true)} /> : active === "helpers" ? <AgentsScreen onOpenHistory={() => setHistoryOpen(true)} /> : active === "community" ? <ChatsScreen user={user} token={token} /> : active === "video" ? <VideoScreen /> : active === "profile" || active === "settings" || active === "admin" ? <ProfileScreen user={user} token={token} onPlus={()=>setPlusOpen(true)} onLogout={()=>{setUser(null);setAuthChecked(true);openPage("home")}} /> : <AgentWorkspace agent={active as "chef" | "mechanic"} onBack={() => openPage("helpers")} />}</AnimatePresence></motion.div>
        : legacyHelper ? <div className="soyuz-legacy-intro"><button onClick={() => openPage("helpers")}>← Все агенты</button><span className="soyuz-kicker">СОЮЗ // AI-АГЕНТ</span><h1>{active === "chef" ? "ИИ-Шеф" : active === "mechanic" ? "ИИ-Механик" : "Учёт и инвентаризация"}</h1><p>Рабочий сценарий помощника сохранён без изменения системных инструкций.</p></div>
        : <div className="soyuz-legacy-intro"><span className="soyuz-kicker">СОЮЗ // РАЗДЕЛ</span><h1>{active === "video" ? "Видео" : active === "community" ? "Чаты" : "Профиль"}</h1></div>}
      </AnimatePresence>
      {authenticated && authChecked && (
        <nav className="soyuz-dock" aria-label="Основная навигация">
          {navItems.map(({ id, label, Icon }) => <button key={id} type="button" className={`soyuz-dock__item ${(id === active || (id === "helpers" && (legacyHelper || active === "chef" || active === "mechanic"))) ? "is-active" : ""}`} onClick={() => openPage(id)} aria-current={id === active ? "page" : undefined}>
            {(id === active || (id === "helpers" && (legacyHelper || active === "chef" || active === "mechanic"))) && <motion.span className="soyuz-dock__indicator" layoutId="soyuz-active-tab" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
            <motion.span className="soyuz-dock__icon" whileTap={{ scale: .86 }}><Icon size={19} strokeWidth={id === active ? 2.2 : 1.7} /></motion.span><span className="soyuz-dock__label">{label}</span>
          </button>)}
        </nav>
      )}
      <HistoryDrawer open={historyOpen} onOpenChange={setHistoryOpen} token={token} />
      <PlusDrawer open={plusOpen} onOpenChange={setPlusOpen} token={token} />
    </>
  );
}

export default App;
