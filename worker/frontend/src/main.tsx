import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { soyuzDb, soyuzQueryClient, useSoyuzStore } from "./lib/platform";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity, ArrowRight, Bell, CalendarDays, Check, ChefHat,
  CircleHelp, ClipboardList, Home, LockKeyhole, MessageCircle,
  Plus, Search, Send, ShieldCheck, Sparkles, Users, Wrench, Archive, Settings, UserRound
} from "lucide-react";
import "./styles.css";

type Helper = { id:string; name:string; role:string; desc:string; status:"open"|"soon"; icon:string; color:string; skills:string[]; sample:string };
const helpers:Helper[] = [
 {id:"chef",name:"ШЕФ",role:"Кухня и питание",desc:"Придумает меню, рассчитает продукты и поможет готовить вкусно каждый день.",status:"open",icon:"chef",color:"tomato",skills:["Рецепты из того, что есть дома","Меню на неделю и список покупок","ПП, калории и баланс БЖУ","Пошаговое сопровождение готовки"],sample:"У меня есть курица, картофель и сметана. Что приготовить на ужин?"},
 {id:"mechanic",name:"МЕХАНИК",role:"Авто и техника",desc:"Поможет разобраться с неисправностью, обслуживанием и ремонтом.",status:"open",icon:"mechanic",color:"blue",skills:["Диагностика по симптомам","Расшифровка ошибок и кодов","План ремонта и инструменты","Регламент обслуживания"],sample:"Машина плохо заводится на холодную. С чего начать проверку?"},
 {id:"lawyer",name:"ЮРИСТ",role:"Документы и право",desc:"Разберёт ситуацию, объяснит нормы и поможет подготовить документы.",status:"soon",icon:"law",color:"gold",skills:["Разбор правовой ситуации","Подготовка заявлений и обращений","Проверка договоров","План действий и сроки"],sample:"Помоги составить обращение по моей ситуации."},
 {id:"builder",name:"СТРОИТЕЛЬ",role:"Ремонт и строительство",desc:"Подскажет технологию работ, материалы, объёмы и последовательность.",status:"soon",icon:"builder",color:"green",skills:["Расчёт материалов","Технология строительных работ","Сметы и планирование","Поиск причин дефектов"],sample:"Хочу утеплить комнату 18 квадратных метров. Что понадобится?"},
 {id:"store",name:"УПРАВЛЯЮЩИЙ",role:"Магазин и торговля",desc:"Каталог, остатки, закупки, приёмка, цены и аналитика в одном рабочем центре.",status:"soon",icon:"store",color:"violet",skills:["Учёт товаров и остатков","Продажи и списания","Заказы поставщикам","Интеграции с кассой и 1С"],sample:"Покажи товары, которые скоро закончатся."},
 {id:"doctor",name:"МЕДИК",role:"Здоровье и самочувствие",desc:"Поможет подготовиться к врачу и разобраться в медицинской информации.",status:"soon",icon:"health",color:"mint",skills:["Подготовка к приёму","Понятное объяснение анализов","Дневник самочувствия","Вопросы врачу"],sample:"Помоги подготовить список вопросов для врача."},
 {id:"navigator",name:"НАВИГАТОР",role:"Поиск решений и маршрутов",desc:"Поможет разобраться в сложной задаче, найти нужные возможности и выстроить понятный маршрут действий.",status:"soon",icon:"navigator",color:"blue",skills:["Поиск подходящих решений и сервисов","Планирование маршрутов и поездок","Сравнение вариантов и возможностей","Пошаговый план достижения цели"],sample:"Помоги спланировать поездку и сравнить варианты маршрута."},
];

function Mascot({kind,size="large"}:{kind:string;size?:string}) {
 if(kind==="chef") return <div className={"mascot "+size+" chef-mascot" }><div className="chef-hat"><i/><i/><i/></div><div className="chef-face"><span className="eye left"/><span className="eye right"/><span className="smile"/></div><div className="chef-body"><span className="scarf"/> <span className="button-dot one"/><span className="button-dot two"/></div><div className="mascot-tool">✦</div></div>;
 if(kind==="mechanic") return <div className={"mascot "+size+" mech-mascot"}><div className="mech-cap"/><div className="mech-face"><span className="eye left"/><span className="eye right"/><span className="smile"/></div><div className="mech-body"><span className="overall-mark">С</span></div><Wrench className="mascot-wrench"/></div>;
 const glyph:Record<string,string>={law:"§",builder:"⌂",store:"▦",health:"✚",navigator:"◎"};
 return <div className={"mascot "+size+" generic-mascot "+kind}><div className="generic-head">{glyph[kind]||"✦"}</div><div className="generic-body"/></div>;
}

