
'use strict';
const WORKER_URL=location.hostname.endsWith('.workers.dev')?location.origin:'https://admin-panel-chef-api.bosstayson24.workers.dev';
let APP_KEY='ai_bragina_data_v2';
const SETTINGS_KEY='ai_bragina_settings_v1';
let authMode='login',authToken=localStorage.getItem('ai_bragina_token')||'',currentUser=null;
function activateUserStorage(user){
 const identity=String(user?.id||user?.username||'').trim().toLowerCase();
 if(!identity)throw new Error('Сервер не вернул идентификатор пользователя.');
 const legacy='ai_bragina_data_v2';
 const key=legacy+'_user_'+encodeURIComponent(identity);
 const oldData=localStorage.getItem(legacy);
 if(!localStorage.getItem(key)&&oldData)localStorage.setItem(key,oldData);
 if(oldData)localStorage.removeItem(legacy);
 APP_KEY=key;
 appData={version:4,tasks:[],history:[],favorites:[],mechanicCases:[],maintenance:{vehicle:{name:'',odometer:''},items:[]},kitchen:{staples:['соль','чёрный перец','сахар','растительное масло','вода'],custom:''}};
 loadData();
 renderMechanicHistory();
 renderMaintenance();
 if($('account-label'))$('account-label').textContent='Вы вошли как: '+(user.username||user.display_name||identity);
 if($('admin-entry'))$('admin-entry').classList.toggle('hidden',user.role!=='owner');
 if($('profile-display-name'))$('profile-display-name').textContent=user.display_name||user.username||'Профиль';
 if($('profile-username'))$('profile-username').textContent='@'+(user.username||'');
 if($('profile-task-count'))$('profile-task-count').textContent=String(appData.tasks?.length||0);
 if($('profile-recipe-count'))$('profile-recipe-count').textContent=String(appData.history?.length||0);
 if($('profile-case-count'))$('profile-case-count').textContent=String(appData.mechanicCases?.length||0);
 if($('profile-admin-link'))$('profile-admin-link').classList.toggle('hidden',user.role!=='owner');
 syncConversations().catch(e=>console.warn('conversation sync',e));
 startChatUnreadUpdates();
}

