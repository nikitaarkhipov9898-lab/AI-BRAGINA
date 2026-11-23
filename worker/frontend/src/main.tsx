import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion } from "motion/react";
import { Drawer } from "vaul";
import { useDrag } from "@use-gesture/react";
import { registerSW } from "virtual:pwa-register";
import { useVirtualizer } from "@tanstack/react-virtual";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { create } from "zustand";
import Dexie, { type Table } from "dexie";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Keyboard } from "@capacitor/keyboard";
import {
  Bell, Search, Home, Newspaper, Users, MessageCircle, Video, Bookmark,
  Settings, Image as ImageIcon, Smile, Send, Heart, MessageSquare,
  Share2, MoreHorizontal, ChevronLeft, ChevronRight, Paperclip, Camera,
  Music2, CalendarDays, Sparkles, LogOut, CheckCheck, Phone, Info,
  Flame, UserRound, X, WandSparkles, Zap, CirclePlay
} from "lucide-react";
import "./styles.css";
import { connectSvoeRealtime, enableSvoePush, type RealtimeStatus } from "./lib/mobile-services";

type Tab = "home" | "feed" | "friends" | "messages" | "video" | "services" | "saved" | "settings";
type ChatMessage = { id: number; chatId: number; mine: boolean; text: string; time: string };
type ChatPerson = { id: number; name: string; avatar: string; color: string; online: boolean; preview: string; time: string; unread?: number };
type Post = { id: number; name: string; avatar: string; time: string; text: string; image?: string; likes: number; comments: number; liked?: boolean; verified?: boolean };

class SvoeDatabase extends Dexie {
  messages!: Table<ChatMessage, number>;
  constructor() {
    super("svoe-mobile-preview");
    this.version(1).stores({ messages: "id, chatId, time" });
  }
}
const db = new SvoeDatabase();
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } });
registerSW({ immediate: true });

type AppState = { tab: Tab; setTab: (tab: Tab) => void };
const useAppStore = create<AppState>((set) => ({ tab: "home", setTab: (tab) => set({ tab }) }));

