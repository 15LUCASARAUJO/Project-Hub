const COLORS=['#1a1917','#2d6a4f','#1e3a5f','#7c3aed','#b45309','#be185d','#0369a1','#047857','#dc2626','#6d28d9'];
let projects=[];
let filter='all';
let editing=null;
let deleting=null;
let color=COLORS[0];
function ld(){
  try{const d=localStorage.getItem('ph1');if(d)projects=JSON.parse(d);}catch(e){}
}
function sv(){try{localStorage.setItem('ph1',JSON.stringify(projects));}catch(e){}}
function gid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function render(){
  renderStats();
  renderGrid();
}
function renderStats(){
  const tot=projects.length;
  const act=projects.filter(p=>p.status==='active').length;
  const done=projects.filter(p=>p.status==='done').length;
  document.getElementById('stats').innerHTML=`
    <div class="stat-card"><div class="stat-label">Total</div><div class="stat-value">${tot}</div></div>
    <div class="stat-card"><div class="stat-label">Ativos</div><div class="stat-value">${act}</div></div>
    <div class="stat-card"><div class="stat-label">Concluídos</div><div class="stat-value">${done}</div></div>
  `;
}
function renderGrid(){
  let list=[...projects];
  if(filter==='high')list=list.filter(p=>p.priority==='high');
  else if(filter!=='all')list=list.filter(p=>p.status===filter);

  if(!list.length){
    document.getElementById('grid').innerHTML=`<div class="empty"><div class="empty-title">Nenhum projeto</div><p>Crie seu primeiro projeto clicando em "Novo projeto"</p></div>`;
    return;
  }
  const sL={active:'Em andamento',paused:'Pausado',done:'Concluído'};
  const sC={active:'b-active',paused:'b-paused',done:'b-done'};
  const prL={high:'Alta',medium:'Média',low:'Baixa'};
  const prC={high:'b-high',medium:'b-medium',low:'b-low'};
  document.getElementById('grid').innerHTML=list.map(p=>`
    <div class="pcard" onclick="openEditProject('${p.id}')">
      <div>
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
          <span class="pdot" style="background:${p.color||'#1a1917'}"></span>
          <span class="pcard-name">${esc(p.name)}</span>
        </div>
        ${p.category?`<div class="pcard-cat">${esc(p.category)}</div>`:''}
      </div>
      ${p.description?`<div class="pcard-desc">${esc(p.description)}</div>`:''}
      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:11px;color:var(--text3)">Progresso</span>
          <span style="font-size:11px;font-weight:600;font-family:'DM Mono',monospace">${p.progress||0}%</span>
        </div>
        <div class="pbar"><div class="pbar-fill" style="width:${p.progress||0}%;background:${p.color||'var(--accent)'}"></div></div>
      </div>
      <div class="pcard-foot">
        <div style="display:flex;gap:5px">
          <span class="badge ${sC[p.status]||'b-active'}">${sL[p.status]||'Em andamento'}</span>
          <span class="badge ${prC[p.priority]||'b-medium'}">${prL[p.priority]||'Média'}</span>
        </div>
        <button onclick="event.stopPropagation();askDel('${p.id}')" style="font-size:11px;color:var(--text3);padding:4px 8px;border-radius:5px" onmouseenter="this.style.color='var(--red)'" onmouseleave="this.style.color='var(--text3)'">excluir</button>
      </div>
    </div>
  `).join('');
}
function setFilter(f,btn){
  filter=f;
  document.querySelectorAll('.fchip').forEach(e=>e.classList.remove('active'));
  btn.classList.add('active');
  renderGrid();
}
function rCPicker(){
  document.getElementById('cpicker').innerHTML=COLORS.map(c=>`<div class="cswatch ${c===color?'sel':''}" style="background:${c}" onclick="color='${c}';rCPicker()"></div>`).join('');
}
function openNewProject(){
  editing=null;
  document.getElementById('modal-title').textContent='Novo Projeto';
  document.getElementById('f-name').value='';
  document.getElementById('f-desc').value='';
  document.getElementById('f-cat').value='';
  document.getElementById('f-status').value='active';
  document.getElementById('f-priority').value='medium';
  document.getElementById('f-progress').value='0';
  color=COLORS[0];rCPicker();
  document.getElementById('proj-modal').classList.add('open');
  setTimeout(()=>document.getElementById('f-name').focus(),150);
}
function openEditProject(id){
  const p=projects.find(x=>x.id===id);if(!p)return;
  editing=id;
  document.getElementById('modal-title').textContent='Editar Projeto';
  document.getElementById('f-name').value=p.name;
  document.getElementById('f-desc').value=p.description||'';
  document.getElementById('f-cat').value=p.category||'';
  document.getElementById('f-status').value=p.status||'active';
  document.getElementById('f-priority').value=p.priority||'medium';
  document.getElementById('f-progress').value=p.progress||0;
  color=p.color||COLORS[0];rCPicker();
  document.getElementById('proj-modal').classList.add('open');
}
function closeModal(){document.getElementById('proj-modal').classList.remove('open');}
function saveProject(){
  const name=document.getElementById('f-name').value.trim();if(!name)return;
  const d={name,description:document.getElementById('f-desc').value.trim(),category:document.getElementById('f-cat').value.trim(),status:document.getElementById('f-status').value,priority:document.getElementById('f-priority').value,progress:parseInt(document.getElementById('f-progress').value)||0,color};
  if(editing){const i=projects.findIndex(p=>p.id===editing);if(i!==-1)projects[i]={...projects[i],...d};toast('Projeto atualizado');}
  else{projects.unshift({...d,id:gid(),createdAt:Date.now()});toast('Projeto criado');}
  sv();closeModal();render();
}
function askDel(id){deleting=id;document.getElementById('conf-ov').classList.add('open');}
function closeConf(){document.getElementById('conf-ov').classList.remove('open');deleting=null;}
function doDelete(){if(!deleting)return;projects=projects.filter(p=>p.id!==deleting);sv();toast('Excluído');closeConf();render();}
function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;document.getElementById('toasts').appendChild(t);setTimeout(()=>t.classList.add('show'),10);setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),300)},2500);}
document.getElementById('proj-modal').addEventListener('click',function(e){if(e.target===this)closeModal();});
document.getElementById('conf-ov').addEventListener('click',function(e){if(e.target===this)closeConf();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeConf();}});
ld();render();
