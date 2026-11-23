import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight, Bell, CalendarDays, Check, ChevronDown, ChevronLeft,
  Command, Home, MessageCircle, MoreHorizontal, Paperclip, Plus, Search,
  Send, Settings, Smile, Sparkles, Video, Zap, Image, Pin
} from "lucide-react";
import "./styles.css";

type IconType = React.ComponentType<{size?:number;strokeWidth?:number}>;
type NavItem = { id:string; label:string; icon:IconType };
const navItems:NavItem[]=[
  {id:"home",label:"Обзор",icon:Home},
  {id:"helpers",label:"Помощники",icon:Sparkles},
  {id:"video",label:"Медиа",icon:Video},
  {id:"messages",label:"Сообщения",icon:MessageCircle},
  {id:"tasks",label:"Мои дела",icon:CalendarDays},
];
const people=[
  {id:1,name:"Александр",letter:"А",color:"lavender",message:"Посмотрел макет, есть пара идей",time:"12:42",unread:2,online:true},
  {id:2,name:"Команда проекта",letter:"К",color:"peach",message:"Мария: отправила файлы",time:"11:18",unread:4,online:false},
  {id:3,name:"Мария",letter:"М",color:"mint",message:"Спасибо! Тогда на связи",time:"Вчера",unread:0,online:true},
  {id:4,name:"Илья",letter:"И",color:"blue",message:"Голосовое сообщение · 0:18",time:"Вчера",unread:0,online:false},
  {id:5,name:"Избранное",letter:"★",color:"yellow",message:"Заметки и сохранённое",time:"Пн",unread:0,online:false},
];
type Message={id:number;mine:boolean;text:string;time:string};
const initialMessages:Message[]=[
  {id:1,mine:false,text:"Привет! Посмотрел новую концепцию. Очень интересно выглядит.",time:"12:35"},
  {id:2,mine:true,text:"Здорово! Хочу сначала проверить главную и сообщения, а потом перенести сюда наши функции.",time:"12:37"},
  {id:3,mine:false,text:"Отличный план. Я собрал несколько мыслей по навигации, могу прислать.",time:"12:42"},
];
const tasks=[
  {time:"10:30",title:"Разобрать входящие сообщения",tag:"Личное",done:true},
  {time:"14:00",title:"Продумать следующий этап проекта",tag:"Проект",done:false},
  {time:"16:30",title:"Проверить новые идеи",tag:"Планирование",done:false},
];
function App(){
  const [active,setActive]=useState("home");
  const [query,setQuery]=useState("");
  const [chatSearch,setChatSearch]=useState("");
  const [selected,setSelected]=useState(1);
  const [chatMobileOpen,setChatMobileOpen]=useState(false);
  const [draft,setDraft]=useState("");
  const [messages,setMessages]=useState(initialMessages);
  const [done,setDone]=useState<number[]>([0]);
  const [notice,setNotice]=useState("");
  const [profileOpen,setProfileOpen]=useState(false);
  const selectedPerson=people.find(p=>p.id===selected)??people[0];
  const filteredPeople=useMemo(()=>people.filter(p=>(p.name+" "+p.message).toLowerCase().includes(chatSearch.toLowerCase())),[chatSearch]);
  function toast(s:string){setNotice(s);window.setTimeout(()=>setNotice(""),2400)}
  function sendMessage(e:React.FormEvent){e.preventDefault();if(!draft.trim())return;setMessages(v=>[...v,{id:Date.now(),mine:true,text:draft.trim(),time:new Intl.DateTimeFormat("ru-RU",{hour:"2-digit",minute:"2-digit"}).format(new Date())}]);setDraft("");}
  const date=new Intl.DateTimeFormat("ru-RU",{weekday:"long",day:"numeric",month:"long"}).format(new Date());
  return <div className="studio">
    <div className="grain"/>
    <aside className="rail">
      <button className="brand-mark" onClick={()=>setActive("home")} aria-label="На главную"><span>с.</span></button>
      <div className="rail-links">{navItems.map(({id,label,icon:Icon})=><button key={id} title={label} className={active===id?"rail-link selected":"rail-link"} onClick={()=>setActive(id)}><Icon size={20}/><span>{label}</span></button>)}</div>
      <div className="rail-bottom"><button className="rail-link" onClick={()=>toast("Настройки подключим к существующему модулю.")}><Settings size={20}/><span>Настройки</span></button><button className="mini-avatar" onClick={()=>setProfileOpen(!profileOpen)}>С</button></div>
    </aside>
    <header className="mobile-head"><button className="brand-mark" onClick={()=>setActive("home")}>с.</button><span className="mobile-title">СВОЁ <i>STUDIO</i></span><button className="round-icon" onClick={()=>toast("Новых уведомлений пока нет")}><Bell size={19}/></button></header>
    <div className="workspace">
      <header className="topline"><div className="crumb"><span>ПРОСТРАНСТВО</span><ChevronDown size={14}/><b>{active==="messages"?"Сообщения":active==="home"?"Обзор":navItems.find(n=>n.id===active)?.label}</b></div><div className="top-actions"><span className="lab-tag"><i/> ЭКСПЕРИМЕНТАЛЬНЫЙ ДИЗАЙН</span><button className="round-icon" onClick={()=>toast("Уведомления появятся здесь")}><Bell size={18}/><i/></button><button className="user-chip" onClick={()=>setProfileOpen(!profileOpen)}><span className="user-dot">С</span><span>Мой профиль</span><ChevronDown size={14}/></button></div></header>
      <AnimatePresence mode="wait">
      {active==="messages"?<motion.main key="messages" className="page messages-page" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.24}}>
        <div className="page-heading messages-heading"><div><div className="overline">ВАШИ КОНТАКТЫ И ДИАЛОГИ</div><h1>Сообщения<span className="heading-dot">.</span></h1><p>Все разговоры — в одном пространстве.</p></div><button className="primary-button" onClick={()=>toast("Создание нового чата подключим к существующим сообщениям")}><Plus size={17}/> Новый диалог</button></div>
        <div className={"chat-workspace"+(chatMobileOpen?" show-chat":"")}>
          <section className="chat-list-panel">
            <div className="chat-list-top"><div className="chat-filter"><Search size={17}/><input value={chatSearch} onChange={e=>setChatSearch(e.target.value)} placeholder="Поиск диалогов"/></div><button className="subtle-icon" onClick={()=>toast("Фильтры диалогов")}><MoreHorizontal size={19}/></button></div>
            <div className="chat-tabs"><button className="active">Все <b>5</b></button><button onClick={()=>toast("Фильтр непрочитанных")}>Непрочитанные</button><button onClick={()=>toast("Избранное")}>Избранное</button></div>
            <div className="people-list">{filteredPeople.map(p=><button key={p.id} className={"person-row "+(selected===p.id?"current":"")} onClick={()=>{setSelected(p.id);setChatMobileOpen(true)}}><span className={"person-avatar "+p.color}>{p.letter}{p.online&&<i/>}</span><span className="person-copy"><strong>{p.name}</strong><small>{p.message}</small></span><span className="person-meta"><time>{p.time}</time>{p.unread>0&&<b>{p.unread}</b>}</span></button>)}</div>
            <div className="list-foot"><span><span className="online-dot"/> 2 человека онлайн</span><button onClick={()=>toast("Управление контактами")}>Контакты <ArrowUpRight size={13}/></button></div>
          </section>
          <section className="conversation">
            <div className="conversation-head"><button className="chat-back" onClick={()=>setChatMobileOpen(false)} aria-label="Назад"><ChevronLeft size={19}/></button><div className={"person-avatar "+selectedPerson.color}>{selectedPerson.letter}{selectedPerson.online&&<i/>}</div><div className="conversation-name"><strong>{selectedPerson.name}</strong><small>{selectedPerson.online?"В сети":"Был(а) недавно"}</small></div><div className="conversation-tools"><button className="subtle-icon" onClick={()=>toast("Поиск по переписке")}><Search size={18}/></button><button className="subtle-icon" onClick={()=>toast("Дополнительные действия")}><MoreHorizontal size={19}/></button></div></div>
            <div className="pinned-note"><Pin size={14}/><span>Закреплённое сообщение</span><b>План обсуждения проекта</b><ChevronDown size={14}/></div>
            <div className="message-stream"><div className="day-separator"><span>СЕГОДНЯ</span></div>{messages.map(m=><motion.div layout key={m.id} className={"bubble-wrap "+(m.mine?"mine":"")}><div className={"bubble "+(m.mine?"outgoing":"incoming")}>{m.text}<time>{m.time}{m.mine&&<Check size={12}/>}</time></div></motion.div>)}</div>
            <form className="composer" onSubmit={sendMessage}><div className="composer-tools"><button type="button" onClick={()=>toast("Прикрепление файлов подключим к хранилищу")}><Paperclip size={18}/></button><button type="button" onClick={()=>toast("Выбор изображения")}><Image size={18}/></button></div><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Напишите сообщение..." aria-label="Сообщение"/><button type="button" className="emoji-button" onClick={()=>setDraft(v=>v+" 🙂")}><Smile size={19}/></button><button className="send-message" type="submit" aria-label="Отправить"><Send size={17}/></button></form>
            <div className="composer-hint">Enter — отправить <span>Ваши сообщения в тестовом интерфейсе не сохраняются</span></div>
          </section>
        </div>
      </motion.main>:active==="home"?<motion.main key="home" className="page home-page" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.24}}>
        <div className="home-intro"><div><div className="overline">{date.toUpperCase()} <span className="live-pulse"/> ВАШЕ ПРОСТРАНСТВО</div><h1>Добро пожаловать<br/>в своё<span className="heading-dot">.</span></h1><p>Меньше переключений. Больше того, что действительно важно.</p></div><div className="intro-art"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-core"><Sparkles size={34}/></div><span className="art-caption">MAKE IT<br/>MATTER</span></div></div>
        <section className="launch-card"><div className="launch-top"><span><Zap size={15}/> БЫСТРЫЙ СТАРТ</span><span className="launch-shortcut">СВОЁ / 01</span></div><div className="launch-main"><div><h2>С чего начнём?</h2><p>Опишите задачу — найдём подходящий инструмент.</p></div><div className="launch-spark">✳</div></div><form className="launch-input" onSubmit={e=>{e.preventDefault();if(query.trim())toast("Подключение ИИ-помощников добавим без изменения их логики.")}}><Command size={19}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Например: помоги спланировать мой день..."/><button type="submit"><ArrowUpRight size={20}/></button></form><div className="suggestions"><button onClick={()=>setQuery("Составить план на день")}>План на день <ArrowUpRight size={12}/></button><button onClick={()=>setQuery("Найти нужный документ")}>Найти документ <ArrowUpRight size={12}/></button><button onClick={()=>setQuery("Разобраться с задачей")}>Разобраться с задачей <ArrowUpRight size={12}/></button></div></section>
        <div className="section-title"><div><div className="overline">ВАШИ ИНСТРУМЕНТЫ</div><h2>Всё под рукой<span className="heading-dot">.</span></h2></div><button className="plain-link" onClick={()=>setActive("helpers")}>Все разделы <ArrowUpRight size={15}/></button></div>
        <section className="feature-grid">
          <button className="feature-card feature-violet" onClick={()=>setActive("helpers")}><span className="feature-number">01 / ПОМОЩЬ</span><span className="feature-icon"><Sparkles size={22}/></span><strong>Умные<br/>помощники</strong><span className="feature-bottom">Решения для ваших задач <ArrowUpRight size={16}/></span><span className="feature-orb"/></button>
          <button className="feature-card feature-orange" onClick={()=>setActive("messages")}><span className="feature-number">02 / ОБЩЕНИЕ</span><span className="feature-icon"><MessageCircle size={22}/></span><strong>Ваши<br/>сообщения</strong><span className="feature-bottom">Быть на связи <ArrowUpRight size={16}/></span><span className="feature-orb"/></button>
          <button className="feature-card feature-blue" onClick={()=>setActive("tasks")}><span className="feature-number">03 / ПОРЯДОК</span><span className="feature-icon"><CalendarDays size={22}/></span><strong>Дела и<br/>планы</strong><span className="feature-bottom">Двигаться вперёд <ArrowUpRight size={16}/></span><span className="feature-orb"/></button>
        </section>
        <section className="today-block"><div className="section-title compact"><div><div className="overline">НЕБОЛЬШИЕ ШАГИ</div><h2>Ваш день</h2></div><span className="task-progress">{done.length} / {tasks.length} выполнено</span></div><div className="today-card">{tasks.map((t,i)=><button key={t.title} className={"today-task "+(done.includes(i)?"checked":"")} onClick={()=>setDone(v=>v.includes(i)?v.filter(x=>x!==i):[...v,i])}><span className="task-tick">{done.includes(i)&&<Check size={13}/>}</span><time>{t.time}</time><strong>{t.title}</strong><span className="task-tag">{t.tag}</span><ChevronDown size={15}/></button>)}</div></section>
        <footer className="home-footer"><span className="footer-logo">с.</span><span>СВОЁ STUDIO</span><i/> <span>Ваше пространство. Ваши правила.</span><span className="footer-version">CONCEPT 02 — PREVIEW</span></footer>
      </motion.main>:<motion.main key={active} className="page placeholder-page" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0}}><div className="overline">ЭКСПЕРИМЕНТАЛЬНАЯ ОБОЛОЧКА</div><h1>{navItems.find(n=>n.id===active)?.label}<span className="heading-dot">.</span></h1><p>Визуальный концепт готов. Существующие функции и настройки остаются нетронутыми.</p><button className="primary-button" onClick={()=>setActive("home")}><ChevronLeft size={16}/> Вернуться на обзор</button></motion.main>}
      </AnimatePresence>
    </div>
    <nav className="mobile-nav">{navItems.map(({id,label,icon:Icon})=><button key={id} className={active===id?"active":""} onClick={()=>setActive(id)}><Icon size={19}/><span>{label}</span></button>)}</nav>
    <AnimatePresence>{notice&&<motion.div className="toast" initial={{opacity:0,y:14,scale:.96}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:10}}>{notice}</motion.div>}</AnimatePresence>
    <AnimatePresence>{profileOpen&&<motion.div className="profile-pop" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:8}}><strong>Тестовый профиль</strong><span>Существующая авторизация не затронута</span><button onClick={()=>{setProfileOpen(false);toast("Настройки профиля останутся прежними")}}>Понятно</button></motion.div>}</AnimatePresence>
  </div>
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
