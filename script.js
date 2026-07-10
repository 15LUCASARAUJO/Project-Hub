const COLORS=['#1a1917','#2d6a4f','#1e3a5f','#7c3aed','#b45309','#be185d','#0369a1','#047857','#dc2626','#6d28d9'];
let S={projects:[],view:'dashboard',proj:null,editing:null,deleting:null,filter:'all',search:'',sort:'createdAt',color:COLORS[0],dragId:null,viewMode:'grid',kFilter:'all',confirmCb:null};
const FIELD_MAP={startDate:'start_date',endDate:'end_date'};
let AUTH_MODE='login';
let realtimeStarted=false;
let CURRENT_USER=null;

/* ===== AUTENTICAÇÃO ===== */
function switchAuthTab(mode){
  AUTH_MODE=mode;
  document.getElementById('auth-tab-login').classList.toggle('active',mode==='login');
  document.getElementById('auth-tab-signup').classList.toggle('active',mode==='signup');
  document.getElementById('auth-submit').textContent=mode==='login'?'Entrar':'Criar conta';
  document.getElementById('auth-error').textContent='';
}
async function submitAuth(){
  const email=document.getElementById('auth-email').value.trim();
  const password=document.getElementById('auth-password').value;
  const errEl=document.getElementById('auth-error');
  errEl.style.color='var(--red)';
  errEl.textContent='';
  if(!email||!password){errEl.textContent='Preencha email e senha.';return;}
  if(typeof supabase==='undefined'||!supabase.auth){
    errEl.textContent='Erro: biblioteca do Supabase não carregou. Verifique sua conexão e recarregue a página.';
    return;
  }
  const btn=document.getElementById('auth-submit');
  btn.disabled=true;btn.textContent='Aguarde...';
  try{
    let result;
    if(AUTH_MODE==='login'){
      result=await supabase.auth.signInWithPassword({email,password});
    }else{
      result=await supabase.auth.signUp({email,password});
    }
    if(result.error){errEl.textContent=result.error.message;return;}
    if(AUTH_MODE==='signup'&&!result.data.session){
      errEl.style.color='var(--green)';
      errEl.textContent='Conta criada! Verifique seu email para confirmar, ou faça login.';
    }
  }catch(err){
    console.error('Erro de autenticação:',err);
    errEl.textContent='Erro de conexão: '+(err.message||'não foi possível falar com o Supabase.');
  }finally{
    btn.disabled=false;btn.textContent=AUTH_MODE==='login'?'Entrar':'Criar conta';
  }
}
function logout(){supabase.auth.signOut();}
async function showApp(){
  const{data:{user}}=await supabase.auth.getUser();
  CURRENT_USER=user;
  const{data:profile}=await supabase.from('profiles').select('username').eq('id',user.id).maybeSingle();
  if(!profile){
    document.getElementById('auth-screen').style.display='none';
    document.getElementById('username-screen').style.display='flex';
    return;
  }
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('username-screen').style.display='none';
  document.getElementById('app').style.display='flex';
  await fetchProjects();
  await fetchInvites();
  if(!realtimeStarted){setupRealtime();realtimeStarted=true;}
}
function showAuth(){
  document.getElementById('auth-screen').style.display='flex';
  document.getElementById('username-screen').style.display='none';
  document.getElementById('app').style.display='none';
  realtimeStarted=false;
}
async function submitUsername(){
  const input=document.getElementById('username-input');
  const errEl=document.getElementById('username-error');
  const u=input.value.trim().toLowerCase();
  errEl.textContent='';
  if(!/^[a-z0-9_]{3,20}$/.test(u)){errEl.textContent='Use 3-20 letras/números/underline, sem espaços.';return;}
  const{error}=await supabase.from('profiles').insert({id:CURRENT_USER.id,username:u});
  if(error){errEl.textContent=error.message.includes('duplicate')?'Esse nome de usuário já existe.':error.message;return;}
  showApp();
}
if(typeof supabase!=='undefined'&&supabase&&supabase.auth){
  supabase.auth.onAuthStateChange((event,session)=>{
    if(session)showApp();else showAuth();
  });
}