type SessionUser = {id:string;username:string;display_name:string;role:string;avatar_url?:string|null};
function AuthScreen({onAuth}:{onAuth:(user:SessionUser,token:string)=>void}){
 const [mode,setMode]=useState<"login"|"register">("login");
 const [username,setUsername]=useState("");
 const [password,setPassword]=useState("");
 const [displayName,setDisplayName]=useState("");
 const [setupCode,setSetupCode]=useState("");
 const [firstAccount,setFirstAccount]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{fetch("/auth/setup-status",{cache:"no-store"}).then(r=>r.json()).then(d=>setFirstAccount(!!d.first_account)).catch(()=>undefined)},[]);
 const submit=async()=>{
  if(busy)return;setBusy(true);setError("");
  try{
   const clean=username.trim().replace(/^@/,"").toLowerCase();
   if(!clean||!password)throw new Error("Укажи логин и пароль.");
   if(mode==="register"&&password.length<8)throw new Error("Пароль должен содержать не менее 8 символов.");
   const path=mode==="register"?"/auth/register":"/auth/login";
   const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},cache:"no-store",body:JSON.stringify(mode==="register"?{username:clean,password,display_name:displayName.trim()||clean,setup_code:setupCode}:{username:clean,password})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(typeof data.error==="string"?data.error:data.error?.message||"Не удалось выполнить вход.");
   localStorage.setItem("ai_bragina_token",data.token);
   localStorage.setItem("ai_bragina_user",JSON.stringify(data.user));
   onAuth(data.user,data.token);
  }catch(e){setError(e instanceof Error?e.message:"Ошибка соединения.");}
  finally{setBusy(false);}
 };
 return <div className="auth-screen"><div className="auth-glow"/><div className="auth-card"><div className="auth-brand"><div className="auth-seal">✦</div><div><b>СОЮЗ</b><small>ЕДИНАЯ ЦИФРОВАЯ СИСТЕМА</small></div></div><div className="eyebrow">ЗАЩИЩЁННЫЙ ДОСТУП</div><h1>{mode==="login"?"С возвращением":"Создать аккаунт"}</h1><p className="auth-lead">{mode==="login"?"Войдите, чтобы продолжить работу в системе.":"Создайте личную учётную запись участника СОЮЗ."}</p><label className="auth-field">ЛОГИН<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Ваш логин"/></label>{mode==="register"&&<label className="auth-field">ОТОБРАЖАЕМОЕ ИМЯ<input value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="Как вас будут видеть"/></label>}<label className="auth-field">ПАРОЛЬ<input type="password" autoComplete={mode==="login"?"current-password":"new-password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Не менее 8 символов"/></label>{mode==="register"&&firstAccount&&<label className="auth-field">КОД ПЕРВОЙ НАСТРОЙКИ<input type="password" autoComplete="off" value={setupCode} onChange={e=>setSetupCode(e.target.value)} placeholder="Код владельца"/></label>}{error&&<div className="auth-error" role="alert">{error}</div>}<button className="hero-button auth-submit" disabled={busy} onClick={()=>void submit()}>{busy?"ПРОВЕРЯЕМ…":mode==="login"?"ВОЙТИ В СОЮЗ":"СОЗДАТЬ АККАУНТ"} <ArrowRight size={16}/></button><button className="auth-switch" onClick={()=>{setMode(mode==="login"?"register":"login");setError("")}}>{mode==="login"?"Нет аккаунта? Создать":"Уже зарегистрированы? Войти"}</button><small className="auth-foot">СОЕДИНЕНИЕ С СЕРВЕРОМ · ПЕРСОНАЛЬНАЯ УЧЁТНАЯ ЗАПИСЬ</small></div></div>;
}