const people: ChatPerson[] = [
  { id: 1, name: "Александр Петров", avatar: "АП", color: "blue", online: true, preview: "Посмотрел, давай обсудим!", time: "12:42", unread: 2 },
  { id: 2, name: "Команда СВОЁ", avatar: "С", color: "violet", online: true, preview: "Мария: отправила файлы", time: "11:18", unread: 4 },
  { id: 3, name: "Мария Иванова", avatar: "МИ", color: "pink", online: false, preview: "Спасибо! Тогда на связи", time: "Вчера" },
  { id: 4, name: "Илья Смирнов", avatar: "ИС", color: "green", online: false, preview: "Голосовое сообщение · 0:18", time: "Вчера" },
  { id: 5, name: "Избранное", avatar: "★", color: "gold", online: false, preview: "Ваши заметки и сохранённое", time: "Пн" },
  { id: 6, name: "Анна", avatar: "А", color: "orange", online: true, preview: "Отличная идея ✨", time: "Вс" },
];
const seedMessages: ChatMessage[] = [
  { id: 101, chatId: 1, mine: false, text: "Привет! Посмотрел новую концепцию. Очень интересно выглядит.", time: "12:35" },
  { id: 102, chatId: 1, mine: true, text: "Здорово! Хочу сначала проверить главную и сообщения, а потом перенести сюда наши функции.", time: "12:37" },
  { id: 103, chatId: 1, mine: false, text: "Отличный план. Я собрал несколько мыслей по навигации, могу прислать.", time: "12:42" },
];
const initialPosts: Post[] = [
  { id: 1, name: "Команда СВОЁ", avatar: "С", time: "15 минут назад", text: "Знакомьтесь с новым пространством для своих идей, общения и полезных дел. Мы строим платформу, где нужные инструменты всегда под рукой. 💙", image: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1200&auto=format&fit=crop&q=80", likes: 128, comments: 24, verified: true },
  { id: 2, name: "Александр Петров", avatar: "АП", time: "1 час назад", text: "Иногда лучший способ продвинуться — просто начать. Маленькие шаги каждый день дают большой результат.", likes: 36, comments: 8 },
  { id: 3, name: "Мария Иванова", avatar: "МИ", time: "Вчера", text: "Собрала подборку полезных идей на неделю. Сохраняйте, чтобы не потерять ✨", image: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1200&auto=format&fit=crop&q=80", likes: 74, comments: 13 },
];
const stories = [
  { name: "Добавить", avatar: "+", color: "add" }, { name: "Александр", avatar: "АП", color: "blue" },
  { name: "Мария", avatar: "МИ", color: "pink" }, { name: "Команда", avatar: "С", color: "violet" },
  { name: "Анна", avatar: "А", color: "orange" }, { name: "Илья", avatar: "ИС", color: "green" },
];
const nav = [
  { id: "home" as Tab, label: "Моя страница", icon: UserRound },
  { id: "feed" as Tab, label: "Новости", icon: Newspaper },
  { id: "messages" as Tab, label: "Мессенджер", icon: MessageCircle, count: 6 },
  { id: "friends" as Tab, label: "Друзья", icon: Users },
  { id: "video" as Tab, label: "Видео", icon: Video },
  { id: "services" as Tab, label: "Сервисы", icon: Sparkles },
  { id: "saved" as Tab, label: "Закладки", icon: Bookmark },
  { id: "settings" as Tab, label: "Настройки", icon: Settings },
];

function haptic() {
  if (Capacitor.isNativePlatform()) void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
}
function transitionTo(action: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(action);
  else action();
}
function Avatar({ label, color = "blue", online = false, size = "" }: { label: string; color?: string; online?: boolean; size?: string }) {
  return <span className={`avatar ${color} ${online ? "online" : ""} ${size}`}>{label}</span>;
}
function App() {
  const tab = useAppStore((s) => s.tab);
  const setTab = useAppStore((s) => s.setTab);
  const [posts, setPosts] = useState(initialPosts);
  const [selectedChat, setSelectedChat] = useState(1);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(seedMessages);
  const [draft, setDraft] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [postDraft, setPostDraft] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [likedComments, setLikedComments] = useState<number[]>([]);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("disabled");
  const messageParent = useRef<HTMLDivElement>(null);
  const activePerson = people.find((p) => p.id === selectedChat) ?? people[0];
  const filteredPeople = useMemo(() => people.filter((p) => (p.name + " " + p.preview).toLowerCase().includes(chatSearch.toLowerCase())), [chatSearch]);
  const chatVirtualizer = useVirtualizer({ count: filteredPeople.length, getScrollElement: () => messageParent.current, estimateSize: () => 66, overscan: 6 });

  useEffect(() => {
    void db.messages.bulkPut(seedMessages).catch(() => {});
    void db.messages.toArray().then((stored) => {
      if (stored.length) setMessages(stored);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (messages.length) void db.messages.bulkPut(messages).catch(() => {});
  }, [messages]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = Keyboard.addListener("keyboardWillShow", () => document.body.classList.add("keyboard-open"));
    const hide = Keyboard.addListener("keyboardWillHide", () => document.body.classList.remove("keyboard-open"));
    return () => { void listener.then((l) => l.remove()); void hide.then((l) => l.remove()); };
  }, []);
  useEffect(() => connectSvoeRealtime(setRealtimeStatus), []);
  useEffect(() => connectSvoeRealtime(setRealtimeStatus), []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const swipeBind = useDrag(({ swipe: [sx] }) => {
    if (sx === -1 && tab === "home") setTab("feed");
    if (sx === 1 && tab === "feed") setTab("home");
  }, { axis: "x", filterTaps: true });

  function go(next: Tab) { haptic(); transitionTo(() => setTab(next)); }
  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    haptic();
    const message = { id: Date.now(), chatId: selectedChat, mine: true, text: draft.trim(), time: new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(new Date()) };
    setMessages((old) => [...old, message]);
    setDraft("");
  }
  function publishPost() {
    if (!postDraft.trim()) return;
    setPosts((old) => [{ id: Date.now(), name: "Моя страница", avatar: "С", time: "только что", text: postDraft.trim(), likes: 0, comments: 0 }, ...old]);
    setPostDraft(""); setDrawerOpen(false); setToast("Запись добавлена в тестовую ленту"); haptic();
  }
  function likePost(id: number) {
    setPosts((old) => old.map((p) => p.id === id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p));
    haptic();
  }

  return <div className="app-shell" {...swipeBind()}>
    <header className="topbar"><div className="topbar-inner">
      <button className="brand" onClick={() => go("home")}><span className="brand-mark">с</span> СВОЁ</button>
      <label className="global-search"><Search size={17}/><input value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} placeholder="Поиск по СВОЁ"/></label>
      <div className="topbar-actions">
        <button className="icon-btn" onClick={async () => { try { const permission = await Notification.requestPermission(); if (permission !== "granted") { setToast("Разрешение на уведомления не выдано"); return; } const token = await enableSvoePush(); setToast(token ? "Устройство зарегистрировано для push. Осталось подключить серверную отправку." : "Push не настроен"); } catch (error) { setToast(error instanceof Error ? error.message : "Не удалось включить уведомления"); } }} aria-label="Включить уведомления"><Bell size={19}/></button>
        <button className="icon-btn" onClick={() => go("messages")} aria-label="Сообщения"><MessageCircle size={19}/></button><span title={realtimeStatus === "connected" ? "Realtime подключён" : "Realtime не настроен"} style={{ width: 7, height: 7, borderRadius: "50%", background: realtimeStatus === "connected" ? "#4bb34b" : "#c5ccd3" }}/>
        <button className="user-mini" onClick={() => go("home")}><Avatar label="Н" size="small"/> <span>Моя страница</span></button>
      </div>
    </div></header>

    <div className="layout">
      <aside className="left-nav">
        {nav.map(({ id, label, icon: Icon, count }) => <button key={id} className={`nav-link ${tab === id ? "active" : ""}`} onClick={() => go(id)}><Icon size={19}/><span>{label}</span>{count && <span className="count">{count}</span>}</button>)}
        <div className="nav-divider"/>
        <button className="nav-link" onClick={() => setToast("Профиль демо-режима")}><LogOut size={18}/><span>Профиль</span></button>
      </aside>

      <main className="center-column">
        <AnimatePresence mode="wait">
          {tab === "messages" ? <motion.section key="messages" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className={`surface chat-layout ${mobileChatOpen ? "mobile-chat-open" : ""}`}>
            <div className="chat-list">
              <div className="chat-search"><input value={chatSearch} onChange={(e) => setChatSearch(e.target.value)} placeholder="Поиск сообщений"/></div>
              <div ref={messageParent} style={{ height: 530, overflow: "auto" }}>
                <div style={{ height: chatVirtualizer.getTotalSize(), position: "relative" }}>
                  {chatVirtualizer.getVirtualItems().map((item) => {
                    const p = filteredPeople[item.index];
                    return <button key={p.id} className={`chat-person ${selectedChat === p.id ? "active" : ""}`} onClick={() => { setSelectedChat(p.id); setMobileChatOpen(true); haptic(); }} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: item.size, transform: `translateY(${item.start}px)` }}>
                      <Avatar label={p.avatar} color={p.color} online={p.online}/><span className="chat-person-copy"><b>{p.name}</b><small>{p.preview}</small></span>
                      {p.unread ? <span className="count">{p.unread}</span> : null}
                    </button>;
                  })}
                </div>
              </div>
            </div>
            <div className="chat-window">
              <div className="chat-head"><button className="chat-back" onClick={() => setMobileChatOpen(false)}><ChevronLeft size={19}/></button><Avatar label={activePerson.avatar} color={activePerson.color} online={activePerson.online}/><div><strong>{activePerson.name}</strong><div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{activePerson.online ? "в сети" : "был(а) недавно"}</div></div><div style={{ marginLeft: "auto", display: "flex", gap: 5 }}><button className="icon-btn" onClick={() => setToast("Звонки подключим через серверный модуль")}><Phone size={18}/></button><button className="icon-btn" onClick={() => setToast("Информация о диалоге")}><Info size={18}/></button></div></div>
              <div className="chat-messages"><div className="chat-day">СЕГОДНЯ</div>
                {messages.filter((m) => m.chatId === selectedChat).map((m) => <div key={m.id} className={`msg ${m.mine ? "mine" : ""}`}>{m.text}<time>{m.time} {m.mine ? <CheckCheck size={11} style={{ verticalAlign: "middle" }}/> : null}</time></div>)}
              </div>
              <form className="chat-send" onSubmit={sendMessage}><button type="button" className="icon-btn" onClick={() => setToast("Вложения подключим к файловому хранилищу")}><Paperclip size={18}/></button><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Напишите сообщение..."/><button type="submit" aria-label="Отправить"><Send size={17}/></button></form>
            </div>
          </motion.section> :
          tab === "home" || tab === "feed" ? <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="feed-page">
            {tab === "home" && <section className="surface profile-card"><div className="profile-cover"/><div className="profile-summary"><div className="profile-avatar-row"><div className="profile-avatar">Н</div><button className="primary-btn" onClick={() => setToast("Редактирование профиля подключим к вашему аккаунту")}>Редактировать</button></div><h1 className="profile-name">Моя страница</h1><div className="profile-status">Добро пожаловать в своё пространство ✨</div></div></section>}
            {tab === "feed" && <h1 className="section-heading">Новости</h1>}
            <section className="surface stories">{stories.map((s) => <button key={s.name} className={`story ${s.color === "add" ? "add" : ""}`} onClick={() => { setToast(s.name === "Добавить" ? "Создание истории доступно в следующем этапе" : `История: ${s.name}`); }}><span className="story-ring"><span>{s.avatar}</span></span><span>{s.name}</span></button>)}</section>
            <section className="surface feed-composer"><div className="composer-top"><Avatar label="Н"/><button className="soft-action" style={{ flex: 1, justifyContent: "flex-start", background: "#f0f2f5", borderRadius: 22, padding: "11px 15px" }} onClick={() => setDrawerOpen(true)}>Что у вас нового?</button></div><div className="composer-actions"><button className="soft-action" onClick={() => setDrawerOpen(true)}><ImageIcon size={17} color="#4bb34b"/> Фото</button><button className="soft-action" onClick={() => setToast("Видео добавим вместе с медиахранилищем")}><CirclePlay size={17} color="#e64646"/> Видео</button><button className="soft-action" onClick={() => setToast("Музыка появится в медиаразделе")}><Music2 size={17} color="#9b6ad6"/> Музыка</button><button className="soft-action" onClick={() => setToast("Создание события")}><CalendarDays size={17} color="#e3a33a"/> Событие</button></div></section>
            {posts.map((post) => <article className="surface post" key={post.id}>
              <div className="post-head"><Avatar label={post.avatar} color={post.avatar === "МИ" ? "pink" : post.avatar === "С" ? "violet" : "blue"}/><div><div className="post-author">{post.name} {post.verified && <span style={{ color: "#2787f5" }}>✓</span>}</div><div className="post-meta">{post.time} · <span>🌐</span></div></div><button className="icon-btn post-more" onClick={() => setToast("Действия с публикацией")}><MoreHorizontal size={19}/></button></div>
              <div className="post-copy">{post.text}</div>
              {post.image && <img className="post-image" src={post.image} loading="lazy" alt="Иллюстрация к публикации"/>}
              <div className="post-footer"><div className="post-actions"><button className={`post-action ${post.liked ? "liked" : ""}`} onClick={() => likePost(post.id)}><Heart size={18} fill={post.liked ? "currentColor" : "none"}/>{post.likes}</button><button className="post-action" onClick={() => setToast("Комментарии появятся после подключения обсуждений")}><MessageSquare size={17}/>{post.comments}</button><button className="post-action" onClick={() => setToast("Ссылка на запись скопирована в тестовом режиме")}><Share2 size={17}/></button></div><button className="post-action" onClick={() => setLikedComments((v) => v.includes(post.id) ? v.filter((x) => x !== post.id) : [...v, post.id])}><Bookmark size={17} fill={likedComments.includes(post.id) ? "currentColor" : "none"}/></button></div>
            </article>)}
          </motion.div> :
          <motion.section key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="surface widget">
            <h1 className="section-heading">{nav.find((n) => n.id === tab)?.label ?? "Раздел"}</h1>
            {tab === "friends" ? people.map((p) => <div className="contact-row" key={p.id}><Avatar label={p.avatar} color={p.color} online={p.online}/><div><strong>{p.name}</strong><span>{p.online ? "Сейчас в сети" : "Недавно был(а) в сети"}</span></div><button className="primary-btn" style={{ marginLeft: "auto" }} onClick={() => { setSelectedChat(p.id); go("messages"); }}>Написать</button></div>) :
            tab === "services" ? <div className="empty-state"><Sparkles size={30}/><p>Помощники, инструменты и сервисы СВОЁ появятся здесь.</p></div> :
            tab === "video" ? <div className="empty-state"><Video size={30}/><p>Видеораздел готовится к подключению медиасервиса.</p></div> :
            tab === "saved" ? <div className="empty-state"><Bookmark size={30}/><p>Сохраняйте публикации, чтобы вернуться к ним позже.</p></div> :
            <div className="empty-state"><Settings size={30}/><p>Настройки аккаунта и приложения останутся связанными с действующей системой.</p></div>}
          </motion.section>}
        </AnimatePresence>
      </main>

      <aside className="right-column">
        <section className="surface widget"><h3 className="widget-title">Друзья онлайн <span className="muted">· 3</span></h3>{people.filter((p) => p.online).slice(0, 4).map((p) => <div className="contact-row" key={p.id}><Avatar label={p.avatar} color={p.color} online/><div><strong>{p.name}</strong><span>Сейчас в сети</span></div></div>)}<button className="soft-action" onClick={() => go("friends")}>Показать всех <ChevronRight size={14}/></button></section>
        <section className="surface widget"><h3 className="widget-title">Популярное сегодня</h3><div className="trend-row"><b><Flame size={13} style={{ display: "inline" }}/> #своёпространство</b><small>2,4 тыс. публикаций</small></div><div className="trend-row"><b>#идеи</b><small>1,8 тыс. публикаций</small></div><div className="trend-row"><b>#вдохновение</b><small>980 публикаций</small></div></section>
        <section className="surface widget"><h3 className="widget-title">Сервисы СВОЁ</h3><div className="contact-row"><span className="avatar violet"><WandSparkles size={18}/></span><div><strong>ИИ-помощники</strong><span>Помогают решать задачи</span></div></div><div className="contact-row"><span className="avatar green"><Zap size={18}/></span><div><strong>Мои инструменты</strong><span>Всё нужное рядом</span></div></div><button className="soft-action" onClick={() => go("services")}>Открыть сервисы <ChevronRight size={14}/></button></section>
      </aside>
    </div>

    <nav className="mobile-bottom">{[{ id: "home" as Tab, label: "Главная", icon: Home }, { id: "feed" as Tab, label: "Новости", icon: Newspaper }, { id: "messages" as Tab, label: "Чаты", icon: MessageCircle }, { id: "friends" as Tab, label: "Друзья", icon: Users }, { id: "services" as Tab, label: "Сервисы", icon: Sparkles }].map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? "active" : ""} onClick={() => go(id)}><Icon size={20}/><span>{label}</span></button>)}</nav>

    <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
      <Drawer.Portal><Drawer.Overlay style={{ position: "fixed", inset: 0, background: "#11182766", zIndex: 50 }}/>
        <Drawer.Content style={{ position: "fixed", zIndex: 51, bottom: 0, left: 0, right: 0, background: "#fff", borderRadius: "18px 18px 0 0", padding: "12px 18px calc(20px + env(safe-area-inset-bottom))", maxWidth: 720, margin: "0 auto" }}>
          <div style={{ width: 38, height: 4, borderRadius: 5, background: "#d9dfe6", margin: "0 auto 17px" }}/>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Drawer.Title style={{ fontSize: 18, fontWeight: 750 }}>Новая запись</Drawer.Title><button className="icon-btn" onClick={() => setDrawerOpen(false)}><X size={18}/></button></div>
          <textarea value={postDraft} onChange={(e) => setPostDraft(e.target.value)} placeholder="Расскажите, что у вас нового..." style={{ width: "100%", minHeight: 130, border: 0, resize: "vertical", outline: 0, padding: "16px 0", font: "inherit", fontSize: 15 }}/>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ display: "flex", gap: 12, color: "#818c99" }}><ImageIcon size={19}/><Camera size={19}/><Smile size={19}/></div><button className="primary-btn" onClick={publishPost}>Опубликовать</button></div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
    <AnimatePresence>{toast && <motion.div className="toast" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>{toast}</motion.div>}</AnimatePresence>
  </div>;
}

function Root() {
  return <QueryClientProvider client={queryClient}><App/></QueryClientProvider>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Root/></React.StrictMode>);
