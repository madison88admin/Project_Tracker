/* Madison Dev Tracker frontend — projects-first, no build step */
const $ = s => document.querySelector(s);
const API_BASE = String(window.MDT_CONFIG?.apiBase || '').replace(/\/$/, '');
const apiUrl = p => /^https?:\/\//i.test(p) ? p : API_BASE + (String(p).startsWith('/') ? p : '/' + p);
const api = {
  async get(p){
    const r=await fetch(apiUrl(p),{headers:authHeaders()});
    let j=null; try{ j=await r.json(); }catch(e){}
    if(r.status===401){ const t=await promptModal('Enter tracker access token','',{title:'Authentication required'}); if(t){localStorage.setItem('mdt_token',t); location.reload();} }
    if(!r.ok) throw new Error((j&&j.error)||('HTTP '+r.status));
    return j;
  },
  async send(p, m, b){
    const r = await fetch(apiUrl(p),{method:m,headers:{'Content-Type':'application/json',...authHeaders()},body:b?JSON.stringify(b):undefined});
    let j=null; try{ j=await r.json(); }catch(e){}
    if(!r.ok) throw new Error((j&&j.error)||('HTTP '+r.status));
    return j;
  }
};
function authHeaders(){ const t=localStorage.getItem('mdt_token'); return t?{Authorization:'Bearer '+t}:{}; }
const S = { view:'dashboard', systems:[], tasks:[], projects:[], activity:[], presence:[], stats:null, meta:{statuses:[],priorities:[],types:[]} };
S.timelineLimit = 8;
window.loadMoreProjects = () => { S.timelineLimit += 8; render(); };
const presenceId = sessionStorage.getItem('mdt_presence_id') || (()=>{ const id=crypto.randomUUID(); sessionStorage.setItem('mdt_presence_id',id); return id; })();
let presenceContext={systemId:'',projectId:''};
let refreshTimer=null, refreshBusy=false, refreshQueued=false;
async function updatePresence(systemId='',projectId=''){ const name=myName(); if(!name) return; presenceContext={systemId,projectId}; try{ const r=await api.send('/api/presence','POST',{sessionId:presenceId,name,systemId,projectId}); S.presence=r.viewers||[]; const el=$('#presenceBar'); if(el) el.innerHTML=presenceHtml(); }catch(e){} }
function presenceHtml(){ const others=S.presence.filter(p=>p.sessionId!==presenceId); return others.length?`<span class="presence-live">●</span><b>Viewing now:</b> ${others.map(p=>`${avatar(p.name,20)} <span>${esc(p.name)}</span>`).join(' ')}`:'<span class="mut">● No other viewers</span>'; }
setInterval(()=>updatePresence(presenceContext.systemId,presenceContext.projectId),30000);
const changeEvents = new EventSource(apiUrl('/api/events'));
changeEvents.onmessage = e => { try { if(JSON.parse(e.data).type==='data') queueRefresh(); } catch(err){} };
changeEvents.onerror = () => {}; // browser automatically reconnects
const sysName = id => (S.systems.find(s=>s.id===id)||{name:id}).name;
const isDone = t => t.status==='Live';
const TEAM = ['John Carlo Manalo', 'Mhark Anthony Pentinio', 'Stephanie Joyce Guce', 'Lester Mendoza', 'Maritoni Joy Sapinoso'];
const DEVELOPER_OVERHEAD = { 'John Carlo Manalo':5, 'Mhark Anthony Pentinio':5, 'Stephanie Joyce Guce':5 };
const ADMIN = 'John Carlo Manalo';
const ITSM_URL = 'https://m88itsm.netlify.app/login';
async function ensureITSMVerified(){
  if(sessionStorage.getItem('mdt_itsm_verified')==='1') return true;
  if(sessionStorage.getItem('mdt_itsm_pending')==='1'){
    sessionStorage.setItem('mdt_itsm_verified','1');
    sessionStorage.removeItem('mdt_itsm_pending');
    return true;
  }
  const ok=await confirmModal('Profile change requires ITSM login verification.\n\nYou will be redirected to ITSM login. After logging in, return here and try again.',{title:'ITSM Verification',ok:'Go to ITSM Login'});
  if(ok){ window.open(ITSM_URL,'_blank'); sessionStorage.setItem('mdt_itsm_pending','1'); toast('Redirected to ITSM — after login, try again'); }
  return false;
}
function isProfileChangeAllowed(){ return localStorage.getItem('mdt_allow_profile_change')==='1'; }
window.toggleProfilePermission=async ()=>{
  if(myName()!==ADMIN){ toast('Only admin can toggle permission'); return; }
  const cur=isProfileChangeAllowed();
  if(cur){ localStorage.setItem('mdt_allow_profile_change','0'); sessionStorage.removeItem('mdt_itsm_verified'); sessionStorage.removeItem('mdt_itsm_pending'); toast('Profile change DISABLED — locked'); }
  else { localStorage.setItem('mdt_allow_profile_change','1'); toast('Profile change ENABLED — allowed'); }
  renderProfile(); render();
};

function toast(m){ const t=$('#toast'); t.textContent=m; t.classList.remove('hidden'); setTimeout(()=>t.classList.add('hidden'),2400); }
function openModal(html){ const modal=$('#modal'); modal.innerHTML=html; modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.setAttribute('tabindex','-1'); const wrap=$('#modalWrap'); wrap.classList.remove('hidden'); setTimeout(()=>modal.querySelector('input,select,textarea,button')?.focus(),0); if(window.gsap&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.fromTo('#modal',{autoAlpha:0,y:18,scale:.96},{autoAlpha:1,y:0,scale:1,duration:.25,ease:'power2.out',overwrite:true}); }
function closeModal(){ const wrap=$('#modalWrap'); if(window.gsap&&!wrap.classList.contains('hidden')&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){ gsap.to('#modal',{autoAlpha:0,y:12,scale:.97,duration:.18,ease:'power2.in',overwrite:true,onComplete:()=>wrap.classList.add('hidden')}); } else wrap.classList.add('hidden'); }
$('#modalWrap').addEventListener('click',e=>{ if(e.target.id==='modalWrap') closeModal(); });
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){ e.preventDefault(); if($('#modalWrap').classList.contains('hidden')) quickOpen(); return; }
  if(e.key==='Escape') closeModal();
});
function confirmModal(msg, opts={}){
  return new Promise(res=>{
    const title=opts.title||'Confirm';
    const ok=opts.ok||'Confirm';
    const cancel=opts.cancel||'Cancel';
    const danger=opts.danger? 'danger' : '';
    openModal(`<h2 style="margin:0 0 8px">${esc(title)}</h2><p class="mut" style="font-size:14px;line-height:1.5;white-space:pre-wrap">${esc(msg)}</p><div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" id="cmCancel">${esc(cancel)}</button><button class="btn pri ${danger}" id="cmOk">${esc(ok)}</button></div>`);
    setTimeout(()=>{ const a=$('#cmOk'),b=$('#cmCancel'); if(a) a.onclick=()=>{closeModal();res(true)}; if(b) b.onclick=()=>{closeModal();res(false)}; },0);
  });
}
function promptModal(msg, def='', opts={}){
  return new Promise(res=>{
    const title=opts.title||'Input';
    openModal(`<h2 style="margin:0 0 8px">${esc(title)}</h2><p class="mut" style="font-size:14px">${esc(msg)}</p><input id="pmInput" value="${esc(def)}" style="margin-top:8px"><div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn" id="pmCancel">Cancel</button><button class="btn pri" id="pmOk">OK</button></div>`);
    setTimeout(()=>{ const inp=$('#pmInput'); if(inp) inp.focus(); const a=$('#pmOk'),b=$('#pmCancel'); if(a) a.onclick=()=>{const v=$('#pmInput').value; closeModal(); res(v);}; if(b) b.onclick=()=>{closeModal(); res(null);}; },0);
  });
}

function captureScrollState(){
  return {
    windowY:window.scrollY,
    inner:[...document.querySelectorAll('[data-scroll-area="tasks"]')].map(el=>el.scrollTop)
  };
}
function restoreScrollState(state){
  if(!state) return;
  requestAnimationFrame(()=>{
    window.scrollTo({top:state.windowY,behavior:'auto'});
    [...document.querySelectorAll('[data-scroll-area="tasks"]')].forEach((el,i)=>{el.scrollTop=state.inner[i]||0;});
  });
}
function queueRefresh(){
  clearTimeout(refreshTimer);
  refreshTimer=setTimeout(()=>refresh({silent:true,preserve:true}),250);
}
async function refresh(opts={}){
  if(refreshBusy){ refreshQueued=true; return; }
  refreshBusy=true;
  const scroll=opts.preserve?captureScrollState():null;
  try{
    const [meta,systems,tasks,projects,activity,stats] = await Promise.all([
      api.get('/api/meta'),api.get('/api/systems'),api.get('/api/tasks'),
      api.get('/api/projects'),api.get('/api/activity'),api.get('/api/stats')
    ]);
    Object.assign(S,{meta,systems,tasks,projects,activity,stats});
    await updatePresence(presenceContext.systemId,presenceContext.projectId);
    const health=$('#apiHealth');
    if(health){ health.textContent=`API ok · ${systems.length} systems · ${projects.length} projects`; health.classList.remove('api-error'); }
    renderProfile();
    render({silent:!!opts.silent});
    restoreScrollState(scroll);
  }catch(e){
    const health=$('#apiHealth');
    if(health){ health.textContent='API offline — retrying'; health.classList.add('api-error'); }
    if(S.stats) toast('Live update failed — showing last known data');
    else { const v=$('#view'); if(v) v.innerHTML='<div class="load-error">Unable to load tracker data. <button class="btn pri" onclick="refresh()">Retry</button></div>'; }
  }finally{
    refreshBusy=false;
    if(refreshQueued){ refreshQueued=false; queueRefresh(); }
  }
}