function App(){
 const tab=useSoyuzStore(state=>state.tab);
 const setTab=useSoyuzStore(state=>state.setTab);
 const [active,setActive]=useState<Helper|null>(null);
 const [sessionUser,setSessionUser]=useState<SessionUser|null>(null);
 const [authReady,setAuthReady]=useState(false);
 useEffect(()=>{const token=localStorage.getItem("ai_bragina_token");if(!token){setAuthReady(true);return;}fetch("/auth/me",{headers:{Authorization:"Bearer "+token},cache:"no-store"}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok||!d.user)throw new Error("session");setSessionUser(d.user);localStorage.setItem("ai_bragina_user",JSON.stringify(d.user));}).catch(()=>{localStorage.removeItem("ai_bragina_token");localStorage.removeItem("ai_bragina_user");}).finally(()=>setAuthReady(true));},[]);
 const handleAuth=(user:SessionUser)=>{setSessionUser(user);};
 const logout=async()=>{const token=localStorage.getItem("ai_bragina_token");try{if(token)await fetch("/auth/logout",{method:"POST",headers:{Authorization:"Bearer "+token}})}catch{}localStorage.removeItem("ai_bragina_token");localStorage.removeItem("ai_bragina_user");setSessionUser(null);setTab("home");setActive(null);};
 const [query,setQuery]=useState("");
 const [chat,setChat]=useState("");
 const [sent,setSent]=useState<string[]>([]);
 const [toast,setToast]=useState("");
 const [profile,setProfile]=useState(()=>{try{return JSON.parse(localStorage.getItem("soyuz_personal_dossier")||"{}")}catch{return {}}});
 const [tasks,setTasks]=useState<Array<{id?:number;title:string;completed:boolean;createdAt:number}>>([]);
 const [newTask,setNewTask]=useState("");
 useEffect(()=>{let alive=true;soyuzDb.tasks.orderBy("createdAt").reverse().toArray().then(items=>{if(alive)setTasks(items)}).catch(()=>undefined);return()=>{alive=false}},[]);
 const addTask=async()=>{const title=newTask.trim();if(!title)return;const item={title,completed:false,createdAt:Date.now()};const id=await soyuzDb.tasks.add(item);setTasks(v=>[{...item,id},...v]);setNewTask("");};
 const toggleTask=async(id:number,completed:boolean)=>{await soyuzDb.tasks.update(id,{completed:!completed});setTasks(v=>v.map(t=>t.id===id?{...t,completed:!completed}:t));};
 const removeTask=async(id:number)=>{await soyuzDb.tasks.delete(id);setTasks(v=>v.filter(t=>t.id!==id));};
 useEffect(()=>{let alive=true;soyuzDb.profiles.get("current").then(saved=>{if(alive&&saved)setProfile({firstName:saved.firstName,lastName:saved.lastName,displayName:saved.displayName,about:saved.about})}).catch(()=>undefined);return()=>{alive=false}},[]);
 useEffect(()=>{const record={id:"current" as const,firstName:profile.firstName||"",lastName:profile.lastName||"",displayName:profile.displayName||"",about:profile.about||"",updatedAt:Date.now()};soyuzDb.profiles.put(record).catch(()=>undefined)},[profile]);
 const notify=(s:string)=>{setToast(s);window.setTimeout(()=>setToast(""),2400)};
 const go=(t:string)=>{setTab(t);setActive(null);void Haptics.impact({style:ImpactStyle.Light}).catch(()=>undefined);window.scrollTo({top:0,behavior:"smooth"});};
 const openHelper=(h:Helper)=>{setActive(h);setChat("");setSent([]);};
 const visibleHelpers=helpers.filter(h=>(h.name+" "+h.role+" "+h.desc).toLowerCase().includes(query.toLowerCase()));
 const nav=[{id:"home",label:"ГЛАВНАЯ",icon:Home},{id:"helpers",label:"БЮРО",icon:Sparkles},{id:"community",label:"СООБЩЕСТВО",icon:Users},{id:"messages",label:"СВЯЗЬ",icon:MessageCircle},{id:"work",label:"ДЕЛА",icon:ClipboardList},{id:"profile",label:"ЛИЧНОЕ ДЕЛО",icon:UserRound}];
 const systemDate=new Date().toLocaleDateString("ru-RU",{day:"2-digit",month:"long",year:"numeric"}).toUpperCase();
 const send=()=>{if(!chat.trim())return;setSent(v=>[...v,chat.trim()]);setChat("");};
 if(!authReady)return <div className="auth-loading"><span className="live-dot"/> ПОДКЛЮЧЕНИЕ К СОЮЗУ…</div>;
 if(!sessionUser)return <AuthScreen onAuth={handleAuth}/>;
 return <div className="union-app">
  <div className="grain"/>
  <header className="union-header">
   <button className="seal" onClick={()=>go("home")} aria-label="На главную"><span className="seal-star">✦</span><span className="seal-orbit"/></button>
   <div className="brand-lockup"><div className="brand-name">СОЮЗ<span>®</span></div><div className="brand-sub">ЕДИНАЯ ЦИФРОВАЯ СИСТЕМА</div></div>
   <div className="header-center"><span className="live-dot"/> СИСТЕМА АКТИВНА <b>·</b> {systemDate}</div>
   <div className="header-actions"><button className="round-icon" onClick={()=>notify("Новых оповещений пока нет")}><Bell size={18}/><i/></button><button className="profile-chip" onClick={()=>go("profile")}><span className="profile-avatar">{(sessionUser.display_name||sessionUser.username||"С").slice(0,1).toUpperCase()}</span><span>{(sessionUser.display_name||sessionUser.username||"УЧАСТНИК").toUpperCase()}</span></button></div>
  </header>
  <div className="mobile-status"><span className="live-dot"/> СИСТЕМА АКТИВНА <span>·</span> {systemDate}</div>
  <div className="union-layout">
   <aside className="side-rail">
    <div className="rail-label">НАВИГАЦИЯ</div>
    {nav.map(n=><button key={n.id} className={"rail-link "+(tab===n.id&&!active?"selected":"")} onClick={()=>go(n.id)}><n.icon size={18}/><span>{n.label}</span>{n.id==="messages"&&<i className="rail-count">2</i>}</button>)}
    <div className="rail-rule"/>
    <div className="rail-label">РАЗДЕЛЫ СИСТЕМЫ</div>
    <button className="rail-link" onClick={()=>go("helpers")}><ChefHat size={18}/><span>БЮРО ИНТЕЛЛЕКТА</span></button>
    <button className="rail-link" onClick={()=>go("work")}><CalendarDays size={18}/><span>ПЛАНИРОВАНИЕ</span></button>
    <button className="rail-link" onClick={()=>notify("Архив подключим вместе с хранилищем файлов")}><Archive size={18}/><span>АРХИВ</span></button>
    <button className="rail-link" onClick={()=>notify("Сигналы системы появятся здесь")}><Bell size={18}/><span>СИГНАЛЫ</span></button>
    <button className={"rail-link "+(tab==="profile"?"selected":"")} onClick={()=>go("profile")}><UserRound size={18}/><span>ЛИЧНОЕ ДЕЛО</span></button>
    <button className="rail-link" onClick={()=>notify("Настройки системы готовятся")}><Settings size={18}/><span>ПАРАМЕТРЫ СИСТЕМЫ</span></button>
    <div className="rail-bottom"><div className="rail-stamp">С</div><div><b>СОЮЗ / 01</b><small>ВЕРСИЯ 0.1 · ПРЕДПРОСМОТР</small></div></div>
   </aside>
   <main className="main-stage">
    <AnimatePresence mode="wait">
    {active ? <motion.section key="detail" className="helper-detail" initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} exit={{opacity:0,y:8}}>
      <button className="back-link" onClick={()=>setActive(null)}>← К БЮРО ИНТЕЛЛЕКТА</button>
      <div className="detail-hero">
       <div className="detail-copy"><div className="eyebrow"><span className="live-dot"/> ПЕРСОНАЛЬНЫЙ ЦИФРОВОЙ СПЕЦИАЛИСТ</div><h1>{active.name}</h1><p>{active.desc}</p><div className="detail-status"><span className={active.status==="open"?"status-open":"status-locked"}>{active.status==="open"?"● ДОСТУПЕН ДЛЯ РАБОТЫ":"▣ ГОТОВИТСЯ К ЗАПУСКУ"}</span><span>ОТДЕЛ: {active.role.toUpperCase()}</span></div>
        {active.id==="chef"&&<button className="hero-button" onClick={()=>window.location.assign("/app?page=chef-events")}>ПРАЗДНИК ПОД КЛЮЧ <ArrowRight size={16}/></button>}</div>
       <div className={"detail-mascot-panel "+active.color}><div className="orbit orbit-a"/><div className="orbit orbit-b"/><Mascot kind={active.icon}/><div className="mascot-caption">СПЕЦИАЛИСТ СОЮЗА №{String(helpers.indexOf(active)+1).padStart(2,"0")}</div></div>
      </div>
      <div className="detail-grid">
       <section className="paper-panel"><div className="panel-kicker">01 / КОМПЕТЕНЦИИ</div><h2>Чем поможет специалист</h2><div className="skill-list">{active.skills.map((s,i)=><div className="skill-row"><span>{String(i+1).padStart(2,"0")}</span><b>{s}</b><Check size={16}/></div>)}</div></section>
       <section className="paper-panel usage-panel"><div className="panel-kicker">02 / РАБОЧЕЕ МЕСТО</div><h2>Поставить задачу</h2>{active.status==="open"?<><div className="chat-intro">Опишите ситуацию обычными словами. Специалист уточнит детали и предложит план действий.</div><div className="sample-prompt" onClick={()=>setChat(active.sample)}><Sparkles size={15}/><span>{active.sample}</span><ArrowRight size={15}/></div><div className="mini-chat">{sent.map((s,i)=><div className="mini-bubble mine" key={i}>{s}</div>)}{sent.length>0&&<div className="mini-bubble bot">Задача принята в демонстрационном режиме. Для полноценной работы подключим интеллектуальный сервис.</div>}</div><div className="task-input"><input value={chat} onChange={e=>setChat(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Напишите задачу..."/><button onClick={send}><Send size={17}/></button></div><small className="demo-note">ДЕМО-РЕЖИМ · ЗАПРОСЫ ПОКА НЕ ОТПРАВЛЯЮТСЯ В ИИ</small></>:<div className="locked-detail"><div className="lock-emblem"><LockKeyhole size={25}/></div><h3>Специалист проходит подготовку</h3><p>Мы разрабатываем инструменты, проверяем качество рекомендаций и готовим подключение к рабочим данным.</p><button className="notify-btn" onClick={()=>notify("Отметили интерес к помощнику "+active.name)}>Сообщить о запуске <Bell size={15}/></button></div>}</section>
      </div>
    </motion.section> :
    tab==="home" ? <motion.div key="home" className="home-page" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:8}}>
     <div className="hero-banner">
      <div className="hero-grid"/>
      <div className="hero-content"><div className="eyebrow"><span className="live-dot"/> ЕДИНАЯ ЦИФРОВАЯ СИСТЕМА · 2026</div><h1>ОДНА СИСТЕМА.<br/><em>ТЫСЯЧИ ВОЗМОЖНОСТЕЙ.</em></h1><p>Общение, знания, работа и интеллектуальные помощники — в едином цифровом пространстве.</p><button className="hero-button" onClick={()=>go("helpers")}>ОТКРЫТЬ БЮРО ИНТЕЛЛЕКТА <ArrowRight size={16}/></button></div>
      <div className="hero-art"><div className="hero-sun"/><div className="hero-ring r1"/><div className="hero-ring r2"/><div className="hero-monument"><div className="monument-star">✦</div><div className="monument-pillar p1"/><div className="monument-pillar p2"/><div className="monument-pillar p3"/><div className="monument-base"/></div><div className="hero-art-label">ПРОЕКТ<br/>БУДУЩЕГО</div></div>
      <div className="hero-index">СОЮЗ / 001</div>
     </div>
     <div className="ticker"><span>✦</span> ЗНАНИЯ <i/> ВОЗМОЖНОСТИ <i/> ВЗАИМОПОМОЩЬ <i/> СОЗИДАНИЕ <i/> БУДУЩЕЕ <i/> <span>✦</span> ЗНАНИЯ <i/> ВОЗМОЖНОСТИ</div>
     <div className="section-head"><div><div className="eyebrow">ЦЕНТР СОЮЗА</div><h2>ВАШЕ ПРОСТРАНСТВО</h2></div><button className="text-link" onClick={()=>go("helpers")}>ВСЕ СЛУЖБЫ <ArrowRight size={15}/></button></div>
     <div className="dashboard-grid">
      <button className="dash-card dispatch" onClick={()=>go("work")}><div className="dash-icon"><CalendarDays/></div><div><small>ПЛАНИРОВАНИЕ</small><h3>Мои задачи</h3><p>Планируйте день и держите важное под контролем.</p></div><span className="dash-arrow"><ArrowRight/></span><b className="card-index">01</b></button>
      <button className="dash-card comms" onClick={()=>go("messages")}><div className="dash-icon"><MessageCircle/></div><div><small>СИСТЕМА СВЯЗИ</small><h3>Личные сообщения</h3><p>Личные диалоги, общие чаты, аудио- и видеосвязь.</p></div><span className="dash-arrow"><ArrowRight/></span><b className="card-index">02</b></button>
      <button className="dash-card people-card" onClick={()=>go("community")}><div className="dash-icon"><Users/></div><div><small>СООБЩЕСТВО СОЮЗА</small><h3>Сообщество</h3><p>Лента событий, люди и общие интересы.</p></div><span className="dash-arrow"><ArrowRight/></span><b className="card-index">03</b></button>
     </div>
     <div className="section-head helper-section-head"><div><div className="eyebrow">ИНТЕЛЛЕКТУАЛЬНЫЕ СЛУЖБЫ</div><h2>ВАШИ БЮРО</h2></div><button className="text-link" onClick={()=>go("helpers")}>ВЕСЬ СОСТАВ <ArrowRight size={15}/></button></div>
     <div className="helper-grid">{helpers.slice(0,3).map(h=><HelperCard key={h.id} h={h} onClick={()=>openHelper(h)}/>)}</div>
     <div className="bottom-motto"><span>✦</span><div>СОЗДАНО ДЛЯ ЛЮДЕЙ.<br/><b>РАБОТАЕТ ДЛЯ БУДУЩЕГО.</b></div><small>СОЮЗ · ЦИФРОВАЯ ЭКОСИСТЕМА</small></div>
    </motion.div> :
    tab==="helpers" ? <motion.div key="helpers" className="catalog-page" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:8}}>
      <div className="page-title-row"><div><div className="eyebrow">СОСТАВ БЮРО · 07 СПЕЦИАЛИСТОВ</div><h1>БЮРО ИНТЕЛЛЕКТА</h1><p>Каждый специалист — отдельный инструмент для конкретной задачи.</p></div><div className="catalog-seal">С<span>✦</span></div></div>
      <label className="catalog-search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти специалиста или направление..."/></label>
      <div className="helper-grid catalog-grid">{visibleHelpers.map(h=><HelperCard key={h.id} h={h} onClick={()=>openHelper(h)}/>)}</div>
      <div className="catalog-foot"><ShieldCheck size={18}/> Состав бюро расширяется. Новые специалисты проходят проверку перед запуском.</div>
    </motion.div> :
    tab==="profile" ? <motion.div key="profile" className="generic-page" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}><div className="eyebrow">УЧЁТНАЯ ЗАПИСЬ УЧАСТНИКА</div><h1>ЛИЧНОЕ ДЕЛО</h1><p className="lead">Ваша личная карточка в системе СОЮЗ.</p><div className="paper-panel dossier-panel"><div className="post-emblem">С</div><h2>Создать личное дело</h2><p>Заполните основные сведения. Пока данные сохраняются только в этом браузере на данном устройстве.</p><label className="dossier-field">Имя<input value={profile.firstName||""} onChange={e=>setProfile({...profile,firstName:e.target.value})} placeholder="Введите имя"/></label><label className="dossier-field">Фамилия<input value={profile.lastName||""} onChange={e=>setProfile({...profile,lastName:e.target.value})} placeholder="Введите фамилию"/></label><label className="dossier-field">Отображаемое имя<input value={profile.displayName||""} onChange={e=>setProfile({...profile,displayName:e.target.value})} placeholder="Как вас будут видеть участники"/></label><label className="dossier-field">О себе<textarea value={profile.about||""} onChange={e=>setProfile({...profile,about:e.target.value})} placeholder="Кратко расскажите о себе"/></label><button className="hero-button" onClick={()=>{localStorage.setItem("soyuz_personal_dossier",JSON.stringify(profile));void soyuzDb.profiles.put({id:"current",firstName:profile.firstName||"",lastName:profile.lastName||"",displayName:profile.displayName||"",about:profile.about||"",updatedAt:Date.now()});notify("Личное дело сохранено на этом устройстве")}}>СОХРАНИТЬ ЛИЧНОЕ ДЕЛО <Check size={16}/></button><small className="demo-note">АККАУНТ: @{sessionUser.username} · ЛИЧНЫЕ ДОПОЛНИТЕЛЬНЫЕ СВЕДЕНИЯ ПОКА СОХРАНЯЮТСЯ НА ЭТОМ УСТРОЙСТВЕ</small><button className="auth-switch profile-logout" onClick={()=>void logout()}>ВЫЙТИ ИЗ АККАУНТА</button></div></motion.div> :
    tab==="community" ? <motion.div key="community" className="generic-page" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}><div className="eyebrow">СООБЩЕСТВО СОЮЗА</div><h1>СООБЩЕСТВО</h1><p className="lead">Пространство людей, идей и полезных открытий.</p><div className="community-compose"><div className="profile-avatar">Н</div><input placeholder="Поделитесь новостью или идеей..."/><button onClick={()=>notify("Публикации появятся после подключения ленты")}><Plus size={18}/> СОЗДАТЬ</button></div><div className="feed-post"><div className="post-top"><div className="post-emblem">С</div><div><b>РЕДАКЦИЯ СОЮЗА</b><small>Центральная лента · 15 минут назад</small></div><span className="verified">✓</span></div><h3>Открываем новое цифровое пространство</h3><p>СОЮЗ объединяет инструменты для повседневных задач, общение и специализированных интеллектуальных помощников. Это только начало большого пути.</p><div className="post-image-graphic"><div className="post-sun"/><div className="post-graphic-text">БУДУЩЕЕ<br/>СОЗДАЁТСЯ<br/><b>ВМЕСТЕ</b></div><div className="post-graphic-star">✦</div></div><div className="post-actions"><button onClick={()=>notify("Отметка добавлена")}>♡ 128</button><button onClick={()=>notify("Комментарии скоро появятся")}>◯ 24 ОТВЕТА</button><button onClick={()=>notify("Ссылка скопирована")}>↗ ПОДЕЛИТЬСЯ</button></div></div></motion.div> :
    tab==="messages" ? <motion.div key="messages" className="generic-page" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}><div className="eyebrow">СИСТЕМА СВЯЗИ</div><h1>ЛИЧНЫЕ СООБЩЕНИЯ</h1><p className="lead">Личные диалоги, общие чаты, контакты, аудио- и видеосвязь.</p><div className="message-placeholder"><div className="signal-icon"><MessageCircle size={32}/></div><h2>КАНАЛ СВЯЗИ ГОТОВИТСЯ</h2><p>Здесь будут личные сообщения, общие чаты, контакты, аудио- и видеозвонки и обмен файлами. Подключение к действующей системе связи — отдельный этап.</p><button className="outline-btn" onClick={()=>notify("Раздел связи добавлен в список интересов")}>СЛЕДИТЬ ЗА ЗАПУСКОМ <Bell size={15}/></button></div></motion.div> :
    <motion.div key="work" className="generic-page" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}><div className="eyebrow">ПЛАНИРОВАНИЕ · ЛОКАЛЬНОЕ ХРАНИЛИЩЕ</div><h1>МОИ ДЕЛА</h1><p className="lead">Создавайте задачи и отмечайте выполненное. Список хранится на устройстве и доступен без сети.</p><div className="task-create"><input value={newTask} onChange={e=>setNewTask(e.target.value)} onKeyDown={e=>e.key==="Enter"&&void addTask()} placeholder="Какое дело нужно выполнить?"/><button className="hero-button" onClick={()=>void addTask()}><Plus size={17}/> ДОБАВИТЬ</button></div><div className="task-board"><div className="task-board-head"><b>СПИСОК ДЕЛ</b><span>{tasks.filter(t=>!t.completed).length} АКТИВНЫХ</span></div>{tasks.length===0?<div className="task-empty"><CalendarDays size={26}/><b>Пока нет задач</b><span>Добавьте первое дело — оно появится здесь</span></div>:tasks.map(t=><div className={"task-row "+(t.completed?"is-done":"")} key={t.id}><button className="task-check" aria-label={t.completed?"Вернуть задачу в работу":"Отметить выполненной"} onClick={()=>t.id!==undefined&&void toggleTask(t.id,t.completed)}>{t.completed?<Check size={16}/>:null}</button><span>{t.title}</span><button className="task-delete" aria-label="Удалить задачу" onClick={()=>t.id!==undefined&&void removeTask(t.id)}>×</button></div>)}</div><small className="demo-note">ОФЛАЙН-ХРАНЕНИЕ · СИНХРОНИЗАЦИЯ МЕЖДУ УСТРОЙСТВАМИ ПОКА НЕ ПОДКЛЮЧЕНА</small></motion.div>}
    </AnimatePresence>
   </main>
   <aside className="right-brief">
    <div className="brief-card"><div className="brief-top"><span>СВОДКА СИСТЕМЫ</span><Activity size={17}/></div><div className="brief-status"><span className="live-dot"/> ИНТЕРФЕЙС ПРЕДПРОСМОТРА</div><div className="brief-stat"><b>07</b><span>ЦИФРОВЫХ СПЕЦИАЛИСТОВ</span></div><div className="brief-stat"><b>02</b><span>ГОТОВЫ К РАБОТЕ</span></div><div className="brief-stat"><b>04</b><span>В РАЗРАБОТКЕ</span></div><div className="brief-progress"><span/><span/><span/><span/><span/><span/><span/></div><small>РАСШИРЕНИЕ ЭКОСИСТЕМЫ</small></div>
    <div className="quote-card"><div className="quote-mark">“</div><p>Большие возможности начинаются с простых полезных дел.</p><span>ПРИНЦИП СОЮЗА</span></div>
    <div className="brief-help"><CircleHelp size={18}/><div><b>Нужна помощь?</b><small>Центр поддержки пользователей</small><button onClick={()=>notify("Центр поддержки будет подключён позже")}>ОТКРЫТЬ <ArrowRight size={12}/></button></div></div>
   </aside>
  </div>
  <nav className="mobile-nav">{nav.map(n=><button key={n.id} className={tab===n.id&&!active?"active":""} onClick={()=>go(n.id)}><n.icon size={19}/><span>{n.label==="СООБЩЕСТВО"?"ЛЮДИ":n.label==="БЮРО"?"ИИ":n.label==="ГЛАВНАЯ"?"ГЛАВНАЯ":n.label==="СВЯЗЬ"?"ЧАТЫ":n.label==="ЛИЧНОЕ ДЕЛО"?"ПРОФИЛЬ":"ДЕЛА"}</span></button>)}</nav>
  <footer className="union-footer"><span>СОЮЗ © 2026</span><span>ЕДИНСТВО · ЗНАНИЯ · ВОЗМОЖНОСТИ</span><span>ДЕМО-КОНЦЕПЦИЯ</span></footer>
  <AnimatePresence>{toast&&<motion.div className="union-toast" initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:8}}>{toast}</motion.div>}</AnimatePresence>
 </div>;
}
function HelperCard({h,onClick}:{h:Helper;onClick:()=>void}){
 return <motion.button whileHover={{y:-4}} whileTap={{scale:.985}} className={"helper-card "+h.color} onClick={onClick}>
  <div className="helper-card-top"><span className="helper-number">СПЕЦИАЛИСТ / {String(helpers.indexOf(h)+1).padStart(2,"0")}</span><span className={h.status==="open"?"card-status open":"card-status locked"}>{h.status==="open"?"ДОСТУПЕН":"СКОРО"}</span></div>
  <div className="helper-illustration"><div className="illustration-grid"/><div className="illustration-orbit"/><Mascot kind={h.icon}/>{h.status==="soon"&&<div className="lock-overlay"><LockKeyhole size={17}/></div>}</div>
  <div className="helper-card-copy"><div className="helper-role">{h.role.toUpperCase()}</div><h3>{h.name}</h3><p>{h.desc}</p><div className="helper-card-bottom"><span>{h.status==="open"?"ПОСТАВИТЬ ЗАДАЧУ":"ПОДРОБНЕЕ"}</span><span className="card-arrow"><ArrowRight size={16}/></span></div></div>
 </motion.button>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><QueryClientProvider client={soyuzQueryClient}><App/></QueryClientProvider></React.StrictMode>);