let conversationSyncTimer=null;
function conversationItems(){
 const items=[];
 for(const entry of (appData.history||[]))items.push({id:String(entry.id),kind:'recipe',title:String(entry.title||'Рецепт'),created_at:entry.date,content:{entry}});
 for(const c of (appData.mechanicCases||[])){
  const safe={...c,vehicle:{...(c.vehicle||{}),vin:''}};
  items.push({id:String(c.id),kind:'mechanic',title:String(c.title||'Диагностика'),created_at:c.createdAt,content:{case:safe}});
 }
 return items;
}
async function syncConversations(){
 if(!authToken||!currentUser)return;
 const headers={'Content-Type':'application/json',Authorization:'Bearer '+authToken};
 const r=await fetch(WORKER_URL+'/conversations/sync',{method:'POST',headers,body:JSON.stringify({items:conversationItems()})});
 if(!r.ok)throw new Error('Не удалось сохранить переписки на сервере.');
 const get=await fetch(WORKER_URL+'/conversations',{headers:{Authorization:'Bearer '+authToken}});
 if(!get.ok)throw new Error('Не удалось загрузить серверную историю.');
 const data=await get.json();let changed=false;
 for(const row of (data.conversations||[])){
  if(row.kind==='recipe'&&row.content?.entry&&!appData.history.some(x=>x.id===row.id)){appData.history.unshift(row.content.entry);changed=true;}
  if(row.kind==='mechanic'&&row.content?.case&&!appData.mechanicCases.some(x=>x.id===row.id)){appData.mechanicCases.unshift(row.content.case);changed=true;}
 }
 if(changed){appData.history=appData.history.slice(0,100);appData.mechanicCases=appData.mechanicCases.slice(0,250);try{localStorage.setItem(APP_KEY,JSON.stringify(appData));}catch(e){}renderHistory();renderMechanicHistory();}
}
function queueConversationSync(){
 if(!authToken||!currentUser)return;
 clearTimeout(conversationSyncTimer);
 conversationSyncTimer=setTimeout(()=>syncConversations().catch(e=>console.warn('conversation sync',e)),900);
}
let adminUsersCache=[];
async function adminFetch(path,options={}){const r=await fetch(WORKER_URL+path,{...options,headers:{Authorization:'Bearer '+authToken,'Content-Type':'application/json',...(options.headers||{})}});const d=await r.json();if(!r.ok)throw new Error(d.error||'Ошибка запроса');return d;}
async function loadAdminOverview(){if(currentUser?.role!=='owner')return;const box=$('admin-overview');box.textContent='Загружаю…';try{const d=await adminFetch('/admin/overview');box.innerHTML='';[['Пользователи',d.users],['Активные',d.active_users],['Заблокированы',d.blocked_users],['Переписки',d.conversations]].forEach(([label,value])=>{const card=document.createElement('div');card.className='admin-stat';const strong=document.createElement('strong');strong.textContent=Number(value||0).toLocaleString('ru-RU');const small=document.createElement('small');small.textContent=label;card.append(strong,small);box.appendChild(card);});}catch(e){box.textContent=e.message;}}
async function loadAdminUsers(){if(currentUser?.role!=='owner')return;const box=$('admin-users');box.textContent='Загружаю аккаунты…';try{const d=await adminFetch('/admin/users');adminUsersCache=d.users||[];renderAdminUsers();}catch(e){box.textContent=e.message;}}
function filterAdminUsers(){renderAdminUsers();}
function renderAdminUsers(){const box=$('admin-users');if(!box)return;const q=($('admin-user-search')?.value||'').trim().toLowerCase();const users=adminUsersCache.filter(u=>[u.username,u.display_name].some(v=>String(v||'').toLowerCase().includes(q)));box.innerHTML='';if(!users.length){box.textContent='Пользователи не найдены.';return;}users.forEach(u=>{const item=document.createElement('div');item.className='history-item';const title=document.createElement('strong');title.textContent=(u.display_name||u.username)+' (@'+u.username+')';item.appendChild(title);const meta=document.createElement('small');meta.textContent='Роль: '+u.role+' · Статус: '+u.status+' · Переписок: '+u.conversations_count+' · Создан: '+(u.created_at?new Date(u.created_at).toLocaleDateString('ru-RU'):'—');item.appendChild(meta);const actions=document.createElement('div');actions.className='case-actions';const chats=document.createElement('button');chats.textContent='История ИИ';chats.onclick=()=>loadAdminConversations(u.id,u.username);actions.appendChild(chats);const personalChats=document.createElement('button');personalChats.textContent='Личные чаты';personalChats.onclick=()=>loadAdminChatThreads(u.id,u.username);actions.appendChild(personalChats);if(u.role!=='owner'){const toggle=document.createElement('button');toggle.textContent=u.status==='active'?'Заблокировать':'Разблокировать';toggle.onclick=()=>adminUserAction(u,u.status==='active'?'block':'unblock');actions.appendChild(toggle);const del=document.createElement('button');del.textContent='Удалить аккаунт';del.onclick=()=>adminUserAction(u,'delete');actions.appendChild(del);}item.appendChild(actions);box.appendChild(item);});}
async function adminUserAction(u,action){const label=action==='block'?'заблокировать':action==='unblock'?'разблокировать':'безвозвратно удалить';const warning=action==='delete'?' Будут удалены аккаунт, его серверные переписки и активные сессии.': '';if(!confirm('Подтверждаешь: '+label+' @'+u.username+'?'+warning))return;try{await adminFetch('/admin/users/action',{method:'POST',body:JSON.stringify({user_id:u.id,action})});toast('Действие выполнено.');await Promise.all([loadAdminUsers(),loadAdminOverview(),loadAdminAudit()]);}catch(e){toast(e.message,'error');}}
async function loadAdminAudit(){if(currentUser?.role!=='owner')return;const box=$('admin-audit');if(!box)return;box.textContent='Загружаю…';try{const d=await adminFetch('/admin/audit');box.innerHTML='';if(!d.items?.length){box.textContent='Записей пока нет.';return;}d.items.forEach(x=>{const row=document.createElement('div');row.className='history-item';const t=document.createElement('strong');t.textContent=x.action;const m=document.createElement('small');m.textContent=(x.actor_username||'Владелец')+' · '+(x.target_username||'—')+' · '+new Date(x.created_at).toLocaleString('ru-RU');row.append(t,m);box.appendChild(row);});}catch(e){box.textContent=e.message;}}
async function loadAdminConversations(userId,username){
 const box=$('admin-conversations');$('admin-chat-title').textContent='Переписки: @'+username;$('admin-conversation-view').classList.add('hidden');box.textContent='Загружаю…';
 try{
  const r=await fetch(WORKER_URL+'/admin/conversations?user_id='+encodeURIComponent(userId),{headers:{Authorization:'Bearer '+authToken}});
  const d=await r.json();if(!r.ok)throw new Error(d.error||'Не удалось загрузить переписки');
  box.innerHTML='';
  if(!d.conversations?.length){box.textContent='Сохранённых переписок пока нет.';return;}
  d.conversations.forEach(c=>{
   const item=document.createElement('div');item.className='history-item';
   const title=document.createElement('strong');title.textContent=c.title||'Диалог';item.appendChild(title);
   const meta=document.createElement('small');meta.textContent=(c.kind==='recipe'?'ИИ-Шеф':c.kind==='mechanic'?'ИИ-Механик':'Диалог')+' · '+new Date(c.updated_at).toLocaleString('ru-RU');item.appendChild(meta);
   const btn=document.createElement('button');btn.textContent='Просмотреть';btn.onclick=()=>showAdminConversation(c);item.appendChild(btn);box.appendChild(item);
  });
 }catch(e){box.textContent=e.message;}
}
function showAdminConversation(c){
 $('admin-view-title').textContent=c.title||'Диалог';
 const value=c.content?.case||c.content?.entry||c.content;
 $('admin-view-content').textContent=JSON.stringify(value,null,2);
 $('admin-conversation-view').classList.remove('hidden');
}
function authStatus(message,error=false){const el=$('auth-status');el.textContent=message;el.classList.remove('hidden','error','success');el.classList.add(error?'error':'success');}
async function toggleAuthMode(){
 authMode=authMode==='login'?'register':'login';
 let firstAccount=false;
 if(authMode==='register'){
  try{
   const r=await fetch(WORKER_URL+'/auth/setup-status',{cache:'no-store'});
   if(!r.ok)throw new Error('status');
   const d=await r.json();firstAccount=!!d.first_account;
  }catch(e){firstAccount=true;}
 }
 $('auth-title').textContent=authMode==='login'?'Вход в приложение':'Создание аккаунта';
 $('auth-hint').textContent=authMode==='login'?'Войди, чтобы продолжить работу.':(firstAccount?'Создай первый аккаунт владельца платформы.':'Создай аккаунт.');
 $('auth-name-wrap').classList.toggle('hidden',authMode!=='register');
 $('auth-code-wrap').classList.toggle('hidden',authMode!=='register'||!firstAccount);
 $('auth-password').autocomplete=authMode==='login'?'current-password':'new-password';
 $('auth-submit').textContent=authMode==='login'?'Войти':'Зарегистрироваться';
 $('auth-toggle').textContent=authMode==='login'?'Создать аккаунт':'У меня уже есть аккаунт';
 $('auth-status').classList.add('hidden');
}
async function authRequest(path,body){
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const r=await fetch(WORKER_URL+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
  const d=await r.json().catch(()=>({error:'Сервер вернул неверный ответ'}));
  if(!r.ok){const raw=d.error??d.message??d;let msg=typeof raw==='string'?raw:(raw&&typeof raw==='object'?(raw.message||raw.error||JSON.stringify(raw)):String(raw));throw new Error(msg||('Ошибка авторизации ('+r.status+')'));}
  return d;
 }catch(e){
  if(e.name==='AbortError')throw new Error('Сервер не ответил за 12 секунд. Проверь тестовый Worker.');
  if(e instanceof TypeError)throw new Error('Не удалось связаться с тестовым сервером. Проверь подключение.');
  throw e;
 }finally{clearTimeout(timeout);}
}
async function submitAuth(){
 const btn=$('auth-submit'),oldText=btn.textContent;
 btn.disabled=true;btn.textContent='Проверяю…';authStatus('Связываюсь с тестовым сервером…');
 try{
  const username=$('auth-username').value.trim(),password=$('auth-password').value;
  if(!username||!password)throw new Error('Заполни логин и пароль.');
  let d;
  if(authMode==='register')d=await authRequest('/auth/register',{username,password,display_name:$('auth-display').value.trim()||username,setup_code:$('auth-code').value});
  else d=await authRequest('/auth/login',{username,password});
  authToken=d.token;currentUser=d.user;
  localStorage.setItem('ai_bragina_token',authToken);localStorage.setItem('ai_bragina_user',JSON.stringify(currentUser));
  activateUserStorage(currentUser);loadData();renderTasks();renderToday();$('auth-screen').classList.add('hidden');toast('Вход выполнен.');
 }catch(e){authStatus(e.message||'Неизвестная ошибка авторизации',true);}
 finally{btn.disabled=false;btn.textContent=oldText;}
}
async function checkAuth(){
 if(!authToken){$('auth-screen').classList.remove('hidden');return;}
 try{
  const r=await fetch(WORKER_URL+'/auth/me',{headers:{Authorization:'Bearer '+authToken}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.user)throw new Error('session');
  currentUser=d.user;
  localStorage.setItem('ai_bragina_user',JSON.stringify(currentUser));
  activateUserStorage(currentUser);
  loadData();renderTasks();renderToday();
  $('auth-screen').classList.add('hidden');
  const rememberedPage=localStorage.getItem('svoe_last_page')||'home';
  showPage(['home','video','helpers','chef','mechanic','invoice','community','tasks','settings'].includes(rememberedPage)?rememberedPage:'home');
 }catch(e){
  authToken='';currentUser=null;
  localStorage.removeItem('ai_bragina_token');localStorage.removeItem('ai_bragina_user');
  $('auth-screen').classList.remove('hidden');authStatus('Сессия истекла. Войди снова.',true);
 }
}
async function logout(){
 if(!confirm('Выйти из аккаунта?'))return;
 try{if(authToken)await fetch(WORKER_URL+'/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+authToken}});}catch(e){}
 authToken='';currentUser=null;clearInterval(chatUnreadTimer);const chatBadge=$('chat-nav-badge');if(chatBadge)chatBadge.classList.add('hidden');
 localStorage.removeItem('ai_bragina_token');localStorage.removeItem('ai_bragina_user');
 appData={version:3,history:[],favorites:[],mechanicCases:[],maintenance:{vehicle:{name:'',odometer:''},items:[]},kitchen:{staples:['соль','чёрный перец','сахар','растительное масло','вода'],custom:''}};
 $('auth-screen').classList.remove('hidden');
}

let chefMode='pantry',currentRecipe=null,variantTitles=[],isBusy=false;
let settings={theme:'warm',compact:false,animations:true,reduced:false,tap:false,start:false,done:false,error:false,volume:25,warnings:true,history:true,confirm:true};
let appData={version:4,tasks:[],history:[],favorites:[],mechanicCases:[],maintenance:{vehicle:{name:'',odometer:''},items:[]},kitchen:{staples:['соль','чёрный перец','сахар','растительное масло','вода'],custom:''}};
function $(id){return document.getElementById(id)}

const VIDEO_KEY='svoe_auto_video_cache_v1';
const VIDEO_TOPICS={
 trending:{label:'Популярное',query:'короткие видео популярное'},
 fun:{label:'Юмор',query:'приколы юмор короткие видео'},
 animals:{label:'Животные',query:'животные смешные короткие видео'},
 auto:{label:'Авто',query:'автомобили авто короткие видео'},
 useful:{label:'Полезное',query:'лайфхаки полезные советы короткие видео'}
};
let activeVideoTopic='trending',videoTopicPage=1,videoLoading=false,videoItems=[],videoHasMore=false;
let videoQueuedTopic='';
let videoSessionSeed=1;
function readVideoCache(){try{const d=JSON.parse(localStorage.getItem(VIDEO_KEY)||'null');return d&&Date.now()-d.savedAt<3600000&&Array.isArray(d.items)?d.items:[];}catch(e){return[];}}
function writeVideoCache(items){try{localStorage.setItem(VIDEO_KEY,JSON.stringify({savedAt:Date.now(),items:items.slice(0,60)}));}catch(e){}}
function normalizeRutubeItem(v){
 const candidates=[v.id,v.video_id,v.code,v.video_url,v.url,v.embed_url].filter(Boolean);
 let id='';
 for(const value of candidates){const m=String(value).match(/[a-f0-9]{32}/i);if(m){id=m[0];break;}}
 if(!id)return null;
 const rawDuration=v.duration||v.duration_seconds||0;
 const duration=typeof rawDuration==='string'&&rawDuration.includes(':')?rawDuration.split(':').reduce((n,part)=>n*60+Number(part||0),0):Number(rawDuration)||0;
 if(duration>150)return null;
 if(!duration&&!String(v.video_url||v.url||'').includes('/shorts/'))return null;
 return {id,embed:'https://rutube.ru/play/embed/'+id+'/',url:'https://rutube.ru/video/'+id+'/',title:String(v.title||v.name||'Короткое видео').slice(0,180),author:String(v.author?.name||v.author_name||v.channel_name||'Автор не указан'),duration,thumbnail:v.thumbnail_url||v.picture_url||v.poster_url||v.thumbnail||'',views:Number(v.hits||v.views_count||v.views||0)};
}
function selectVideoTopic(topic,button){
 if(!VIDEO_TOPICS[topic])return;
 activeVideoTopic=topic;videoTopicPage=1;videoItems=[];videoHasMore=false;
 if(videoLoading){videoQueuedTopic=topic;return;}
 document.querySelectorAll('#video-discovery-tabs button').forEach(x=>x.classList.toggle('active',x===button));
 loadAutoVideoFeed(true);
}
async function loadAutoVideoFeed(reset=false){
 const box=$('video-feed'),status=$('video-feed-status'),more=$('video-more-btn');
 if(!box||videoLoading)return;
 videoLoading=true;if(more)more.classList.add('hidden');
 if(reset||!videoItems.length)box.innerHTML='<div class="video-empty"><div class="video-empty-icon">◌</div><strong>Подбираем ролики</strong><p>Ищем открытые короткие видео…</p></div>';
 if(status)status.textContent='Загружаем подборку…';
 const topic=VIDEO_TOPICS[activeVideoTopic]||VIDEO_TOPICS.trending;
 try{
  const requestPage=((videoSessionSeed+videoTopicPage-2)%5)+1;
  const url='/video/feed?topic='+encodeURIComponent(activeVideoTopic)+'&page='+requestPage+'&fresh='+Date.now();
  const response=await fetch(url,{method:'GET',credentials:'same-origin',headers:{'Accept':'application/json'},cache:'no-store'});
  if(!response.ok)throw new Error('Видеоплощадка временно не отдаёт каталог ('+response.status+').');
  const data=await response.json(),rows=Array.isArray(data.results)?data.results:Array.isArray(data)?data:[];
  const normalized=rows.map(normalizeRutubeItem).filter(Boolean);
  for(let i=normalized.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[normalized[i],normalized[j]]=[normalized[j],normalized[i]];}
  const seen=new Set(videoItems.map(x=>x.id));
  const fresh=normalized.filter(x=>!seen.has(x.id));
  videoItems=videoItems.concat(fresh).slice(0,60);
  videoHasMore=!!(data.has_next||data.next)&&videoTopicPage<5;
  if(reset)box.innerHTML='';
  renderAutoVideoCards();
  if(videoItems.length&&document.body.dataset.page==='video'&&!videoFocusMode){enterVideoFocus(videoItems[0]);}
  if(status)status.textContent=videoItems.length?'Подборка обновляется из открытого каталога · '+videoItems.length+' роликов':'В этой теме пока не нашлось коротких роликов. Попробуй другую тему.';
  if(more)more.classList.toggle('hidden',!videoHasMore);
  if(videoItems.length)writeVideoCache(videoItems);
 }catch(error){
  if(!videoItems.length){
   const cached=readVideoCache();
   if(cached.length){videoItems=cached;renderAutoVideoCards();if(status)status.textContent='Показана последняя сохранённая подборка. Для обновления ленты нужно подключение к источнику видео.';}
   else{box.innerHTML='<div class="video-empty"><div class="video-empty-icon">!</div><strong>Не удалось загрузить ленту</strong><p>'+String(error.message||'Проверь подключение к интернету.')+'</p><p>СОЮЗ не требует аккаунта на видеоплощадках. Попробуй ещё раз немного позже.</p><button class="mini-btn" onclick="loadAutoVideoFeed(true)">Повторить</button></div>';if(status)status.textContent='';}
  }else if(status)status.textContent='Не удалось обновить подборку. Уже загруженные ролики остались на экране.';
 }finally{videoLoading=false;if(videoQueuedTopic){const queued=videoQueuedTopic;videoQueuedTopic='';if(queued!==activeVideoTopic){activeVideoTopic=queued;videoTopicPage=1;videoItems=[];videoHasMore=false;document.querySelectorAll('#video-discovery-tabs button').forEach(x=>x.classList.toggle('active',x.dataset.topic===queued));loadAutoVideoFeed(true);}}}
}
function loadMoreAutoVideos(){if(!videoHasMore||videoLoading)return;videoTopicPage++;loadAutoVideoFeed(false);}
let videoFocusObserver=null,videoAutoplayArmed=false,videoFocusMode=false,videoActiveId='',videoSwipeStart=null,videoScrollTimer=null;
function enterVideoFocus(firstItem){
 const feed=$('video-feed');if(!feed)return;
 videoFocusMode=true;videoAutoplayArmed=true;videoActiveId='';
 document.body.classList.add('svoe-video-focus');
 if(firstItem){const card=[...feed.querySelectorAll('.short-card')].find(x=>x.dataset.videoId===firstItem.id);if(card){feed.scrollTop=card.offsetTop;activateFocusedVideo(card);}}
 setupVideoFocusObserver();
}
function closeVideoFocus(){
 videoFocusMode=false;videoAutoplayArmed=false;videoActiveId='';document.body.classList.remove('svoe-video-focus');
 if(videoFocusObserver){videoFocusObserver.disconnect();videoFocusObserver=null;}
 if(videoScrollTimer){clearTimeout(videoScrollTimer);videoScrollTimer=null;}
 document.querySelectorAll('.short-card iframe').forEach(x=>x.remove());
 document.querySelectorAll('.short-card').forEach(card=>{const p=card.querySelector('.short-poster');if(p)p.style.display='';const b=card.querySelector('.short-play');if(b)b.style.display='grid';});
}
function activateFocusedVideo(card){
 if(!card||!videoFocusMode)return;
 const item=videoItems.find(x=>x.id===card.dataset.videoId);if(!item||videoActiveId===item.id)return;
 videoActiveId=item.id;
 document.querySelectorAll('.short-card').forEach(other=>{
  if(other===card)return;
  const frame=other.querySelector('iframe');if(frame)frame.remove();
  const p=other.querySelector('.short-poster');if(p)p.style.display='';
  const b=other.querySelector('.short-play');if(b)b.style.display='grid';
 });
 playAutoVideo(item,card);
}
function getCenteredVideoCard(){
 const feed=$('video-feed');if(!feed)return null;
 const cards=[...feed.querySelectorAll('.short-card')];if(!cards.length)return null;
 const center=feed.getBoundingClientRect().top+feed.clientHeight/2;
 return cards.reduce((best,card)=>{
  const r=card.getBoundingClientRect(),d=Math.abs((r.top+r.bottom)/2-center);
  return !best||d<best.distance?{card,distance:d}:best;
 },null)?.card||null;
}
function setupVideoFocusObserver(){
 const feed=$('video-feed');if(!feed)return;
 if(videoFocusObserver)videoFocusObserver.disconnect();
 videoFocusObserver=new IntersectionObserver(entries=>{
  if(!videoFocusMode||!videoAutoplayArmed)return;
  const visible=entries.filter(e=>e.isIntersecting).sort((x,y)=>y.intersectionRatio-x.intersectionRatio)[0];
  if(visible&&visible.intersectionRatio>=.7)activateFocusedVideo(getCenteredVideoCard()||visible.target);
 },{root:feed,threshold:[.5,.7,.9]});
 feed.querySelectorAll('.short-card').forEach(card=>videoFocusObserver.observe(card));
 feed.onscroll=()=>{
  if(!videoFocusMode)return;
  if(videoScrollTimer)clearTimeout(videoScrollTimer);
  videoScrollTimer=setTimeout(()=>{const card=getCenteredVideoCard();if(card)activateFocusedVideo(card);const cards=[...feed.querySelectorAll('.short-card')];if(videoHasMore&&cards.length&&cards.indexOf(card)>=cards.length-3)loadMoreAutoVideos();},110);
 };
}
function handleVideoSwipeStart(event){
 if(!videoFocusMode||event.target.closest('.short-actions'))return;
 const touch=event.touches?event.touches[0]:event;
 videoSwipeStart={x:touch.clientX,y:touch.clientY,time:Date.now()};
}
function handleVideoSwipeEnd(event){
 if(!videoFocusMode||!videoSwipeStart)return;
 const touch=event.changedTouches?event.changedTouches[0]:event;
 const dy=touch.clientY-videoSwipeStart.y,dx=touch.clientX-videoSwipeStart.x;
 const elapsed=Date.now()-videoSwipeStart.time;videoSwipeStart=null;
 if(Math.abs(dy)<38||Math.abs(dy)<Math.abs(dx)*1.15||elapsed>900)return;
 const feed=$('video-feed'),cards=[...feed.querySelectorAll('.short-card')];const current=getCenteredVideoCard();let index=cards.indexOf(current);
 if(index<0)index=0;
 const next=cards[Math.max(0,Math.min(cards.length-1,index+(dy<0?1:-1)))];
 if(next){feed.scrollTo({top:next.offsetTop,behavior:'smooth'});setTimeout(()=>activateFocusedVideo(getCenteredVideoCard()||next),260);}
}
function renderAutoVideoCards(){
 const box=$('video-feed');if(!box)return;box.innerHTML='';
 if(!videoItems.length){box.innerHTML='<div class="video-empty"><strong>Пока пусто</strong><p>В этой теме ещё нет доступных коротких роликов.</p></div>';return;}
 videoItems.forEach((item,index)=>{
  const card=document.createElement('article');card.className='short-card';card.dataset.videoId=item.id;
  const poster=document.createElement('img');poster.className='short-poster';poster.alt='';poster.loading=index<2?'eager':'lazy';poster.src=item.thumbnail||'';if(!item.thumbnail)poster.style.display='none';card.appendChild(poster);
  const play=document.createElement('button');play.className='short-play';play.type='button';play.textContent='▶';play.setAttribute('aria-label','Смотреть видео');play.onclick=()=>{if(!videoFocusMode)enterVideoFocus(item);else{videoAutoplayArmed=true;activateFocusedVideo(card);}};card.appendChild(play);
  const overlay=document.createElement('div');overlay.className='short-overlay';
  const title=document.createElement('strong');title.textContent=item.title;const meta=document.createElement('div');meta.className='short-meta';meta.textContent=item.author+(item.duration?' · '+Math.floor(item.duration/60)+':'+String(item.duration%60).padStart(2,'0'):'');
  const actions=document.createElement('div');actions.className='short-actions';const save=document.createElement('button');save.textContent=isAutoVideoSaved(item.id)?'♥ В избранном':'♡ В избранное';save.onclick=()=>toggleAutoVideoSaved(item,save);const open=document.createElement('button');open.textContent='Открыть ↗';open.onclick=()=>window.open(item.url,'_blank','noopener,noreferrer');actions.append(save,open);overlay.append(title,meta,actions);card.appendChild(overlay);
  const swipe=document.createElement('div');swipe.className='video-swipe-zone';swipe.setAttribute('aria-hidden','true');swipe.addEventListener('touchstart',handleVideoSwipeStart,{passive:true});swipe.addEventListener('touchend',handleVideoSwipeEnd,{passive:true});swipe.addEventListener('pointerdown',handleVideoSwipeStart);swipe.addEventListener('pointerup',handleVideoSwipeEnd);card.appendChild(swipe);['left','right'].forEach(side=>{const rail=document.createElement('div');rail.className='video-swipe-rail '+side;rail.setAttribute('aria-hidden','true');rail.addEventListener('touchstart',handleVideoSwipeStart,{passive:true});rail.addEventListener('touchend',handleVideoSwipeEnd,{passive:true});rail.addEventListener('pointerdown',handleVideoSwipeStart);rail.addEventListener('pointerup',handleVideoSwipeEnd);card.appendChild(rail);});
  box.appendChild(card);
 });
 if(videoFocusMode)setupVideoFocusObserver();
}
function playAutoVideo(item,card){
 document.querySelectorAll('.short-card iframe').forEach(frame=>{const parent=frame.closest('.short-card');if(parent&&parent!==card)frame.remove();});
 if(card.querySelector('iframe'))return;
 const frame=document.createElement('iframe');frame.src=item.embed+'?autoplay=true';frame.title=item.title;frame.allow='autoplay; encrypted-media; fullscreen; picture-in-picture';frame.allowFullscreen=true;frame.loading='eager';frame.referrerPolicy='strict-origin-when-cross-origin';frame.style.position='absolute';frame.style.inset='0';card.insertBefore(frame,card.firstChild);
 const poster=card.querySelector('.short-poster');if(poster)poster.style.display='none';const play=card.querySelector('.short-play');if(play)play.style.display='none';
}
function getSavedAutoVideos(){try{return JSON.parse(localStorage.getItem(VIDEO_KEY+'_saved')||'[]');}catch(e){return[];}}
function isAutoVideoSaved(id){return getSavedAutoVideos().some(x=>x.id===id);}
function toggleAutoVideoSaved(item,button){let saved=getSavedAutoVideos();if(saved.some(x=>x.id===item.id))saved=saved.filter(x=>x.id!==item.id);else saved.unshift(item);try{localStorage.setItem(VIDEO_KEY+'_saved',JSON.stringify(saved.slice(0,100)));}catch(e){}button.textContent=isAutoVideoSaved(item.id)?'♥ В избранном':'♡ В избранное';}
function showSavedAutoVideos(button){if(videoLoading)return;document.querySelectorAll('#video-discovery-tabs button').forEach(x=>x.classList.toggle('active',x===button));videoItems=getSavedAutoVideos();renderAutoVideoCards();if($('video-feed-status'))$('video-feed-status').textContent='Избранное хранится только на этом устройстве.';if($('video-more-btn'))$('video-more-btn').classList.add('hidden');}



let activeChatThread=null,activeChatPeer=null,chatPollTimer=null,chatSearchTimer=null,chatLastMessageId="",chatLastMessageAt="";
async function chatFetch(path,options={}){
 const r=await fetch(WORKER_URL+path,{...options,headers:{Authorization:"Bearer "+authToken,"Content-Type":"application/json",...(options.headers||{})},cache:"no-store"});
 const d=await r.json().catch(()=>({error:"Сервер вернул неверный ответ"}));
 if(!r.ok)throw new Error(d.error||"Ошибка чата");return d;
}
let chatUnreadTimer=null,chatUnreadBusy=false;
async function refreshChatUnread(){
 if(!authToken||chatUnreadBusy)return;chatUnreadBusy=true;
 try{const d=await chatFetch("/chat/unread");const badge=$("chat-nav-badge");if(!badge)return;const n=Math.max(0,Number(d.unread)||0);badge.textContent=n>99?"99+":String(n);badge.classList.toggle("hidden",n===0);}
 catch(e){}finally{chatUnreadBusy=false;}
}
function startChatUnreadUpdates(){
 clearInterval(chatUnreadTimer);if(!authToken)return;refreshChatUnread();chatUnreadTimer=setInterval(()=>{if(document.visibilityState==="visible")refreshChatUnread();},15000);
}
async function loadChatList(){
 if(!authToken)return;const box=$("chat-list");if(!box)return;
 try{const d=await chatFetch("/chat/list");renderChatList(d.chats||[]);refreshChatUnread();}catch(e){box.textContent=e.message;}
}
function renderChatList(items){
 const box=$("chat-list");if(!box)return;box.innerHTML="";
 if(!items.length){box.innerHTML='<div class="chat-empty">Пока нет переписок.<br>Найди человека по логину выше.</div>';return;}
 items.forEach(c=>{
  const b=document.createElement("button");b.className="chat-list-item";
  const info=document.createElement("span");info.style.flex="1";
  const title=document.createElement("strong");title.textContent=c.peer_display_name||c.peer_username||"Пользователь";
  const meta=document.createElement("small");meta.textContent=(c.last_message||"Начните общение")+(c.last_message_at?" · "+new Date(c.last_message_at).toLocaleString("ru-RU"):"");
  info.append(title,meta);b.appendChild(info);
  if(Number(c.unread)>0){const n=document.createElement("span");n.className="chat-unread";n.textContent=String(c.unread);b.appendChild(n);}
  b.onclick=()=>openChatRoom(c.id,{id:c.peer_id,username:c.peer_username,display_name:c.peer_display_name,avatar_url:c.peer_avatar});box.appendChild(b);
 });
}
function searchChatUsers(){
 clearTimeout(chatSearchTimer);const q=String($("chat-user-search")?.value||"").trim();const box=$("chat-search-results");if(!box)return;
 if(q.length<2){box.innerHTML="";return;}
 chatSearchTimer=setTimeout(async()=>{try{const d=await chatFetch("/chat/users?q="+encodeURIComponent(q));box.innerHTML="";
  if(!d.users?.length){box.textContent="Никого не нашли.";return;}
  d.users.forEach(u=>{const b=document.createElement("button");b.className="chat-user-result";const span=document.createElement("span");const strong=document.createElement("strong");strong.textContent=u.display_name||u.username;const small=document.createElement("small");small.textContent="@"+u.username;span.append(strong,small);b.appendChild(span);b.onclick=()=>createDirectChat(u.username);box.appendChild(b);});
 }catch(e){box.textContent=e.message;}},350);
}
async function createDirectChat(username){
 try{const d=await chatFetch("/chat/direct",{method:"POST",body:JSON.stringify({username})});$("chat-user-search").value="";$("chat-search-results").innerHTML="";await loadChatList();await openChatRoom(d.thread.id,d.thread.peer);}
 catch(e){toast(e.message,"error");}
}
let chatTypingIdleTimer=null,chatTypingHeartbeat=null,chatTypingActive=false;
function setPeerTypingIndicator(isTyping){
 const el=$("chat-peer-login");if(!el)return;
 el.classList.toggle("chat-typing",!!isTyping);
 el.textContent=isTyping?"печатает…":(activeChatPeer?.username?"@"+activeChatPeer.username:"");
}
async function sendChatTypingState(isTyping){
 if(!activeChatThread||!authToken)return;
 try{await chatFetch("/chat/typing",{method:"POST",body:JSON.stringify({thread_id:activeChatThread,typing:!!isTyping})});}catch(e){}
}
function chatTypingChanged(){
 if(!activeChatThread)return;
 clearTimeout(chatTypingIdleTimer);
 if(!chatTypingActive){chatTypingActive=true;sendChatTypingState(true);chatTypingHeartbeat=setInterval(()=>{if(chatTypingActive)sendChatTypingState(true);},4000);}
 chatTypingIdleTimer=setTimeout(stopChatTyping,2000);
}
function stopChatTyping(){
 clearTimeout(chatTypingIdleTimer);chatTypingIdleTimer=null;
 if(chatTypingHeartbeat){clearInterval(chatTypingHeartbeat);chatTypingHeartbeat=null;}
 if(chatTypingActive){chatTypingActive=false;sendChatTypingState(false);}
}
async function openChatRoom(threadId,peer){
 activeChatThread=threadId;activeChatPeer=peer;chatLastMessageId="";chatLastMessageAt="";
 document.body.classList.add("svoe-chat-open");
 $("chat-sidebar").classList.add("hidden");$("chat-room").classList.remove("hidden");
 $("chat-peer-name").textContent=peer?.display_name||peer?.username||"Диалог";
 $("chat-peer-login").textContent=peer?.username?"@"+peer.username:"";
 setPeerTypingIndicator(false);
 await loadChatMessages(true);
 await chatFetch("/chat/read",{method:"POST",body:JSON.stringify({thread_id:threadId})}).catch(()=>{});
 refreshChatUnread();loadChatList();
 clearInterval(chatPollTimer);chatPollTimer=setInterval(()=>{if(activeChatThread&&document.visibilityState==="visible")loadChatMessages(false);},5000);
}
function closeChatRoom(){
 stopChatTyping();clearInterval(chatPollTimer);chatPollTimer=null;activeChatThread=null;activeChatPeer=null;
 document.body.classList.remove("svoe-chat-open");
 $("chat-room").classList.add("hidden");$("chat-sidebar").classList.remove("hidden");loadChatList();
}
async function loadChatMessages(initial){
 if(!activeChatThread)return;const box=$("chat-messages");if(initial)box.innerHTML='<div class="chat-empty">Загружаю сообщения…</div>';
 try{
  const query="/chat/messages?thread_id="+encodeURIComponent(activeChatThread)+"&limit=50"+(!initial&&chatLastMessageAt?"&after="+encodeURIComponent(chatLastMessageAt):"");
  const d=await chatFetch(query);
  if(initial){
   box.innerHTML="";
   if(!d.messages?.length)box.innerHTML='<div class="chat-empty">Сообщений пока нет. Напиши первым 👋</div>';
  }
  setPeerTypingIndicator(!!d.peer_typing);
  (d.messages||[]).forEach(m=>{
   const b=document.createElement("div");b.className="chat-bubble"+(m.sender_id===currentUser?.id?" mine":"");
   const body=document.createElement("div");body.textContent=m.body;
   const meta=document.createElement("small");meta.textContent=new Date(m.created_at).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
   b.append(body,meta);box.appendChild(b);chatLastMessageId=m.id;chatLastMessageAt=m.created_at;
  });
  if(d.messages?.length){box.querySelector(".chat-empty")?.remove();box.scrollTop=box.scrollHeight;await chatFetch("/chat/read",{method:"POST",body:JSON.stringify({thread_id:activeChatThread})}).catch(()=>{});refreshChatUnread();loadChatList();}
 }catch(e){if(initial)box.textContent=e.message;}
}
async function sendChatMessage(event){
 event.preventDefault();const input=$("chat-message-input"),body=String(input.value||"").trim();if(!body||!activeChatThread)return;stopChatTyping();
 const btn=event.submitter;if(btn)btn.disabled=true;
 try{await chatFetch("/chat/messages",{method:"POST",body:JSON.stringify({thread_id:activeChatThread,body})});input.value="";await loadChatMessages(false);await loadChatList();}
 catch(e){toast(e.message,"error");}finally{if(btn)btn.disabled=false;input.focus();}
}
async function loadAdminChatThreads(userId,username){
 const box=$("admin-chat-threads"),view=$("admin-chat-message-view");view.classList.add("hidden");box.textContent="Загружаю личные чаты…";
 try{const d=await adminFetch("/admin/chat/threads?user_id="+encodeURIComponent(userId));box.innerHTML="";
  if(!d.chats?.length){box.textContent="Личных чатов пока нет.";return;}
  d.chats.forEach(c=>{const item=document.createElement("div");item.className="history-item";const title=document.createElement("strong");title.textContent="Диалог · "+(c.last_message_at?new Date(c.last_message_at).toLocaleString("ru-RU"):"без сообщений");const meta=document.createElement("small");meta.textContent=c.last_message||"Сообщений пока нет";const btn=document.createElement("button");btn.textContent="Открыть сообщения";btn.onclick=()=>loadAdminChatMessages(c.id,username);item.append(title,meta,btn);box.appendChild(item);});
 }catch(e){box.textContent=e.message;}
}
async function loadAdminChatMessages(threadId,username){
 const box=$("admin-chat-message-view");box.classList.remove("hidden");box.textContent="Загружаю сообщения…";
 try{const d=await adminFetch("/admin/chat/messages?thread_id="+encodeURIComponent(threadId));box.innerHTML="";
  if(!d.messages?.length){box.textContent="Сообщений пока нет.";return;}
  d.messages.forEach(m=>{const item=document.createElement("div");item.className="history-item";const who=document.createElement("strong");who.textContent=(m.display_name||m.username||"Пользователь")+" (@"+m.username+")";const body=document.createElement("p");body.style.whiteSpace="pre-wrap";body.style.overflowWrap="anywhere";body.textContent=m.body;const time=document.createElement("small");time.textContent=new Date(m.created_at).toLocaleString("ru-RU");item.append(who,body,time);box.appendChild(item);});
 }catch(e){box.textContent=e.message;}
}

function showPage(page){if(videoFocusMode&&page!=='video')closeVideoFocus();if(page!=='community'){stopChatTyping();document.body.classList.remove("svoe-chat-open");clearInterval(chatPollTimer);chatPollTimer=null;activeChatThread=null;}if(page==='admin'&&currentUser?.role!=='owner'){toast('Нет доступа к панели владельца.','error');return;}const target=$('page-'+page);if(!target){toast('Раздел пока готовится.');return;}document.querySelectorAll('main section[id^="page-"]').forEach(x=>x.classList.add('hidden'));target.classList.remove('hidden');document.body.dataset.page=page;document.querySelectorAll('.nav').forEach(x=>x.classList.remove('active'));const map={home:'nav-home',video:'nav-video',helpers:'nav-tools',chef:'nav-tools',mechanic:'nav-tools',invoice:'nav-tools',community:'nav-community',tasks:'nav-tasks',settings:'nav-settings',admin:'nav-settings',profile:'nav-settings'};const nav=$(map[page]||'nav-tools');if(nav)nav.classList.add('active');if(page==='community')loadChatList();if(page==='tasks')renderTasks();if(page==='home')renderToday();if(page==='video'){videoItems=[];videoTopicPage=1;videoSessionSeed=Math.floor(Math.random()*5)+1;loadAutoVideoFeed(true);}try{localStorage.setItem('svoe_last_page',page);}catch(e){}window.scrollTo({top:0,behavior:settings.animations&&!settings.reduced?'smooth':'auto'});}
function dispatchHomeCommand(){const q=String($('home-command-input')?.value||'').trim().toLowerCase();if(!q){showPage('helpers');return;}if(/рецепт|еда|приготов|ужин|завтрак|шеф/.test(q)){showPage('chef');return;}if(/машин|авто|двигател|механик/.test(q)){showPage('mechanic');return;}if(/уч[её]т|товар|склад|остат|инвентар|наклад/.test(q)){showPage('invoice');return;}if(/задач|напом|дело|план/.test(q)){showPage('tasks');return;}if(/чат|сообщ|семь|друз|общен/.test(q)){showPage('community');return;}showPage('helpers');toast('Подходящий раздел пока не найден. Посмотри каталог помощников.');}
function addTask(){const title=String($('task-title')?.value||'').trim();if(!title){toast('Напиши, что нужно сделать.','error');return;}appData.tasks=Array.isArray(appData.tasks)?appData.tasks:[];appData.tasks.unshift({id:crypto.randomUUID(),title:title.slice(0,160),due:$('task-due')?.value||'',done:false,createdAt:new Date().toISOString()});$('task-title').value='';$('task-due').value='';saveData();renderTasks();renderToday();toast('Задача добавлена.');}
function toggleTask(id){const t=(appData.tasks||[]).find(x=>x.id===id);if(!t)return;t.done=!t.done;saveData();renderTasks();renderToday();}
function deleteTask(id){appData.tasks=(appData.tasks||[]).filter(x=>x.id!==id);saveData();renderTasks();renderToday();}
function taskNode(t){const item=document.createElement('div');item.className='history-item';const row=document.createElement('div');row.style.display='flex';row.style.alignItems='center';row.style.gap='9px';const check=document.createElement('input');check.type='checkbox';check.checked=!!t.done;check.setAttribute('aria-label','Отметить задачу выполненной');check.onchange=()=>toggleTask(t.id);row.appendChild(check);const title=document.createElement('strong');title.textContent=t.title;title.style.flex='1';if(t.done)title.style.textDecoration='line-through';row.appendChild(title);item.appendChild(row);const meta=document.createElement('small');meta.textContent=(t.due?'Срок: '+new Date(t.due+'T12:00:00').toLocaleDateString('ru-RU')+' · ':'')+(t.done?'Выполнено':'В работе');item.appendChild(meta);const del=document.createElement('button');del.className='mini-btn';del.textContent='Удалить';del.style.marginTop='8px';del.onclick=()=>deleteTask(t.id);item.appendChild(del);return item;}
function renderTasks(){const box=$('task-list');if(!box)return;box.innerHTML='';const tasks=Array.isArray(appData.tasks)?appData.tasks:[];$('task-count').textContent=tasks.length+' задач · '+tasks.filter(x=>!x.done).length+' активных';if(!tasks.length){box.innerHTML='<div class="panel muted">Пока задач нет. Добавь первую — она появится здесь.</div>';return;}tasks.forEach(t=>box.appendChild(taskNode(t)));}
function renderToday(){const box=$('home-today');if(!box)return;box.innerHTML='';const tasks=(Array.isArray(appData.tasks)?appData.tasks:[]).filter(t=>!t.done).slice(0,3);if(!tasks.length){box.innerHTML='<p class="muted">На сегодня пока нет активных задач. Добавь дело, чтобы ничего не забыть.</p><button class="mini-btn" onclick="showPage(\'tasks\')">Добавить задачу</button>';return;}tasks.forEach(t=>box.appendChild(taskNode(t)));const all=document.createElement('button');all.className='mini-btn';all.textContent='Все задачи';all.onclick=()=>showPage('tasks');box.appendChild(all);}
function renderChefMode(){ $('chef-pantry').classList.toggle('hidden',chefMode!=='pantry');$('chef-specific').classList.toggle('hidden',chefMode!=='specific');$('tab-pantry').classList.toggle('active',chefMode==='pantry');$('tab-specific').classList.toggle('active',chefMode==='specific');}
function loadData(){try{const d=JSON.parse(localStorage.getItem(APP_KEY)||'null');if(d&&(d.version===2||d.version===3||d.version===4)){appData.tasks=Array.isArray(d.tasks)?d.tasks:[];appData.history=Array.isArray(d.history)?d.history:[];appData.favorites=Array.isArray(d.favorites)?d.favorites:[];appData.kitchen=d.kitchen||appData.kitchen;appData.mechanicCases=Array.isArray(d.mechanicCases)?d.mechanicCases.map(x=>({...x,mode:x.mode==='quick'?'quick':'deep'})):[];appData.maintenance=d.maintenance&&typeof d.maintenance==='object'?{vehicle:d.maintenance.vehicle||{name:'',odometer:''},items:Array.isArray(d.maintenance.items)?d.maintenance.items:[]}:appData.maintenance;}}catch(e){console.warn(e)}try{const s=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null');if(s)settings={...settings,...s};}catch(e){console.warn(e)}applySettings();renderHistory();}
function saveData(){try{appData.version=4;localStorage.setItem(APP_KEY,JSON.stringify(appData));queueConversationSync();}catch(e){toast('Не удалось сохранить данные. Возможно, память браузера заполнена.','error');}}
function applySettings(){const root=document.documentElement;let theme=settings.theme;if(theme==='system')theme=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';root.dataset.theme=theme==='dark'?'dark':theme==='light'?'light':'warm';document.body.classList.toggle('compact',!!settings.compact);document.body.classList.toggle('no-anim',!settings.animations||settings.reduced);if($('general-warning'))$('general-warning').classList.toggle('hidden',!settings.warnings);Object.keys(settings).forEach(k=>{const el=$('set-'+k);if(el){if(el.type==='checkbox')el.checked=!!settings[k];else el.value=settings[k];}});}
function updateSetting(key,value){settings[key]=value;localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));applySettings();if(key==='tap'&&value){prepareSvoeAudio();playTone('tap');}}
function resetSettings(){if(settings.confirm&&!confirm('Вернуть настройки приложения к исходным?'))return;settings={theme:'warm',compact:false,animations:true,reduced:false,tap:false,start:false,done:false,error:false,volume:25,warnings:true,history:true,confirm:true};localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));applySettings();toast('Настройки восстановлены');}
let svoeAudioContext=null;function prepareSvoeAudio(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;if(!svoeAudioContext)svoeAudioContext=new C({latencyHint:'interactive'});if(svoeAudioContext.state==='suspended')svoeAudioContext.resume();return svoeAudioContext;}catch(e){return null;}}function playTone(type){if(type==='tap'&&!settings.tap)return;if(type==='start'&&!settings.start)return;if(type==='done'&&!settings.done&&$('set-done')&&!$('set-done').checked)return;if(type==='error'&&!settings.error)return;const ctx=prepareSvoeAudio();if(!ctx)return;const vol=Math.max(0,Math.min(100,Number(settings.volume)||0))/100;if(!vol)return;try{const osc=ctx.createOscillator(),gain=ctx.createGain();const now=ctx.currentTime;const notes=type==='done'?[740,990]:type==='error'?[245,185]:type==='start'?[520,660]:[520];osc.type='sine';osc.frequency.setValueAtTime(notes[0],now);if(notes[1])osc.frequency.setValueAtTime(notes[1],now+.075);gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(Math.min(.22,vol*.22),now+.008);gain.gain.exponentialRampToValueAtTime(.0001,now+(type==='done'?.27:type==='start'?.15:.085));osc.connect(gain);gain.connect(ctx.destination);osc.start(now);osc.stop(now+(type==='done'?.28:type==='start'?.16:.095));}catch(e){}}document.addEventListener('pointerdown',e=>{if(!settings.tap||!e.target.closest('button'))return;prepareSvoeAudio();playTone('tap');},{capture:true,passive:true});document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.closest('button')&&settings.tap)playTone('tap');},true);
function toast(message,type='success'){const old=$('toast');if(old)old.remove();const el=document.createElement('div');el.id='toast';el.className='status '+(type==='error'?'error':'success');el.textContent=message;el.style.cssText='position:fixed;z-index:99;left:16px;right:16px;bottom:90px;max-width:680px;margin:auto;box-shadow:var(--shadow)';document.body.appendChild(el);setTimeout(()=>el.remove(),3500);}
function friendlyError(err,response){const status=response?.status||0;const raw=String(err?.message||err||'');if(!navigator.onLine)return 'Нет подключения к интернету. Проверьте соединение и попробуйте ещё раз.';if(status===429||/rate_limit|too many requests|quota/i.test(raw))return 'Временно достигнут лимит запросов к ИИ. Подождите немного и попробуйте снова.';if(status===401||status===403)return 'Сервис ИИ отклонил запрос. Возможно, возникла проблема с доступом. Сообщите разработчику.';if(status>=500)return 'Сервис ИИ временно недоступен. Попробуйте повторить запрос немного позже.';if(/failed to generate json|failed_generation|json/i.test(raw))return 'ИИ не смог оформить ответ правильно. Попробуйте ещё раз или немного измените описание задачи.';if(/failed to fetch|networkerror|load failed/i.test(raw))return 'Не удалось связаться с сервером. Проверьте интернет и попробуйте снова.';if(/empty|пустой ответ/i.test(raw))return 'ИИ прислал пустой ответ. Попробуйте повторить запрос.';return 'Не удалось получить ответ от ИИ. Попробуйте ещё раз. Если ошибка повторится, сообщите разработчику.';}
function cleanJson(text){return String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');}
async function callAI(payload){
 if(!authToken)throw new Error('Сначала войдите в аккаунт.');
 let response;
 try{
  response=await fetch(WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+authToken},body:JSON.stringify(payload)});
 }catch(e){throw new Error(friendlyError(e));}
 let data;
 try{data=await response.json();}catch(e){throw new Error(friendlyError(new Error('empty response'),response));}
 if(response.status===401){
  authToken='';currentUser=null;
  localStorage.removeItem('ai_bragina_token');localStorage.removeItem('ai_bragina_user');
  $('auth-screen').classList.remove('hidden');
  throw new Error('Сессия завершена. Войдите в аккаунт снова.');
 }
 if(!response.ok){const er=new Error(data?.error?.message||data?.error||'request failed');er.status=response.status;throw new Error(friendlyError(er,response));}
 const content=data?.choices?.[0]?.message?.content;
 if(!content)throw new Error('ИИ прислал пустой ответ. Попробуйте повторить запрос.');
 return {content,usage:data.usage||null};
}
function tokenText(u){if(!u)return 'Статистика токенов не пришла от сервера.';return `Вход: ${u.prompt_tokens??'—'} · Выход: ${u.completion_tokens??'—'} · Всего: ${u.total_tokens??'—'} токенов`;}
function addCaseUsage(c,u){if(!c.usage)c.usage={prompt_tokens:0,completion_tokens:0,total_tokens:0,requests:0};if(u){c.usage.prompt_tokens+=Number(u.prompt_tokens)||0;c.usage.completion_tokens+=Number(u.completion_tokens)||0;c.usage.total_tokens+=Number(u.total_tokens)||0;c.usage.requests++;}c.updatedAt=new Date().toISOString();saveData();}
function caseUsageMarkup(c,last){return `<div class="token-box"><strong>Расход ИИ</strong><br>Этот запрос: ${escapeHTML(tokenText(last))}<br>По этой неисправности: ${c.usage?.total_tokens??0} токенов · запросов: ${c.usage?.requests??0}</div>`;}
function escapeHTML(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function parseList(v){return String(v||'').split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean);}
function makeChefPrompts(regen){let inputs;if(chefMode==='specific'){inputs={mode:'specific',dish:$('chef-dish').value.trim(),servings:$('chef-servings2').value,wishes:$('chef-wishes2').value.trim()};if(!inputs.dish)throw new Error('Напишите название блюда.');}else{inputs={mode:'pantry',main:parseList($('chef-products').value),extras:parseList($('chef-extras').value),basics:$('chef-use-staples')?.checked?(appData.kitchen?.staples||['соль','чёрный перец','сахар','растительное масло']).filter(x=>!['вода','воду'].includes(norm(x))):[],meal:$('chef-type').value,servings:$('chef-servings').value,wishes:$('chef-wishes').value.trim()};if(!inputs.main.length)throw new Error('Укажите хотя бы один основной продукт.');const unsafe=inputs.main.concat(inputs.extras).some(x=>/(кошка|кошк|кот|собака|собак|пёс|пес|щенок|котёнок|котенок|питомец|животн)/i.test(x));if(unsafe)throw new Error('В списке указано домашнее животное. ИИ-Шеф работает только с пищевыми продуктами. Удалите эту позицию и укажите продукты, которые можно использовать для приготовления.');}
const old=variantTitles.slice(-5).join('; ')||'Нет';let system,user;if(inputs.mode==='pantry'){system=`Ты профессиональный шеф-повар. Составь простой, полноценный рецепт из основных и дополнительных продуктов пользователя. СТРОГО: массив ingredients содержит только продукты из основных и дополнительных списков. Не добавляй туда домашние базовые продукты. Отдельные домашние продукты из списка BASIC допускается предложить только в массиве optional_staples и использовать в шагах как необязательные добавки. Они не должны быть обязательными: рецепт должен оставаться выполнимым, если человек их не положит. Не добавляй никакие другие продукты, даже если они кажутся обычными. Не заменяй один продукт другим. Если рецепт невозможен, честно объясни это в result. Верни валидный JSON с полями title, servings, difficulty, time, ingredients (массив объектов name/amount), optional_staples (массив объектов name/amount), steps (массив строк), result, tips (массив), improvements (массив). Дай не менее 3 подробных шагов, если рецепт возможен. Пиши по-русски.`;user=`ОСНОВНЫЕ ПРОДУКТЫ ПОЛЬЗОВАТЕЛЯ: ${inputs.main.join(', ')}. ДОПОЛНИТЕЛЬНЫЕ ПРОДУКТЫ: ${inputs.extras.join(', ')||'нет'}. РАЗРЕШЁННЫЕ ДЛЯ НЕОБЯЗАТЕЛЬНОГО ИСПОЛЬЗОВАНИЯ ДОМАШНИЕ БАЗОВЫЕ ПРОДУКТЫ (только если уместны, обязательно укажи отдельно): ${inputs.basics.join(', ')||'не использовать'}. Тип блюда: ${inputs.meal}. Порции: ${inputs.servings}. Пожелания: ${inputs.wishes||'нет'}. Предыдущие варианты, не повторять: ${old}. Составь рецепт: основные и дополнительные продукты — обязательная основа, домашние базовые продукты — только необязательное дополнение. Если человек их не добавит, рецепт всё равно должен быть понятным и выполнимым.`;}else{system=`Ты профессиональный шеф-повар. Составь качественный и реалистичный рецепт указанного блюда. Пользователь может купить ингредиенты. Укажи точные количества, время, температуру и признаки готовности. Соблюдай пищевую безопасность, особенно для мяса и птицы. Сохрани именно указанное блюдо. Не повторяй предыдущие варианты. Верни только JSON с полями title, servings, difficulty, time, ingredients (массив объектов name/amount), steps (массив строк), result, tips (массив), shopping_list (массив). Пиши по-русски.`;user=`Блюдо: ${inputs.dish}. Порции: ${inputs.servings}. Пожелания: ${inputs.wishes||'нет'}. Предыдущие варианты: ${old}. Создай рецепт.`;}return {inputs,system,user};}
async function generateChef(regen=false){if(isBusy)return;let p;try{p=makeChefPrompts(regen);}catch(e){toast(e.message,'error');return;}if(!regen)variantTitles=[];isBusy=true;playTone('start');const btn=$(chefMode==='pantry'?'chef-generate':'chef-generate2');btn.disabled=true;btn.textContent='ИИ готовит ответ…';$('chef-result').classList.remove('hidden');$('chef-output').innerHTML='<div class="loader"><span class="spinner"></span><span class="muted">ИИ-Шеф подбирает рецепт. Это может занять несколько секунд.</span></div>';
try{
 let result=null,recipe=null,lastProblem='';
 const attempts=p.inputs.mode==='pantry'?2:1;
 for(let attempt=0;attempt<attempts;attempt++){
  const correction=attempt===0?'':('\n\nИСПРАВЛЕНИЕ ПРЕДЫДУЩЕГО ОТВЕТА: '+lastProblem+'. Сгенерируй рецепт заново. В ingredients разрешены только основные и дополнительные продукты: '+[...p.inputs.main,...p.inputs.extras].join(', ')+'. Домашние продукты '+(p.inputs.basics||[]).join(', ')+' можно указать только в optional_staples и использовать необязательно. Верни полный JSON.');
  result=await callAI({model:'openai/gpt-oss-120b',messages:[{role:'system',content:p.system},{role:'user',content:p.user+correction}],temperature:p.inputs.mode==='pantry'?.25:.45,max_tokens:2600,response_format:{type:'json_object'}});
  try{recipe=JSON.parse(cleanJson(result.content));}catch(e){lastProblem='ответ не является корректным полным JSON';recipe=null;}
  if(!recipe||typeof recipe.title!=='string'||!Array.isArray(recipe.ingredients)||!Array.isArray(recipe.steps)||!recipe.ingredients.length||!recipe.steps.length){lastProblem='ответ неполный: нужны название, список ингредиентов и шаги приготовления';recipe=null;if(attempt+1<attempts)continue;throw new Error('ИИ не смог составить полный рецепт даже после повторной попытки. Попробуйте ещё раз или добавьте продукты.');}
  if(p.inputs.mode==='pantry'){
   const allowed=[...p.inputs.main,...p.inputs.extras].map(norm).filter(Boolean);
   const bad=recipe.ingredients.filter(x=>!x||typeof x.name!=='string'||!allowed.includes(norm(x.name)));
   if(bad.length){lastProblem='в прошлый раз были добавлены запрещённые продукты: '+bad.map(x=>x?.name||'неизвестный продукт').join(', ');recipe=null;if(attempt+1<attempts)continue;throw new Error('ИИ снова предложил продукты не из вашего списка ('+bad.map(x=>x?.name||'неизвестный продукт').join(', ')+'). Рецепт не показан. Попробуйте уточнить список продуктов.');}
  }
  break;
 }
 if(!recipe)throw new Error('Не удалось получить корректный рецепт. Попробуйте ещё раз.');
 currentRecipe=recipe;variantTitles.push(recipe.title);renderRecipe(recipe,p.inputs.mode,result?.usage);if(settings.history){appData.history.unshift({id:'r_'+Date.now(),title:recipe.title,mode:p.inputs.mode,date:new Date().toISOString(),recipe,inputs:p.inputs});appData.history=appData.history.slice(0,100);const ids=new Set(appData.history.map(x=>x.id));appData.favorites=appData.favorites.filter(x=>ids.has(x));saveData();renderHistory();}playTone('done');
}catch(e){$('chef-output').innerHTML='';const msg=document.createElement('div');msg.className='status error';msg.textContent=e.message||'Не удалось получить рецепт. Попробуйте снова.';$('chef-output').appendChild(msg);playTone('error');}finally{isBusy=false;btn.disabled=false;btn.textContent='Создать рецепт';}}
function norm(v){return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/\([^)]*\)/g,'').replace(/\d+(?:[.,]\d+)?\s*(г|кг|мл|л|шт|грамм|литр)/gi,'').replace(/[^а-яa-z\s-]/gi,'').replace(/\s+/g,' ').trim();}
function renderRecipe(r,mode,usage){const out=$('chef-output');out.innerHTML='';const card=document.createElement('div');card.className='recipe';const h=document.createElement('h3');h.textContent=r.title;card.appendChild(h);const meta=document.createElement('div');meta.className='recipe-meta';meta.textContent=`${r.servings||'—'} порц. · ${r.difficulty||'Сложность не указана'} · ${r.time||'Время не указано'}`;card.appendChild(meta);function section(title,items,ordered){if(!Array.isArray(items)||!items.length)return;const head=document.createElement('h4');head.textContent=title;card.appendChild(head);const list=document.createElement(ordered?'ol':'ul');items.forEach(x=>{const li=document.createElement('li');li.textContent=typeof x==='string'?x:`${x.name} — ${x.amount||'по необходимости'}`;list.appendChild(li);});card.appendChild(list);}section('Ингредиенты',r.ingredients,false);if(mode==='pantry')section('Можно добавить по желанию',r.optional_staples,false);section('Приготовление',r.steps,true);if(r.result){const p=document.createElement('p');p.className='muted';p.textContent=r.result;card.appendChild(p);}section('Советы',r.tips,false);section(mode==='specific'?'Список покупок':'Что можно добавить отдельно',mode==='specific'?(r.shopping_list||[]):(r.improvements||[]),false);out.appendChild(card);if(usage){const stat=document.createElement('div');stat.className='muted';stat.style.marginTop='10px';stat.textContent=`Токены запроса: ${usage.total_tokens??'нет данных'}`;out.appendChild(stat);}}
function renderHistory(){const box=$('recipe-history');if(!box)return;box.innerHTML='';if(!appData.history.length){box.innerHTML='<p class="muted">Сохранённых рецептов пока нет.</p>';return;}appData.history.slice(0,12).forEach(entry=>{const item=document.createElement('div');item.className='history-item';const title=document.createElement('strong');title.textContent=entry.title;item.appendChild(title);const date=document.createElement('small');date.textContent=new Date(entry.date).toLocaleString('ru-RU');item.appendChild(date);const actions=document.createElement('div');actions.className='history-actions';const open=document.createElement('button');open.textContent='Открыть';open.onclick=()=>{renderRecipe(entry.recipe,entry.mode);$('chef-result').classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'});};const fav=document.createElement('button');fav.textContent=appData.favorites.includes(entry.id)?'★ В избранном':'☆ В избранное';fav.onclick=()=>{appData.favorites.includes(entry.id)?appData.favorites=appData.favorites.filter(x=>x!==entry.id):appData.favorites.push(entry.id);saveData();renderHistory();};const del=document.createElement('button');del.textContent='Удалить';del.onclick=()=>{if(settings.confirm&&!confirm('Удалить этот рецепт?'))return;appData.history=appData.history.filter(x=>x.id!==entry.id);appData.favorites=appData.favorites.filter(x=>x!==entry.id);saveData();renderHistory();};actions.append(open,fav,del);item.appendChild(actions);box.appendChild(item);});}
let activeCaseId=null,mechanicLastUsage=null,mechanicMode="deep";
function showMechanicMode(mode){mechanicMode=mode;$(`mechanic-quick-form`).classList.toggle("hidden",mode!=="quick");$("mechanic-start-form").classList.toggle("hidden",mode!=="deep");$("mechanic-mode-quick").classList.toggle("active",mode==="quick");$("mechanic-mode-deep").classList.toggle("active",mode==="deep");}
function showMechanicTab(tab){['new','history','maint'].forEach(t=>{$('mech-'+t).classList.toggle('hidden',t!==tab);$('mech-tab-'+t).classList.toggle('active',t===tab);});if(tab==='history')renderMechanicHistory();if(tab==='maint')renderMaintenance();}
function activeCase(){return appData.mechanicCases.find(x=>x.id===activeCaseId)||null;}
function startNewMechanic(){activeCaseId=null;showMechanicMode('deep');$('mechanic-start-form').classList.remove('hidden');$('mechanic-quick-form').classList.add('hidden');$('mechanic-result').classList.add('hidden');['car-brand','car-model','car-year','car-engine','car-mileage','car-vin','car-problem','car-code','quick-problem'].forEach(id=>$(id).value='');$('car-when').selectedIndex=0;showMechanicTab('new');window.scrollTo({top:0,behavior:'smooth'});}
function statusInfo(status){return status==='resolved'?{cls:'solved',icon:'🔩',label:'Решена'}:status==='in_progress'?{cls:'progress',icon:'⚠',label:'В процессе'}:{cls:'open',icon:'✕',label:'Не решена'};}
function setCaseStatus(id,status){const c=appData.mechanicCases.find(x=>x.id===id);if(!c)return;c.status=status;c.updatedAt=new Date().toISOString();saveData();if(activeCaseId===id)renderActiveCase(c,c.lastUsage);renderMechanicHistory();toast('Статус неисправности обновлён.');}
function renderActiveCase(c,lastUsage){if(!c)return;$('mechanic-result').classList.remove('hidden');$('mechanic-start-form').classList.add('hidden');$('mechanic-quick-form').classList.add('hidden');const si=statusInfo(c.status);if(c.mode==='quick'){const out=$('mechanic-output');out.innerHTML='';const h=document.createElement('h3');h.textContent='Возможные причины';h.style.fontSize='15px';out.appendChild(h);if(c.diagnosis?.summary){const summary=document.createElement('p');summary.className='muted';summary.textContent=c.diagnosis.summary;out.appendChild(summary);}const causes=Array.isArray(c.diagnosis?.possible_causes)?c.diagnosis.possible_causes:[];if(c.diagnosis){if(c.diagnosis.risk&&/высок|опас/i.test(c.diagnosis.risk)){const warn=document.createElement('div');warn.className='notice';warn.textContent='Возможен опасный характер неисправности. Не продолжай движение, если автомобиль может быть небезопасен.';out.appendChild(warn);}if(causes.length){const ul=document.createElement('ul');causes.forEach(x=>{const li=document.createElement('li');li.textContent=String(x);li.style.fontSize='13px';li.style.lineHeight='1.5';li.style.margin='8px 0';ul.appendChild(li);});out.appendChild(ul);}else{const empty=document.createElement('p');empty.className='muted';empty.textContent='ИИ пока не смог определить вероятные причины. Попробуй описать симптом немного иначе.';out.appendChild(empty);}}else{out.innerHTML='<div class="loader"><span class="spinner"></span><span class="muted">ИИ анализирует описание…</span></div>';}$('mechanic-followup').classList.add('hidden');$('mechanic-actions').classList.add('hidden');return;}$('mechanic-status').className='status-chip '+si.cls;$('mechanic-status').textContent=si.icon+' '+si.label;const out=$('mechanic-output');out.innerHTML='';const h=document.createElement('h3');h.textContent=c.title||`${[c.vehicle?.brand,c.vehicle?.model].filter(Boolean).join(' ')||'Автомобиль не указан'}: неисправность`;h.style.fontSize='15px';out.appendChild(h);const meta=document.createElement('div');meta.className='case-meta';meta.textContent=`${[c.vehicle?.brand,c.vehicle?.model,c.vehicle?.year].filter(Boolean).join(' ')||'Автомобиль не указан'} · ${c.mode==='quick'?'Быстрая диагностика':'Глубокая диагностика'} · ${new Date(c.createdAt).toLocaleString('ru-RU')}`;out.appendChild(meta);const summary=document.createElement('div');summary.className='status '+(c.diagnosis?.risk&&/высок|опас/i.test(c.diagnosis.risk)?'error':'');summary.textContent=`Риск: ${c.diagnosis?.risk||'не определён'}\n${c.diagnosis?.summary||c.problem}`;out.appendChild(summary);function add(title,arr){if(!Array.isArray(arr)||!arr.length)return;const hh=document.createElement('h4');hh.textContent=title;out.appendChild(hh);const ul=document.createElement('ul');arr.forEach(x=>{const li=document.createElement('li');li.textContent=String(x);ul.appendChild(li);});out.appendChild(ul);}add('Возможные причины',c.diagnosis?.possible_causes);add('Что проверить безопасно',c.diagnosis?.checks);if(c.diagnosis?.next_step){const n=document.createElement('div');n.className='status';n.textContent='Следующий шаг: '+c.diagnosis.next_step;out.appendChild(n);}if(c.diagnosis?.drive_advice){const d=document.createElement('div');d.className='notice';d.textContent='Можно ли ехать: '+c.diagnosis.drive_advice;out.appendChild(d);}if(c.repairPlan){const plan=document.createElement('div');plan.className='repair-plan';const ph=document.createElement('h4');ph.textContent='План ремонта и запчасти';plan.appendChild(ph);const txt=document.createElement('div');txt.textContent=c.repairPlan;txt.style.whiteSpace='pre-wrap';txt.style.fontSize='12px';txt.style.lineHeight='1.55';plan.appendChild(txt);out.appendChild(plan);}if(c.partsNote){const pn=document.createElement('div');pn.className='status';pn.textContent='Что нужно заказать / комментарий: '+c.partsNote;out.appendChild(pn);}if(c.userNotes){const un=document.createElement('div');un.className='status';un.textContent='Заметки: '+c.userNotes;out.appendChild(un);}const log=document.createElement('div');log.className='case-meta';log.textContent=`История общения: ${c.dialogue?.length||0} уточнений`;out.appendChild(log);out.insertAdjacentHTML('beforeend',caseUsageMarkup(c,lastUsage||c.lastUsage));renderFollowup(c);renderCaseActions(c);}
function renderFollowup(c){const box=$('mechanic-followup');box.innerHTML='';box.classList.remove('hidden');const qs=Array.isArray(c.diagnosis?.questions)?c.diagnosis.questions:[];if(qs.length){const head=document.createElement('h4');head.textContent='Ответь на уточняющие вопросы';box.appendChild(head);qs.forEach((q,i)=>{const card=document.createElement('div');card.className='question-card';const title=document.createElement('strong');title.textContent=(i+1)+'. '+q;card.appendChild(title);const sel=document.createElement('select');sel.className='question-answer';sel.dataset.index=i;[['','Выбери ответ'],['Да','Да'],['Нет','Нет'],['Не знаю','Не знаю / не проверял'],['Не применимо','Не относится к моей ситуации']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;sel.appendChild(o);});card.appendChild(sel);const extra=document.createElement('textarea');extra.className='question-extra';extra.placeholder='Дополнение: например, когда именно это происходит…';card.appendChild(extra);box.appendChild(card);});}else{const p=document.createElement('p');p.className='muted';p.textContent='Дополнительных вопросов пока нет. Можно сообщить новые симптомы или результат проверки и продолжить разбор.';box.appendChild(p);}const label=document.createElement('div');label.className='field';label.innerHTML='<label>Новая информация или результаты проверки</label>';const extra=document.createElement('textarea');extra.id='mechanic-new-info';extra.placeholder='Например: проверил свечи — одна мокрая; звук появился сильнее; заменил датчик, но ошибка осталась…';label.appendChild(extra);box.appendChild(label);const btn=document.createElement('button');btn.className='btn';btn.textContent=c.mode==='quick'?'Уточнить быструю диагностику':'Отправить ответы и продолжить';btn.onclick=()=>continueMechanic(c.id);box.appendChild(btn);}
function renderCaseActions(c){const box=$('mechanic-actions');box.innerHTML='';box.classList.remove('hidden');const h=document.createElement('h4');h.textContent='Следующие действия';box.appendChild(h);const repair=document.createElement('button');repair.className='btn secondary';repair.textContent='Подобрать запчасти и порядок ремонта';repair.onclick=()=>makeRepairPlan(c.id);box.appendChild(repair);const fields=document.createElement('div');fields.className='field';fields.innerHTML='<label>Запчасти, инструменты или что нужно заказать</label>';const note=document.createElement('textarea');note.id='case-parts-note';note.value=c.partsNote||'';note.placeholder='Например: нужен датчик ABS передний левый, пока не заказал…';fields.appendChild(note);const save=document.createElement('button');save.className='btn secondary';save.textContent='Сохранить комментарий';save.onclick=()=>{c.partsNote=$('case-parts-note').value.trim();c.updatedAt=new Date().toISOString();saveData();toast('Комментарий сохранён.');};fields.appendChild(save);box.appendChild(fields);const notes=document.createElement('div');notes.className='field';notes.innerHTML='<label>Личные заметки по ремонту</label>';const ta=document.createElement('textarea');ta.id='case-user-notes';ta.value=c.userNotes||'';ta.placeholder='Что уже сделал, что сказал мастер, какие детали проверены…';notes.appendChild(ta);const saveN=document.createElement('button');saveN.className='btn secondary';saveN.textContent='Сохранить заметки';saveN.onclick=()=>{c.userNotes=$('case-user-notes').value.trim();c.updatedAt=new Date().toISOString();saveData();toast('Заметки сохранены.');};notes.appendChild(saveN);box.appendChild(notes);const statusLabel=document.createElement('div');statusLabel.className='field';statusLabel.innerHTML='<label>Статус неисправности</label>';const select=document.createElement('select');select.id='case-status-select';[['open','✕ Не решена'],['in_progress','⚠ В процессе / ожидаю запчасти'],['resolved','🔩 Решена — проверено после ремонта']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;select.appendChild(o);});select.value=c.status;statusLabel.appendChild(select);const statusBtn=document.createElement('button');statusBtn.className='btn secondary';statusBtn.textContent='Обновить статус';statusBtn.onclick=()=>{if(select.value==='resolved'&&!confirm('Подтверждаешь, что неисправность устранена и результат проверен?'))return;setCaseStatus(c.id,select.value);};statusLabel.appendChild(statusBtn);box.appendChild(statusLabel);const close=document.createElement('button');close.className='btn secondary';close.textContent='Вернуться к списку неисправностей';close.onclick=()=>{showMechanicTab('history');};box.appendChild(close);}
async function askMechanic(){if(isBusy)return;const vehicle={brand:$('car-brand').value.trim(),model:$('car-model').value.trim(),year:$('car-year').value.trim(),engine:$('car-engine').value.trim(),mileage:$('car-mileage').value.trim(),vin:$('car-vin').value.trim()};const problem=$('car-problem').value.trim();if(!vehicle.brand||!vehicle.model||!problem){toast('Укажи марку, модель и опиши, что произошло.','error');return;}const c={id:'m_'+Date.now(),mode:'deep',title:`${vehicle.brand} ${vehicle.model}: ${problem.slice(0,65)}`,vehicle,problem,when:$('car-when').value,code:$('car-code').value.trim(),status:'open',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),diagnosis:null,dialogue:[],usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0,requests:0},lastUsage:null,repairPlan:'',partsNote:'',userNotes:''};appData.mechanicCases.unshift(c);activeCaseId=c.id;if(!appData.maintenance.vehicle.name)appData.maintenance.vehicle={name:`${vehicle.brand} ${vehicle.model} ${vehicle.year}`.trim(),odometer:vehicle.mileage};saveData();await runMechanicAI(c,'initial');}
async function askQuickMechanic(){if(isBusy)return;const problem=$('quick-problem').value.trim();if(!problem){toast('Опиши, что именно не работает.','error');return;}const c={id:'m_'+Date.now(),mode:'quick',title:'Быстрая диагностика: '+problem.slice(0,75),vehicle:{brand:'',model:'',year:'',engine:'',mileage:'',vin:''},problem,when:'',code:'',status:'open',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),diagnosis:null,dialogue:[],usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0,requests:0},lastUsage:null,repairPlan:'',partsNote:'',userNotes:''};appData.mechanicCases.unshift(c);activeCaseId=c.id;saveData();await runMechanicAI(c,'quick');}
async function runMechanicAI(c,kind,payloadText=''){if(isBusy)return;isBusy=true;const btn=$(kind==='quick'?'quick-mechanic-btn':'mechanic-btn');if(btn)btn.disabled=true;const out=$('mechanic-output');$('mechanic-result').classList.remove('hidden');$('mechanic-start-form').classList.add('hidden');$('mechanic-quick-form').classList.add('hidden');out.innerHTML='<div class="loader"><span class="spinner"></span><span class="muted">ИИ-Механик анализирует информацию. Не закрывай страницу, пожалуйста.</span></div>';$('mechanic-followup').classList.add('hidden');$('mechanic-actions').classList.add('hidden');playTone('start');const deepSystem=`Ты автомобильный диагност-консультант. Это предварительная консультация, не выдавай гипотезу за установленный факт. Сначала безопасность: при подозрении на неисправность тормозов, рулевого управления, шин, перегреве, красной лампе давления масла, утечке топлива, дыме, сильном стуке или резкой потере мощности прямо рекомендуй безопасно остановиться, заглушить двигатель при необходимости и вызвать эвакуатор/специалиста. Не советуй залезать под машину без сертифицированных опор, касаться движущихся/горячих частей или работать с топливом/высоким напряжением. Не придумывай характеристики авто и артикулы деталей. Если данных недостаточно, задай короткие конкретные вопросы. Для каждого вопроса пользователь сможет ответить Да, Нет, Не знаю и добавить пояснение. Не повторяй уже отвеченные вопросы. Разделяй подтверждённые факты и предположения. Верни ТОЛЬКО JSON: {"summary":"...","risk":"низкий/средний/высокий","possible_causes":["..."],"checks":["безопасная проверка"],"questions":["вопрос"],"next_step":"...","drive_advice":"...","confidence":"низкая/средняя/высокая"}. Пиши простым русским языком.`;const quickSystem=`Ты автомобильный диагност-консультант. Пользователь ввёл только свободное описание неисправности. По этому описанию перечисли 2–5 наиболее вероятных причин простым русским языком. Не требуй марку, модель, год, пробег, код ошибки или дополнительные параметры. Не задавай вопросы. Не добавляй проверки, план ремонта, советы о движении, общие вступления и заключения. Не выдавай гипотезы за подтверждённый диагноз. Если симптом может быть опасен (тормоза, рулевое управление, шины, перегрев, красная лампа давления масла, топливо, дым), добавь краткое предупреждение в summary. Верни ТОЛЬКО JSON: {"summary":"краткая формулировка симптома","risk":"низкий/средний/высокий","possible_causes":["вероятная причина 1","вероятная причина 2"],"checks":[],"questions":[],"next_step":"","drive_advice":"","confidence":"низкая/средняя/высокая"}.`;;const system=kind==='quick'?quickSystem:deepSystem;const history=(c.dialogue||[]).map(x=>`${x.role==='user'?'Пользователь':'ИИ'}: ${x.text}`).join('\n');const user=`АВТОМОБИЛЬ: ${JSON.stringify(c.vehicle)}\nПРОБЛЕМА: ${c.problem}\nКОГДА: ${c.when}\nКОД ОШИБКИ: ${c.code||'не указан'}\nПРЕДЫДУЩИЙ РАЗБОР: ${JSON.stringify(c.diagnosis||{})}\nИСТОРИЯ ДИАЛОГА:\n${history||'нет'}\nНОВАЯ ИНФОРМАЦИЯ: ${payloadText||'первичное обращение'}\n${kind==='quick'?'Для быстрой диагностики: кратко ответь, не задавай больше двух вопросов.':'Сделай следующий шаг глубокой диагностики, обнови список гипотез и задай только действительно необходимые вопросы.'}`;try{const result=await callAI({model:'openai/gpt-oss-120b',messages:[{role:'system',content:system},{role:'user',content:user}],temperature:.25,max_tokens:1800,response_format:{type:'json_object'}});let d;try{d=JSON.parse(cleanJson(result.content));}catch(e){throw new Error('ИИ вернул ответ, который не удалось обработать. Повтори запрос — сохранённая неисправность не потеряется.');}if(!d||typeof d.summary!=='string'||!Array.isArray(d.questions)||!Array.isArray(d.possible_causes))throw new Error('Ответ ИИ оказался неполным. Данные диагностики сохранены, попробуй продолжить ещё раз.');c.diagnosis=d;c.lastUsage=result.usage||null;addCaseUsage(c,result.usage);c.dialogue.push({role:'assistant',text:d.summary+' Вопросов: '+d.questions.length,date:new Date().toISOString()});saveData();renderActiveCase(c,result.usage);playTone('done');}catch(e){out.innerHTML='';const msg=document.createElement('div');msg.className='status error';msg.textContent=e.message||'Не удалось получить ответ. Проверь интернет и попробуй ещё раз.';out.appendChild(msg);out.insertAdjacentHTML('beforeend',caseUsageMarkup(c,null));const retry=document.createElement('button');retry.className='btn secondary';retry.textContent='Повторить запрос';retry.onclick=()=>runMechanicAI(c,kind,payloadText);out.appendChild(retry);playTone('error');}finally{isBusy=false;if(btn)btn.disabled=false;}}
async function continueMechanic(id){const c=appData.mechanicCases.find(x=>x.id===id);if(!c||isBusy)return;const answers=[];document.querySelectorAll('#mechanic-followup .question-card').forEach((card,i)=>{const q=card.querySelector('strong')?.textContent||`Вопрос ${i+1}`;const a=card.querySelector('.question-answer')?.value||'Не ответил';const extra=card.querySelector('.question-extra')?.value.trim()||'';if(a||extra)answers.push(`${q}\nОтвет: ${a||'не указан'}\nПояснение: ${extra||'нет'}`);});const extra=$('mechanic-new-info')?.value.trim()||'';if(!answers.length&&!extra){toast('Ответь хотя бы на один вопрос или добавь новую информацию.','error');return;}const text=[answers.join('\n\n'),extra?'НОВОЕ / ИЗМЕНИВШЕЕСЯ: '+extra:''].filter(Boolean).join('\n\n');c.dialogue.push({role:'user',text,date:new Date().toISOString()});await runMechanicAI(c,c.mode==='quick'?'quick':'followup',text);}
async function makeRepairPlan(id){const c=appData.mechanicCases.find(x=>x.id===id);if(!c||isBusy)return;const btn=[...$('mechanic-actions').querySelectorAll('button')].find(x=>x.textContent.includes('Подобрать'));if(btn){btn.disabled=true;btn.textContent='Готовим план…';}isBusy=true;playTone('start');try{const system=`Ты консультант по ремонту автомобилей. На основании данных и предварительной диагностики предложи безопасный план дальнейших действий. Чётко разделяй: что подтверждено, что пока гипотеза, что должен проверить мастер. Перечисли необходимые запчасти и расходники, инструменты, порядок замены на общем уровне и проверки после ремонта. Не выдумывай OEM-артикулы, совместимость, моменты затяжки, объёмы и спецификации. Для точного подбора проси VIN/код двигателя и советуй сверять деталь по каталогу производителя или VIN у продавца. Если операция связана с тормозами, рулевым управлением, подушками безопасности, топливом, высоким напряжением гибридов/электромобилей или требует подъёма авто, предупреди о необходимости квалифицированного специалиста. Ответь простым русским текстом, можно с разделами.`;const user=`Автомобиль: ${JSON.stringify(c.vehicle)}\nПроблема: ${c.problem}\nДиагностика: ${JSON.stringify(c.diagnosis||{})}\nСоставь план: что уточнить перед покупкой, какие детали/расходники/инструменты могут понадобиться, как проверить совместимость, общий порядок ремонта, что проверить после. Не выдавай предположение за точный диагноз.`;const r=await callAI({model:'openai/gpt-oss-120b',messages:[{role:'system',content:system},{role:'user',content:user}],temperature:.2,max_tokens:1800});c.repairPlan=r.content;c.lastUsage=r.usage||null;addCaseUsage(c,r.usage);saveData();renderActiveCase(c,r.usage);toast('План ремонта добавлен. Проверь совместимость деталей перед покупкой.');playTone('done');}catch(e){toast(e.message||'Не удалось составить план ремонта.','error');playTone('error');}finally{isBusy=false;if(btn){btn.disabled=false;btn.textContent='Подобрать запчасти и порядок ремонта';}}}
function renderMechanicHistory(){const box=$('mechanic-history-list');if(!box)return;box.innerHTML='';$('case-count').textContent=appData.mechanicCases.length+' записей';if(!appData.mechanicCases.length){box.innerHTML='<p class="muted">Пока нет сохранённых неисправностей. Начни диагностику — запись появится здесь автоматически.</p>';return;}appData.mechanicCases.forEach(c=>{const card=document.createElement('div');card.className='case-card';const si=statusInfo(c.status);const title=document.createElement('h3');title.textContent=c.title||`${[c.vehicle?.brand,c.vehicle?.model].filter(Boolean).join(' ')||'Неисправность'}`;card.appendChild(title);const chip=document.createElement('span');chip.className='status-chip '+si.cls;chip.textContent=si.icon+' '+si.label;card.appendChild(chip);const p=document.createElement('p');p.textContent=c.problem;card.appendChild(p);const meta=document.createElement('div');meta.className='case-meta';meta.textContent=`${[c.vehicle?.brand,c.vehicle?.model].filter(Boolean).join(' ')||'Автомобиль не указан'} · ${c.mode==='quick'?'Быстрая':'Глубокая'} диагностика · обновлено ${new Date(c.updatedAt||c.createdAt).toLocaleString('ru-RU')} · ${c.usage?.total_tokens||0} токенов`;card.appendChild(meta);if(c.partsNote){const pn=document.createElement('p');pn.textContent='Запчасти / ожидание: '+c.partsNote;card.appendChild(pn);}const actions=document.createElement('div');actions.className='case-actions';const open=document.createElement('button');open.textContent='Открыть и продолжить';open.onclick=()=>{activeCaseId=c.id;showMechanicTab('new');$('mechanic-start-form').classList.add('hidden');renderActiveCase(c,c.lastUsage);};const stat=document.createElement('select');stat.className='select-small';stat.setAttribute('aria-label','Статус неисправности');[['open','Не решена'],['in_progress','В процессе'],['resolved','Решена']].forEach(([v,t])=>{const o=document.createElement('option');o.value=v;o.textContent=t;stat.appendChild(o);});stat.value=c.status||'open';const saveStat=document.createElement('button');saveStat.textContent='Сохранить статус';saveStat.onclick=()=>{if(stat.value==='resolved'&&!confirm('Подтверждаешь, что неисправность устранена и проверена?'))return;setCaseStatus(c.id,stat.value);};const del=document.createElement('button');del.textContent='Удалить';del.onclick=()=>{if(settings.confirm&&!confirm('Удалить запись о неисправности?'))return;appData.mechanicCases=appData.mechanicCases.filter(x=>x.id!==c.id);if(activeCaseId===c.id)activeCaseId=null;saveData();renderMechanicHistory();};actions.append(open,stat,saveStat,del);card.appendChild(actions);box.appendChild(card);});}
function saveMaintenanceVehicle(){appData.maintenance.vehicle={name:$('maint-car-name').value.trim(),odometer:$('maint-odometer').value.trim()};saveData();renderMaintenance();toast('Данные автомобиля сохранены.');}
function addMaintenance(){const title=$('maint-title').value.trim();if(!title){toast('Напиши, какое обслуживание нужно выполнить.','error');return;}const item={id:'t_'+Date.now(),title,dueKm:$('maint-due-km').value.trim(),dueDate:$('maint-due-date').value,note:$('maint-note').value.trim(),done:false,createdAt:new Date().toISOString()};appData.maintenance.items.unshift(item);saveData();$('maint-title').value='';$('maint-due-km').value='';$('maint-due-date').value='';$('maint-note').value='';renderMaintenance();toast('Напоминание добавлено.');}
function maintenanceState(x){const km=Number(appData.maintenance.vehicle?.odometer),due=Number(x.dueKm);const dateDue=x.dueDate?new Date(x.dueDate+'T23:59:59'):null;const today=new Date();if(x.done)return {text:'Выполнено',cls:'solved'};if((x.dueKm&&km>=due)||(dateDue&&dateDue<today))return {text:'Пора выполнить',cls:'open'};if((x.dueKm&&due-km<=500)||(dateDue&&(dateDue-today)<30*86400000))return {text:'Скоро',cls:'progress'};return {text:'Запланировано',cls:'progress'};}
function renderMaintenance(){const v=appData.maintenance.vehicle||{};if($('maint-car-name'))$('maint-car-name').value=v.name||'';if($('maint-odometer'))$('maint-odometer').value=v.odometer||'';const box=$('maintenance-list');if(!box)return;box.innerHTML='';$('maint-count').textContent=appData.maintenance.items.length+' записей';if(!appData.maintenance.items.length){box.innerHTML='<p class="muted">Пока нет напоминаний. Добавь замену масла, фильтров, проверку тормозов или другое обслуживание по регламенту своего автомобиля.</p>';return;}appData.maintenance.items.forEach(x=>{const card=document.createElement('div');card.className='maintenance-item';card.dataset.maintenanceId=x.id;const title=document.createElement('strong');title.textContent=x.title;card.appendChild(title);const st=maintenanceState(x);const chip=document.createElement('span');chip.className='status-chip '+st.cls;chip.style.marginLeft='7px';chip.textContent=st.text;card.appendChild(chip);const small=document.createElement('small');small.textContent=[x.dueKm?'Пробег: '+Number(x.dueKm).toLocaleString('ru-RU')+' км':'',x.dueDate?'Дата: '+new Date(x.dueDate+'T12:00:00').toLocaleDateString('ru-RU'):'',x.note].filter(Boolean).join(' · ')||'Срок не задан';card.appendChild(small);const actions=document.createElement('div');actions.className='case-actions';const edit=document.createElement('button');edit.textContent='Изменить';edit.onclick=()=>editMaintenance(x.id);const done=document.createElement('button');done.textContent=x.done?'Вернуть в план':'Отметить выполненным';done.onclick=()=>{x.done=!x.done;x.completedAt=x.done?new Date().toISOString():null;x.completedAtOdometer=x.done?(appData.maintenance.vehicle?.odometer||''):'';saveData();renderMaintenance();};const del=document.createElement('button');del.textContent='Удалить';del.onclick=()=>{if(settings.confirm&&!confirm('Удалить напоминание?'))return;appData.maintenance.items=appData.maintenance.items.filter(y=>y.id!==x.id);saveData();renderMaintenance();};actions.append(edit,done,del);card.appendChild(actions);box.appendChild(card);});}
function editMaintenance(id){const x=appData.maintenance.items.find(y=>y.id===id);if(!x)return;const card=[...document.querySelectorAll('.maintenance-item')].find(el=>el.dataset.maintenanceId===id);if(!card)return;if(card.querySelector('.inline-edit'))return;const form=document.createElement('div');form.className='inline-edit';const makeField=(labelText,type,value,placeholder='')=>{const wrap=document.createElement('div');wrap.className='field';const label=document.createElement('label');label.textContent=labelText;const input=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value||'';input.placeholder=placeholder;wrap.append(label,input);form.appendChild(wrap);return input;};const title=makeField('Что нужно сделать?','text',x.title);const km=makeField('К какому пробегу, км','number',x.dueKm);const date=makeField('К какой дате','date',x.dueDate);const note=makeField('Комментарий / запчасти / материалы','textarea',x.note);const actions=document.createElement('div');actions.className='row';const save=document.createElement('button');save.className='btn';save.textContent='Сохранить';save.onclick=()=>{if(!title.value.trim()){toast('Название не может быть пустым.','error');return;}x.title=title.value.trim();x.dueKm=km.value.trim();x.dueDate=date.value;x.note=note.value.trim();saveData();renderMaintenance();toast('Напоминание изменено.');};const cancel=document.createElement('button');cancel.className='btn secondary';cancel.textContent='Отмена';cancel.onclick=()=>form.remove();actions.append(save,cancel);form.appendChild(actions);card.appendChild(form);} 
function copyResult(id){const text=$(id).innerText;if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(()=>toast('Текст скопирован')).catch(()=>fallbackCopy(text));}else fallbackCopy(text);}
function fallbackCopy(text){const a=document.createElement('textarea');a.value=text;document.body.appendChild(a);a.select();try{document.execCommand('copy');toast('Текст скопирован');}catch(e){toast('Не удалось скопировать текст','error');}a.remove();}
function exportData(){const blob=new Blob([JSON.stringify({version:3,exportedAt:new Date().toISOString(),history:appData.history,favorites:appData.favorites,kitchen:appData.kitchen,appData,settings},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='AI-BRAGINA-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function importData(event){const file=event.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const d=JSON.parse(reader.result);const source=d.appData||d;if(!Array.isArray(source.history))throw new Error('В файле не найдена история рецептов.');const seen=new Set(appData.history.map(x=>x.id));const imported=source.history.filter(x=>x&&typeof x.id==='string'&&typeof x.title==='string'&&x.recipe&&Array.isArray(x.recipe.ingredients)&&Array.isArray(x.recipe.steps)&&!seen.has(x.id));appData.history=[...imported,...appData.history].slice(0,100);if(Array.isArray(source.favorites))appData.favorites=[...new Set([...appData.favorites,...source.favorites])].filter(id=>appData.history.some(x=>x.id===id));if(source.kitchen&&Array.isArray(source.kitchen.staples))appData.kitchen=source.kitchen;if(Array.isArray(source.mechanicCases)){const caseIds=new Set(appData.mechanicCases.map(x=>x.id));const cases=source.mechanicCases.filter(x=>x&&typeof x.id==='string'&&x.vehicle&&typeof x.problem==='string'&&!caseIds.has(x.id)).map(x=>({...x,mode:x.mode==='quick'?'quick':'deep'}));appData.mechanicCases=[...cases,...appData.mechanicCases];}if(source.maintenance&&typeof source.maintenance==='object'){if(source.maintenance.vehicle&&typeof source.maintenance.vehicle==='object')appData.maintenance.vehicle=source.maintenance.vehicle;if(Array.isArray(source.maintenance.items)){const taskIds=new Set(appData.maintenance.items.map(x=>x.id));const tasks=source.maintenance.items.filter(x=>x&&typeof x.id==='string'&&typeof x.title==='string'&&!taskIds.has(x.id));appData.maintenance.items=[...tasks,...appData.maintenance.items];}}saveData();if(d.settings&&typeof d.settings==='object'){settings={...settings,...d.settings};localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));applySettings();}renderHistory();toast('Импортировано: рецептов '+imported.length+', неисправностей '+(Array.isArray(source.mechanicCases)?source.mechanicCases.length:0)+', напоминания ТО сохранены.');renderMechanicHistory();renderMaintenance();}catch(e){toast('Файл не удалось прочитать. Проверьте, что это резервная копия AI-БРАГИНА.','error');}event.target.value='';};reader.onerror=()=>{toast('Не удалось прочитать файл.','error');event.target.value='';};reader.readAsText(file);}

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  const button = $('install-app-btn');
  if (button) { const label = $('install-app-label'); if (label) label.textContent = 'Установить приложение'; }
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const button = $('install-app-btn');
  if (button) {
    const label = $('install-app-label'); if (label) label.textContent = 'Приложение установлено';
    button.disabled = true;
  }
});
async function installSvoeApp() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    if (choice && choice.outcome === 'accepted') {
      const button = $('install-app-btn');
      if (button) { const label = $('install-app-label'); if (label) label.textContent = 'Устанавливаем…'; }
    }
    return;
  }
  const status = $('auth-status');
  if (status) {
    status.textContent = 'Если кнопка установки пока недоступна, открой меню Chrome (⋮) и выбери «Установить приложение» или «Добавить на главный экран».';
    status.classList.remove('hidden', 'error', 'success');
  }
}
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', {scope: '/'})
      .catch(error => console.warn('Не удалось подключить офлайн-режим:', error));
  });
}

checkAuth();
