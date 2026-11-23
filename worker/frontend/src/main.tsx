import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight, Bell, CalendarDays, Check, ChevronRight, CircleHelp,
  Command, FileText, Home, Inbox, Menu, MessageCircle, Plus, Search,
  Settings, Sparkles, Video, WalletCards, X
} from "lucide-react";
import "./styles.css";

type NavItem = { id: string; label: string; icon: React.ComponentType<{size?:number;strokeWidth?:number}> };
const navItems: NavItem[] = [
  { id: "home", label: "Главная", icon: Home },
  { id: "helpers", label: "Помощники", icon: Sparkles },
  { id: "video", label: "Видео", icon: Video },
  { id: "messages", label: "Сообщения", icon: MessageCircle },
  { id: "tasks", label: "Дела", icon: CalendarDays },
];
const initialTasks = [
  { id: 1, time: "09:30", title: "Проверить список дел на сегодня", tag: "Личное", done: false },
  { id: 2, time: "12:00", title: "Подготовить документы по проекту", tag: "Работа", done: false },
  { id: 3, time: "16:30", title: "Связаться с командой", tag: "Команда", done: true },
];

function App() {
  const [active, setActive] = useState("home");
  const [prompt, setPrompt] = useState("");
  const [tasks, setTasks] = useState(initialTasks);
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const completed = tasks.filter((task) => task.done).length;
  const date = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  function notify(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }
  function submitPrompt(event: React.FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) return;
    notify("Поле уже готово. Подключение помощников добавим следующим этапом.");
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="#home" onClick={(event) => { event.preventDefault(); setActive("home"); }}>
          <span className="brand-symbol"><span /></span>
          <span className="brand-copy"><strong>СВОЁ</strong><small>МЕСТО ДЛЯ СВОИХ</small></span>
        </a>
        <div className="topbar-right">
          <span className="mode-label"><i /> ТЕСТОВЫЙ РЕЖИМ</span>
          <button className="icon-button notification-button" aria-label="Уведомления" onClick={() => notify("Уведомления появятся здесь.")}><Bell size={19}/><span /></button>
          <button className="avatar" aria-label="Профиль" onClick={() => notify("Профиль подключим к существующей авторизации.")}>С</button>
        </div>
      </header>

      <div className="ticker" aria-label="Новости платформы">
        <div className="ticker-track">
          <span>СВОЁ — МЕСТО ДЛЯ СВОИХ</span><b>✳</b><span>ПЛАТФОРМА В ТЕСТОВОМ РЕЖИМЕ</span><b>✳</b><span>МЫ СОЗДАЁМ НОВЫЕ ВОЗМОЖНОСТИ</span><b>✳</b>
          <span>СВОЁ — МЕСТО ДЛЯ СВОИХ</span><b>✳</b><span>ПЛАТФОРМА В ТЕСТОВОМ РЕЖИМЕ</span><b>✳</b><span>МЫ СОЗДАЁМ НОВЫЕ ВОЗМОЖНОСТИ</span><b>✳</b>
        </div>
      </div>

      <main className="main-content">
        <section className="welcome-row">
          <div>
            <p className="eyebrow">{date}</p>
            <h1>Всё важное.<br/><em>В одном месте.</em></h1>
            <p className="welcome-subtitle">Пространство, где идеи превращаются в дела.</p>
          </div>
          <div className="welcome-mark" aria-hidden="true">
            <div className="mark-orbit orbit-a" /><div className="mark-orbit orbit-b" />
            <div className="mark-core"><span>С</span></div>
            <span className="mark-star star-a">✳</span><span className="mark-star star-b">✦</span>
          </div>
        </section>

        <section className="command-section">
          <div className="section-kicker"><Sparkles size={15}/> ВАША ТОЧКА СТАРТА</div>
          <form className="command-box" onSubmit={submitPrompt}>
            <div className="command-icon"><Command size={20}/></div>
            <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Что нужно сделать?" aria-label="Что нужно сделать?" />
            <button type="submit" className="send-button" aria-label="Продолжить"><ArrowUpRight size={21}/></button>
          </form>
          <div className="command-hint"><span>Опишите задачу обычными словами</span><span className="hint-shortcut"><Search size={13}/> Поможем найти решение</span></div>
        </section>

        <section className="today-section">
          <div className="section-heading">
            <div><p className="eyebrow">ВАШ РИТМ</p><h2>Сегодня</h2></div>
            <button className="text-action" onClick={() => setActive("tasks")}>Все дела <ArrowUpRight size={16}/></button>
          </div>
          <div className="today-layout">
            <div className="progress-panel">
              <div className="progress-top"><span>План на день</span><span className="progress-count">{completed}<i> / </i>{tasks.length}</span></div>
              <div className="progress-track"><span style={{width: tasks.length ? (completed/tasks.length*100)+"%" : "0%"}} /></div>
              <div className="progress-bottom"><span>{completed === tasks.length ? "Отличная работа!" : "Шаг за шагом — к результату"}</span><span>{tasks.length ? Math.round(completed/tasks.length*100) : 0}%</span></div>
              <div className="progress-decoration"><CalendarDays size={17}/><span>День под контролем</span></div>
            </div>
            <div className="task-list">
              {tasks.map((task) => (
                <button className={"task-row"+(task.done ? " is-done" : "")} key={task.id} onClick={() => setTasks((current) => current.map((item) => item.id === task.id ? {...item, done: !item.done} : item))}>
                  <span className="task-check">{task.done && <Check size={13}/>}</span>
                  <span className="task-main"><strong>{task.title}</strong><small>{task.tag}</small></span>
                  <time>{task.time}</time>
                </button>
              ))}
              <button className="add-task" onClick={() => notify("Создание и сохранение дел подключим к вашему аккаунту.")}><Plus size={16}/> Добавить дело</button>
            </div>
          </div>
        </section>

        <section className="workspace-strip">
          <div className="workspace-copy"><span className="workspace-icon"><Inbox size={18}/></span><div><p className="eyebrow">ВАШЕ ПРОСТРАНСТВО</p><h3>Ничего не теряется</h3><p>Сообщения, документы и задачи — рядом, когда нужны.</p></div></div>
          <button className="round-arrow" aria-label="Открыть пространство" onClick={() => notify("Общие рабочие пространства появятся в следующем этапе.")}><ChevronRight size={20}/></button>
        </section>

        <section className="footer-note"><span>СВОЁ</span><i/> Создаём полезное вместе</section>
      </main>

      <nav className="bottom-nav" aria-label="Основная навигация">
        {navItems.map(({id,label,icon:Icon}) => (
          <button key={id} className={"nav-item"+(active===id ? " active" : "")} onClick={() => {setActive(id); if(id!=="home") notify("Раздел «"+label+"» подключим к существующим функциям.");}}>
            <Icon size={20} strokeWidth={active===id ? 2.2 : 1.7}/><span>{label}</span>
          </button>
        ))}
        <button className={"nav-item nav-more"+(menuOpen ? " active" : "")} onClick={() => setMenuOpen(!menuOpen)}><Menu size={20}/><span>Ещё</span></button>
      </nav>
      <AnimatePresence>
        {menuOpen && <motion.div className="more-menu" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:12}}><button onClick={() => notify("Настройки подключим на следующем этапе.")}><Settings size={17}/> Настройки</button><button onClick={() => notify("Документы появятся в рабочем пространстве.")}><FileText size={17}/> Документы</button><button onClick={() => notify("Справочный центр готовится.")}><CircleHelp size={17}/> Помощь</button><button onClick={() => setMenuOpen(false)}><X size={17}/> Закрыть</button></motion.div>}
      </AnimatePresence>
      <AnimatePresence>{notice && <motion.div className="toast" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:8}}>{notice}</motion.div>}</AnimatePresence>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