/* ===== DADOS (Supabase) ===== */
function mapProjectFromDB(p){
  return{
    id:p.id,name:p.name,description:p.description,category:p.category,
    status:p.status,priority:p.priority,progress:p.progress,
    startDate:p.start_date,endDate:p.end_date,color:p.color,notes:p.notes,
    ownerId:p.user_id,
    createdAt:p.created_at?new Date(p.created_at).getTime():null,
    tasks:(p.tasks||[]).map(t=>({id:t.id,text:t.text,done:t.done,due:t.due})).sort((a,b)=>(a.id>b.id?1:-1)),
    links:(p.links||[]).map(l=>({id:l.id,title:l.title,url:l.url})),
    shares:(p.project_shares||[]).map(s=>({id:s.id,userId:s.user_id,role:s.role,status:s.status}))
  };
}
function isOwner(p){return CURRENT_USER&&p.ownerId===CURRENT_USER.id;}
function myRole(p){
  if(isOwner(p))return'owner';
  const s=(p.shares||[]).find(x=>x.userId===CURRENT_USER?.id&&x.status==='accepted');
  return s?s.role:'viewer';
}
function canEdit(p){return myRole(p)!=='viewer';}
async function fetchProjects(){
  const{data,error}=await supabase.from('projects').select('*, tasks(*), links(*), project_shares(*)').order('created_at',{ascending:false});
  if(error){toast('Erro ao carregar projetos');console.error(error);return;}
  S.projects=data.map(mapProjectFromDB);
  renderSB();renderMain();
}
async function fetchInvites(){
  const{data,error}=await supabase.from('project_shares').select('id,role,projects(name)').eq('user_id',CURRENT_USER.id).eq('status','pending');
  if(error){console.error(error);return;}
  renderInvites(data||[]);
}
function renderInvites(list){
  const el=document.getElementById('invites-bar');if(!el)return;
  if(!list.length){el.innerHTML='';el.style.display='none';return;}
  el.style.display='flex';
  el.innerHTML=list.map(i=>`<div class="invite-item">Convite para "<b>${esc(i.projects.name)}</b>" (${i.role==='editor'?'editor':'visualizador'}) <button class="btn btn-primary" style="padding:5px 10px" onclick="respondInvite('${i.id}',true)">Aceitar</button><button class="btn btn-secondary" style="padding:5px 10px" onclick="respondInvite('${i.id}',false)">Recusar</button></div>`).join('');
}
async function respondInvite(shareId,accept){
  if(accept){await supabase.from('project_shares').update({status:'accepted'}).eq('id',shareId);}
  else{await supabase.from('project_shares').delete().eq('id',shareId);}
  fetchInvites();fetchProjects();
}
function setupRealtime(){
  supabase.channel('db-changes')
    .on('postgres_changes',{event:'*',schema:'public',table:'projects'},()=>fetchProjects())
    .on('postgres_changes',{event:'*',schema:'public',table:'tasks'},()=>fetchProjects())
    .on('postgres_changes',{event:'*',schema:'public',table:'links'},()=>fetchProjects())
    .on('postgres_changes',{event:'*',schema:'public',table:'project_shares'},()=>{fetchProjects();fetchInvites();})
    .subscribe();
}
function gid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function toggleDark(){
  const cur=document.documentElement.getAttribute('data-theme');
  const next=cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  try{localStorage.setItem('ph-theme',next);}catch(e){}
  updateDmUI();
}
function updateDmUI(){
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  const icon=document.getElementById('dm-icon');const lbl=document.getElementById('dm-label');
  if(icon)icon.innerHTML=isDark?'<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>':'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  if(lbl)lbl.textContent=isDark?'Modo claro':'Modo escuro';
}
function openSidebar(){document.getElementById('sidebar').classList.add('open');document.getElementById('sidebar-ov').classList.add('open');}
function closeSidebar(){document.getElementById('sidebar').classList.remove('open');document.getElementById('sidebar-ov').classList.remove('open');}
function navigate(v,id){
  S.view=v;S.proj=id||null;closeSidebar();
  document.querySelectorAll('.nav-item').forEach(e=>e.classList.remove('active'));
  const map={dashboard:0,projects:1,kanban:2,timeline:3};
  const i=map[v];if(i!==undefined)document.querySelectorAll('.nav-item')[i]?.classList.add('active');
  ['dashboard','projects','kanban','timeline'].forEach(k=>document.getElementById('bn-'+k)?.classList.remove('active'));
  if(map[v]!==undefined)document.getElementById('bn-'+v)?.classList.add('active');
  renderSB();renderMain();
}
function renderSB(){
  const el=document.getElementById('sb-projs');if(!el)return;
  const vis=S.projects.filter(p=>p.status!=='archived');
  if(!vis.length){el.innerHTML='<div style="font-size:12px;color:var(--text3);padding:4px 8px">Nenhum projeto</div>';return;}
  el.innerHTML=vis.map(p=>`<button class="sb-proj ${S.proj===p.id?'active':''}" onclick="navigate('detail','${p.id}')"><span class="pdot" style="background:${p.color}"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</span></button>`).join('');
}
function renderMain(){
  const el=document.getElementById('main');
  if(S.view==='dashboard')rDash(el);
  else if(S.view==='projects')rProjects(el);
  else if(S.view==='kanban')rKanban(el);
  else if(S.view==='timeline')rTimeline(el);
  else if(S.view==='detail')rDetail(el);
}
function isOverdue(p){
  if(!p.endDate||p.status==='done'||p.status==='archived')return false;
  return new Date(p.endDate+'T23:59:59')<new Date();
}
function rDash(el){
  const ps=S.projects.filter(p=>p.status!=='archived');
  const tot=ps.length,act=ps.filter(p=>p.status==='active').length,done=ps.filter(p=>p.status==='done').length,pause=ps.filter(p=>p.status==='paused').length;
  const avg=tot?Math.round(ps.reduce((a,p)=>a+(p.progress||0),0)/tot):0;
  const recent=[...ps].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,4);
  const hiPrio=ps.filter(p=>p.priority==='high'&&p.status!=='done');
  const overdue=ps.filter(p=>isOverdue(p));
  if(!S.projects.length){
    el.innerHTML=`
    <div class="topbar">
      <div class="topbar-left">
        <button class="hamburger" onclick="openSidebar()" aria-label="Menu"><svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
        <span class="topbar-title">Dashboard</span>
      </div>
    </div>
    <div class="content" style="display:flex;align-items:center;justify-content:center;min-height:70vh">
      <div class="welcome">
        <div class="welcome-icon"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></div>
        <h2>Bem-vindo ao ProjectHub</h2>
        <p>Organize seus projetos, acompanhe tarefas, prazos e progresso — tudo em um só lugar. Comece criando seu primeiro projeto.</p>
        <div>
          <button class="welcome-cta" onclick="openNewProject()">
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Criar primeiro projeto
          </button>
        </div>
        <p style="font-size:13px;color:var(--text2);margin-bottom:12px;font-weight:500">Ou comece por uma categoria:</p>
        <div class="welcome-cats">
          ${['Web','Mobile','Design','Marketing','Pesquisa','Produto','Infra','Outro'].map(c=>`<div class="wcat" onclick="openNewProjectCat('${c}')">${c}</div>`).join('')}
        </div>
        <p class="welcome-hint">Use <span class="kbd">Enter</span> para salvar, <span class="kbd">Esc</span> para cancelar</p>
      </div>
    </div>`;
    return;
  }
  el.innerHTML=`
  <div class="topbar">
    <div class="topbar-left">
      <button class="hamburger" onclick="openSidebar()" aria-label="Menu"><svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
      <span class="topbar-title">Dashboard</span>
    </div>
    <div class="topbar-actions">
      <button class="btn btn-primary" onclick="openNewProject()">
        <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span class="hide-xs">Novo</span>
      </button>
    </div>
  </div>
  <div class="content">
    <div class="stats-grid">
      ${sc('Total',tot,'projetos')}${sc('Ativos',act,'em andamento')}${sc('Concluídos',done,'finalizados')}${sc('Progresso',avg+'%','média')}
    </div>
    ${overdue.length?`<div style="background:var(--red-bg);border:1px solid var(--red);border-radius:var(--r2);padding:12px 16px;margin-bottom:20px;display:flex;align-items:center;gap:10px"><svg width="16" height="16" stroke="var(--red)" fill="none" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span style="font-size:13px;color:var(--red);font-weight:500">${overdue.length} projeto${overdue.length>1?'s':''} em atraso: ${overdue.slice(0,2).map(p=>esc(p.name)).join(', ')}${overdue.length>2?' e mais…':''}</span></div>`:''}
    <div class="two-col">
      <div>
        <div class="section-header"><span class="section-title">Por status</span></div>
        <div class="dcard">${srow('Em andamento',act,tot)}${srow('Pausados',pause,tot)}${srow('Concluídos',done,tot)}</div>
      </div>
      <div>
        <div class="section-header"><span class="section-title">Por prioridade</span></div>
        <div class="dcard">${prow('Alta',ps.filter(p=>p.priority==='high').length,tot,'var(--red)')}${prow('Média',ps.filter(p=>p.priority==='medium').length,tot,'var(--amber)')}${prow('Baixa',ps.filter(p=>p.priority==='low').length,tot,'var(--green)')}</div>
      </div>
    </div>
    ${hiPrio.length?`<div class="section-header"><span class="section-title">Alta prioridade</span><span class="section-link" onclick="navigate('projects')">Ver todos →</span></div><div class="projects-grid" style="margin-bottom:22px">${hiPrio.slice(0,3).map(p=>pcHTML(p)).join('')}</div>`:''}
    <div class="section-header"><span class="section-title">Recentes</span><span class="section-link" onclick="navigate('projects')">Ver todos →</span></div>
    ${recent.length?`<div class="projects-grid">${recent.map(p=>pcHTML(p)).join('')}</div>`:emptyHTML('Nenhum projeto','Crie seu primeiro projeto')}
  </div>`;
}
function sc(l,v,s){return`<div class="stat-card"><div class="stat-label">${l}</div><div class="stat-value">${v}</div><div class="stat-sub">${s}</div></div>`}
function srow(l,c,t){const p=t?Math.round(c/t*100):0;return`<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:13px">${l}</span><span style="font-size:13px;font-weight:600;font-family:'DM Mono',monospace">${c}</span></div><div class="pbar"><div class="pbar-fill" style="width:${p}%"></div></div></div>`}
function prow(l,c,t,col){const p=t?Math.round(c/t*100):0;return`<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:13px">${l}</span><span style="font-size:13px;font-weight:600;font-family:'DM Mono',monospace">${c}</span></div><div class="pbar"><div class="pbar-fill" style="width:${p}%;background:${col}"></div></div></div>`}
function rProjects(el){
  const cats=[...new Set(S.projects.map(p=>p.category).filter(Boolean))];
  let list=[...S.projects];
  if(S.filter==='archived'){list=list.filter(p=>p.status==='archived');}
  else if(S.filter!=='all'){list=list.filter(p=>p.status!=='archived'&&(p.status===S.filter||p.priority===S.filter||p.category===S.filter));}
  else{list=list.filter(p=>p.status!=='archived');}
  if(S.search){
    const q=S.search.toLowerCase();
    list=list.filter(p=>
      p.name.toLowerCase().includes(q)||
      (p.description||'').toLowerCase().includes(q)||
      (p.category||'').toLowerCase().includes(q)||
      (p.notes||'').toLowerCase().includes(q)||
      (p.tasks||[]).some(t=>t.text.toLowerCase().includes(q))
    );
  }
  const sortFns={
    createdAt:(a,b)=>(b.createdAt||0)-(a.createdAt||0),
    endDate:(a,b)=>{if(!a.endDate&&!b.endDate)return 0;if(!a.endDate)return 1;if(!b.endDate)return-1;return a.endDate.localeCompare(b.endDate)},
    priority:(a,b)=>{const o={high:0,medium:1,low:2};return(o[a.priority]||1)-(o[b.priority]||1)},
    name:(a,b)=>a.name.localeCompare(b.name),
    progress:(a,b)=>(b.progress||0)-(a.progress||0)
  };
  list.sort(sortFns[S.sort]||sortFns.createdAt);
  el.innerHTML=`
  <div class="topbar">
    <div class="topbar-left">
      <button class="hamburger" onclick="openSidebar()" aria-label="Menu"><svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
      <span class="topbar-title">Projetos</span>
    </div>
    <div class="topbar-actions">
      <div class="view-toggle">
        <button class="vtbtn ${S.viewMode==='grid'?'active':''}" onclick="S.viewMode='grid';renderMain()" title="Grade">
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
        </button>
        <button class="vtbtn ${S.viewMode==='list'?'active':''}" onclick="S.viewMode='list';renderMain()" title="Lista">
          <svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        </button>
      </div>
      <select class="sort-select" onchange="S.sort=this.value;renderMain()">
        <option value="createdAt" ${S.sort==='createdAt'?'selected':''}>Recentes</option>
        <option value="name" ${S.sort==='name'?'selected':''}>Nome A-Z</option>
        <option value="priority" ${S.sort==='priority'?'selected':''}>Prioridade</option>
        <option value="endDate" ${S.sort==='endDate'?'selected':''}>Prazo</option>
        <option value="progress" ${S.sort==='progress'?'selected':''}>Progresso</option>
      </select>
    </div>
  </div>
  <div class="content">
    <div class="filters-bar">
      <div class="search-wrap">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" placeholder="Buscar projetos, tarefas, notas..." value="${esc(S.search)}" oninput="S.search=this.value;renderMain()">
      </div>
      <button class="fchip ${S.filter==='all'?'active':''}" onclick="S.filter='all';renderMain()">Todos</button>
      <button class="fchip ${S.filter==='active'?'active':''}" onclick="S.filter='active';renderMain()">Ativos</button>
      <button class="fchip ${S.filter==='paused'?'active':''}" onclick="S.filter='paused';renderMain()">Pausados</button>
      <button class="fchip ${S.filter==='done'?'active':''}" onclick="S.filter='done';renderMain()">Concluídos</button>
      <button class="fchip ${S.filter==='high'?'active':''}" onclick="S.filter='high';renderMain()">Alta prior.</button>
      <button class="fchip ${S.filter==='archived'?'active':''}" onclick="S.filter='archived';renderMain()">Arquivados</button>
      ${cats.map(c=>`<button class="fchip ${S.filter===c?'active':''}" onclick="S.filter='${esc(c)}';renderMain()">${esc(c)}</button>`).join('')}
    </div>
    ${list.length?(S.viewMode==='list'?`<div class="projects-list">${list.map(p=>plHTML(p)).join('')}</div>`:`<div class="projects-grid">${list.map(p=>pcHTML(p)).join('')}</div>`):emptyHTML('Nenhum projeto encontrado','Ajuste os filtros ou crie um novo')}
  </div>`;
}
function pcHTML(p){
  const sL={active:'Em andamento',paused:'Pausado',done:'Concluído',archived:'Arquivado'};
  const sC={active:'b-active',paused:'b-paused',done:'b-done',archived:'b-archived'};
  const prL={high:'Alta',medium:'Média',low:'Baixa'};
  const prC={high:'b-high',medium:'b-medium',low:'b-low'};
  const tasks=p.tasks||[];const dc=tasks.filter(t=>t.done).length;
  const od=isOverdue(p);
  return`<div class="pcard${od?' overdue':''}${p.status==='archived'?' archived':''}" onclick="navigate('detail','${p.id}')">
    ${od?`<div style="position:absolute;top:10px;right:10px"><span class="overdue-badge"><svg width="9" height="9" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Atrasado</span></div>`:''}
    <div class="pcard-header">
      <div><div style="display:flex;align-items:center;gap:7px"><span class="pdot" style="background:${p.color||'#1a1917'}"></span><span class="pcard-name">${esc(p.name)}</span></div>${p.category?`<div class="pcard-cat">${esc(p.category)}</div>`:''}</div>
      <button class="pcard-menu" onclick="event.stopPropagation();openEditProject('${p.id}')">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
      </button>
    </div>
    ${p.description?`<div class="pcard-desc">${esc(p.description)}</div>`:''}
    <div><div style="display:flex;justify-content:space-between;margin-bottom:5px"><span style="font-size:11px;color:var(--text3)">Progresso</span><span style="font-size:11px;font-weight:600;font-family:'DM Mono',monospace">${p.progress||0}%</span></div><div class="pbar"><div class="pbar-fill" style="width:${p.progress||0}%;background:${p.color||'var(--accent)'}"></div></div></div>
    <div class="pcard-foot">
      <div style="display:flex;gap:5px;flex-wrap:wrap"><span class="badge ${sC[p.status]||'b-active'}">${sL[p.status]||'Em andamento'}</span><span class="badge ${prC[p.priority]||'b-medium'}">${prL[p.priority]||'Média'}</span></div>
      <div class="pmeta">${tasks.length?`<span class="pmeta-item"><svg viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>${dc}/${tasks.length}</span>`:''}${p.endDate?`<span class="pmeta-item"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${fmtDate(p.endDate)}</span>`:''}</div>
    </div>
  </div>`;
}
function plHTML(p){
  const sL={active:'Em andamento',paused:'Pausado',done:'Concluído',archived:'Arquivado'};
  const sC={active:'b-active',paused:'b-paused',done:'b-done',archived:'b-archived'};
  const prL={high:'Alta',medium:'Média',low:'Baixa'};
  const prC={high:'b-high',medium:'b-medium',low:'b-low'};
  const od=isOverdue(p);
  return`<div class="prow${od?' overdue':''}${p.status==='archived'?' archived':''}" onclick="navigate('detail','${p.id}')">
    <span class="prow-dot"><span class="pdot" style="background:${p.color||'#1a1917'}"></span></span>
    <span class="prow-name">${esc(p.name)}</span>
    <span class="prow-badges"><span class="badge ${sC[p.status]||'b-active'}" style="font-size:10px;padding:2px 7px">${sL[p.status]||''}</span><span class="badge ${prC[p.priority]||'b-medium'}" style="font-size:10px;padding:2px 7px">${prL[p.priority]||''}</span>${od?`<span class="badge b-high" style="font-size:10px;padding:2px 7px">Atrasado</span>`:''}</span>
    <span class="prow-prog">${p.progress||0}%</span>
    <span class="prow-cat">${esc(p.category||'—')}</span>
    <span class="prow-date">${p.endDate?fmtDate(p.endDate):'—'}</span>
    <button class="prow-menu" onclick="event.stopPropagation();openEditProject('${p.id}')"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg></button>
  </div>`;
}
function rKanban(el){
  const cols=[{id:'active',label:'Em andamento',color:'var(--green)'},{id:'paused',label:'Pausado',color:'var(--amber)'},{id:'done',label:'Concluído',color:'var(--blue)'}];
  const prOpts=['all','high','medium','low'];
  const prL={all:'Todos',high:'Alta prior.',medium:'Média prior.',low:'Baixa prior.'};
  el.innerHTML=`
  <div class="topbar">
    <div class="topbar-left">
      <button class="hamburger" onclick="openSidebar()" aria-label="Menu"><svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
      <span class="topbar-title">Kanban</span>
    </div>
  </div>
  <div class="content">
    <div class="kanban-filters">
      ${prOpts.map(p=>`<button class="fchip ${S.kFilter===p?'active':''}" onclick="S.kFilter='${p}';renderMain()">${prL[p]}</button>`).join('')}
    </div>
    <p class="kanban-hint">← Deslize para ver todas as colunas</p>
    <div class="kanban-outer"><div class="kanban-board">${cols.map(c=>{
      let ps=S.projects.filter(p=>p.status===c.id&&p.status!=='archived');
      if(S.kFilter!=='all')ps=ps.filter(p=>p.priority===S.kFilter);
      return`<div class="kcol"><div class="kcol-head"><span class="kcol-title"><span style="width:8px;height:8px;border-radius:50%;background:${c.color};display:inline-block"></span>${c.label}</span><span class="kcol-count">${ps.length}</span></div>
      <div class="kdrop" id="kd-${c.id}" ondragover="kOver(event,'${c.id}')" ondrop="kDrop(event,'${c.id}')" ondragleave="kLeave(event)">
        ${ps.map(p=>kcHTML(p)).join('')}
      </div>
      <div class="add-kcard" onclick="openNewProjectStatus('${c.id}')"><svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Adicionar</div></div>`;
    }).join('')}</div></div>
  </div>`;
  initTouchDrag();
}
function kcHTML(p){
  const prL={high:'Alta',medium:'Média',low:'Baixa'};const prC={high:'b-high',medium:'b-medium',low:'b-low'};
  const od=isOverdue(p);
  return`<div class="kcard${od?' overdue':''}" draggable="true" ondragstart="kStart(event,'${p.id}')" id="kcard-${p.id}" onclick="navigate('detail','${p.id}')">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px"><span style="width:8px;height:8px;border-radius:50%;background:${p.color||'#1a1917'}"></span><span class="kcard-name">${esc(p.name)}</span></div>
    ${p.description?`<div style="font-size:12px;color:var(--text2);margin-bottom:8px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(p.description)}</div>`:''}
    ${od?`<div style="margin-bottom:6px"><span class="overdue-badge" style="font-size:10px"><svg width="9" height="9" stroke="currentColor" fill="none" stroke-width="2.5" stroke-linecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Atrasado</span></div>`:''}
    <div style="margin-bottom:8px"><div class="pbar"><div class="pbar-fill" style="width:${p.progress||0}%;background:${p.color||'var(--accent)'}"></div></div></div>
    <div class="kcard-tags">${p.category?`<span class="badge" style="background:var(--surface2);color:var(--text2)">${esc(p.category)}</span>`:''}<span class="badge ${prC[p.priority]||'b-medium'}">${prL[p.priority]||'Média'}</span></div>
  </div>`;
}
function kStart(e,id){S.dragId=id;setTimeout(()=>document.getElementById('kcard-'+id)?.classList.add('dragging'),0);e.dataTransfer.effectAllowed='move';}
function kOver(e,id){e.preventDefault();document.querySelectorAll('.kdrop').forEach(z=>z.classList.remove('over'));document.getElementById('kd-'+id)?.classList.add('over');}
function kLeave(e){e.currentTarget.classList.remove('over');}
async function kDrop(e,id){e.preventDefault();document.querySelectorAll('.kdrop').forEach(z=>z.classList.remove('over'));if(!S.dragId)return;await supabase.from('projects').update({status:id}).eq('id',S.dragId);toast('Projeto movido');S.dragId=null;fetchProjects();}
function initTouchDrag(){
  let touchCard=null,touchCol=null,startX=0,startY=0,clone=null;
  document.querySelectorAll('.kcard').forEach(card=>{
    card.addEventListener('touchstart',e=>{
      const touch=e.touches[0];startX=touch.clientX;startY=touch.clientY;
      touchCard=card.id.replace('kcard-','');
    },{passive:true});
    card.addEventListener('touchmove',e=>{
      const touch=e.touches[0];
      const dx=Math.abs(touch.clientX-startX),dy=Math.abs(touch.clientY-startY);
      if(dx<8&&dy<8)return;
      e.preventDefault();
      if(!clone){clone=card.cloneNode(true);clone.style.cssText='position:fixed;opacity:.7;pointer-events:none;z-index:9999;width:'+card.offsetWidth+'px';document.body.appendChild(clone);}
      clone.style.left=(touch.clientX-card.offsetWidth/2)+'px';clone.style.top=(touch.clientY-20)+'px';
      const els=document.elementsFromPoint(touch.clientX,touch.clientY);
      const drop=els.find(el=>el.classList.contains('kdrop'));
      document.querySelectorAll('.kdrop').forEach(z=>z.classList.remove('over'));
      if(drop){drop.classList.add('over');touchCol=drop.id.replace('kd-','');}
    },{passive:false});
    card.addEventListener('touchend',async()=>{
      if(clone){clone.remove();clone=null;}
      document.querySelectorAll('.kdrop').forEach(z=>z.classList.remove('over'));
      if(touchCard&&touchCol){
        const p=S.projects.find(x=>x.id===touchCard);
        if(p&&p.status!==touchCol){await supabase.from('projects').update({status:touchCol}).eq('id',touchCard);toast('Projeto movido');fetchProjects();}
      }
      touchCard=null;touchCol=null;
    });
  });
}
function rTimeline(el){
  const now=new Date();const yr=now.getFullYear();
  const months=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  function d2p(ds){if(!ds)return null;const d=new Date(ds+'T00:00:00');const st=new Date(yr,0,1);const en=new Date(yr+1,0,1);return Math.max(0,Math.min(100,(d-st)/(en-st)*100));}
  const todayP=d2p(now.toISOString().slice(0,10));
  const wDates=S.projects.filter(p=>p.status!=='archived'&&(p.startDate||p.endDate));
  el.innerHTML=`
  <div class="topbar">
    <div class="topbar-left">
      <button class="hamburger" onclick="openSidebar()" aria-label="Menu"><svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
      <span class="topbar-title">Timeline ${yr}</span>
    </div>
  </div>
  <div class="content">
    ${!wDates.length?emptyHTML('Nenhum projeto com datas','Adicione início e prazo aos projetos'):`
    <div class="tl-outer">
      <div class="tl-wrap">
        <div class="tl-head">
          <div class="tl-name-col">Projeto</div>
          <div class="tl-months">${months.map(m=>`<div class="tl-month">${m}</div>`).join('')}</div>
        </div>
        ${wDates.map(p=>{
          const sp=p.startDate?d2p(p.startDate):0;const ep=p.endDate?d2p(p.endDate):100;const w=Math.max(1,ep-sp);
          const od=isOverdue(p);
          return`<div class="tl-row"><div class="tl-row-label" onclick="navigate('detail','${p.id}')"><span class="pdot" style="background:${p.color||'#1a1917'}"></span><div><div class="tl-row-name">${esc(p.name)}</div>${p.category?`<div class="tl-row-cat">${esc(p.category)}</div>`:''}</div></div>
          <div class="tl-bars"><div class="tl-today" style="left:${todayP}%"></div><div class="tl-bar" style="left:${sp}%;width:${w}%;background:${od?'var(--red)':(p.color||'var(--accent)')};opacity:.85">${w>7?esc(p.name):''}</div></div></div>`;
        }).join('')}
      </div>
    </div>
    <div class="tl-legend"><span style="width:14px;height:2px;background:var(--red);border-radius:2px;display:inline-block"></span>Hoje &nbsp;&nbsp; <span style="width:14px;height:8px;background:var(--red);border-radius:2px;display:inline-block;opacity:.8"></span>Atrasado</div>`}
  </div>`;
}
function rDetail(el){
  const p=S.projects.find(x=>x.id===S.proj);if(!p){navigate('projects');return;}
  const sL={active:'Em andamento',paused:'Pausado',done:'Concluído',archived:'Arquivado'};const sC={active:'b-active',paused:'b-paused',done:'b-done',archived:'b-archived'};
  const prL={high:'Alta',medium:'Média',low:'Baixa'};const prC={high:'b-high',medium:'b-medium',low:'b-low'};
  const tasks=p.tasks||[];const links=p.links||[];const dc=tasks.filter(t=>t.done).length;
  const od=isOverdue(p);
  el.innerHTML=`
  <div class="topbar">
    <div class="topbar-left" style="min-width:0">
      <button class="hamburger" onclick="openSidebar()" aria-label="Menu"><svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
      <button class="btn-ghost btn" onclick="navigate('projects')" style="padding:6px 8px;flex-shrink:0">
        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="topbar-title" style="display:flex;align-items:center;gap:6px;min-width:0"><span class="pdot" style="background:${p.color||'#1a1917'};flex-shrink:0"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</span></span>
    </div>
    <div class="topbar-actions">
      ${isOwner(p)?`<button class="btn btn-secondary" onclick="openShareModal('${p.id}')" title="Compartilhar">
        <svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      </button>`:''}
      ${canEdit(p)?`<button class="btn btn-secondary" onclick="openEditProject('${p.id}')">
        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        <span class="hide-xs">Editar</span>
      </button>
      <button class="btn btn-secondary" onclick="archiveProj('${p.id}')" title="${p.status==='archived'?'Desarquivar':'Arquivar'}">
        <svg viewBox="0 0 24 24"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
      </button>`:''}
      ${isOwner(p)?`<button class="btn btn-secondary" style="color:var(--red)" onclick="askDel('${p.id}')">
        <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>`:''}
    </div>
  </div>
  <div class="content">
    ${!isOwner(p)?`<div style="background:var(--surface2);border-radius:var(--r);padding:8px 14px;margin-bottom:16px;font-size:12px;color:var(--text2)">Compartilhado com você — ${canEdit(p)?'você pode editar':'somente visualização'}</div>`:''}
    ${od?`<div style="background:var(--red-bg);border:1px solid var(--red);border-radius:var(--r);padding:10px 14px;margin-bottom:16px;font-size:13px;color:var(--red);font-weight:500;display:flex;align-items:center;gap:8px"><svg width="14" height="14" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Este projeto está em atraso — prazo era ${fmtDate(p.endDate)}</div>`:''}
    <div class="detail-layout">
      <div class="detail-main">
        <div class="dcard">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap">
            <div style="min-width:0"><h2 style="font-size:18px;font-weight:600;letter-spacing:-.3px;margin-bottom:4px">${esc(p.name)}</h2>${p.description?`<p style="font-size:13px;color:var(--text2);line-height:1.6">${esc(p.description)}</p>`:''}</div>
            <div style="display:flex;gap:5px;flex-shrink:0"><span class="badge ${sC[p.status]||'b-active'}">${sL[p.status]||'Em andamento'}</span><span class="badge ${prC[p.priority]||'b-medium'}">${prL[p.priority]||'Média'}</span></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:12px;color:var(--text3)">Progresso</span><span style="font-size:13px;font-weight:600;font-family:'DM Mono',monospace">${p.progress||0}%</span></div>
          <div class="pbar" style="height:6px"><div class="pbar-fill" style="width:${p.progress||0}%;background:${p.color||'var(--accent)'}"></div></div>
        </div>
        <div class="tabs" role="tablist">
          <div class="tab active" id="t-tasks" onclick="switchTab('tasks')" role="tab">Tarefas (${dc}/${tasks.length})</div>
          <div class="tab" id="t-notes" onclick="switchTab('notes')" role="tab">Anotações</div>
          <div class="tab" id="t-links" onclick="switchTab('links')" role="tab">Links (${links.length})</div>
        </div>
        <div id="tc-tasks">
          ${tasks.map(t=>tHTML(p.id,t,canEdit(p))).join('')}
          ${canEdit(p)?`<div class="add-task-row">
            <input class="add-task-in" id="newtask" placeholder="Adicionar tarefa..." onkeydown="if(event.key==='Enter')addTask('${p.id}')">
            <input class="add-task-date" id="newtask-date" type="date" title="Prazo da tarefa">
            <button class="btn btn-primary" onclick="addTask('${p.id}')" style="min-width:44px;padding:10px">
              <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>`:''}
        </div>
        <div id="tc-notes" style="display:none">
          <textarea class="notes-ed" id="notesed" placeholder="Escreva anotações, decisões, links..." ${canEdit(p)?'':'readonly'}>${esc(p.notes||'')}</textarea>
          ${canEdit(p)?`<div style="display:flex;gap:8px;margin-top:10px;align-items:center">
            <button class="btn btn-primary" onclick="saveNotes('${p.id}')">Salvar <span class="kbd" style="margin-left:4px">Ctrl+S</span></button>
            <span id="notes-ok" style="font-size:12px;color:var(--text3)"></span>
          </div>`:''}
        </div>
        <div id="tc-links" style="display:none">
          ${links.map(l=>lHTML(p.id,l,canEdit(p))).join('')}
          ${!links.length?`<div style="font-size:13px;color:var(--text3);margin-bottom:12px">Nenhum link ainda.</div>`:''}
          ${canEdit(p)?`<div class="add-link-form">
            <input id="ltitle" placeholder="Título (ex: Figma, Repositório...)">
            <input id="lurl" placeholder="URL (https://...)" onkeydown="if(event.key==='Enter')addLink('${p.id}')">
            <button class="btn btn-primary" style="align-self:flex-start" onclick="addLink('${p.id}')">Adicionar link</button>
          </div>`:''}
        </div>
      </div>
      <div class="detail-side">
        <div class="dcard">
          <div class="dcard-title">Informações</div>
          <div class="mfield"><div class="mlabel">Status</div><select class="msel" onchange="updField('${p.id}','status',this.value);syncProgress('${p.id}')"><option value="active" ${p.status==='active'?'selected':''}>Em andamento</option><option value="paused" ${p.status==='paused'?'selected':''}>Pausado</option><option value="done" ${p.status==='done'?'selected':''}>Concluído</option><option value="archived" ${p.status==='archived'?'selected':''}>Arquivado</option></select></div>
          <div class="mfield"><div class="mlabel">Prioridade</div><select class="msel" onchange="updField('${p.id}','priority',this.value)"><option value="high" ${p.priority==='high'?'selected':''}>Alta</option><option value="medium" ${p.priority==='medium'?'selected':''}>Média</option><option value="low" ${p.priority==='low'?'selected':''}>Baixa</option></select></div>
          <div class="mfield"><div class="mlabel">Categoria</div><input class="min" value="${esc(p.category||'')}" placeholder="Ex: Web..." onchange="updField('${p.id}','category',this.value)"></div>
          <div class="mfield"><div class="mlabel">Progresso (%)</div><input class="min" type="number" min="0" max="100" value="${p.progress||0}" onchange="updField('${p.id}','progress',parseInt(this.value)||0)"></div>
          <div class="mfield"><div class="mlabel">Início</div><input class="min" type="date" value="${p.startDate||''}" onchange="updField('${p.id}','startDate',this.value)"></div>
          <div class="mfield"><div class="mlabel">Prazo</div><input class="min" type="date" value="${p.endDate||''}" onchange="updField('${p.id}','endDate',this.value)"></div>
          ${p.endDate?`<div class="mfield"><div class="mlabel">Restam</div><div style="font-size:13px;font-family:'DM Mono',monospace;color:${isOverdue(p)?'var(--red)':'var(--text)'}">${daysLeft(p.endDate)}</div></div>`:''}
        </div>
        <div class="dcard">
          <div class="dcard-title">Atividade</div>
          <div style="display:flex;flex-direction:column;gap:7px">
            ${actRow('Tarefas concluídas',dc)}${actRow('Total de tarefas',tasks.length)}${actRow('Links salvos',links.length)}${actRow('Criado em',p.createdAt?new Date(p.createdAt).toLocaleDateString('pt-BR'):'—')}
          </div>
        </div>
        <div class="dcard">
          <div class="dcard-title">Exportar</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-secondary" style="width:100%;justify-content:center" onclick="exportProj('${p.id}')">
              <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exportar JSON
            </button>
            <button class="btn btn-secondary" style="width:100%;justify-content:center" onclick="copyResume('${p.id}')">
              <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copiar resumo
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
  document.getElementById('notesed')?.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveNotes(p.id);}
  });
}
async function syncProgress(pid){
  const p=S.projects.find(x=>x.id===pid);if(!p)return;
  if(p.status==='done'){await supabase.from('projects').update({progress:100}).eq('id',pid);fetchProjects();}
}
function actRow(l,v){return`<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--text2)">${l}</span><span style="font-weight:600;font-family:'DM Mono',monospace">${v}</span></div>`}
function tHTML(pid,t,editable=true){
  const now=new Date();const isOd=t.due&&!t.done&&new Date(t.due+'T23:59:59')<now;
  return`<div class="task-item"><div class="tcheck ${t.done?'done':''}" onclick="${editable?`toggleTask('${pid}','${t.id}')`:''}"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><span class="ttxt ${t.done?'done':''}">${esc(t.text)}</span>${t.due?`<span class="task-due ${isOd?'overdue':''}">${fmtDate(t.due)}</span>`:''}${editable?`<button class="tdel" onclick="delTask('${pid}','${t.id}')"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`:''}</div>`
}
async function addTask(pid){
  const inp=document.getElementById('newtask');const txt=inp?.value.trim();if(!txt)return;
  const dateInp=document.getElementById('newtask-date');const due=dateInp?.value||null;
  const{error}=await supabase.from('tasks').insert({project_id:pid,text:txt,done:false,due});
  if(error){toast('Erro ao adicionar tarefa');console.error(error);return;}
  inp.value='';if(dateInp)dateInp.value='';fetchProjects();
}
async function toggleTask(pid,tid){
  const p=S.projects.find(x=>x.id===pid);if(!p)return;
  const t=(p.tasks||[]).find(x=>x.id===tid);if(!t)return;
  const newDone=!t.done;
  await supabase.from('tasks').update({done:newDone}).eq('id',tid);
  const doneCount=p.tasks.filter(x=>x.id===tid?newDone:x.done).length;
  const newProgress=p.tasks.length?Math.round(doneCount/p.tasks.length*100):p.progress;
  await supabase.from('projects').update({progress:newProgress}).eq('id',pid);
  fetchProjects();
}
async function delTask(pid,tid){await supabase.from('tasks').delete().eq('id',tid);fetchProjects();}
function switchTab(tab){['tasks','notes','links'].forEach(t=>{document.getElementById('t-'+t)?.classList.remove('active');const c=document.getElementById('tc-'+t);if(c)c.style.display='none';});document.getElementById('t-'+tab)?.classList.add('active');const c=document.getElementById('tc-'+tab);if(c)c.style.display='block';}
async function saveNotes(pid){
  const val=document.getElementById('notesed')?.value||'';
  const p=S.projects.find(x=>x.id===pid);if(p)p.notes=val;
  const{error}=await supabase.from('projects').update({notes:val}).eq('id',pid);
  const m=document.getElementById('notes-ok');
  if(m){m.textContent=error?'Erro ao salvar':'Salvo!';setTimeout(()=>{m.textContent='';},2000);}
}
function lHTML(pid,l,editable=true){return`<div class="link-item"><div class="link-favicon">🔗</div><div class="link-info"><div class="link-title"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title||l.url)}</a></div><div class="link-url">${esc(l.url)}</div></div>${editable?`<button class="link-del" onclick="delLink('${pid}','${l.id}')"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`:''}</div>`}
async function addLink(pid){
  const t=document.getElementById('ltitle')?.value.trim();const u=document.getElementById('lurl')?.value.trim();if(!u)return;
  await supabase.from('links').insert({project_id:pid,title:t||u,url:u});
  fetchProjects();setTimeout(()=>switchTab('links'),10);
}
async function delLink(pid,lid){await supabase.from('links').delete().eq('id',lid);fetchProjects();setTimeout(()=>switchTab('links'),10);}
function exportProj(pid){const p=S.projects.find(x=>x.id===pid);if(!p)return;const blob=new Blob([JSON.stringify(p,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=p.name.replace(/\s+/g,'_')+'.json';a.click();URL.revokeObjectURL(a.href);toast('Exportado com sucesso');}
function copyResume(pid){
  const p=S.projects.find(x=>x.id===pid);if(!p)return;
  const tasks=(p.tasks||[]);const dc=tasks.filter(t=>t.done).length;
  const sL={active:'Em andamento',paused:'Pausado',done:'Concluído',archived:'Arquivado'};
  const prL={high:'Alta',medium:'Média',low:'Baixa'};
  const lines=[
    `📁 ${p.name}`,
    `Status: ${sL[p.status]||'—'}  |  Prioridade: ${prL[p.priority]||'—'}`,
    `Progresso: ${p.progress||0}%  |  Tarefas: ${dc}/${tasks.length}`,
    p.endDate?`Prazo: ${fmtDate(p.endDate)}  ${isOverdue(p)?'⚠️ ATRASADO':''}`:null,
    p.description?`\n${p.description}`:null,
    tasks.length?`\nTarefas:\n${tasks.map(t=>`${t.done?'✅':'⬜'} ${t.text}`).join('\n')}`:null
  ].filter(Boolean);
  try{navigator.clipboard.writeText(lines.join('\n'));toast('Resumo copiado!');}catch(e){toast('Não foi possível copiar');}
}
async function archiveProj(pid){
  const p=S.projects.find(x=>x.id===pid);if(!p)return;
  const newStatus=p.status==='archived'?'active':'archived';
  await supabase.from('projects').update({status:newStatus}).eq('id',pid);
  toast(newStatus==='archived'?'Projeto arquivado':'Projeto reativado');
  if(newStatus==='archived')navigate('projects');else fetchProjects();
}
function openNewProject(st,cat){
  S.editing=null;
  document.getElementById('modal-title').textContent='Novo Projeto';
  ['f-name','f-desc','f-cat'].forEach(id=>document.getElementById(id).value='');
  if(cat)document.getElementById('f-cat').value=cat;
  document.getElementById('f-status').value=st||'active';
  document.getElementById('f-priority').value='medium';
  document.getElementById('f-progress').value='0';
  document.getElementById('f-start').value='';
  document.getElementById('f-end').value='';
  S.color=COLORS[0];rCPicker();
  document.getElementById('proj-modal').classList.add('open');
  setTimeout(()=>document.getElementById('f-name').focus(),200);
}
function openNewProjectCat(cat){openNewProject('active',cat);}
function openNewProjectStatus(st){openNewProject(st);}
function openEditProject(id){
  const p=S.projects.find(x=>x.id===id);if(!p)return;
  S.editing=id;
  document.getElementById('modal-title').textContent='Editar Projeto';
  document.getElementById('f-name').value=p.name;
  document.getElementById('f-desc').value=p.description||'';
  document.getElementById('f-cat').value=p.category||'';
  document.getElementById('f-status').value=p.status||'active';
  document.getElementById('f-priority').value=p.priority||'medium';
  document.getElementById('f-progress').value=p.progress||0;
  document.getElementById('f-start').value=p.startDate||'';
  document.getElementById('f-end').value=p.endDate||'';
  S.color=p.color||COLORS[0];rCPicker();
  document.getElementById('proj-modal').classList.add('open');
}
function rCPicker(){document.getElementById('cpicker').innerHTML=COLORS.map(c=>`<div class="cswatch ${c===S.color?'sel':''}" style="background:${c}" onclick="selColor('${c}')"></div>`).join('');}
function selColor(c){S.color=c;rCPicker();}
function closeModal(){document.getElementById('proj-modal').classList.remove('open');}
async function saveProject(){
  const name=document.getElementById('f-name').value.trim();if(!name){document.getElementById('f-name').focus();return;}
  const d={
    name,
    description:document.getElementById('f-desc').value.trim(),
    category:document.getElementById('f-cat').value.trim(),
    status:document.getElementById('f-status').value,
    priority:document.getElementById('f-priority').value,
    progress:parseInt(document.getElementById('f-progress').value)||0,
    start_date:document.getElementById('f-start').value||null,
    end_date:document.getElementById('f-end').value||null,
    color:S.color
  };
  if(S.editing){
    const{error}=await supabase.from('projects').update(d).eq('id',S.editing);
    if(error){toast('Erro: '+error.message);console.error(error);return;}
    toast('Projeto atualizado');
  }else{
    const{data:{user}}=await supabase.auth.getUser();
    const{error}=await supabase.from('projects').insert({...d,user_id:user.id});
    if(error){toast('Erro: '+error.message);console.error(error);return;}
    toast('Projeto criado');
  }
  closeModal();fetchProjects();
}
async function openShareModal(pid){
  S.sharingProject=pid;
  document.getElementById('share-modal').classList.add('open');
  await renderShareList();
}
function closeShareModal(){document.getElementById('share-modal').classList.remove('open');S.sharingProject=null;}
async function renderShareList(){
  const pid=S.sharingProject;
  const{data,error}=await supabase.from('project_shares').select('id,role,status,profiles(username)').eq('project_id',pid);
  const el=document.getElementById('share-list');
  if(error){el.innerHTML='Erro ao carregar.';return;}
  el.innerHTML=(data&&data.length)?data.map(s=>`<div class="share-row"><span>${esc(s.profiles?.username||'?')}</span><span class="badge ${s.status==='accepted'?'b-active':'b-paused'}">${s.status==='accepted'?(s.role==='editor'?'Editor':'Visualizador'):'Pendente'}</span><button class="link-del" style="opacity:1" onclick="removeShare('${s.id}')"><svg viewBox="0 0 24 24" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>`).join(''):'<div style="font-size:13px;color:var(--text3)">Ninguém convidado ainda.</div>';
}
async function inviteUser(){
  const pid=S.sharingProject;
  const uname=document.getElementById('share-username').value.trim().toLowerCase();
  const role=document.getElementById('share-role').value;
  const errEl=document.getElementById('share-error');
  errEl.textContent='';
  if(!uname){errEl.textContent='Digite um nome de usuário.';return;}
  const{data:prof,error:e1}=await supabase.from('profiles').select('id').eq('username',uname).maybeSingle();
  if(e1||!prof){errEl.textContent='Usuário não encontrado.';return;}
  if(prof.id===CURRENT_USER.id){errEl.textContent='Você já é o dono deste projeto.';return;}
  const{error:e2}=await supabase.from('project_shares').insert({project_id:pid,user_id:prof.id,role,invited_by:CURRENT_USER.id});
  if(e2){errEl.textContent=e2.message.includes('duplicate')?'Usuário já convidado.':e2.message;return;}
  document.getElementById('share-username').value='';
  toast('Convite enviado');renderShareList();
}
async function removeShare(shareId){await supabase.from('project_shares').delete().eq('id',shareId);renderShareList();fetchProjects();}
function showConf(title,msg,details,btnLabel,cb){
  document.getElementById('conf-title').textContent=title;
  document.getElementById('conf-msg').textContent=msg;
  document.getElementById('conf-details').textContent=details;
  document.getElementById('conf-details').style.display=details?'block':'none';
  document.getElementById('conf-btn').textContent=btnLabel;
  S.confirmCb=cb;
  document.getElementById('conf-ov').classList.add('open');
}
function closeConf(){document.getElementById('conf-ov').classList.remove('open');S.confirmCb=null;S.deleting=null;}
function doConfirm(){if(S.confirmCb)S.confirmCb();closeConf();}
function askDel(id){
  const p=S.projects.find(x=>x.id===id);if(!p)return;
  S.deleting=id;
  const tasks=(p.tasks||[]).length,links=(p.links||[]).length;
  const details=`Projeto: "${p.name}"\n${tasks} tarefa(s)  •  ${links} link(s)  •  notas`;
  showConf('Excluir projeto?','Esta ação não pode ser desfeita.',details,'Excluir',doDelete);
}
async function doDelete(){
  if(!S.deleting)return;
  const{error}=await supabase.from('projects').delete().eq('id',S.deleting);
  if(error){toast('Erro ao excluir projeto');console.error(error);return;}
  toast('Projeto excluído');navigate('projects');
}
async function updField(id,f,v){
  const dbField=FIELD_MAP[f]||f;
  const{error}=await supabase.from('projects').update({[dbField]:v||null}).eq('id',id);
  if(error){toast('Erro ao salvar alteração');console.error(error);return;}
  fetchProjects();
}
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function fmtDate(s){if(!s)return'';const d=new Date(s+'T00:00:00');return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});}
function daysLeft(e){if(!e)return'—';const d=Math.ceil((new Date(e+'T00:00:00')-new Date())/86400000);if(d<0)return`${Math.abs(d)}d atrasado`;if(d===0)return'Hoje!';return`${d} dias`;}
function emptyHTML(t,s){return`<div class="empty"><svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><div class="empty-title">${t}</div><div class="empty-sub">${s}</div></div>`;}
function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;document.getElementById('toasts').appendChild(t);setTimeout(()=>t.classList.add('show'),10);setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),300)},2500);}
document.addEventListener('keydown',e=>{
  if(document.getElementById('proj-modal').classList.contains('open')){
    if(e.key==='Escape')closeModal();
    if(e.key==='Enter'&&e.target.tagName!=='TEXTAREA'&&e.target.tagName!=='SELECT'){e.preventDefault();saveProject();}
    return;
  }
  if(document.getElementById('conf-ov').classList.contains('open')){
    if(e.key==='Escape')closeConf();
    return;
  }
});
document.getElementById('proj-modal').addEventListener('click',function(e){if(e.target===this)closeModal();});
document.getElementById('conf-ov').addEventListener('click',function(e){if(e.target===this)closeConf();});
window.addEventListener('resize',()=>{if(window.innerWidth>767)closeSidebar();});

/* ===== INICIALIZAÇÃO ===== */
(async function init(){
  try{const th=localStorage.getItem('ph-theme');if(th)document.documentElement.setAttribute('data-theme',th);}catch(e){}
  updateDmUI();
  if(typeof supabase==='undefined'||!supabase||!supabase.auth){
    showAuth();
    return;
  }
  const{data:{session}}=await supabase.auth.getSession();
  if(session)showApp();else showAuth();
})();