function esc(s){return String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  projects: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  systems: '<rect x="3" y="4" width="18" height="12" rx="2"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="16" x2="12" y2="20"/>',
  activity: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  benefits: '<path d="M4 19h16"/><path d="M6 16V9m6 7V5m6 11v-3"/><path d="M4 5h5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  layers: '<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  code: '<path d="M8 6 3 12l5 6M16 6l5 6-5 6"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  alert: '<path d="M12 3 2 21h20L12 3z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17" x2="12" y2="17"/>',
  comment: '<path d="M4 5h16v11H9l-5 4z"/>',
  send: '<path d="M12 19V5m-7 7 7-7 7 7"/>'
};
const icon = (n, s) => `<svg class="ic" width="${s||16}" height="${s||16}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]||''}</svg>`;
const FALLBACK_COLORS = { 'SYS-HRIS':'#3b82f6','SYS-INV':'#f59e0b','SYS-POS':'#22c55e','SYS-CRM':'#a855f7','SYS-WEB':'#ec4899' };
function sysColor(id){ const s=S.systems.find(x=>x.id===id); return (s&&s.color)||FALLBACK_COLORS[id]||'#64748b'; }
function avatarColor(n){ let h=0; for(const c of String(n||'?')) h=(h*31+c.charCodeAt(0))>>>0; return `hsl(${h%360} 65% 45%)`; }
function initials(n){ const p=String(n||'?').trim().split(/\s+/); return ((p[0]||'?')[0]+(p.length>1?(p[p.length-1]||'')[0]:'')).toUpperCase(); }
function avatar(n,sz){ sz=sz||24; return `<span class="avatar" title="${esc(n||'Unassigned')}" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz*0.42)}px;background:${avatarColor(n||'?')}">${esc(initials(n||'?'))}</span>`; }
function dueInfo(t){
  if(!t.due&&!t.deadline||isDone(t)||t.status==='On Hold') return null;
  const due=t.due||t.deadline;
  const today=new Date().toISOString().slice(0,10);
  const diff=Math.round((new Date(due)-new Date(today))/864e5);
  if(diff<0) return {cls:'due-over',txt:`${-diff}d overdue`};
  if(diff===0) return {cls:'due-soon',txt:'due today'};
  if(diff<=2) return {cls:'due-soon',txt:`due in ${diff}d`};
  return {cls:'due-ok',txt:`${due}`};
}
function myName(){ return localStorage.getItem('mdt_me')||''; }
function setMyName(n){ if(n) localStorage.setItem('mdt_me',n); else localStorage.removeItem('mdt_me'); renderProfile(); }
function teamOpts(){ return [...new Set([...TEAM,...S.tasks.map(t=>t.assignee).filter(Boolean)])].map(n=>`<option value="${esc(n)}">`).join(''); }
function renderProfile(){
  const box=document.getElementById('profileBox'); if(!box) return;
  const me=myName();
  const allowed=isProfileChangeAllowed();
  if(!me){
    box.innerHTML=`<span class="mut" style="font-size:12px">👤 Select profile:</span><select id="profileSel" style="width:auto;min-width:160px"><option value="">— choose —</option>${[...new Set([...TEAM,...S.tasks.map(t=>t.assignee).filter(Boolean)])].map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('')}</select><button class="btn pri" onclick="const v=document.getElementById('profileSel').value;if(!v)return toast('Pili ka muna ng user');setProfile(v)">Lock</button><a href="${ITSM_URL}" target="_blank" class="mut" style="font-size:11px;margin-left:6px;text-decoration:underline">ITSM Login →</a>${allowed?'': '<span class="pill" style="margin-left:6px;background:#3f1d1d;color:#fca5a5;border-color:#7f1d1d">Locked by admin</span>'}`;
  } else {
    const isAdmin=me===ADMIN;
    box.innerHTML=`<span style="display:flex;align-items:center;gap:8px;cursor:pointer" onclick="confirmProfileChange()" title="Click to change">${avatar(me,26)}<b style="font-size:13px">${esc(me)}</b><span class="pill" style="background:#0c2a4d;color:#579dff;border-color:#0052cc">🔒 Locked</span>${isAdmin?'<span class="pill" style="background:#14532d;color:#86efac">Admin</span>':''}${allowed?'<span class="pill" style="background:#14532d;color:#86efac">Allowed</span>':'<span class="pill" style="background:#3f1d1d;color:#fca5a5">Blocked</span>'}</span><button class="btn" onclick="confirmProfileChange()">Change</button><a href="${ITSM_URL}" target="_blank" class="mut" style="font-size:11px;margin-left:4px;text-decoration:underline">ITSM</a>${isAdmin?`<button class="btn" style="margin-left:4px;font-size:11px" onclick="toggleProfilePermission()">${allowed?'🔒 Disable':'🔓 Allow'} change</button>`:''}`;
  }
}
window.setProfile=async (name)=>{
  const cur=myName();
  if(cur){
    if(!await ensureITSMVerified()) return;
    if(!isProfileChangeAllowed()){
      toast('🔒 Blocked — need admin permission (ako lang mag-eedit). Admin must enable via toggle.');
      return;
    }
  }
  setMyName(name); toast('🔒 Profile locked: '+name+' — ITSM mode'); refresh();
};
window.clearProfile=async ()=>{
  const cur=myName();
  if(cur){
    if(!await ensureITSMVerified()) return;
    if(!isProfileChangeAllowed()){
      toast('🔒 Blocked — need admin permission');
      return;
    }
  }
  setMyName(''); toast('Unlocked'); refresh();
};
window.confirmProfileChange=async ()=>{
  const cur=myName();
  if(cur){
    if(!await ensureITSMVerified()) return;
    if(!isProfileChangeAllowed()){
      toast('🔒 Blocked — need admin permission');
      return;
    }
  }
  if(await confirmModal('Change profile? Current lock will be removed.',{title:'Change profile',ok:'Change'})){ setMyName(''); toast('Unlocked — select new profile'); render(); }
};
function projectStage(p){
  if(p.status && S.meta.statuses.includes(p.status)) return p.status;
  const ts=S.tasks.filter(t=>t.projectId===p.id);
  if(ts.length){
    if(ts.every(t=>t.status==='Live')) return 'Live';
    if(ts.some(t=>t.status==='On Hold')) return 'On Hold';
    if(ts.some(t=>t.status==='UAT')) return 'UAT';
    if(ts.some(t=>t.status==='Development')) return 'Development';
    return 'Pipeline';
  }
  if(p.hqProgress!=null) return p.hqProgress>=100?'Live':'Development';
  return 'Pipeline';
}
function progressState(p){
  const stage=projectStage(p), pct=Number(p.pct||0);
  if(stage!=='Live' && pct>=100) return {label:'Work complete · stage approval pending',cls:'progress-warning'};
  if(stage==='Live' && pct<100) return {label:'Live · verify completion',cls:'progress-warning'};
  return null;
}
const isNonDevelopingSystem = s => s && (s.category === 'Non-developing' || s.id === 'SYS-ADMIN');
const statusColor={Pipeline:'#64748b',Development:'#3b82f6',UAT:'#a855f7',Live:'#22c55e','On Hold':'#f59e0b'};
const SDLC_PHASES=['Technical Analysis','Technical Design','Coding Development','System Internal Testing (SIT)','UAT','Go Live','Hypercare'];
function currentPhase(p){ const stage=projectStage(p); if(stage==='Pipeline') return 'Technical Analysis'; if(stage==='UAT') return 'UAT'; if(stage==='Live') return 'Hypercare'; if(stage==='On Hold') return 'Paused'; const active=(p.subprojects||[]).find(s=>s.stage==='Development'); return active?active.name:'Technical Analysis'; }
function phaseIndex(p){ const name=currentPhase(p).toLowerCase(); const direct=SDLC_PHASES.findIndex(x=>x.toLowerCase()===name); if(direct>=0) return direct; if(name.includes('technical design')) return 1; if(name.includes('technical')) return 0; if(name.includes('coding')||name.includes('frontend')||name.includes('backend')) return 2; if(name.includes('sit')||name.includes('testing')||name.includes('internal')) return 3; if(name==='uat'||name.includes('uat sign')) return 4; if(name.includes('go live')) return 5; if(name.includes('hypercare')) return 6; return projectStage(p)==='Live'?6:0; }
function stageJourney(p){
  const stage=projectStage(p);
  if(stage==='On Hold') return 'Paused · resumes from current stage';
  const map={Pipeline:['Pipeline','Development'],Development:['Development','UAT'],UAT:['UAT','Go Live'],Live:['Live','Hypercare']};
  const pair=map[stage]||['Technical Analysis','Coding'];
  const complete=Number(p.pct||0)>=100;
  return complete?`${pair[0]} complete · Next: ${pair[1]}`:`Current: ${pair[0]} · Next: ${pair[1]}`;
}
function sdlcTimeline(p){ const at=phaseIndex(p); return `<div class="sdlc-timeline" aria-label="SDLC timeline">${SDLC_PHASES.map((name,i)=>`<span class="sdlc-step ${i<at?'done':i===at?'current':'future'}"><i>${i<at?'✓':i+1}</i><b>${esc(name.replace(' (SIT)','').replace(' Sign Off',''))}</b></span>`).join('')}</div>`; }
window.saveProjectAllocation=async (id,value)=>{
  const raw=String(value??'').trim();
  if(raw!=='' && (!Number.isFinite(Number(raw)) || Number(raw)<0 || Number(raw)>100)) return toast('Allocation must be between 0% and 100%');
  try{
    await api.send('/api/projects/'+id,'PATCH',{allocationPct:raw===''?null:Number(raw),by:myName()||'User'});
    toast(raw===''?'Allocation reset to automatic':'Manual allocation saved');
    refresh({silent:true,preserve:true});
  }catch(e){ toast(e.message); }
};
function developerWorkloadHTML(){
  const map={};
  for(const u of TEAM) map[u]={active:[],paused:0,live:0};
  for(const p of S.projects){ const u=p.assignee||'Unassigned'; if(u==='Unassigned') continue; if(!map[u]) map[u]={active:[],paused:0,live:0}; const stage=projectStage(p); if(stage==='Live') map[u].live++; else if(stage==='On Hold') map[u].paused++; else map[u].active.push(p); }
  return Object.entries(map).sort((a,b)=>b[1].active.length-a[1].active.length).map(([u,x])=>{
    const manual=x.active.filter(p=>p.allocationPct!==null&&p.allocationPct!==undefined&&p.allocationPct!=='').map(p=>({...p,allocation:Number(p.allocationPct)}));
    const overhead=DEVELOPER_OVERHEAD[u]||0;
    const manualTotal=manual.reduce((sum,p)=>sum+(Number.isFinite(p.allocation)?Math.max(0,Math.min(100,p.allocation)):0),0);
    const automatic=x.active.filter(p=>!manual.some(m=>m.id===p.id));
    const autoAllocation=automatic.length?Math.max(0,100-overhead-manualTotal)/automatic.length:0;
    const allocations=new Map(x.active.map(p=>[p.id,manual.find(m=>m.id===p.id)?.allocation??autoAllocation]));
    const used=Math.round(overhead+x.active.reduce((sum,p)=>sum+(allocations.get(p.id)||0),0));
    const color=used>=100?'#ef4444':used>=50?'#f59e0b':'#22c55e';
    const barWidth=Math.min(100,Math.max(0,used));
    const overheadChip=overhead?`<span class="workload-chip workload-overhead"><span>Operational Support / BAU</span><b>${overhead}%</b></span>`:'';
    const projectChips=x.active.map(p=>{ const hasManual=p.allocationPct!==null&&p.allocationPct!==undefined&&p.allocationPct!==''; const value=hasManual?Number(p.allocationPct):''; const calculated=Math.round(allocations.get(p.id)||0); return `<span class="workload-chip"><span>${esc(p.name)}</span><label title="${hasManual?'Manual override':'Automatic allocation'}"><input class="workload-allocation" type="number" min="0" max="100" step="5" value="${hasManual?value:''}" placeholder="${calculated}" aria-label="${esc(p.name)} allocation percentage" onchange="saveProjectAllocation('${p.id}',this.value)">%</label>${hasManual?'<small>manual</small>':''}</span>`; }).join('');
    return `<div class="workload-row" style="--workload-color:${color}"><div class="workload-person">${avatar(u,28)}<b>${esc(u)}</b><span class="workload-summary" style="color:${color}">${used}% allocated · ${Math.max(0,100-used)}% available</span></div><div class="workload-bar"><i style="width:${barWidth}%;background:${color}"></i></div><div class="workload-projects">${overheadChip}${projectChips||'<span class="mut">No active assignments</span>'}</div><small class="mut">${x.active.length} active · ${x.paused} paused · ${x.live} live · ${manual.length} manual · ${overhead}% BAU</small></div>`;
  }).join('')||'<span class="mut">No developers assigned yet.</span>';
}
const BENEFIT_DEFAULTS = { currentHandlingMinutes:0, transactionsPerMonth:0, futureHandlingMinutes:0, futureManualHoursPerMonth:null, manualExceptionsPct:0, roles:'', fullyLoadedHourlyCost:450, annualCostPerFte:900000, outcome:'Capacity Released (Soft Savings)', errorReductionPct:0, cycleTimeReductionPct:0, riskReduction:'' };
function benefitData(p){
  const b={...BENEFIT_DEFAULTS,...(p&&p.benefits||{})};
  const current=Number(b.currentHandlingMinutes)||0, volume=Number(b.transactionsPerMonth)||0, futureMins=Number(b.futureHandlingMinutes)||0;
  const baseline=current*volume/60, estimatedFuture=futureMins*volume/60;
  const future=b.futureManualHoursPerMonth===null||b.futureManualHoursPerMonth===''||b.futureManualHoursPerMonth===undefined?estimatedFuture:Math.max(0,Number(b.futureManualHoursPerMonth)||0);
  const saved=Math.max(0,baseline-future), fte=saved/160, annual=Number(b.annualCostPerFte)||900000;
  return {b,baseline,future,saved,fteWithout:baseline/160,fteWith:future/160,fte,costAvoidance:fte*annual,cycleReduction:Number(b.cycleTimeReductionPct)|| (baseline? saved/baseline*100:0),configured:current>0&&volume>0};
}
function numberFmt(n,d=1){ return new Intl.NumberFormat('en-PH',{maximumFractionDigits:d}).format(Number(n)||0); }
function phpFmt(n){ return new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0}).format(Number(n)||0); }
function benefitSummaryHTML(p){
  const x=benefitData(p);
  return `<section class="project-benefit-card"><div class="dashboard-section-head"><div><span class="dashboard-eyebrow">BENEFITS POLICY</span><h3>FTE capacity & cost impact</h3><p class="mut">Connected to ${esc(p.name)} · calculated from the Benefits Calculation Policy</p></div><button class="btn" onclick="benefitForm('${p.id}')">${x.configured?'Edit inputs':'Add baseline'}</button></div><div class="benefit-metrics"><div><b>${x.configured?numberFmt(x.saved):'—'}</b><span>hours saved / month</span></div><div><b>${x.configured?numberFmt(x.fte,2):'—'}</b><span>FTE equivalent</span></div><div><b>${x.configured?phpFmt(x.costAvoidance):'—'}</b><span>annual cost avoidance</span></div></div><div class="benefit-formula"><span>Baseline ${x.configured?numberFmt(x.baseline):'—'}h → Future ${x.configured?numberFmt(x.future):'—'}h</span><span>1 FTE = 160h/month · ${esc(x.b.outcome)}</span></div></section>`;
}
function benefitsHTML(){
  const system=S._benefitSystem||'';
  const rows=S.projects.filter(p=>!system||p.systemId===system).map(p=>({p,x:benefitData(p)}));
  const measured=rows.filter(r=>r.x.configured), totalSaved=measured.reduce((n,r)=>n+r.x.saved,0), totalFte=measured.reduce((n,r)=>n+r.x.fte,0), totalCost=measured.reduce((n,r)=>n+r.x.costAvoidance,0);
  return `<div class="benefits-shell"><div class="benefits-heading"><div><span class="dashboard-eyebrow">POLICY-BASED ANALYTICS</span><h1>FTE Benefits</h1><p>Measure time saved, capacity released, and cost avoidance per project. Values stay linked to the project record.</p></div><label class="benefits-system-filter">System<select onchange="S._benefitSystem=this.value;render()"><option value="">All systems</option>${S.systems.map(s=>`<option value="${esc(s.id)}" ${system===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label></div><div class="benefit-kpis"><div class="benefit-kpi"><span>Projects measured</span><b>${measured.length}<small> / ${rows.length}</small></b><em>${rows.length?Math.round(measured.length/rows.length*100):0}% coverage</em></div><div class="benefit-kpi"><span>Time saved / month</span><b>${numberFmt(totalSaved)}<small> hrs</small></b><em>baseline minus future manual work</em></div><div class="benefit-kpi"><span>FTE equivalent</span><b>${numberFmt(totalFte,2)}</b><em>capacity released at 160h/FTE</em></div><div class="benefit-kpi"><span>Annual cost impact</span><b>${phpFmt(totalCost)}</b><em>policy-based estimate</em></div></div><div class="benefit-policy-note"><b>Calculation</b><span>Current manual hours − future manual hours = time saved</span><span>Time saved ÷ 160 = FTE equivalent</span><span>FTE equivalent × annual cost per FTE = cost avoidance</span></div><div class="benefit-project-list">${rows.map(({p,x})=>`<article class="benefit-project-card benefit-project-row"><div class="benefit-project-title"><div>${avatar(p.assignee||'Unassigned',30)}<div><h3>${esc(p.name)}</h3><small>${esc(sysName(p.systemId))} · ${esc(p.assignee||'Unassigned')}</small></div></div><span class="pill" style="background:${statusColor[p.status]||'#1c2438'};color:#fff;border:0">${esc(p.status||'Pipeline')}</span></div><div class="benefit-row-values"><div><span>Baseline</span><b>${x.configured?numberFmt(x.baseline)+'h':'Not set'}</b></div><div><span>Future manual</span><b>${x.configured?numberFmt(x.future)+'h':'—'}</b></div><div><span>Saved / month</span><b>${x.configured?numberFmt(x.saved)+'h':'—'}</b></div><div><span>FTE equivalent</span><b>${x.configured?numberFmt(x.fte,2):'—'}</b></div><div><span>Outcome</span><b>${esc(x.b.outcome)}</b></div></div><div class="benefit-project-actions"><small class="mut">${x.configured?phpFmt(x.costAvoidance)+' annual impact':'Add the policy baseline to calculate this project'}</small><span><button class="btn" onclick="benefitForm('${p.id}')">${x.configured?'Edit calculation':'Set baseline'}</button><button class="btn" onclick="projOpen('${p.id}')">Open project</button></span></div></article>`).join('')||'<div class="empty-state">No projects found.</div>'}</div></div>`;
}
function reportScopeProjects(){
  const system=S._reportSystem||'', developer=S._reportDeveloper||'', status=S._reportStatus||'';
  return S.projects.filter(p=>(!system||p.systemId===system)&&(!developer||(p.assignee||'Unassigned')===developer)&&(!status||projectStage(p)===status));
}
function reportFilterChanged(){ S._reportSelected=null; render(); }
function reportSelectedSet(){
  const visible=reportScopeProjects().map(p=>p.id);
  if(!(S._reportSelected instanceof Set)) S._reportSelected=new Set(visible);
  else [...S._reportSelected].forEach(id=>{if(!visible.includes(id)) S._reportSelected.delete(id);});
  return S._reportSelected;
}
window.toggleReportProject=(id,checked)=>{ const set=reportSelectedSet(); checked?set.add(id):set.delete(id); render({silent:true}); };
window.toggleReportSection=(name,checked)=>{ S._reportInclude={...(S._reportInclude||{}),[name]:checked}; };
window.toggleAllReportProjects=(checked)=>{ S._reportSelected=new Set(checked?reportScopeProjects().map(p=>p.id):[]); render({silent:true}); };
window.exportPortfolioReport=async()=>{
  const selected=[...reportSelectedSet()];
  if(!selected.length) return toast('Pili muna ng project para sa report');
  const include={overview:true,delivery:true,team:true,benefits:true,register:true,...(S._reportInclude||{})};
  const system=S._reportSystem||'',developer=S._reportDeveloper||'',status=S._reportStatus||'';
  const scope=reportScopeProjects();
  toast('Preparing portfolio executive PPT…');
  try{
    const r=await fetch(apiUrl('/api/reports/portfolio.pptx'),{method:'POST',headers:{'Content-Type':'application/json',...authHeaders()},body:JSON.stringify({projectIds:selected,include,filters:{systemLabel:system?sysName(system):'All systems',developerLabel:developer||'All developers',statusLabel:status||'All statuses'}})});
    if(!r.ok){let j=null;try{j=await r.json()}catch(e){}throw new Error(j?.error||('HTTP '+r.status));}
    const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a'); a.href=url; a.download='madison-portfolio-executive-report.pptx'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),2000); toast(`Portfolio report ready · ${scope.length} projects`);
  }catch(e){ toast('Portfolio export failed: '+e.message); }
};
function portfolioReportHTML(){
  const visible=reportScopeProjects(),selected=reportSelectedSet(),include={overview:true,delivery:true,team:true,benefits:true,register:true,...(S._reportInclude||{})};
  const developers=[...new Set([...TEAM,...S.projects.map(p=>p.assignee||'Unassigned')])].filter(Boolean).sort();
  const system=S._reportSystem||'',developer=S._reportDeveloper||'',status=S._reportStatus||'';
  return `<div class="report-shell"><div class="report-heading"><div><span class="dashboard-eyebrow">EXECUTIVE REPORTING</span><h1>Portfolio Report</h1><p>Select the exact project scope and sections to include in the M88 executive PPT.</p></div><div class="report-heading-actions"><span class="report-selection-count"><b>${selected.size}</b> selected · ${visible.length} visible</span><button class="btn pri" onclick="exportPortfolioReport()" ${selected.size?'':'disabled'}>Export portfolio PPT</button></div></div><div class="report-controls card"><div class="report-filter-group"><label>System<select onchange="S._reportSystem=this.value;reportFilterChanged()"><option value="">All development systems</option>${S.systems.filter(s=>!isNonDevelopingSystem(s)).map(s=>`<option value="${esc(s.id)}" ${system===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label><label>Developer<select onchange="S._reportDeveloper=this.value;reportFilterChanged()"><option value="">All developers</option>${developers.map(u=>`<option value="${esc(u)}" ${developer===u?'selected':''}>${esc(u)}</option>`).join('')}</select></label><label>Status<select onchange="S._reportStatus=this.value;reportFilterChanged()"><option value="">All statuses</option>${['Pipeline','Development','UAT','Live','On Hold'].map(st=>`<option value="${st}" ${status===st?'selected':''}>${st}</option>`).join('')}</select></label></div><div class="report-sections"><span class="report-section-label">Include in PPT</span>${[['overview','Overview'],['delivery','Delivery detail'],['team','Team capacity'],['benefits','FTE benefits'],['register','Project register']].map(([key,label])=>`<label class="report-toggle"><input type="checkbox" ${include[key]?'checked':''} onchange="toggleReportSection('${key}',this.checked)"><span>${label}</span></label>`).join('')}</div></div><div class="report-list-card card"><div class="report-list-head"><div><h2>Projects to report</h2><p class="mut">Only checked projects will appear in the deck.</p></div><div class="row"><button class="btn" onclick="toggleAllReportProjects(true)">Select visible</button><button class="btn" onclick="toggleAllReportProjects(false)">Clear</button></div></div><div class="report-project-list">${visible.map(p=>`<label class="report-project-row"><input class="report-project-check" type="checkbox" ${selected.has(p.id)?'checked':''} onchange="toggleReportProject('${p.id}',this.checked)"><span class="report-project-main"><b>${esc(p.name)}</b><small>${esc(sysName(p.systemId))} · ${esc(p.assignee||'Unassigned')} · ${esc(currentPhase(p))}</small></span><span class="report-project-progress"><b>${Number(p.pct||0)}%</b><i><em style="width:${Math.max(0,Math.min(100,Number(p.pct)||0))}%"></em></i></span><span class="pill" style="background:${statusColor[projectStage(p)]||'#1c2438'};color:#fff;border:0">${esc(projectStage(p))}</span></label>`).join('')||'<div class="empty-state">No projects match these filters.</div>'}</div></div></div>`;
}
window.benefitForm=(pid)=>{
  const p=S.projects.find(x=>x.id===pid); if(!p) return;
  const x=benefitData(p), b=x.b;
  openModal(`<div class="benefit-form-head"><div><span class="dashboard-eyebrow">PROJECT BENEFITS</span><h2>${esc(p.name)}</h2><p class="mut">Use the policy inputs below. The outputs are computed automatically.</p></div><span class="pill">1 FTE = 160h/month</span></div><div class="form-grid benefit-input-grid"><label>Current handling time (min)<input id="b_current" type="number" min="0" step="0.1" value="${b.currentHandlingMinutes}"></label><label>Transactions / month<input id="b_volume" type="number" min="0" step="1" value="${b.transactionsPerMonth}"></label><label>Future handling time (min)<input id="b_future" type="number" min="0" step="0.1" value="${b.futureHandlingMinutes}"></label><label>Future manual hours / month <small>(optional override)</small><input id="b_future_hours" type="number" min="0" step="0.1" value="${b.futureManualHoursPerMonth===null?'':b.futureManualHoursPerMonth}" placeholder="Auto from future time × volume"></label><label>Manual exceptions (%)<input id="b_exceptions" type="number" min="0" max="100" step="1" value="${b.manualExceptionsPct}"></label><label>Roles involved<input id="b_roles" value="${esc(b.roles)}" placeholder="e.g. Operations"></label><label>Fully loaded hourly cost (PHP)<input id="b_hourly" type="number" min="0" step="1" value="${b.fullyLoadedHourlyCost}"></label><label>Annual cost per FTE (PHP)<input id="b_annual" type="number" min="0" step="1000" value="${b.annualCostPerFte}"></label><label>Outcome classification<select id="b_outcome"><option ${b.outcome==='Headcount Reduced (Hard FTE Savings)'?'selected':''}>Headcount Reduced (Hard FTE Savings)</option><option ${b.outcome==='Capacity Released (Soft Savings)'?'selected':''}>Capacity Released (Soft Savings)</option><option ${b.outcome==='Growth Absorbed (Cost Avoidance)'?'selected':''}>Growth Absorbed (Cost Avoidance)</option></select></label><label>Error reduction (%)<input id="b_error" type="number" min="0" max="100" step="1" value="${b.errorReductionPct}"></label><label>Cycle time reduction (%)<input id="b_cycle" type="number" min="0" max="100" step="1" value="${b.cycleTimeReductionPct}"></label><label>Risk reduction<input id="b_risk" value="${esc(b.riskReduction)}" placeholder="e.g. less key-person dependency"></label><div class="benefit-live-preview full" id="benefitLivePreview"></div></div><div class="row" style="margin-top:14px"><button class="btn pri" onclick="saveBenefitForm('${p.id}')">Save calculation</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
  renderBenefitPreview();
};
window.renderBenefitPreview=()=>{
  const el=$('#benefitLivePreview'); if(!el) return;
  const current=Number($('#b_current')?.value)||0, volume=Number($('#b_volume')?.value)||0, futureMins=Number($('#b_future')?.value)||0, override=$('#b_future_hours')?.value;
  const baseline=current*volume/60, future=override===''||override===undefined?futureMins*volume/60:Number(override)||0, saved=Math.max(0,baseline-future), fte=saved/160, annual=Number($('#b_annual')?.value)||900000;
  el.innerHTML=`<div><span>Current manual</span><b>${numberFmt(baseline)} h/month</b></div><div><span>Future manual</span><b>${numberFmt(future)} h/month</b></div><div><span>Time saved</span><b>${numberFmt(saved)} h/month</b></div><div><span>FTE equivalent</span><b>${numberFmt(fte,2)}</b></div><div><span>Annual impact</span><b>${phpFmt(fte*annual)}</b></div>`;
};
window.saveBenefitForm=async pid=>{
  const body={currentHandlingMinutes:Number($('#b_current').value)||0,transactionsPerMonth:Number($('#b_volume').value)||0,futureHandlingMinutes:Number($('#b_future').value)||0,futureManualHoursPerMonth:$('#b_future_hours').value===''?null:Number($('#b_future_hours').value)||0,manualExceptionsPct:Number($('#b_exceptions').value)||0,roles:$('#b_roles').value,fullyLoadedHourlyCost:Number($('#b_hourly').value)||0,annualCostPerFte:Number($('#b_annual').value)||0,outcome:$('#b_outcome').value,errorReductionPct:Number($('#b_error').value)||0,cycleTimeReductionPct:Number($('#b_cycle').value)||0,riskReduction:$('#b_risk').value};
  try{ await api.send('/api/projects/'+pid,'PATCH',{benefits:body,by:myName()||'User'}); toast('FTE benefits saved to project'); closeModal(); refresh(); }catch(e){ toast(e.message); }
};
let smoothScroller=null;
function initSmoothScrolling(){
  if(!window.gsap||!window.ScrollTrigger||!window.ScrollSmoother||window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try{
    gsap.registerPlugin(ScrollTrigger,ScrollSmoother);
    document.body.classList.add('smooth-enhanced');
    smoothScroller=ScrollSmoother.create({wrapper:'#smooth-wrapper',content:'#smooth-content',smooth:1.2,effects:true,smoothTouch:0.1});
    ScrollTrigger.refresh();
  }catch(e){
    document.body.classList.remove('smooth-enhanced');
    smoothScroller=null;
  }
}
window.smoothScrollTo=(target,position='center center')=>{
  if(smoothScroller) smoothScroller.scrollTo(target,true,position);
  else document.querySelector(target)?.scrollIntoView({behavior:'smooth',block:'center'});
};
window.quickOpen=()=>{
  openModal(`<div class="quick-open-head"><div><span class="dashboard-eyebrow">COMMAND CENTER</span><h2>Quick open</h2><p class="mut">Search a project or task without leaving this view.</p></div><kbd>Esc</kbd></div><input id="quickOpenQ" class="quick-open-input" placeholder="Search projects, tasks, developers…" autocomplete="off" oninput="renderQuickOpen()"><div id="quickOpenResults" class="quick-open-results" aria-live="polite"></div>`);
  renderQuickOpen();
  setTimeout(()=>$('#quickOpenQ')?.focus(),0);
};
window.renderQuickOpen=()=>{
  const q=($('#quickOpenQ')?.value||'').trim().toLowerCase(), out=$('#quickOpenResults'); if(!out) return;
  const projects=S.projects.filter(p=>!q||(p.name+' '+sysName(p.systemId)+' '+(p.assignee||'')).toLowerCase().includes(q)).slice(0,8);
  const tasks=S.tasks.filter(t=>!q||(t.id+' '+t.title+' '+(t.assignee||'')).toLowerCase().includes(q)).slice(0,6);
  out.innerHTML=`${projects.length?`<div class="quick-open-label">Projects</div>${projects.map(p=>`<button class="quick-open-result" onclick="closeModal();projOpen('${p.id}')"><span class="quick-open-icon">${icon('folder',14)}</span><span><b>${esc(p.name)}</b><small>${esc(sysName(p.systemId))} · ${esc(p.assignee||'Unassigned')}</small></span><span class="pill quick-open-status" style="background:${statusColor[p.status]||'#1c2438'};color:#fff;border:0">${esc(p.status||'Pipeline')}</span></button>`).join('')}`:'<div class="quick-open-empty">No matching projects</div>'}${tasks.length?`<div class="quick-open-label">Tasks</div>${tasks.map(t=>`<button class="quick-open-result" onclick="closeModal();openTicket('${t.id}')"><span class="quick-open-icon">${icon('check',14)}</span><span><b>${esc(t.id)} · ${esc(t.title)}</b><small>${esc(t.assignee||'Unassigned')} · ${esc(t.status||'Pipeline')}</small></span></button>`).join('')}`:''}`;
};
function projectFilterMenu(includeProject=false){
  const active=[S._projFilter,S._projectSystemFilter,S._projectAdminFilter,S._userFilter||S._projectUserFilter,S._projectStatusFilter].filter(Boolean).length;
  const projectOpts=S.projects.map(p=>`<option value="${esc(p.id)}" ${S._projFilter===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
  const devSystems=S.systems.filter(s=>!isNonDevelopingSystem(s));
  const adminSystems=S.systems.filter(isNonDevelopingSystem);
  const systemOpts=devSystems.map(s=>`<option value="${esc(s.id)}" ${S._projectSystemFilter===s.id?'selected':''}>${esc(s.name)}</option>`).join('');
  const adminSystemOpts=adminSystems.map(s=>`<option value="${esc(s.id)}" ${S._projectAdminFilter===s.id?'selected':''}>${esc(s.name)}</option>`).join('');
  const userOpts=[...new Set([...TEAM,...S.projects.map(p=>p.assignee||'Unassigned'),...S.tasks.map(t=>t.assignee||'Unassigned')])].map(u=>`<option value="${esc(u)}" ${S._userFilter===u||S._projectUserFilter===u?'selected':''}>${esc(u)}</option>`).join('');
  const statusOpts=['Pipeline','Development','UAT','Live','On Hold'].map(st=>`<option value="${st}" ${S._projectStatusFilter===st?'selected':''}>${st}</option>`).join('');
  return `<details class="filter-menu"><summary class="btn">☷ Filters${active?` <span class="filter-count">${active}</span>`:''}</summary><div class="filter-popover">
    ${includeProject?`<label>Project<select onchange="S._projFilter=this.value;render()"><option value="">All projects</option>${projectOpts}</select></label>`:''}
    <label>System<select onchange="S._projectSystemFilter=this.value;S._projectAdminFilter='';render()"><option value="">All development systems</option>${systemOpts}</select></label>
    <label>Admin / non-developing<select onchange="S._projectAdminFilter=this.value;S._projectSystemFilter='';render()"><option value="">Hidden from main list</option>${adminSystemOpts}</select></label>
    <label>Developer<select onchange="S._userFilter=this.value;S._projectUserFilter=this.value;render()"><option value="">All developers</option>${userOpts}</select></label>
    <label>Status<select onchange="S._projectStatusFilter=this.value;render()"><option value="">All statuses</option>${statusOpts}</select></label>
    <button class="btn" onclick="S._projFilter='';S._userFilter='';S._projectUserFilter='';S._projectSystemFilter='';S._projectAdminFilter='';S._projectStatusFilter='';S.stageFilter=null;render()">Clear filters</button>
  </div></details>`;
}
function taskMobileCard(t){
  const p=S.projects.find(pp=>pp.id===t.projectId), sp=p?(p.subprojects||[]).find(s=>s.id===t.subprojectId):null;
  const sClass=t.status==='Pipeline'?'pipeline':t.status==='Development'?'development':t.status==='UAT'?'uat':t.status==='Live'?'live':'onhold';
  const start=t.startDate||(p&&sp&&sp.startDate)||(t.createdAt||'').slice(0,10)||'None', due=t.due||'None';
  return `<article class="task-mobile-card" onclick="openTicket('${t.id}')"><div class="task-mobile-top"><b>${esc(t.id)}</b><select class="status-select ${sClass}" onclick="event.stopPropagation()" onchange="changeTaskStatus('${t.id}',this.value)"><option ${t.status==='Pipeline'?'selected':''}>Pipeline</option><option ${t.status==='Development'?'selected':''}>Development</option><option ${t.status==='UAT'?'selected':''}>UAT</option><option ${t.status==='Live'?'selected':''}>Live</option><option ${t.status==='On Hold'?'selected':''}>On Hold</option></select></div><h4>${esc(t.title)}</h4><button class="inline-project-link" onclick="event.stopPropagation();${p?`projOpen('${p.id}')`:`toast('Project record not found')`}">${icon('folder',12)} ${esc(p?p.name:'Project unavailable')}${sp?' · '+esc(sp.name):''}</button><div class="task-mobile-meta"><span>${avatar(t.assignee,22)} ${esc(t.assignee||'Unassigned')}</span><span>${esc(start)} → ${esc(due)}</span></div>${t.description?`<p>${esc(t.description.slice(0,120))}</p>`:''}</article>`;
}

let appMenuOpen=false;
let appMenuTimeline=null;
function initAppMenu(){
  const island=document.querySelector('#appIsland');
  const overlay=document.querySelector('#menu-overlay');
  if(!island||!overlay||!window.gsap) return;
  // The navigation links live in the panel below; the island only needs room
  // for the logo and close button. Keeping it compact prevents header overlap.
  const expandedWidth=112;
  appMenuTimeline=gsap.timeline({paused:true})
    .set(overlay,{pointerEvents:'auto'})
    .set('.menu-panel',{visibility:'visible'},0)
    .to(island,{width:expandedWidth,duration:.65,ease:'back.out(1.8)'},0)
    .to('.island-logo',{opacity:1,rotation:0,duration:.32,ease:'power2.out'},.08)
    .to('.bar-mid',{opacity:0,duration:.15,ease:'power2.in'},0)
    .to('.bar-top',{attr:{x1:3,y1:3,x2:13,y2:13},duration:.25,ease:'power3.inOut'},0)
    .to('.bar-bot',{attr:{x1:13,y1:3,x2:3,y2:13},duration:.25,ease:'power3.inOut'},0)
    .to('.menu-backdrop',{opacity:1,duration:.28,ease:'power2.out'},0)
    .fromTo('.menu-panel',{autoAlpha:0,yPercent:-8,scale:.96},{autoAlpha:1,yPercent:0,scale:1,duration:.55,transformOrigin:'top center',ease:'back.out(1.6)'},.1)
    .fromTo('#nav .menu-link',{opacity:0,y:6},{opacity:1,y:0,duration:.25,ease:'power2.out',stagger:.04},.22);
  document.querySelector('#menuToggle')?.addEventListener('click',toggleAppMenu);
  document.querySelector('.menu-backdrop')?.addEventListener('click',closeAppMenu);
  overlay.addEventListener('keydown',e=>{
    if(e.key==='Escape'){ closeAppMenu(); document.querySelector('#menuToggle')?.focus(); return; }
    if(!appMenuOpen||e.key!=='Tab') return;
    const focusable=[...overlay.querySelectorAll('button:not([disabled]),input,select')]; if(!focusable.length) return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
}
function toggleAppMenu(){
  if(!appMenuTimeline) return;
  appMenuOpen=!appMenuOpen;
  const btn=document.querySelector('#menuToggle');
  btn?.setAttribute('aria-expanded',String(appMenuOpen));
  btn?.setAttribute('aria-label',appMenuOpen?'Close navigation menu':'Open navigation menu');
  document.querySelectorAll('#nav .menu-link').forEach(l=>l.setAttribute('tabindex',appMenuOpen?'0':'-1'));
  if(appMenuOpen) appMenuTimeline.timeScale(1).play();
  else appMenuTimeline.eventCallback('onReverseComplete',()=>{gsap.set('.menu-overlay',{pointerEvents:'none'});}).timeScale(1).reverse();
}
function closeAppMenu(){ if(appMenuOpen) toggleAppMenu(); }
function go(v){ if(v==='projects' && S._userFilter) S._projectUserFilter=S._userFilter; closeAppMenu(); S.view=v; document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===v)); render(); }
window.toggleCompact=()=>{ const cur=localStorage.getItem('mdt_compact')!=='0'; localStorage.setItem('mdt_compact', cur?'0':'1'); render(); };
document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>go(b.dataset.view));
window.goProjects=()=>{ S.stageFilter=null; go('projects'); };
window.openSystemProjects=id=>{
  S._projectSystemFilter=id;
  S._projectAdminFilter='';
  S._projectUserFilter='';
  S._projectStatusFilter='';
  S.stageFilter=null;
  localStorage.setItem('mdt_jira','0');
  go('projects');
};
window.filterStage=s=>{ if(!s){ S.stageFilter=null; } else { S.stageFilter=s; } go('projects'); };
window.filterSys=()=>go('projects');

function projectsMotionTimelineHTML(ps,opts={}){
  const standalone=!!opts.standalone;
  const today=new Date(); today.setHours(0,0,0,0);
  const dayValue=value=>{
    if(!value) return null;
    const d=new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime())?null:d;
  };
  const dayDiff=(a,b)=>Math.round((a-b)/864e5);
  const fmtDay=d=>d?d.toLocaleDateString('en-US',{month:'short',day:'numeric'}):'No date';
  const stageColor=p=>statusColor[projectStage(p)]||'#64748b';
  const dueLabel=p=>{
    const d=dayValue(p.deadline);
    if(!d) return 'No deadline';
    const diff=dayDiff(d,today);
    if(diff<0) return `${-diff}d overdue`;
    if(diff===0) return 'Due today';
    if(diff===1) return 'Due tomorrow';
    return `Due in ${diff}d`;
  };
  const developer=S._motionDeveloper||'';
  const deadlineFilter=S._motionDeadline||'all';
  const source=ps.filter(p=>{
    const system=S.systems.find(s=>s.id===p.systemId);
    return !isNonDevelopingSystem(system) && projectStage(p)!=='On Hold';
  });
  const developers=[...new Set([...TEAM,...source.map(p=>p.assignee||'Unassigned')])].sort((a,b)=>a.localeCompare(b));
  const filtered=source.filter(p=>{
    const assignee=p.assignee||'Unassigned';
    if(developer&&assignee!==developer) return false;
    const deadline=dayValue(p.deadline);
    if(deadlineFilter==='near') return !!deadline && dayDiff(deadline,today)>=0 && dayDiff(deadline,today)<=7;
    if(deadlineFilter==='overdue') return !!deadline && dayDiff(deadline,today)<0;
    if(deadlineFilter==='nodate') return !deadline;
    return true;
  }).sort((a,b)=>{
    const ad=dayValue(a.deadline),bd=dayValue(b.deadline);
    return (ad?ad.getTime():Number.MAX_SAFE_INTEGER)-(bd?bd.getTime():Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name);
  });
  const visible=filtered;
  const dated=filtered.flatMap(p=>[dayValue(p.startDate),dayValue(p.deadline)].filter(Boolean));
  const rangeStart=dated.length?new Date(Math.min(...dated.map(d=>d.getTime()),today.getTime())):new Date(today);
  const rangeEnd=dated.length?new Date(Math.max(...dated.map(d=>d.getTime()),today.getTime())):new Date(today);
  if(dayDiff(rangeEnd,rangeStart)<30) rangeEnd.setDate(rangeStart.getDate()+30);
  const rangeDays=Math.max(1,dayDiff(rangeEnd,rangeStart));
  const axis=Array.from({length:7},(_,i)=>{
    const d=new Date(rangeStart); d.setDate(rangeStart.getDate()+Math.round(rangeDays*i/6));
    return d;
  });
  const todayPct=Math.max(0,Math.min(100,dayDiff(today,rangeStart)/rangeDays*100));
  const barHTML=p=>{
    const start=dayValue(p.startDate)||dayValue(p.deadline);
    const end=dayValue(p.deadline)||dayValue(p.startDate);
    if(!start&&!end) return '<span class="timeline-no-date">No schedule</span>';
    const left=Math.max(0,Math.min(100,dayDiff(start||end,rangeStart)/rangeDays*100));
    const width=Math.max(3,Math.min(100-left,((dayDiff(end||start,start||end)+1)/rangeDays)*100));
    const due=dayValue(p.deadline);
    const late=due&&dayDiff(due,today)<0&&projectStage(p)!=='Live';
    return `<span class="timeline-bar${late?' late':''}" style="left:${left}%;width:${width}%;background:${stageColor(p)}" title="${esc(p.name)} · ${esc(projectStage(p))} · ${fmtDay(start)} → ${fmtDay(end)}">${esc(projectStage(p))}</span>`;
  };
  return `<section class="dashboard-feature-card project-timeline-card${standalone?' calendar-feature-card':''}">
     <div class="dashboard-section-head"><div><span class="dashboard-eyebrow">${standalone?'SCHEDULE TIMELINE':'DELIVERY CALENDAR'}</span><h2>${standalone?'All project schedules':'Projects in motion'}</h2><p>${standalone?'Start/end dates, deadlines, owners, and stage handoff for every main project.':'Main projects by schedule — start, end, owner, and deadline risk.'}</p></div>${standalone?'':'<button class="btn" onclick="go(\'calendar\')">View all</button>'}</div>
     <div class="timeline-toolbar"><label>Developer<select onchange="S._motionDeveloper=this.value;render()"><option value="">All developers</option>${developers.map(u=>`<option value="${esc(u)}" ${developer===u?'selected':''}>${esc(u)}</option>`).join('')}</select></label><label>Deadline<select onchange="S._motionDeadline=this.value;render()"><option value="all" ${deadlineFilter==='all'?'selected':''}>All deadlines</option><option value="near" ${deadlineFilter==='near'?'selected':''}>Due in 7 days</option><option value="overdue" ${deadlineFilter==='overdue'?'selected':''}>Overdue</option><option value="nodate" ${deadlineFilter==='nodate'?'selected':''}>No deadline</option></select></label><span class="timeline-summary"><b>${filtered.length}</b> projects · ${dated.length?'scheduled':'No dated projects'} · scroll to view all</span></div>
    <div class="timeline-calendar" style="--timeline-today:${todayPct}%"><div class="timeline-axis"><span class="timeline-axis-label">PROJECT</span><div class="timeline-axis-track">${axis.map(d=>`<span>${fmtDay(d)}</span>`).join('')}</div></div>
       <div class="timeline-rows">${visible.map(p=>`<button class="timeline-row" onclick="projOpen('${p.id}')"><span class="timeline-label"><b>${esc(p.name)}</b><small>${esc(p.assignee||'Unassigned')} · ${esc(projectStage(p))}</small><em>${esc(stageJourney(p))}</em></span><span class="timeline-track">${barHTML(p)}</span><span class="timeline-row-date ${p.deadline&&dayDiff(dayValue(p.deadline),today)<0&&projectStage(p)!=='Live'?'late':''}"><b>${esc(dueLabel(p))}</b><span>${p.startDate||p.deadline?`${fmtDay(dayValue(p.startDate))} → ${fmtDay(dayValue(p.deadline))}`:'No dates'}</span></span></button>`).join('')||'<div class="timeline-empty">No projects match these filters.</div>'}</div>
    </div>
  </section>`;
}

function projectCalendarHTML(){
  return `<div class="calendar-shell">
    <div class="calendar-heading"><div><span class="dashboard-eyebrow">PORTFOLIO SCHEDULE</span><h1>Project Calendar</h1><p>One schedule view for every main project, from start date to deadline.</p></div><div class="calendar-heading-actions"><button class="btn" onclick="go('projects')">Open projects</button></div></div>
    ${projectsMotionTimelineHTML(S.projects,{standalone:true})}
  </div>`;
}

function dashboardHTML(){
  const ps=S.projects;
  const counts={Pipeline:0,Development:0,UAT:0,Live:0,'On Hold':0};
  ps.forEach(p=>{ const stage=projectStage(p); counts[stage]=(counts[stage]||0)+1; });
  const active=ps.filter(p=>!['Live','On Hold'].includes(projectStage(p)));
  const overdue=ps.filter(p=>projectStage(p)!=='On Hold'&&p.deadline&&Number(p.pct||0)<100&&p.deadline<new Date().toISOString().slice(0,10));
  const dated=ps.filter(p=>p.deadline);
  const onTime=dated.length?Math.round((dated.length-overdue.length)/dated.length*100):null;
  const average=ps.length?Math.round(ps.reduce((n,p)=>n+Number(p.pct||0),0)/ps.length):0;
  const systems=S.systems.filter(s=>!isNonDevelopingSystem(s)).map(s=>{const list=ps.filter(p=>p.systemId===s.id);return {...s,total:list.length,live:list.filter(p=>projectStage(p)==='Live').length,active:list.filter(p=>!['Live','On Hold'].includes(projectStage(p))).length};});
  const fmtDate=d=>d?new Date(`${d}T00:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'No deadline';
  const pctColor=p=>projectStage(p)==='Live'?'#20b26b':projectStage(p)==='On Hold'?'#d88918':'#3b82f6';
  return `<div class="dashboard-shell">
    <div id="presenceBar" class="presence-bar">${presenceHtml()}</div>
    <div class="dashboard-heading">
      <div><span class="dashboard-eyebrow">MADISON DEVELOPMENT OPERATIONS</span><h1>Portfolio overview</h1><p>Track delivery health, active work, ownership, and deadlines from one view.</p></div>
      <div class="dashboard-heading-actions"><button class="btn" onclick="go('activity')">Activity log</button><button class="btn pri" onclick="go('projects')">Open projects</button></div>
    </div>
    <div class="dashboard-tabs"><button class="dashboard-tab active">Overview</button><button class="dashboard-tab" onclick="go('projects')">Projects <b>${ps.length}</b></button><button class="dashboard-tab" onclick="go('activity')">Activity <b>${S.activity.length}</b></button></div>
    <div class="dashboard-kpis">
      <button class="dashboard-kpi" onclick="filterStage('')"><span>Tracked projects</span><strong>${ps.length}</strong><small>${counts.Live} live · ${active.length} in progress</small></button>
      <button class="dashboard-kpi" onclick="filterStage('Development')"><span>Work in progress</span><strong>${counts.Development+counts.UAT}</strong><small>${counts.Development} development · ${counts.UAT} UAT</small></button>
      <button class="dashboard-kpi" onclick="filterStage('Live')"><span>Live projects</span><strong>${counts.Live}</strong><small>${ps.length?Math.round(counts.Live/ps.length*100):0}% of portfolio</small></button>
      <button class="dashboard-kpi ${overdue.length?'warning':''}" onclick="go('projects')"><span>Needs attention</span><strong>${overdue.length}</strong><small>${onTime===null?'No dated projects':`${onTime}% deadline coverage`}</small></button>
    </div>
    <div class="dashboard-feature-grid">
      <section class="dashboard-feature-card portfolio-health">
        <div class="dashboard-section-head"><div><span class="dashboard-eyebrow">PORTFOLIO HEALTH</span><h2>Delivery at a glance</h2></div><span class="health-badge ${average>=75?'good':average>=40?'steady':'watch'}">${average>=75?'On track':average>=40?'In motion':'Needs focus'}</span></div>
        <div class="health-score"><strong>${average}%</strong><span>average completion</span></div>
        <div class="health-track"><i style="width:${average}%"></i></div>
        <div class="health-meta"><span>${counts.Pipeline} pipeline</span><span>${counts['On Hold']} on hold</span><span>${dated.length} with deadlines</span></div>
        <div class="health-insights"><div><b>${onTime===null?'—':onTime+'%'}</b><span>deadline coverage</span></div><div><b>${S.tasks.length}</b><span>tracked tasks</span></div><div><b>${S.systems.filter(isNonDevelopingSystem).length}</b><span>admin systems</span></div></div>
      </section>
      <section class="dashboard-feature-card system-pulse">
        <div class="dashboard-section-head"><div><span class="dashboard-eyebrow">SYSTEM PULSE</span><h2>Per-system delivery</h2></div><button class="icon-button" onclick="go('systems')" title="Open systems">↗</button></div>
        <div class="system-pulse-list">${systems.map(s=>`<button class="system-pulse-row" onclick="S._projectSystemFilter='${esc(s.id)}';S._projectAdminFilter='';goProjects()"><i style="background:${sysColor(s.id)}"></i><span><b>${esc(s.name)}</b><small>${s.active} active · ${s.live} live</small></span><strong>${s.total}</strong></button>`).join('')||'<span class="mut">No development systems.</span>'}</div>
        ${S.systems.filter(isNonDevelopingSystem).map(s=>`<button class="admin-system-link" onclick="S._projectAdminFilter='${esc(s.id)}';S._projectSystemFilter='';goProjects()">Other system · ${esc(s.name)} <span>↗</span></button>`).join('')}
      </section>
    </div>
    <div class="dashboard-split">
      ${projectsMotionTimelineHTML(ps)}
      <section class="dashboard-feature-card attention-card"><div class="dashboard-section-head"><div><span class="dashboard-eyebrow">RISK WATCH</span><h2>Needs attention</h2></div><span class="health-badge ${overdue.length?'warning':'good'}">${overdue.length?'Action needed':'All clear'}</span></div>
        <div class="attention-list">${overdue.slice(0,5).map(p=>`<button class="attention-row" onclick="projOpen('${p.id}')"><span class="attention-dot"></span><span><b>${esc(p.name)}</b><small>${fmtDate(p.deadline)} · ${Number(p.pct||0)}% complete</small></span><strong>Overdue</strong></button>`).join('')||'<div class="empty-state">No overdue deadlines.</div>'}</div>
      </section>
    </div>
    <section class="dashboard-feature-card workload-card"><div class="dashboard-section-head"><div><span class="dashboard-eyebrow">TEAM CAPACITY</span><h2>Developer availability</h2><p>Automatic allocation by default. Edit the % beside each project to override it; Live and On Hold are excluded.</p></div><button class="btn" onclick="go('projects')">Manage work</button></div><div class="workload-list">${developerWorkloadHTML()}</div></section>
  </div>`;
}

function render(opts={}){
  const v=$('#view');
  if(!opts.silent){ v.classList.remove('anim'); void v.offsetWidth; v.classList.add('anim'); }
  if(!S.stats){ v.innerHTML='<p class="mut">Loading…</p>'; return; }
  if(S.view==='dashboard'){
    v.innerHTML=dashboardHTML();
    if(!opts.silent) requestAnimationFrame(()=>animateView());
    return;
  /* Legacy dashboard markup retained below for safe rollback. */
  if(false){
    const ps=S.projects, counts={Pipeline:0,Development:0,UAT:0,Live:0,'On Hold':0};
    ps.forEach(p=>counts[projectStage(p)]=(counts[projectStage(p)]||0)+1);
    const today=new Date().toISOString().slice(0,10);
    const od=ps.filter(p=>p.status!=='On Hold'&&p.deadline&&p.pct<100&&p.deadline<today);
    v.innerHTML=`
    <div id="presenceBar" class="presence-bar">${presenceHtml()}</div>
    <div class="grid" style="grid-template-columns:repeat(6,1fr);gap:10px">
      <div class="card clickable" onclick="filterStage('')" title="Show all projects"><h3>${icon('folder',14)} Projects</h3><div class="big">${ps.length}</div><div class="mut">total tracked</div></div>
      <div class="card clickable${S.stageFilter==='Pipeline'?' on':''}" onclick="filterStage('Pipeline')"><h3>${icon('layers',14)} Pipeline</h3><div class="big">${counts.Pipeline||0}</div><div class="mut">queued</div></div>
      <div class="card clickable${S.stageFilter==='Development'?' on':''}" onclick="filterStage('Development')"><h3>${icon('code',14)} Development</h3><div class="big" style="color:#60a5fa">${counts.Development||0}</div><div class="mut">dev</div></div>
      <div class="card clickable${S.stageFilter==='UAT'?' on':''}" onclick="filterStage('UAT')"><h3>◉ UAT</h3><div class="big" style="color:#c084fc">${counts.UAT||0}</div><div class="mut">testing</div></div>
      <div class="card clickable${S.stageFilter==='Live'?' on':''}" onclick="filterStage('Live')"><h3>${icon('check',14)} Live</h3><div class="big" style="color:#4ade80">${counts.Live||0}</div><div class="mut">live</div></div>
      <div class="card clickable${S.stageFilter==='On Hold'?' on':''}" onclick="filterStage('On Hold')"><h3>⏸ On Hold</h3><div class="big" style="color:#f59e0b">${counts['On Hold']||0}</div><div class="mut">hold</div></div>
    </div>
    <div class="card" style="margin-top:20px"><h3>Per-system load — click to open projects</h3><div class="sys-strip">
      ${S.systems.filter(s=>!isNonDevelopingSystem(s)).map(s=>{const list=S.projects.filter(p=>p.systemId===s.id);const comp=list.filter(p=>projectStage(p)==='Live').length;
      return `<button class="sys-pill" onclick="goProjects()"><i style="background:${sysColor(s.id)}"></i><b>${esc(s.name)}</b><span>${list.length} projects · ${comp} live</span></button>`;}).join('')}
      ${S.systems.filter(isNonDevelopingSystem).map(s=>{const list=S.projects.filter(p=>p.systemId===s.id); return `<button class="sys-pill sys-admin-pill" onclick="S._projectAdminFilter='${esc(s.id)}';S._projectSystemFilter='';goProjects()"><i style="background:${sysColor(s.id)}"></i><b>${esc(s.name)}</b><span>Admin / non-developing · ${list.length} projects</span></button>`;}).join('')}
    </div></div>
    <div class="card" style="margin-top:16px"><h3>Projects per user — sino may handle</h3><div class="team-strip">
      ${(()=>{const m={}; for(const p of S.projects){const u=p.assignee||'Unassigned'; if(!m[u]) m[u]={tasks:0,proj:new Set(),activeProj:new Set(),live:0,activeTasks:0}; m[u].proj.add(p.id); if(projectStage(p)!=='Live') m[u].activeProj.add(p.id); } for(const t of S.tasks){const u=t.assignee||'Unassigned'; if(!m[u]) m[u]={tasks:0,proj:new Set(),activeProj:new Set(),live:0,activeTasks:0}; m[u].tasks++; if(t.status==='Live') m[u].live++; else m[u].activeTasks++; } const arr=Object.entries(m).sort((a,b)=> (b[1].activeProj.size - a[1].activeProj.size) || (b[1].proj.size - a[1].proj.size)); return arr.map(([u,info])=>`<button class="tm" onclick="S._userFilter='${esc(u)}';go('projects')" title="Handler: ${esc(u)} — ${info.activeProj.size} active projects"><div style="position:relative">${avatar(u,42)}${info.activeProj.size>0?`<span class="tm-badge" style="background:#0c66e4">${info.activeProj.size}</span>`:''}</div><b style="font-size:13px;margin-top:4px">${esc(u)}</b><small style="font-weight:700;color:${info.activeProj.size>0?'#579dff':'#8c94a3'}">${info.activeProj.size} active · ${info.proj.size} total projects</small><small class="mut">${info.activeTasks} tasks ginagawa</small><small class="mut" style="color:#7ee2b8">✓ ${info.live} live tasks</small><small style="font-size:10px;color:#579dff;margin-top:4px;text-decoration:underline" onclick="event.stopPropagation();setProfile('${esc(u)}')">🔒 Lock as me</small></button>`).join('') || '<span class="mut">No users yet</span>';})()}
    </div><div class="mut" style="margin-top:10px;font-size:11px">Projects counted by Handler (project assignee) · Active = hindi pa Live — click para i-filter Projects/Jira list</div></div>
    <div class="card" style="margin-top:16px"><div class="chart-title-row"><div><h3>Developer availability</h3><div class="mut">Automatic allocation across active projects — Live and On Hold are excluded</div></div><span class="pill">Workload analytics</span></div><div class="workload-list">${developerWorkloadHTML()}</div></div>
    <div class="card compact-chart" style="margin-top:16px"><div class="chart-title-row"><h3>Project progress</h3><span class="mut">${S.projects.length} projects · sorted by completion</span></div><div style="overflow:auto"><div style="min-width:640px">${timelineFrame()}</div></div></div>
    <div class="grid g2" style="margin-top:20px">
      <div class="card"><h3>${icon('alert',14)} Needs attention</h3>
      ${od.map(p=>`<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding:6px 0"><b style="cursor:pointer" onclick="projOpen('${p.id}')">${esc(p.name)}</b><span class="due-over">${p.deadline} · ${p.pct}%</span></div>`).join('')||'<span class="mut">All clear — no overdue deadlines.</span>'}</div>
    </div>
    <div class="grid g3 dashboard-insights" style="margin-top:16px">
      <div class="card"><h3>Work in progress</h3><div class="big" style="color:#60a5fa">${counts.Development+counts.UAT}</div><div class="mut">development + UAT projects</div><div class="mini-meter"><i style="width:${ps.length?Math.round((counts.Development+counts.UAT)/ps.length*100):0}%;background:#3b82f6"></i></div></div>
      <div class="card"><h3>Completion trend</h3><div class="big" style="color:#4ade80">${ps.length?Math.round(ps.reduce((n,p)=>n+(Number(p.pct)||0),0)/ps.length):0}%</div><div class="mut">average project completion</div><div class="mini-meter"><i style="width:${ps.length?Math.round(ps.reduce((n,p)=>n+(Number(p.pct)||0),0)/ps.length):0}%;background:#22c55e"></i></div></div>
      <div class="card"><h3>SLA watch</h3><div class="big" style="color:${od.length?'#f59e0b':'#4ade80'}">${od.length}</div><div class="mut">projects past deadline</div><button class="btn" style="margin-top:10px" onclick="go('activity')">View activity</button></div>
    </div>
    `;
  }
  }
  if(S.view==='systems'){
    v.innerHTML=`<div class="row" style="margin-bottom:10px"><button class="btn pri" onclick="sysForm()">+ Add system</button></div>
    <div class="sys-grid">${S.systems.map(s=>{
      const c=S.projects.filter(p=>p.systemId===s.id).length;
      return `<div class="card system-card clickable" role="button" tabindex="0" title="Open ${esc(s.name)} projects" onclick="openSystemProjects('${esc(s.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openSystemProjects('${esc(s.id)}') }" style="border-top:3px solid ${sysColor(s.id)}"><b>${esc(s.name)}</b> <span class="pill">${esc(s.health||'')}</span><div class="mut">${s.id} · Owner: ${esc(s.owner||'—')} · ${esc(s.tech||'')}</div>
      <div class="mut">Repo: ${esc(s.repo||'—')}</div><div class="mut">Prod: ${esc(s.envProd||'—')}</div>
      <div style="margin-top:8px"><span class="pill">${c} projects</span></div>
      <div class="row" style="margin-top:8px"><button class="btn" onclick="event.stopPropagation();sysForm('${s.id}')">Edit</button><button class="btn" onclick="event.stopPropagation();openSystemProjects('${esc(s.id)}')">Projects</button></div></div>`;
    }).join('')}</div>`;
  }
  if(S.view==='activity'){
    const byDay={}; for(const a of S.activity){ const d=new Date(a.at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}); (byDay[d]=byDay[d]||[]).push(a); }
    v.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">
        <div><h2 style="margin:0;font-size:18px;font-weight:800">Activity</h2><div class="mut">Auto-logged updates across all systems · ${S.activity.length} entries</div></div>
        <input placeholder="Filter activity..." oninput="S._actQ=this.value;render()" value="${esc(S._actQ||'')}" style="max-width:280px">
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        ${Object.entries(byDay).map(([day,items])=>{
          const q=(S._actQ||'').toLowerCase();
          const filtered=q?items.filter(a=> (a.by+a.text).toLowerCase().includes(q)):items;
          if(!filtered.length) return '';
          return `<div style="padding:14px 20px 6px;border-bottom:1px solid var(--line);background:rgba(255,255,255,0.02)"><small style="font-weight:700;letter-spacing:.06em;color:var(--mut);text-transform:uppercase">${esc(day)}</small> <small class="mut">· ${filtered.length}</small></div>
          ${filtered.map(a=>`<div class="activity-row" style="display:flex;gap:12px;padding:14px 20px;border-bottom:1px solid #1e2531;align-items:flex-start">
            <div style="margin-top:2px">${avatar(a.by,32)}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b style="font-size:13px">${esc(a.by)}</b><small class="mut">${new Date(a.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · ${new Date(a.at).toLocaleDateString()}</small></div>
              <div style="margin-top:4px;font-size:13.5px;line-height:1.5;color:#c7ced9">${esc(a.text)}</div>
            </div>
          </div>`).join('')}`;
        }).join('')||'<div style="padding:24px;text-align:center" class="mut">No activity yet</div>'}
      </div>`;
  }
  if(S.view==='projects'){
    const jiraMode = localStorage.getItem('mdt_jira')!=='0';
    const q=(S._q||'').toLowerCase();
    let filtered=[...S.tasks];
    if(S.stageFilter) filtered=filtered.filter(t=>t.status===S.stageFilter);
    if(S._projectStatusFilter) filtered=filtered.filter(t=>{
      const p=S.projects.find(pp=>pp.id===t.projectId);
      return p && projectStage(p)===S._projectStatusFilter;
    });
    if(S._projectSystemFilter) filtered=filtered.filter(t=>{
      const p=S.projects.find(pp=>pp.id===t.projectId);
      return p && p.systemId===S._projectSystemFilter;
    });
    if(S._projectAdminFilter) filtered=filtered.filter(t=>{
      const p=S.projects.find(pp=>pp.id===t.projectId);
      return p && p.systemId===S._projectAdminFilter;
    });
    if(S._projFilter) filtered=filtered.filter(t=>t.projectId===S._projFilter);
    if(S._userFilter) filtered=filtered.filter(t=>(t.assignee||'Unassigned')===S._userFilter);
    const qTasks=q?filtered.filter(t=> (t.title+t.description+t.id+(t.assignee||'')).toLowerCase().includes(q)):filtered;
    const taskProjectIds=new Set(S.tasks.map(t=>t.projectId));
    const projectsWithoutTasks=S.projects.filter(p=>!taskProjectIds.has(p.id));
    const coverageNote=projectsWithoutTasks.length?`<div class="coverage-note"><span><b>${S.projects.length} projects</b><span class="mut"> · </span><b>${S.tasks.length} tasks</b><span class="mut"> · ${projectsWithoutTasks.length} project${projectsWithoutTasks.length===1?'':'s'} without task records</span></span><button class="btn" onclick="localStorage.setItem('mdt_jira','0');render()">Open cards</button></div>`:'';
    const devSystems=S.systems.filter(s=>!isNonDevelopingSystem(s));
    const adminSystems=S.systems.filter(isNonDevelopingSystem);
    // Jira-style List (default) — table like screenshot, cards as fallback
    if(jiraMode){
      v.innerHTML=`
        <div class="jira-list-wrap">
          <div class="jira-toolbar">
            <input id="jiraQ" placeholder="Search work" value="${esc(S._q||'')}" oninput="S._q=this.value;renderProjectsTable()" style="flex:1;max-width:220px">
            ${projectFilterMenu(true)}
             <div style="display:flex;gap:4px;align-items:center;margin-left:4px">${[...new Set(S.tasks.map(t=>t.assignee).filter(a=>a&&a!=='Unassigned'))].slice(0,4).map(a=>`<span onclick="S._userFilter='${esc(a)}';S._projectUserFilter='${esc(a)}';render()" style="cursor:pointer" title="Filter ${esc(a)}">${avatar(a,26)}</span>`).join('')}<span onclick="S._userFilter='';S._projectUserFilter='';render()" style="cursor:pointer" class="mut" title="Clear user filter">✕</span><span style="margin-left:6px" class="mut">${qTasks.length}/${S.tasks.length}</span></div>
            <button class="btn" onclick="toggleCompact()">Group</button>
            <span style="margin-left:auto" class="mut" id="syncMeta"></span>
            <button class="btn" onclick="localStorage.setItem('mdt_jira','0');render()">Cards</button>
            <button class="btn pri" onclick="projForm()">+ Create</button>
          </div>
           ${coverageNote}
           <div data-scroll-area="tasks" style="overflow:auto;max-height:calc(100vh - 220px)">
           <table class="jira-table">
              <thead><tr>
                <th style="min-width:220px">Task</th>
                <th>Description</th>
                <th>Assignee</th>
                <th>Start date</th>
                <th>Due date</th>
                <th>Status</th>
                <th style="width:40px"></th>
              </tr></thead>
              <tbody>
                ${qTasks.slice(0,100).map(t=>{
                  const p=S.projects.find(pp=>pp.id===t.projectId);
                  const sp=p ? (p.subprojects||[]).find(s=>s.id===t.subprojectId) : null;
                  const sClass=t.status==='Pipeline'?'pipeline':t.status==='Development'?'development':t.status==='UAT'?'uat':t.status==='Live'?'live':'onhold';
                  const start=t.startDate || (p&&sp&&sp.startDate) || (t.createdAt||'').slice(0,10) || 'None';
                  const due=t.due || 'None';
                  const desc=(t.description||'None').slice(0,40);
                  return `<tr onclick="openTicket('${t.id}')" style="cursor:pointer">
                    <td title="${esc(p?p.name:'')}${sp?' → '+sp.name:''}"><b style="color:#579dff">${esc(t.id)}</b> <span style="margin-left:6px">${esc(t.title.slice(0,42))}</span><br><button class="inline-project-link" onclick="event.stopPropagation();${p?`projOpen('${p.id}')`:`toast('Project record not found')`}" title="Open project${p?' · '+esc(p.name):''}">${icon('folder',12)} ${esc(p?p.name:'Project unavailable')}${sp?' · '+esc(sp.name):''}</button></td>
                    <td class="mut">${esc(desc)}</td>
                    <td><div class="assignee-cell" onclick="setProfile('${esc(t.assignee||'Unassigned')}')" title="Click to lock as your profile — lahat ng next changes naka-log sa name na to (ITSM)">${avatar(t.assignee,22)}<span>${esc(t.assignee||'Unassigned')}</span></div></td>
                    <td>${esc(start)}</td>
                    <td>${esc(due)}</td>
                    <td><select class="status-select ${sClass}" onclick="event.stopPropagation()" onchange="changeTaskStatus('${t.id}',this.value)"><option ${t.status==='Pipeline'?'selected':''}>Pipeline</option><option ${t.status==='Development'?'selected':''}>Development</option><option ${t.status==='UAT'?'selected':''}>UAT</option><option ${t.status==='Live'?'selected':''}>Live</option><option ${t.status==='On Hold'?'selected':''}>On Hold</option></select></td>
                    <td><span class="dots" onclick="event.stopPropagation();openTicket('${t.id}')">⋯</span></td>
                  </tr>`;
                }).join('')||`<tr><td colspan="7" class="mut" style="text-align:center;padding:20px">No tickets — create one via + Create or + Add subtask sa project modal</td></tr>`}
              </tbody>
            </table>
            <div class="jira-mobile-list">${qTasks.slice(0,100).map(taskMobileCard).join('')||'<div class="quick-open-empty">No matching tasks</div>'}</div>
          </div>
           <div class="jira-footer"><button class="btn" onclick="projForm()">+ Create</button><span style="margin-left:12px" class="mut">${qTasks.length} tasks · ${S.projects.length} projects</span><span style="margin-left:auto" class="mut">Task view · Pipeline → Development → UAT → Live → On Hold</span></div>
        </div>
        <div style="padding:10px 12px" class="mut">Tip: click Task para edit, o palitan Status dropdown inline (Pipeline/Development/UAT/Live/On Hold). Cards view nasa Cards button.</div>
      `;
      window.renderProjectsTable=()=>{ const inp=document.getElementById('jiraQ'); if(inp) S._q=inp.value; render(); setTimeout(()=>{ const el=document.getElementById('jiraQ'); if(el){ el.focus(); el.selectionStart=el.value.length; } },0); };
      paintSyncMeta();
    } else {
      v.innerHTML=`<div class="row" style="margin-bottom:10px;flex-wrap:wrap"><button class="btn pri" onclick="projForm()">+ New project</button><button class="btn" onclick="syncHQ()">Sync HQ</button><button class="btn" onclick="pushHQ()">Push HQ</button>${projectFilterMenu(false)}<span class="mut" id="syncMeta" style="flex:1;min-width:180px"></span><button class="btn" onclick="localStorage.setItem('mdt_jira','1');render()">List (Jira)</button></div>`+
      (S._projectAdminFilter ? adminSystems.filter(s=>s.id===S._projectAdminFilter) : S._projectSystemFilter ? devSystems.filter(s=>s.id===S._projectSystemFilter) : devSystems).map(s=>{ const list=S.projects.filter(p=>p.systemId===s.id&&(!S.stageFilter||projectStage(p)===S.stageFilter)&&(!S._projectStatusFilter||projectStage(p)===S._projectStatusFilter)&&(!S._projectUserFilter||(p.assignee||'Unassigned')===S._projectUserFilter));
         return `<div class="card" style="margin:8px 12px;border-top:3px solid ${sysColor(s.id)}"><div class="row" style="justify-content:space-between"><b>${esc(s.name)}</b><span class="pill">${list.length} projects</span></div><div class="proj-compact-grid">${list.map(p=>{const flag=progressState(p); return `<div class="proj-compact ${projectStage(p)==='UAT'?'phase-focus':''}" onclick="projOpen('${p.id}')"><div class="row" style="justify-content:space-between;align-items:center"><b style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name)}</b><span class="pill" style="background:${statusColor[p.status||'Pipeline']||'#1c2438'};color:#fff;border:none;font-size:10px;padding:2px 6px">${esc(p.status||'Pipeline')}</span></div><div class="row" style="gap:6px;align-items:center;margin-top:4px"><span style="display:flex;align-items:center;gap:4px" title="Handler: ${esc(p.assignee||'Unassigned')}">${avatar(p.assignee||'Unassigned',16)}<span style="font-size:11px" class="mut">${esc(p.assignee||'Unassigned')}</span></span><span class="mut" style="font-size:10px;margin-left:auto">${esc(p.startDate||'—')} → ${esc(p.deadline||'—')}</span></div>${sdlcTimeline(p)}<div class="progress"><i style="width:${p.pct}%"></i></div><div class="mut" style="font-size:11px">${p.done}/${p.total} · ${p.pct}%</div>${flag?`<small class="progress-state ${flag.cls}">${flag.label}</small>`:''}</div>`;}).join('')}</div></div>`; }).join('');
      paintSyncMeta();
    }
  }
  if(S.view==='benefits') v.innerHTML = benefitsHTML();
  if(S.view==='calendar') v.innerHTML = projectCalendarHTML();
  if(S.view==='portfolioReport') v.innerHTML = portfolioReportHTML();
  if(!opts.silent) requestAnimationFrame(()=>animateView());
}
function animateView(){
  if(!window.gsap || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cards=[...document.querySelectorAll('#view>.card,#view>.grid>.card,.proj-compact')];
  if(cards.length) gsap.fromTo(cards,{autoAlpha:0,y:10},{autoAlpha:1,y:0,duration:.35,stagger:.035,ease:'power2.out',overwrite:true});
  document.querySelectorAll('.progress i,.bar-chart-fill').forEach(el=>{
    const width=el.style.width; if(width) gsap.fromTo(el,{width:'0%'},{width,duration:.65,ease:'power2.out',overwrite:true});
  });
  if(window.ScrollTrigger) requestAnimationFrame(()=>ScrollTrigger.refresh());
}
function barList(obj){
  const max=Math.max(1,...Object.values(obj));
  return Object.entries(obj).map(([k,c])=>`<div style="margin:6px 0"><small>${esc(k)} — <b>${c}</b></small><div class="progress"><i style="width:${Math.round(c/max*100)}%"></i></div></div>`).join('')||'<span class="mut">—</span>';
}
function timelineFrame(){
  const all=[...S.projects].sort((a,b)=>(Number(b.pct||0)-Number(a.pct||0))||a.name.localeCompare(b.name));
  if(!all.length) return '<div class="mut" style="padding:12px;text-align:center">No projects yet</div>';
  const fmt=d=>d?new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'No date';
  let h='<div class="bar-chart-head"><span>Project</span><span>Progress</span><span>Status</span></div><div class="bar-chart-grid">';
  const visible=all.slice(0,S.timelineLimit||8);
  visible.forEach(p=>{
    const pct=Math.max(0,Math.min(100,Number(p.pct)||0));
    const col=statusColor[p.status]||'#579dff';
    const dates=(p.startDate||p.deadline)?fmt(p.startDate)+' → '+fmt(p.deadline):'No dates';
    h+='<div class="bar-chart-row" title="'+esc(p.name)+' · '+esc(dates)+'"><div class="bar-chart-label">'+esc(p.name)+'</div><div class="bar-chart-track"><div class="bar-chart-fill" style="width:'+pct+'%;background:'+col+'"><span>'+pct+'%</span></div></div><div class="bar-chart-value"><span class="pill" style="background:'+col+';color:#fff;border:none">'+esc(p.status||'Pipeline')+'</span></div></div>';
  });
  h+=all.length>visible.length?`</div><div style="text-align:center;margin-top:10px"><button class="btn" onclick="loadMoreProjects()">Load more projects (${all.length-visible.length} remaining)</button></div>`:'</div>';
  return h;
}

function projName(t){ if(!t.projectId) return '<span class="mut">—</span>'; const p=S.projects.find(x=>x.id===t.projectId); if(!p) return esc(t.project||'—'); const s=(p.subprojects||[]).find(x=>x.id===t.subprojectId); return esc(p.name)+(s?`<br><small class="mut">↳ ${esc(s.name)}</small>`:''); }
window.updProjOpts=(px)=>{ const sys=$('#'+px+'_system').value,sel=$('#'+px+'_project'),cur=sel.value; const list=S.projects.filter(p=>p.systemId===sys); sel.innerHTML='<option value="">—</option>'+list.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join(''); if(list.some(p=>p.id===cur)) sel.value=cur; updSubOpts(px); };
window.updSubOpts=(px)=>{ const p=S.projects.find(x=>x.id===$('#'+px+'_project').value),sel=$('#'+px+'_sub'),cur=sel.value; const list=(p&&p.subprojects)||[]; sel.innerHTML='<option value="">—</option>'+list.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join(''); if(list.some(s=>s.id===cur)) sel.value=cur; };
function projectDateLabel(value){ return value?new Date(`${value}T00:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Not set'; }
function projectDateHistoryHTML(p){ const last=(Array.isArray(p.dateChangeLog)?p.dateChangeLog:[]).slice(-1)[0]; if(!last) return ''; const label=last.field==='startDate'?'From date':'Deadline'; return `<div class="date-history-note"><b>Last date change</b><span>${esc(label)}: ${esc(projectDateLabel(last.previousDate))} → ${esc(projectDateLabel(last.newDate))}</span><small>${last.justification?`Reason: ${esc(last.justification)} · `:'No justification recorded · '}${esc(last.by||'User')} · ${new Date(last.at||Date.now()).toLocaleString()}</small></div>`; }
window.restoreProjectDates=(pid)=>{ closeModal(); setTimeout(()=>projOpen(pid),0); };
window.requestProjectDateChange=(pid,field,val)=>{ const p=S.projects.find(x=>x.id===pid); if(!p) return; const previous=String(p[field]||''); const extension=Boolean(previous&&val&&val>previous); if(!extension) return updateProjectDates(pid,field,val,''); const label=field==='startDate'?'From date':'Deadline'; openModal(`<h2>Justify date extension</h2><p class="mut">A later ${esc(label.toLowerCase())} needs a short explanation before it can be saved.</p><div class="date-justification-card"><span>Previously saved</span><b>${esc(projectDateLabel(previous))}</b><span>New date</span><b>${esc(projectDateLabel(val))}</b></div><label class="full">Justification<textarea id="date_justification" rows="4" placeholder="Explain why this date is being extended…"></textarea></label><div class="row" style="margin-top:10px"><button class="btn pri" onclick="saveProjectDateChange('${pid}','${field}','${val}')">Save date change</button><button class="btn" onclick="restoreProjectDates('${pid}')">Cancel</button></div>`); };
window.saveProjectDateChange=(pid,field,val)=>{ const justification=($('#date_justification')?.value||'').trim(); if(!justification) return toast('Justification required'); updateProjectDates(pid,field,val,justification); };
window.projOpen=(id)=>{
  const p=S.projects.find(x=>x.id===id); if(!p) return;
  updatePresence(p.systemId,id);
  const d=dueInfo({due:p.deadline,status:p.status});
  const hasTpl=(p.subprojects||[]).some(s=>s.name==='Hypercare') && (p.subprojects||[]).length>=7;
  const assigneeOpts=[...new Set([...TEAM,...S.tasks.map(t=>t.assignee).filter(Boolean), 'Unassigned'])].map(u=>`<option ${p.assignee===u?'selected':''}>${esc(u)}</option>`).join('');
  const statusOpts=['Pipeline','Development','UAT','Live','On Hold'].map(s=>`<option ${p.status===s?'selected':''}>${s}</option>`).join('');
  openModal(`
    <div class="project-modal-head" id="modalTop"><div><small>${sysName(p.systemId)} · ${p.total} tickets · <span class="pill" style="background:${statusColor[p.status]||'#1c2438'};color:#fff;border:none">${esc(p.status||'Pipeline')}</span></small><h2 style="margin:4px 0">${esc(p.name)}</h2><div class="row" style="margin-top:8px"><button class="btn" onclick="closeModal();go('portfolioReport')">Create portfolio report</button></div></div><button class="btn" onclick="closeModal()">✕</button></div>
    <div class="presence-bar" style="margin:8px 0">${presenceHtml()}<span class="mut" style="margin-left:auto;font-size:10px">Presence expires after inactivity</span></div>
    ${p.description?`<p class="mut">${esc(p.description)}</p>`:''}
    <div class="row" style="gap:8px;align-items:center;margin:8px 0;background:#1e2531;border:1px solid #2c333f;border-radius:8px;padding:8px 10px"><span class="mut">Handler:</span>${avatar(p.assignee||'Unassigned',24)}<b>${esc(p.assignee||'Unassigned')}</b><select onchange="changeProjectAssignee('${p.id}',this.value)" style="width:auto;margin-left:auto;min-width:140px">${assigneeOpts}</select></div>
    <div class="row" style="gap:8px;align-items:center;margin:8px 0;background:#1e2531;border:1px solid #2c333f;border-radius:8px;padding:8px 10px"><span class="mut">Project Status:</span><span class="pill" style="background:${statusColor[p.status]||'#1c2438'};color:#fff;border:none">${esc(p.status||'Pipeline')}</span><select onchange="changeProjectStatus('${p.id}',this.value)" style="width:auto;margin-left:auto;min-width:140px">${statusOpts}</select></div>
     <div class="project-date-fields"><label><span class="mut">From</span><input type="date" value="${p.startDate||''}" onchange="requestProjectDateChange('${p.id}','startDate',this.value)"><small>Previously saved: ${esc(projectDateLabel(p.startDate))}</small></label><span class="date-arrow">→</span><label><span class="mut">End date</span><input type="date" value="${p.deadline||''}" onchange="requestProjectDateChange('${p.id}','deadline',this.value)"><small>Previously saved: ${esc(projectDateLabel(p.deadline))}</small></label><span class="mut date-duration">${p.startDate&&p.deadline?Math.round((new Date(p.deadline)-new Date(p.startDate))/864e5)+' days':''}</span></div>${projectDateHistoryHTML(p)}
    <div class="row" style="gap:8px;flex-wrap:wrap">${p.status==='On Hold'?'<span class="pill" style="background:#7c4a03;color:#fde68a;border-color:#a16207">⏸ Paused — deadline paused</span>':d?`<span class="${d.cls}">${d.txt}</span>`:''}${p.status==='Live'&&p.liveAt?`<span class="pill env">Live since ${new Date(p.liveAt).toLocaleDateString()}</span>`:''}${p.status==='Development'?`<span class="pill env">Development end: ${p.deadline||'Not set'}</span>`:''}${p.hqProgress!=null?`<span class="pill env">HQ ${p.hqProgress}%${p.hqStatus?' · '+esc(p.hqStatus):''}</span>`:''} ${p.status!=='On Hold'&&!d&&!p.hqProgress?'<span class="mut">No deadline</span>':''}</div>
    <div style="margin-top:8px"><div class="row" style="justify-content:space-between"><span class="mut">Progress</span><span class="mut" style="font-weight:700;color:${p.pct===100?'#7ee2b8':p.pct>0?'#579dff':'#8c94a3'}">${p.pct}% · ${p.done}/${p.total} done</span></div><div class="progress" style="height:8px;margin-top:4px"><i style="width:${p.pct}%;background:${p.pct===100?'#22c55e':p.pct>0?'#0c66e4':'#334155'}"></i></div></div>
    ${benefitSummaryHTML(p)}
    <div class="mut" style="margin-top:6px;font-size:11px">▸ ${p.byStage.Pipeline||0} Pipeline → ${p.byStage.Development||0} Dev → ${p.byStage.UAT||0} UAT → ${p.byStage.Live||0} Live → ${p.byStage['On Hold']||0} Hold</div>
    <div class="modal-phase-nav" aria-label="Jump to SDLC phase"><button class="phase-jump overview-jump" onclick="jumpModalTo('modalTop')" title="Back to project overview">Overview</button>${(p.subprojects||[]).map((sp,i)=>`<button class="phase-jump ${i===phaseIndex(p)?'current':''}" onclick="jumpModalTo('phase-${sp.id}')" title="Jump to ${esc(sp.name)}" ${i===phaseIndex(p)?'aria-current="step"':''}>${esc(sp.name.replace(' Development','').replace(' Sign Off',''))}</button>`).join('')}</div>
    <h3>Sub-projects & tasks (${(p.subprojects||[]).length})</h3>
    ${(p.subprojects||[]).map(sp=>{
      const tks=S.tasks.filter(t=>t.subprojectId===sp.id);
      return `<div class="sub" id="phase-${sp.id}"><div class="row" style="justify-content:space-between;align-items:center"><b>↳ ${esc(sp.name)}</b><span class="pill" style="background:${statusColor[sp.stage]||'#1c2438'};color:#fff;border:none">${sp.stage||'Pipeline'}</span><select onchange="changeSubStage('${sp.id}',this.value)" style="width:auto;padding:4px 6px;font-size:11px"><option ${sp.stage==='Pipeline'?'selected':''}>Pipeline</option><option ${sp.stage==='Development'?'selected':''}>Development</option><option ${sp.stage==='UAT'?'selected':''}>UAT</option><option ${sp.stage==='Live'?'selected':''}>Live</option><option ${sp.stage==='On Hold'?'selected':''}>On Hold</option></select></div>
      <div class="mut">${sp.startDate||'—'} → ${sp.deadline||'—'} · ${sp.done}/${sp.total} (${sp.pct}%)</div>
      <div class="row" style="justify-content:space-between;margin-top:4px"><span class="mut">Progress</span><span class="mut" style="font-weight:700;color:${sp.pct===100?'#7ee2b8':sp.pct>0?'#579dff':'#8c94a3'}">${sp.pct}%</span></div><div class="progress" style="height:6px"><i style="width:${sp.pct}%;background:${sp.pct===100?'#22c55e':sp.pct>0?'#0c66e4':'#334155'}"></i></div>
      ${tks.length?`<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${tks.map(t=>`<span class="tag" onclick="closeModal();openTicket('${t.id}')" style="cursor:pointer;background:${statusColor[t.status]||'#1c2438'};color:#fff;border:none">${esc(t.title.slice(0,32))} · ${t.status}${t.assignee?' · '+esc(t.assignee):''} <small onclick="event.stopPropagation();changeTaskStatus('${t.id}','select')" style="text-decoration:underline;margin-left:4px">change</small></span><select onchange="changeTaskStatus('${t.id}',this.value)" style="width:auto;padding:2px 4px;font-size:10px"><option ${t.status==='Pipeline'?'selected':''}>Pipeline</option><option ${t.status==='Development'?'selected':''}>Development</option><option ${t.status==='UAT'?'selected':''}>UAT</option><option ${t.status==='Live'?'selected':''}>Live</option><option ${t.status==='On Hold'?'selected':''}>On Hold</option></select>`).join('')}</div>`:'<div class="mut">No subtasks yet.</div>'}
      <div class="row" style="margin-top:6px"><button class="btn pri" onclick="quickTaskForm('${sp.id}','${p.id}')">+ Add subtask</button>${sp.name==='Hypercare'?`<button class="btn" onclick="quickTaskForm('${sp.id}','${p.id}','Change Request')">+ Change Request</button>`:''}<button class="btn" onclick="subForm('${p.id}','${sp.id}')">Edit phase</button></div></div>`;
    }).join('')||'<p class="mut">No phases yet — apply SDLC template: Technical Analysis → Technical Design → Coding Development → SIT → UAT → Go Live → Hypercare.</p>'}
    <div class="row" style="margin-top:12px;flex-wrap:wrap">${!hasTpl&&!isNonDevelopingSystem(S.systems.find(s=>s.id===p.systemId))?`<button class="btn pri" onclick="applyTemplate('${p.id}')">⊕ Apply SDLC template (7 phases + starter tasks)</button>`:''}<button class="btn" onclick="subForm('${p.id}')">+ Sub-project</button><button class="btn" onclick="projForm('${p.id}')">Edit</button></div>`);
};
window.exportProjectReport=(id)=>{ const p=S.projects.find(x=>x.id===id); if(!p) return toast('Project not found'); toast('Preparing executive PPT…'); window.open(apiUrl('/api/projects/'+encodeURIComponent(id)+'/report.pptx'),'_blank'); };
window.jumpModalTo=(id)=>{ const modal=$('#modal'),target=document.getElementById(id); if(!modal||!target) return; const top=target.getBoundingClientRect().top-modal.getBoundingClientRect().top+modal.scrollTop-12; modal.scrollTo({top:Math.max(0,top),behavior:'smooth'}); };
window.changeProjectAssignee=async (pid,val)=>{ const me=myName()||'User'; try{ await api.send('/api/projects/'+pid,'PATCH',{assignee:val,by:me}); toast(me+': project owner → '+val); refresh(); const p=S.projects.find(x=>x.id===pid); if(p) setTimeout(()=>projOpen(pid),300); }catch(e){ toast(e.message); } };
window.changeProjectStatus=async (pid,val)=>{ const me=myName()||'User'; try{ await api.send('/api/projects/'+pid,'PATCH',{status:val,by:me}); toast(me+': project status → '+val); refresh(); setTimeout(()=>projOpen(pid),300); }catch(e){ toast(e.message); } };
window.updateProjectDates=async (pid,field,val,justification='')=>{ const me=myName()||'User'; const p=S.projects.find(x=>x.id===pid); const previous=String(p?.[field]||''); if(previous&&val&&val>previous&&!justification) return requestProjectDateChange(pid,field,val); try{ await api.send('/api/projects/'+pid,'PATCH',{[field]:val,dateJustification:justification,by:me}); toast(justification?'Date extended with justification':'Dates updated'); closeModal(); refresh(); setTimeout(()=>projOpen(pid),300); }catch(e){ toast(e.message); } };
window.projForm=(id)=>{ const p=S.projects.find(x=>x.id===id)||{name:'',systemId:(S.systems[0]||{}).id||'',description:'',deadline:'',startDate:'',assignee:myName()||'Unassigned',status:'Pipeline'};
  const isNew=!id;
  const curAssignee=p.assignee||myName()||'Unassigned';
  const curStatus=p.status||'Pipeline';
  openModal(`<h2>${id?'Edit':'New'} project</h2><div class="form-grid"><label class="full">Title<input id="p_name" value="${esc(p.name)}"></label><label>System<select id="p_sys">${S.systems.map(s=>`<option value="${s.id}" ${s.id===p.systemId?'selected':''}>${s.name}</option>`).join('')}</select></label><label>Handler / Assignee<div class="row" style="align-items:center;gap:8px"><span id="p_av2">${avatar(curAssignee)}</span><input id="p_assignee" list="teamList" value="${esc(curAssignee)}" oninput="document.querySelector('#p_av2').innerHTML=avatar(this.value||'?')"><datalist id="teamList">${teamOpts()}</datalist></div></label><label>Status<select id="p_status"><option ${curStatus==='Pipeline'?'selected':''}>Pipeline</option><option ${curStatus==='Development'?'selected':''}>Development</option><option ${curStatus==='UAT'?'selected':''}>UAT</option><option ${curStatus==='Live'?'selected':''}>Live</option><option ${curStatus==='On Hold'?'selected':''}>On Hold</option></select></label><label>Start date<input id="p_start" type="date" value="${p.startDate||''}"></label><label>End date<input id="p_due" type="date" value="${p.deadline||''}"></label><label class="full">Description<textarea id="p_desc">${esc(p.description||'')}</textarea></label>${isNew?`<label class="full" style="display:flex;gap:8px;align-items:center;background:var(--panel2);padding:8px 10px;border-radius:8px;border:1px dashed var(--line)"><input type="checkbox" id="p_tpl" checked> <span>Apply SDLC template — <b>7 phases + starter tasks</b>: Technical Analysis → Technical Design → Coding Development → SIT → UAT → Go Live → Hypercare <small class="mut">(development systems only)</small></span></label>`:''}</div><div class="row" style="margin-top:10px"><button class="btn pri" onclick="saveProj('${id||''}')">Save</button><button class="btn" onclick="closeModal()">Cancel</button></div>`); };
window.saveProj=async id=>{ const body={name:$('#p_name').value,systemId:$('#p_sys').value,assignee:$('#p_assignee').value||'Unassigned',status:$('#p_status').value||'Pipeline',startDate:$('#p_start').value||'',description:$('#p_desc').value,deadline:$('#p_due').value||''}; if(!body.name) return toast('Title required'); const isNew=!id; if(isNew){ const chk=$('#p_tpl'); const sys=S.systems.find(s=>s.id===body.systemId); if(chk) body.applyTemplate=chk.checked&&!isNonDevelopingSystem(sys); } try{ if(id) await api.send('/api/projects/'+id,'PATCH',{...body,by:myName()||'User'}); else { const r=await api.send('/api/projects','POST',body); if(r && (r.templated?.length||r.templateTasksCreated)) toast(`Project saved + SDLC template: ${r.templated?.length||0} phases, ${r.templateTasksCreated||0} starter tasks`); else toast('Project saved'); closeModal(); refresh(); return; } toast('Project saved → '+body.assignee+' ['+body.status+']'); closeModal(); refresh(); }catch(e){ toast(e.message); } };
window.applyTemplate=async id=>{ if(!await confirmModal('I-apply ang SDLC lifecycle: Technical Analysis → Coding → SIT → UAT → Go Live → Hypercare, kasama ang starter tasks para sa design, coding, QA, code review, migration, at maker checker?',{title:'Apply SDLC template',ok:'Apply'})) return; try{ const r=await api.send('/api/projects/'+id+'/apply-template','POST',{}); toast(r.created||r.tasksCreated?`SDLC template applied: +${r.created||0} phases, +${r.tasksCreated||0} starter tasks`:(r.message||'Already has all phases')); refresh(); const p=S.projects.find(x=>x.id===id); if(p) setTimeout(()=>projOpen(id),400); }catch(e){ toast(e.message); } };
window.quickTaskForm=(subId,projId)=>{ const p=S.projects.find(x=>x.id===projId); const sp=(p&&p.subprojects||[]).find(s=>s.id===subId); const sysId=p?p.systemId:(S.systems[0]||{}).id; const me=myName(); openModal(`<h2>+ Subtask <small class="mut">para sa ${esc(sp?sp.name:'')} — ${esc(p?p.name:'')}</small></h2>${me?`<div class="pill" style="margin-bottom:8px;background:#0c2a4d;color:#579dff;border-color:#0052cc">🔒 Creating as ${esc(me)}</div>`:''}<div class="form-grid"><label class="full">Task title<input id="qt_title" placeholder="ex: Technical design / Setup API endpoint / UAT checklist"></label><label>Status<select id="qt_status" onchange="document.getElementById('qt_prog').value=this.value==='Live'?100:document.getElementById('qt_prog').value"><option>Pipeline</option><option>Development</option><option>UAT</option><option>Live</option><option>On Hold</option></select></label><label>Progress %<input id="qt_prog" type="number" min="0" max="100" value="0"></label><label>Assignee<div class="row" style="align-items:center"><span id="qt_av">${avatar(me||'')}</span><input id="qt_assignee" list="teamList" value="${esc(me)}" placeholder="Name" oninput="document.querySelector('#qt_av').innerHTML=avatar(this.value||'?')"><datalist id="teamList">${teamOpts()}</datalist></div></label><label>Priority<select id="qt_prio"><option>Medium</option><option>High</option><option>Critical</option><option>Low</option></select></label><label>Type<select id="qt_type"><option>Task</option><option>Feature</option><option>Bug</option><option>Improvement</option><option>Docs</option></select></label><label>Start<input id="qt_start" type="date"></label><label>End<input id="qt_due" type="date"></label><label class="full">Description<textarea id="qt_desc" placeholder="Details / acceptance criteria..."></textarea></label></div><div class="row" style="margin-top:10px"><button class="btn pri" onclick="saveQuickTask('${subId}','${projId}','${sysId}')">Create subtask</button><button class="btn" onclick="closeModal()">Cancel</button></div>`); };
window.saveQuickTask=async (subId,projId,sysId)=>{ const title=$('#qt_title').value.trim(); if(!title) return toast('Title required'); const status=$('#qt_status').value||'Pipeline'; const body={ title, systemId: sysId, projectId: projId, subprojectId: subId, priority: $('#qt_prio').value, type: $('#qt_type').value, assignee: $('#qt_assignee').value||'Unassigned', startDate:$('#qt_start').value||'', due: $('#qt_due').value, estimate: 0, description: $('#qt_desc').value, status }; try{ const t=await api.send('/api/tasks','POST',body); toast('Subtask created: '+t.id+' → '+t.status); closeModal(); refresh(); setTimeout(()=>projOpen(projId),300); }catch(e){ toast(e.message); } };
window.changeTaskStatus=async (id,val)=>{ if(!val||val==='select') return; const me=myName()||'User'; try{ await api.send('/api/tasks/'+id,'PATCH',{status:val,by:me}); toast(me+': '+val+' → '+id); refresh(); }catch(e){ toast(e.message); } };
window.changeSubStage=async (sid,val)=>{ const sp=S.projects.flatMap(pp=>pp.subprojects||[]).find(s=>s.id===sid); if(!sp) return; const tks=S.tasks.filter(t=>t.subprojectId===sid); if(!tks.length) return toast('No subtasks to update — add one first'); if(!await confirmModal(`Ilipat lahat ng ${tks.length} subtasks sa ${sp.name} → ${val}?`,{title:'Bulk update',ok:'Update'})) return; const me=myName()||'User'; for(const tk of tks){ try{ await api.send('/api/tasks/'+tk.id,'PATCH',{status:val,by:me}); }catch(e){} } toast(me+': '+sp.name+' → '+val+' ('+tks.length+')'); refresh(); setTimeout(()=>projOpen(sp.projectId),400); };
window.delProj=async id=>{ if(!await confirmModal('Delete project? Tickets stay, unlinked.',{title:'Delete project',ok:'Delete',danger:true}))return; try{ await api.send('/api/projects/'+id,'DELETE',{by:myName()||'User'}); toast('Deleted'); refresh(); }catch(e){ toast(e.message); } };
window.subForm=(pid,id)=>{ const p=S.projects.find(x=>x.id===pid); const s=((p&&p.subprojects)||[]).find(x=>x.id===id)||{name:'',description:'',deadline:'',startDate:'',stage:'Pipeline'};
  const cur=s.stage||'Pipeline';
  openModal(`<h2>${id?'Edit':'New'} sub-project <small class="mut">under ${esc(p?p.name:'')}</small></h2><div class="form-grid"><label class="full">Title<input id="sb_name" value="${esc(s.name)}"></label><label>Status<select id="sb_status"><option ${cur==='Pipeline'?'selected':''}>Pipeline</option><option ${cur==='Development'?'selected':''}>Development</option><option ${cur==='UAT'?'selected':''}>UAT</option><option ${cur==='Live'?'selected':''}>Live</option><option ${cur==='On Hold'?'selected':''}>On Hold</option></select></label><label>Start date<input id="sb_start" type="date" value="${s.startDate||''}"></label><label>End date<input id="sb_due" type="date" value="${s.deadline||''}"></label><label class="full">Description<textarea id="sb_desc">${esc(s.description||'')}</textarea></label><small class="mut full">Status ng phase — kung may subtasks, lahat sila mag-sync sa status na pipiliin mo. Kung wala pang subtasks, ito ang magiging stage ng phase.</small></div><div class="row" style="margin-top:10px"><button class="btn pri" onclick="saveSub('${pid}','${id||''}')">Save</button><button class="btn" onclick="closeModal()">Cancel</button></div>`); };
window.saveSub=async (pid,id)=>{ const body={projectId:pid,name:$('#sb_name').value,description:$('#sb_desc').value,deadline:$('#sb_due').value,startDate:$('#sb_start').value,stage:$('#sb_status').value}; if(!body.name) return toast('Title required'); try{ if(id){ await api.send('/api/subprojects/'+id,'PATCH',{name:body.name,description:body.description,deadline:body.deadline,startDate:body.startDate,stage:body.stage}); const tks=S.tasks.filter(t=>t.subprojectId===id); if(tks.length && tks.some(t=>t.status!==body.stage)){ if(await confirmModal(`I-sync ang ${tks.length} subtasks sa ${body.stage}?`,{title:'Sync subtasks',ok:'Sync'})){ for(const tk of tks) await api.send('/api/tasks/'+tk.id,'PATCH',{status:body.stage,by:myName()||'User'}); } } } else { const r=await api.send('/api/subprojects','POST',{projectId:pid,name:body.name,description:body.description,deadline:body.deadline,startDate:body.startDate,stage:body.stage}); if(body.stage && body.stage!=='Pipeline'){ await api.send('/api/subprojects/'+r.id,'PATCH',{stage:body.stage}); } } toast('Saved'); closeModal(); refresh(); }catch(e){ toast(e.message); } };
window.delSub=async id=>{ if(!await confirmModal('Delete sub-project? Tickets stay, unlinked.',{title:'Delete phase',ok:'Delete',danger:true}))return; try{ await api.send('/api/subprojects/'+id,'DELETE',{by:myName()||'User'}); toast('Deleted'); refresh(); }catch(e){ toast(e.message); } };

window.openTicket=async id=>{
  const t=S.tasks.find(x=>x.id===id); if(!t) return;
  openModal(`
    <div class="row" style="justify-content:space-between"><div><small>${t.id} · ${sysName(t.systemId)}</small><h2 style="margin:4px 0">${esc(t.title)}</h2></div><button class="btn" onclick="closeModal()">✕</button></div>
    <div class="flow">${S.meta.statuses.map((s,i)=>{const cur=S.meta.statuses.indexOf(t.status);return `<span class="step ${i<cur?'done':i===cur?'cur':''}">${s}</span>`;}).join('<span class="step-arrow">→</span>')}</div>
    <div class="form-grid">
      <label>System<select id="m_system" onchange="updProjOpts('m')">${S.systems.map(s=>`<option value="${s.id}" ${s.id===t.systemId?'selected':''}>${s.name}</option>`).join('')}</select></label>
      <label>Project<select id="m_project" onchange="updSubOpts('m')"><option value="">—</option>${S.projects.filter(p=>p.systemId===t.systemId).map(p=>`<option value="${p.id}" ${p.id===t.projectId?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>
      <label>Sub-project<select id="m_sub"><option value="">—</option>${((S.projects.find(p=>p.id===t.projectId)||{}).subprojects||[]).map(s=>`<option value="${s.id}" ${s.id===t.subprojectId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>
      <label>Stage<select id="m_status">${S.meta.statuses.map(s=>`<option ${s===t.status?'selected':''}>${s}</option>`).join('')}</select></label>
      <label>Priority<select id="m_priority">${S.meta.priorities.map(s=>`<option ${s===t.priority?'selected':''}>${s}</option>`).join('')}</select></label>
      <label>Type<select id="m_type">${S.meta.types.map(s=>`<option ${s===t.type?'selected':''}>${s}</option>`).join('')}</select></label>
      <label>Assignee<div class="row" style="align-items:center"><span id="m_av">${avatar(t.assignee)}</span><input id="m_assignee" list="teamList" value="${esc(t.assignee||'')}" oninput="document.querySelector('#m_av').innerHTML=avatar(this.value||'?')"><datalist id="teamList">${teamOpts()}</datalist></div></label>
      <label>Start date<input id="m_start" type="date" value="${t.startDate||''}"></label>
      <label>Due date<input id="m_due" type="date" value="${t.due||''}"></label>
      <label>Progress %<input id="m_prog" type="number" min="0" max="100" value="${t.progress||0}"></label>
      <label class="full">Description<textarea id="m_desc">${esc(t.description||'')}</textarea></label>
    </div>
    <div class="row" style="margin-top:10px"><button class="btn" onclick="closeModal();projOpen($('#m_project').value)">View project & sub-tasks</button></div>
    <div class="row" style="margin-top:10px"><button class="btn pri" onclick="saveTicket('${t.id}')">Save changes</button>
    <button class="btn" onclick="delTicket('${t.id}')">Delete</button></div>
    <hr style="border-color:var(--line)">
    <h3>Post an update</h3>
    <div class="row"><input id="u_by" placeholder="Your name" style="max-width:160px" value="${esc(myName())}"><input id="u_text" placeholder="What changed? blockers? next?"></div>
    <div class="row" style="margin-top:8px"><button class="btn pri" onclick="addUpdate('${t.id}')">Post update</button></div>
    <h3>Log deployment</h3>
    <div class="form-grid"><label>Env<select id="d_env"><option>Dev</option><option>Staging</option><option>UAT</option><option>Prod</option></select></label>
    <label>Version<input id="d_ver" placeholder="v1.2.3"></label><label class="full">Notes<input id="d_notes"></label></div>
    <div class="row" style="margin-top:8px"><button class="btn" onclick="addDeploy('${t.id}')">Log deploy</button></div>
    <h3>Updates & deploys</h3><div class="timeline">
      ${(t.deployments||[]).map(d=>`<div class="u">${icon('send',12)} <b>${esc(d.by)}</b> <small>${new Date(d.at).toLocaleString()}</small><br>Deployed <b>${esc(d.version)}</b> → ${esc(d.env)} — ${esc(d.notes)}</div>`).join('')}
      ${(t.updates||[]).map(u=>`<div class="u">${icon('comment',12)} <b>${esc(u.by)}</b> <small>${new Date(u.at).toLocaleString()}</small><br>${esc(u.text)}</div>`).join('')||'<span class="mut">No updates yet — be the first.</span>'}
    </div>`);
};
window.saveTicket=async id=>{
  try{
    const pid=$('#m_project').value,spid=$('#m_sub').value,pj=S.projects.find(p=>p.id===pid);
    const body={systemId:$('#m_system').value,project:pj?pj.name:'',projectId:pid,subprojectId:spid,status:$('#m_status').value,priority:$('#m_priority').value,type:$('#m_type').value,assignee:$('#m_assignee').value,startDate:$('#m_start').value,due:$('#m_due').value,progress:+$('#m_prog').value,description:$('#m_desc').value,by:$('#m_assignee').value||'User'};
    await api.send('/api/tasks/'+id,'PATCH',body); toast('Saved '+id); closeModal(); refresh();
  }catch(e){ toast(e.message); }
};
window.delTicket=async id=>{ if(!await confirmModal('Delete '+id+'?',{title:'Delete task',ok:'Delete',danger:true}))return; try{ await api.send('/api/tasks/'+id,'DELETE',{by:myName()||'User'}); toast('Deleted'); closeModal(); refresh(); }catch(e){ toast(e.message); } };
window.addUpdate=async id=>{ const by=$('#u_by').value||'User',text=$('#u_text').value; if(!text)return toast('Type an update first'); try{ await api.send(`/api/tasks/${id}/updates`,'POST',{by,text}); toast('Update posted'); refresh(); openTicket(id); }catch(e){ toast(e.message); } };
window.addDeploy=async id=>{ try{ await api.send(`/api/tasks/${id}/deployments`,'POST',{by:myName()||'User',env:$('#d_env').value,version:$('#d_ver').value,notes:$('#d_notes').value}); if($('#d_env').value==='Prod') await api.send('/api/tasks/'+id,'PATCH',{status:'Live'}); toast('Deploy logged'); refresh(); openTicket(id); }catch(e){ toast(e.message); } };

window.sysForm=(id)=>{
  const s=S.systems.find(x=>x.id===id)||{name:'',owner:'',tech:'',repo:'',envDev:'',envStaging:'',envProd:'',health:'On Track'};
  openModal(`<h2>${id?'Edit':'Add'} system</h2><div class="form-grid">
    <label class="full">Name<input id="s_name" value="${esc(s.name)}"></label>
    <label>Owner<input id="s_owner" value="${esc(s.owner||'')}"></label><label>Tech stack<input id="s_tech" value="${esc(s.tech||'')}"></label>
    <label>Repo<input id="s_repo" value="${esc(s.repo||'')}"></label><label>Card color<input id="s_color" type="color" value="${s.color||'#3b82f6'}" style="height:38px;padding:4px"></label>
    <label>Health<select id="s_health"><option>On Track</option><option>Attention</option><option>At Risk</option></select></label>
    <label>Dev URL<input id="s_dev" value="${esc(s.envDev||'')}"></label><label>Staging URL<input id="s_stag" value="${esc(s.envStaging||'')}"></label>
    <label class="full">Prod URL<input id="s_prod" value="${esc(s.envProd||'')}"></label></div>
    <div class="row" style="margin-top:10px"><button class="btn pri" onclick="saveSys('${id||''}')">Save</button><button class="btn" onclick="closeModal()">Cancel</button></div>`);
  if(id) $('#s_health').value=s.health;
};
window.saveSys=async id=>{
  const body={name:$('#s_name').value,owner:$('#s_owner').value,tech:$('#s_tech').value,repo:$('#s_repo').value,color:$('#s_color').value,health:$('#s_health').value,envDev:$('#s_dev').value,envStaging:$('#s_stag').value,envProd:$('#s_prod').value};
  try{ if(id) await api.send('/api/systems/'+id,'PATCH',body); else await api.send('/api/systems','POST',body); toast('System saved'); closeModal(); refresh(); }
  catch(e){ toast(e.message); }
};

$('#btnExport').onclick=()=>window.open(apiUrl('/api/export'),'_blank');
$('#btnReset').onclick=async()=>{ if(!await confirmModal('Reset to seed demo data? All current projects will be replaced.',{title:'Reset',ok:'Reset',danger:true}))return; try{ await api.send('/api/reset','POST'); toast('Reset done'); refresh(); }catch(e){ toast(e.message); } };
$('#fileImport').onchange=async e=>{
  const f=e.target.files[0]; if(!f)return;
  try{ const data=JSON.parse(await f.text()); await api.send('/api/import','POST',data); toast('Imported'); refresh(); }
  catch(err){ toast(err.message); }
};

async function paintSyncMeta(){ try{ const s=await api.get('/api/sync/status'); const el=$('#syncMeta'); if(!el) return; const f=x=>x?new Date(x.at).toLocaleString()+' — '+x.text:'never'; el.textContent=`Last pull: ${f(s.pull)} · Last push: ${f(s.push)}`; }catch(e){} }
window.syncHQ=async ()=>{ toast('Syncing HQ projects…'); try{ const r=await api.send('/api/sync/hq','POST'); toast(`HQ synced: ${r.created} new, ${r.updated} updated`); refresh(); }catch(e){ toast(e.message); } };
window.pushHQ=async ()=>{ if(!await confirmModal('Push new local projects to the HQ site? This will send local-only projects to HQ Supabase.',{title:'Push HQ',ok:'Push'}))return; toast('Pushing to HQ…'); try{ const r=await api.send('/api/sync/push','POST'); toast(r.added.length?`Pushed to HQ: ${r.added.join(', ')}`:'Nothing new — HQ already in sync'); refresh(); }catch(e){ toast(e.message); } };

initSmoothScrolling();
initAppMenu();
renderProfile(); refresh();
document.querySelectorAll('#nav button').forEach(b=>{ const label=b.querySelector('span:first-child')?.textContent||b.textContent.trim(); b.setAttribute('aria-label',label); });
// polished click feedback — ponytail: one listener for all
document.addEventListener('click', e=>{
  const b=e.target.closest('.btn,.primary,.sys-pill,.tm,.card.clickable,.proj-compact,.tag,.pill');
  if(!b) return;
  b.animate([{transform:'scale(0.97)'},{transform:'scale(1.02)'},{transform:'scale(1)'}],{duration:180,easing:'cubic-bezier(.16,1,.3,1)'});
});
document.addEventListener('keydown', e=>{ if(e.key==='Enter' && e.target.matches('input,select')) e.target.animate([{transform:'scale(0.98)'},{transform:'scale(1)'}],{duration:120}); });

// Updated lifecycle actions: post-Hypercare requests are explicitly classified as Change Requests.
window.applyTemplate=async id=>{ if(!await confirmModal('I-apply ang 7-step SDLC lifecycle: Technical Analysis → Technical Design → Coding Development → SIT → UAT → Go Live → Hypercare, kasama ang Solution Design, QA, code review, migration, Maker-Checker, UAT Sign-off, at Go Live Sign-off?',{title:'Apply SDLC template',ok:'Apply'})) return; try{ const r=await api.send('/api/projects/'+id+'/apply-template','POST',{}); toast(r.created||r.tasksCreated?`SDLC template applied: +${r.created||0} phases, ${r.tasksCreated||0} starter tasks`:(r.message||'Already has all phases')); refresh(); const p=S.projects.find(x=>x.id===id); if(p) setTimeout(()=>projOpen(id),400); }catch(e){ toast(e.message); } };
window.quickTaskForm=(subId,projId,defaultType='')=>{ const p=S.projects.find(x=>x.id===projId); const sp=(p&&p.subprojects||[]).find(s=>s.id===subId); const sysId=p?p.systemId:(S.systems[0]||{}).id; const me=myName(); const isChange=defaultType==='Change Request'; openModal(`<h2>+ ${isChange?'Change Request':'Subtask'} <small class="mut">para sa ${esc(sp?sp.name:'')} — ${esc(p?p.name:'')}</small></h2>${me?`<div class="pill" style="margin-bottom:8px;background:#0c2a4d;color:#579dff;border-color:#0052cc">🔒 Creating as ${esc(me)}</div>`:''}<div class="form-grid"><label class="full">Task title<input id="qt_title" placeholder="${isChange?'Describe the post-Hypercare request':'ex: Solution Design / QA checklist / Maker-Checker'}"></label><label>Status<select id="qt_status" onchange="document.getElementById('qt_prog').value=this.value==='Live'?100:document.getElementById('qt_prog').value"><option>Pipeline</option><option>Development</option><option>UAT</option><option>Live</option><option>On Hold</option></select></label><label>Progress %<input id="qt_prog" type="number" min="0" max="100" value="0"></label><label>Assignee<div class="row" style="align-items:center"><span id="qt_av">${avatar(me||'')}</span><input id="qt_assignee" list="teamList" value="${esc(me)}" placeholder="Name" oninput="document.querySelector('#qt_av').innerHTML=avatar(this.value||'?')"><datalist id="teamList">${teamOpts()}</datalist></div></label><label>Priority<select id="qt_prio"><option>Medium</option><option>High</option><option>Critical</option><option>Low</option></select></label><label>Type<select id="qt_type"><option ${isChange?'selected':''}>Change Request</option><option ${!isChange?'selected':''}>Task</option><option>Feature</option><option>Bug</option><option>Improvement</option><option>Docs</option></select></label><label>Start<input id="qt_start" type="date"></label><label>End<input id="qt_due" type="date"></label><label class="full">Description<textarea id="qt_desc" placeholder="Details / acceptance criteria..."></textarea></label></div><div class="row" style="margin-top:10px"><button class="btn pri" onclick="saveQuickTask('${subId}','${projId}','${sysId}')">Create ${isChange?'change request':'subtask'}</button><button class="btn" onclick="closeModal()">Cancel</button></div>`); };
