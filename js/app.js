import {openDatabase, getAll, put, clear} from './database/database.js';
import {transactions,categories,settings,goals,resetAll} from './database/repositories.js';
import {state,update} from './core/store.js';
import {formatCurrency,parseCurrency} from './utils/currency.js';
import {localDate,dateKey,startOfWeek,addDays,formatDate,formatRange,isoWeek,weekStart,weeksInYear} from './utils/dates.js';
import {byWeek,totals,summary,daily} from './services/financeService.js';
import {exportJson,exportCsv} from './services/exportService.js';
import {validateBackup} from './services/importService.js';

const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || 'http://localhost:4000';
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  document.documentElement.dataset.pwaInstallAvailable = 'true';
  const btn = document.querySelector('[data-action="install"]');
  if(btn) btn.style.display = 'inline-block';
});

async function setAuthUI(){
  const token = localStorage.getItem('auth.token');
  const btn = document.querySelector('[data-action="auth"]');
  if(!btn) return;
  const sidebar = document.getElementById('sidebar');
  // clear previous user block
  if(sidebar){ const prev = sidebar.querySelector('.sidebar-user'); if(prev) prev.remove(); }

  if(token){
    // try to fetch user info
    try{
      const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: 'Bearer ' + token } });
      if(res.ok){
        const me = await res.json();
        const firstName = (me.name||me.email||'Conta').split(' ')[0];
        btn.textContent = firstName || 'Conta';
        btn.dataset.signed = 'true';
        if(sidebar){
          const initials = (me.name||me.email||'').split(' ').map(s=>s[0]).filter(Boolean).slice(0,2).join('').toUpperCase() || 'U';
          const avatarHtml = me.avatarUrl ? `<img class="avatar-img" src="${esc(me.avatarUrl)}" alt="${esc(me.name||me.email)}">` : `<div class="avatar" style="background:${me.color||'var(--surface-muted)'}">${initials}</div>`;
          const userHtml = `<div class="sidebar-user"><div class="avatar-wrap">${avatarHtml}</div><div class="user-info"><strong>${esc(me.name||me.email)}</strong><small>${esc(me.email||'')}</small></div><div class="user-actions"><button class="button" data-action="auth">Sair</button></div></div>`;
          sidebar.insertAdjacentHTML('afterbegin', userHtml);
        }
        return;
      }
    }catch(e){ console.warn('Could not fetch user info', e); }
    // fallback if fetch failed
    btn.textContent = 'Conta'; btn.dataset.signed = 'true';
    return;
  } else {
    btn.textContent = 'Entrar'; delete btn.dataset.signed;
  }
}

// sidebar backdrop helpers
function showSidebarBackdrop(){
  let d = document.querySelector('.sidebar-backdrop');
  if(!d){
    d = document.createElement('div');
    d.className = 'sidebar-backdrop';
    d.addEventListener('click', ()=>{
      const sb = document.getElementById('sidebar');
      if(sb){ sb.classList.remove('open'); sb.setAttribute('aria-hidden','true'); }
      hideSidebarBackdrop();
    });
    document.body.appendChild(d);
  }
  d.style.display = 'block';
  setTimeout(()=>d.classList.add('visible'),10);
}
function hideSidebarBackdrop(){
  const d = document.querySelector('.sidebar-backdrop');
  if(d){ d.classList.remove('visible'); setTimeout(()=>{ d.style.display = 'none'; }, 280); }
}

async function doLogin(email,password){
  const res = await fetch(`${API_BASE}/auth/login`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email,password})});
  if(!res.ok){ const j = await res.json().catch(()=>({})); throw new Error(j.error||'login_failed'); }
  const j = await res.json();
  localStorage.setItem('auth.token', j.token);
  await syncAfterAuth();
  setAuthUI();
  await load();
  return j.user;
}

async function doRegister(email,password,name){
  const res = await fetch(`${API_BASE}/auth/register`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email,password,name})});
  if(!res.ok){ const j = await res.json().catch(()=>({})); throw new Error(j.error||'register_failed'); }
  const j = await res.json();
  localStorage.setItem('auth.token', j.token);
  await syncAfterAuth();
  setAuthUI();
  await load();
  return j.user;
}


function formAuth(){
  const m = modal('Entrar / Criar conta', `
    <form class="form" id="auth-form">
      <label class="field">Email<input required name="email" type="email"></label>
      <label class="field">Senha<input required name="password" type="password"></label>
      <label class="field"><input type="checkbox" name="register" id="register-toggle"> <label for="register-toggle">Criar nova conta</label></label>
      <label class="field" id="name-field" style="display:none">Nome<input name="name"></label>
      <p style="margin:8px 0"><a href="#" id="forgot-link">Esqueci minha senha</a></p>
      <div class="actions"><button class="button secondary" type="button" data-action="close">Cancelar</button><button class="button">Confirmar</button></div>
    </form>
  `);
  const form = m.querySelector('#auth-form');
  const regToggle = form.querySelector('[name=register]');
  const nameField = form.querySelector('#name-field');
  regToggle.addEventListener('change',()=>{ nameField.style.display = regToggle.checked ? 'block':'none'; });
  const forgot = m.querySelector('#forgot-link');
  forgot.addEventListener('click', (ev)=>{ ev.preventDefault(); m.remove(); formResetRequest(); });
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(form);
    const email = fd.get('email').trim();
    const password = fd.get('password');
    const name = fd.get('name')?.trim();
    try{
      if(regToggle.checked){ await doRegister(email,password,name); toast('Conta criada e autenticada.'); }
      else { await doLogin(email,password); toast('Autenticado.'); }
      m.remove();
      await load();
    }catch(err){ console.error(err); toast(err.message||'Erro ao autenticar.'); }
  });
}

async function doRequestReset(email){
  try{
    const res = await fetch(`${API_BASE}/auth/request-reset`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email })});
    if(!res.ok) { const j = await res.json().catch(()=>({})); throw new Error(j.error||'request_failed'); }
    toast('Se o email existir, instruções foram enviadas.');
    return true;
  }catch(e){ console.error(e); toast(e.message||'Não foi possível solicitar reset.'); return false; }
}

async function doPerformReset(token,password){
  try{
    const res = await fetch(`${API_BASE}/auth/reset`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token, password })});
    if(!res.ok){ const j = await res.json().catch(()=>({})); throw new Error(j.error||'reset_failed'); }
    toast('Senha redefinida com sucesso. Faça login.');
    return true;
  }catch(e){ console.error(e); toast(e.message||'Não foi possível redefinir a senha.'); return false; }
}

function formResetRequest(){
  const m = modal('Redefinir senha', `
    <form class="form" id="reset-request-form">
      <label class="field">Email<input required name="email" type="email"></label>
      <div class="actions"><button class="button secondary" type="button" data-action="close">Cancelar</button><button class="button">Enviar instruções</button></div>
    </form>
  `);
  const form = m.querySelector('#reset-request-form');
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(form);
    const email = fd.get('email').trim();
    const ok = await doRequestReset(email);
    if(ok) m.remove();
  });
}

function formPerformReset(token){
  const m = modal('Criar nova senha', `
    <form class="form" id="reset-perform-form">
      <label class="field">Nova senha<input required name="password" type="password"></label>
      <label class="field">Repita a senha<input required name="password2" type="password"></label>
      <div class="actions"><button class="button secondary" type="button" data-action="close">Cancelar</button><button class="button">Redefinir senha</button></div>
    </form>
  `);
  const form = m.querySelector('#reset-perform-form');
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const fd = new FormData(form);
    const p1 = fd.get('password');
    const p2 = fd.get('password2');
    if(p1 !== p2){ toast('As senhas não coincidem.'); return; }
    const ok = await doPerformReset(token, p1);
    if(ok) m.remove();
  });
}

async function syncAfterAuth(){
  const token = localStorage.getItem('auth.token');
  if(!token) return;
  // ensure user is verified before syncing
  try{
    const me = await safeFetchJson(`${API_BASE}/auth/me`);
    if(!me){ toast('Não foi possível verificar a conta.'); return; }
    if(!me.verified){
      const m = modal('Verifique seu e-mail', `<p>Seu endereço de e-mail ainda não foi verificado. Verifique sua caixa de entrada para o link de verificação.</p><div class="actions"><button class="button secondary" data-action="close">Fechar</button><button class="button" id="resend-verify">Reenviar e-mail de verificação</button></div>`);
      m.querySelector('#resend-verify').addEventListener('click', async ()=>{
        try{
          const res = await fetch(`${API_BASE}/auth/resend-verify`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token } });
          if(res.ok){ toast('Email de verificação reenviado.'); m.remove(); }
          else { const j = await res.json().catch(()=>({})); toast(j.error||'Não foi possível reenviar.'); }
        }catch(e){ console.error(e); toast('Erro ao reenviar email.'); }
      });
      return;
    }
  }catch(err){ console.warn('Could not confirm user verification', err); return; }

  const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
  try{
    // Upload local transactions to the server (best-effort)
    const localTx = await getAll('transactions');
    for(const t of localTx){
      try{ await fetch(`${API_BASE}/transactions`, { method: 'POST', headers, body: JSON.stringify(t) }); }catch(e){ console.warn('upload transaction failed', e); }
    }
    // Upload local categories/goals/settings if needed
    const localCats = await getAll('categories');
    for(const c of localCats){ try{ await fetch(`${API_BASE}/categories`, { method: 'POST', headers, body: JSON.stringify(c) }); }catch(e){ console.warn('upload category failed', e); } }
    const localGoals = await getAll('goals');
    for(const g of localGoals){ try{ await fetch(`${API_BASE}/goals`, { method: 'POST', headers, body: JSON.stringify(g) }); }catch(e){ console.warn('upload goal failed', e); } }
    // Fetch canonical server data and replace local stores
    const endpoints = [ {store:'transactions', url:'/transactions'}, {store:'categories', url:'/categories'}, {store:'goals', url:'/goals'}, {store:'settings', url:'/settings'} ];
    for(const ep of endpoints){
      try{
        const res = await fetch(`${API_BASE}${ep.url}`, { headers });
        if(res.ok){
          const arr = await res.json();
          await clear(ep.store);
          for(const item of arr){ await put(ep.store, item); }
        }
      }catch(e){ console.warn('sync fetch failed', ep, e); }
    }
  }catch(e){ console.error('syncAfterAuth error', e); }
}

async function handleAuthUrl(){
  try{
    const params = new URLSearchParams(location.search);
    if(params.has('verify')){
      const token = params.get('verify');
      const res = await fetch(`${API_BASE}/auth/verify?token=${encodeURIComponent(token)}`);
      if(res.ok){ toast('Email verificado com sucesso.'); }
      else { const j = await res.json().catch(()=>({})); toast(j.error||'Falha na verificação.'); }
      params.delete('verify');
      const newUrl = location.pathname + (params.toString()?`?${params.toString()}`:'') + location.hash;
      history.replaceState({}, document.title, newUrl);
      return;
    }
    if(params.has('reset')){
      const token = params.get('reset');
      params.delete('reset');
      const newUrl = location.pathname + (params.toString()?`?${params.toString()}`:'') + location.hash;
      history.replaceState({}, document.title, newUrl);
      formPerformReset(token);
      return;
    }
  }catch(e){ console.error(e); }
}

const root=document.querySelector('#app'),live=document.querySelector('#live'),uid=()=>crypto.randomUUID(),esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const defaults=[
  ['income','Salário','💼','#315cdb'],
  ['income','Venda','🛍️','#18a873'],
  ['income','Freelance','💻','#805ad5'],
  ['income','Investimento','📈','#cf8a18'],
  ['income','Uber','🚗','#ff6b6b'],
  ['income','Delivery','📦','#18a873'],
  ['income','Outros','✦','#69738a'],
  ['expense','Alimentação','🍽️','#e2595e'],
  ['expense','Transporte','🚌','#d06a3a'],
  ['expense','Gasolina','⛽','#d06a3a'],
  ['expense','Manutenção de Veículo','🔧','#8b5cf6'],
  ['expense','Seguro Veicular','🛡️','#f59e0b'],
  ['expense','Pedágio','🚧','#f97316'],
  ['expense','Estacionamento','🅿️','#6b7280'],
  ['expense','Moradia','🏠','#845ec2'],
  ['expense','Saúde','♥','#d44970'],
  ['expense','Educação','📚','#315cdb'],
  ['expense','Lazer','☀','#cf8a18'],
  ['expense','Compras','🛒','#e2595e'],
  ['expense','Contas','▣','#69738a'],
  ['expense','Assinaturas','◉','#805ad5'],
  ['expense','Outros','✦','#69738a']
];
const nav=[['dashboard','⌂','Início'],['transactions','▤','Lançamentos'],['weeks','▦','Semanas'],['reports','◔','Relatórios'],['settings','⚙','Configurações']];
function route(){return location.hash.slice(2)||'dashboard'}function go(page){location.hash=`#/${page}`}function toast(message){live.textContent=message;const n=document.createElement('div');n.className='toast';n.textContent=message;document.body.append(n);setTimeout(()=>n.remove(),2600)}
async function load(){update({transactions:await transactions.all(),categories:await categories.all(),goals:await goals.all(),settings:(await settings.all())[0]||{id:'app',theme:'system',onboarded:false}});if(!state.categories.length){for(const [type,name,icon,color] of defaults)await categories.save({id:uid(),type,name,icon,color,default:true});update({categories:await categories.all()})}applyTheme();render()}
function applyTheme(){const mode=state.settings.theme||'system';const dark=mode==='dark'||(mode==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=dark?'dark':'light'}
function shell(content,page=route()){root.innerHTML=`<div class="app"><header class="top"><a class="brand" href="/" title="OrganizaFinanças">Organiza<b>Finanças</b></a><nav class="desktop-nav">${nav.map(x=>`<a href="#/${x[0]}" class="${page===x[0]?'active':''}">${x[2]}</a>`).join('')}</nav><div class="header-actions"><button class="icon-btn" data-action="menu" aria-label="Menu">☰</button><button class="icon-btn install" data-action="install" aria-label="Instalar app" style="display:none">⤓</button><button class="icon-btn" data-action="theme" aria-label="Alternar tema">${document.documentElement.dataset.theme==='dark'?'☀':'☾'}</button><button class="icon-btn" data-action="auth" aria-label="Entrar">Entrar</button></div></header><aside id="sidebar" class="sidebar" aria-hidden="true"><div class="card" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;"><h2 style="margin:0;font-size:1.1em">OrganizaFinanças</h2><button class="icon-btn" data-action="menu">×</button></div><div class="card sidebar-actions" style="padding:12px;"><div style="margin-bottom:8px"><button class="button" data-action="new-transaction">Novo lançamento</button></div><div style="margin-bottom:8px"><button class="button secondary" data-action="categories">Categorias</button></div><div><button class="button secondary" data-action="settings">Configurações</button></div></div></aside><main id="content">${content}</main></div><nav class="bottom-nav" aria-label="Navegação principal">${nav.map(x=>`<a href="#/${x[0]}" class="${page===x[0]?'active':''}"><span>${x[1]}</span>${x[2]}</a>`).join('')}</nav>${page!=='transactions'?'<button class="fab" data-action="new-transaction" aria-label="Adicionar lançamento">+</button>':''}` }
function weekNav(){const iso=isoWeek(state.week);return `<div class="week-nav"><button data-action="week" data-days="-7">← Anterior</button><div><b>Semana ${String(iso.week).padStart(2,'0')}</b><small>${formatRange(state.week)}</small></div><button data-action="week" data-days="7">Próxima →</button></div><p style="text-align:center;margin:-8px 0 12px"><button class="link" data-action="current-week">Semana atual</button></p>`}
function chart(items){const rows=daily(items,state.week),max=Math.max(1,...rows.flatMap(x=>[x.income,x.expense]));return `<div class="chart" role="img" aria-label="Ganhos e gastos por dia">${rows.map((x,i)=>`<div class="chart-col" aria-label="${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][i]}"><i class="chart-bar income" style="height:${x.income/max*100}%"></i><i class="chart-bar expense" style="height:${x.expense/max*100}%"></i><small>${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][i]}</small></div>`).join('')}</div>`}
function transactionItem(x,withActions=false){const c=state.categories.find(c=>c.id===x.categoryId)||{name:x.categoryName||'Categoria removida',icon:'✦'};return `<article class="item"><span class="bubble">${esc(c.icon)}</span><div class="copy"><strong>${esc(x.description||c.name)}</strong><small>${esc(c.name)} · ${formatDate(x.date)}</small></div><span class="amount ${x.type}">${x.type==='income'?'+':'−'} ${formatCurrency(x.amount)}</span>${withActions?`<button class="icon-btn" data-action="edit-transaction" data-id="${x.id}" aria-label="Editar">✎</button><button class="icon-btn" data-action="delete-transaction" data-id="${x.id}" aria-label="Excluir">×</button>`:''}</article>`}
function dashboard(){const items=byWeek(state.transactions,state.week),s=summary(items),goal=state.goals.find(x=>x.week===dateKey(state.week));const goalCard=goal?`<div class="card"><small>Meta semanal de ${goal.kind==='expense'?'gastos':'economia'}</small><b>${formatCurrency(goal.amount)}</b><p class="muted">${goal.kind==='expense'?formatCurrency(s.expense):formatCurrency(s.balance)} usados</p><div class="progress"><i style="width:${Math.min(100,(goal.kind==='expense'?s.expense:s.balance)/goal.amount*100)}%"></i></div></div>`:`<div class="card"><b>Defina uma meta</b><p class="muted">Acompanhe seus gastos ou sua economia nesta semana.</p><button class="link" data-action="goal">Criar meta</button></div>`;shell(`${weekNav()}<section class="grid dashboard-grid"><article class="card balance wide"><small>Saldo da semana</small><strong>${formatCurrency(s.balance)}</strong><div class="metrics"><div class="metric"><small>Ganhos</small><b>${formatCurrency(s.income)}</b></div><div class="metric"><small>Gastos</small><b>${formatCurrency(s.expense)}</b></div></div></article><article class="card chart-card"><div class="section-title"><h2>Movimentação diária</h2><small class="muted">● Ganhos · Gastos</small></div>${chart(items)}</article><article class="card recent"><h2>Resumo</h2><p>${s.income?`Você gastou <b>${s.percent}%</b> do que ganhou.`:'Adicione ganhos para ver a análise.'}</p><p class="muted">${s.count} lançamento(s) · Média diária: ${formatCurrency(s.average)}</p></article>${goalCard}</section><div class="section-title"><h2>Lançamentos recentes</h2><a class="link" href="#/transactions">Ver todos</a></div><div class="list">${items.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(x=>transactionItem(x)).join('')||'<div class="empty">Nenhum lançamento nesta semana.<br>Use o botão + para começar.</div>'}</div>`)}
function transactionsPage(){let items=[...state.transactions];const f=state.filters;if(f.type!=='all')items=items.filter(x=>x.type===f.type);if(f.category)items=items.filter(x=>x.categoryId===f.category);if(f.search){const q=f.search.toLowerCase();items=items.filter(x=>`${x.description} ${x.categoryName}`.toLowerCase().includes(q))}items.sort((a,b)=>b.date.localeCompare(a.date));shell(`<h1 class="page-title">Lançamentos</h1><div class="filters"><input data-filter="search" value="${esc(f.search)}" placeholder="Buscar descrição ou categoria"><select data-filter="category"><option value="">Todas as categorias</option>${state.categories.map(c=>`<option value="${c.id}" ${f.category===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="tabs">${[['all','Todos'],['income','Ganhos'],['expense','Gastos']].map(x=>`<button data-action="filter-type" data-type="${x[0]}" class="${f.type===x[0]?'active':''}">${x[1]}</button>`).join('')}</div><div class="section-title"><h2>${items.length} resultado(s)</h2><button class="button" data-action="new-transaction">Adicionar</button></div><div class="list">${items.map(x=>transactionItem(x,true)).join('')||'<div class="empty">Nenhum lançamento encontrado.</div>'}</div>`)}
function weeksPage(){const year=isoWeek(state.week).year,max=weeksInYear(year),rows=[];for(let n=1;n<=max;n++){const start=weekStart(year,n),s=summary(byWeek(state.transactions,start));rows.push(`<button class="week-row" data-action="select-week" data-date="${dateKey(start)}"><div><b>Semana ${String(n).padStart(2,'0')}</b><b class="${s.balance>=0?'income':'expense'}">${formatCurrency(s.balance)}</b></div><small>${formatRange(start)} · Ganhos ${formatCurrency(s.income)} · Gastos ${formatCurrency(s.expense)}</small></button>`)}shell(`<h1 class="page-title">Semanas</h1><div class="filters"><label class="sr-only" for="week-year">Ano das semanas</label><select id="week-year" data-action="year">${[year-1,year,year+1].map(y=>`<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('')}</select></div><div class="week-list">${rows.join('')}</div>`)}
function reports(){const current=summary(byWeek(state.transactions,state.week)),previous=summary(byWeek(state.transactions,addDays(state.week,-7))),expenses=byWeek(state.transactions,state.week).filter(x=>x.type==='expense');const categoriesTotals=expenses.reduce((a,x)=>{a[x.categoryId]=(a[x.categoryId]||0)+x.amount;return a},{}),max=Math.max(1,...Object.values(categoriesTotals));const catBars=Object.entries(categoriesTotals).sort((a,b)=>b[1]-a[1]).map(([id,v])=>{const c=state.categories.find(x=>x.id===id);return `<div class="bar-row"><span>${esc(c?.name||'Outros')}</span><i style="width:${v/max*100}%"></i><b>${formatCurrency(v)}</b></div>`}).join('')||'<p class="muted">Sem gastos nesta semana.</p>';const delta=(a,b)=>b?`${Math.round((a-b)/Math.abs(b)*100)}%`:'—';shell(`${weekNav()}<h1 class="page-title">Relatórios</h1><section class="grid dashboard-grid"><div class="card"><small>Resultado semanal</small><strong class="${current.balance>=0?'income':'expense'}">${formatCurrency(current.balance)}</strong><p class="muted">Ganhos ${formatCurrency(current.income)} · Gastos ${formatCurrency(current.expense)}</p></div><div class="card"><small>Comparação com semana anterior</small><p>Ganhos: <b>${delta(current.income,previous.income)}</b></p><p>Gastos: <b>${delta(current.expense,previous.expense)}</b></p><p>Saldo: <b>${delta(current.balance,previous.balance)}</b></p></div><div class="card wide"><h2>Gastos por categoria</h2><div class="bars">${catBars}</div></div><div class="card wide"><h2>Análise</h2><p>Maior gasto: <b>${current.largestExpense?formatCurrency(current.largestExpense.amount):'—'}</b></p><p>Dia com maior gasto: <b>${current.largestDay?`${current.largestDay.name} (${formatCurrency(current.largestDay.amount)})`:'—'}</b></p><p>Média diária de gastos: <b>${formatCurrency(current.average)}</b></p></div></section>`)}
function categoriesPage(){shell(`<h1 class="page-title">Categorias</h1><div class="section-title"><p class="muted">Personalize seus lançamentos.</p><button class="button" data-action="new-category">Nova</button></div><div class="list">${state.categories.sort((a,b)=>a.type.localeCompare(b.type)||a.name.localeCompare(b.name)).map(c=>`<article class="item"><span class="bubble" style="color:${esc(c.color)}">${esc(c.icon)}</span><div class="copy"><strong>${esc(c.name)}</strong><small>${c.type==='income'?'Ganho':'Gasto'}</small></div><button class="icon-btn" data-action="edit-category" data-id="${c.id}">✎</button><button class="icon-btn" data-action="delete-category" data-id="${c.id}">×</button></article>`).join('')}</div>`)}
function settingsPage(){const theme=state.settings.theme||'system';shell(`<h1 class="page-title">Configurações</h1><div class="grid"><section class="card"><h2>Tema</h2><div class="tabs">${[['light','Claro'],['dark','Escuro'],['system','Sistema']].map(x=>`<button class="${theme===x[0]?'active':''}" data-action="theme-set" data-theme="${x[0]}">${x[1]}</button>`).join('')}</div></section><section class="card"><h2>Dados locais</h2><p class="muted">Seus dados ficam somente neste dispositivo.</p><div class="actions"><button class="button secondary" data-action="export-json">Backup JSON</button><button class="button secondary" data-action="export-csv">CSV</button><button class="button" data-action="import">Importar</button></div></section><section class="card"><h2>Zona de perigo</h2><button class="button danger" data-action="reset">Excluir todos os dados</button></section><section class="card"><h2>Categorias</h2><button class="button secondary" data-action="categories">Gerenciar categorias</button></section></div>`)}
function render(){if(!state.settings.onboarded){root.innerHTML='<section class="welcome"><div><a class="brand" href="/" title="OrganizaFinanças">Organiza<b>Finanças</b></a><h1>Seu dinheiro, mais claro.</h1><p>Registre ganhos e gastos, acompanhe suas semanas e mantenha os seus dados no seu dispositivo.</p><button class="button" data-action="start">Começar</button></div></section>';return}({dashboard,transactions:transactionsPage,weeks:weeksPage,reports,categories:categoriesPage,settings:settingsPage}[route()]||dashboard)()}
function modal(title,body){const el=document.createElement('div');el.className='modal';el.innerHTML=`<div class="modal-box" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-action="close">×</button></div>${body}</div>`;document.body.append(el);el.querySelector('input,select,textarea,button')?.focus();return el}
function formTransaction(item={type:'expense',date:dateKey(state.week)}){
  const options = type => state.categories.filter(c=>c.type===type).map(c=>`<option value="${c.id}" ${item.categoryId===c.id?'selected':''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('') + `<option value="__other__">✦ Outro...</option>`;
  const m = modal(item.id?'Editar lançamento':'Novo lançamento', `
    <form class="form" id="transaction-form">
      <label class="field">Tipo<select name="type"><option value="income" ${item.type==='income'?'selected':''}>Ganho</option><option value="expense" ${item.type==='expense'?'selected':''}>Gasto</option></select></label>
      <label class="field">Valor<input required name="amount" inputmode="decimal" placeholder="R$ 0,00" value="${item.amount?formatCurrency(item.amount):''}"></label>
      <label class="field">Categoria<select name="categoryId" required>${options(item.type)}</select></label>
      <div id="custom-cat" style="display:none;margin:8px 0">
        <label class="field">Outra categoria<input name="customCategory" maxlength="40"></label>
        <label class="field">Ícone<input name="customIcon" maxlength="4" placeholder="✦"></label>
        <label class="field">Cor<input type="color" name="customColor" value="#69738a"></label>
      </div>
      <label class="field">Data<input required type="date" name="date" value="${item.date}"></label>
      <label class="field">Descrição <input maxlength="100" name="description" value="${esc(item.description||'')}"></label>
      <div class="actions"><button class="button secondary" type="button" data-action="close">Cancelar</button><button class="button">Salvar</button></div>
    </form>
  `);
  const typeEl = m.querySelector('[name=type]');
  const categoryEl = m.querySelector('[name=categoryId]');
  const customDiv = m.querySelector('#custom-cat');
  const customInput = m.querySelector('[name=customCategory]');
  const customIcon = m.querySelector('[name=customIcon]');
  const customColor = m.querySelector('[name=customColor]');
  // update category list when type changes
  typeEl.addEventListener('change',()=>{ categoryEl.innerHTML = options(typeEl.value); customDiv.style.display='none'; });
  // show custom input when 'other' selected
  categoryEl.addEventListener('change',()=>{ if(categoryEl.value==='__other__') customDiv.style.display='block'; else customDiv.style.display='none'; });
  m.querySelector('form').addEventListener('submit',async e=>{
  e.preventDefault();
  const d = new FormData(e.target);
  const amount = parseCurrency(d.get('amount'));
  if(!amount){ toast('Informe um valor válido.'); return; }
  let cat = state.categories.find(c=>c.id===d.get('categoryId'));
  if(d.get('categoryId')==='__other__'){
    const name = (d.get('customCategory')||'').trim();
    const icon = (d.get('customIcon')||'✦').trim() || '✦';
    const color = d.get('customColor') || '#69738a';
    if(!name){ toast('Informe o nome da nova categoria.'); return; }
    const newCat = { id: uid(), type: d.get('type'), name, icon, color, default:false };
    await categories.save(newCat);
    cat = newCat;
  }
  if(!cat){ toast('Informe uma categoria válida.'); return; }
  await transactions.save({ id: item.id||uid(), type: d.get('type'), amount, categoryId: cat.id, categoryName: cat.name, date: d.get('date'), description: d.get('description').trim(), createdAt: item.createdAt||Date.now() });
  m.remove();
  await load();
  toast('Lançamento salvo com sucesso.');
  });
}
function formCategory(item={type:'expense',icon:'✦',color:'#315cdb'}){const m=modal(item.id?'Editar categoria':'Nova categoria',`<form class="form"><label class="field">Nome<input required maxlength="40" name="name" value="${esc(item.name||'')}"></label><label class="field">Tipo<select name="type"><option value="expense" ${item.type==='expense'?'selected':''}>Gasto</option><option value="income" ${item.type==='income'?'selected':''}>Ganho</option></select></label><label class="field">Ícone<input required maxlength="4" name="icon" value="${esc(item.icon)}"></label><label class="field">Cor<input type="color" name="color" value="${esc(item.color)}"></label><div class="actions"><button class="button secondary" type="button" data-action="close">Cancelar</button><button class="button">Salvar</button></div></form>`);m.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target);await categories.save({id:item.id||uid(),type:d.get('type'),name:d.get('name').trim(),icon:d.get('icon').trim(),color:d.get('color'),default:false});m.remove();await load();toast('Categoria salva.')} )}
function formGoal(){const existing=state.goals.find(x=>x.week===dateKey(state.week))||{kind:'expense'};const m=modal('Meta semanal',`<form class="form"><label class="field">Tipo<select name="kind"><option value="expense">Limite de gastos</option><option value="savings">Meta de economia</option></select></label><label class="field">Valor<input required name="amount" inputmode="decimal" value="${existing.amount?formatCurrency(existing.amount):''}"></label><div class="actions"><button class="button secondary" type="button" data-action="close">Cancelar</button><button class="button">Salvar</button></div></form>`);m.querySelector('[name=kind]').value=existing.kind;m.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const d=new FormData(e.target),amount=parseCurrency(d.get('amount'));if(!amount)return toast('Informe um valor válido.');await goals.save({id:existing.id||uid(),week:dateKey(state.week),kind:d.get('kind'),amount});m.remove();await load();toast('Meta salva.')} )}
async function importBackup(){const input=document.createElement('input');input.type='file';input.accept='application/json';input.onchange=async()=>{try{const data=validateBackup(JSON.parse(await input.files[0].text()));const replace=confirm('Substituir os dados atuais? Escolha Cancelar para adicionar ao conteúdo existente.');if(replace)await resetAll();for(const x of data.categories)await categories.save(x);for(const x of data.transactions)await transactions.save(x);for(const x of data.goals||[])await goals.save(x);await settings.save({...state.settings,...(data.settings||{}),id:'app',onboarded:true});await load();toast(`${data.transactions.length} lançamento(s) importados.`)}catch(e){console.error(e);toast(e.message||'Não foi possível importar o backup.')}};input.click()}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-action]');
  // allow clicks outside data-action to close sidebar
  if(!b){
    const sb=document.getElementById('sidebar');
    if(sb && sb.classList.contains('open') && !e.target.closest('#sidebar')) { sb.classList.remove('open'); sb.setAttribute('aria-hidden','true'); hideSidebarBackdrop(); }
    return;
  }
  const a=b.dataset.action;
  // menu toggle
  if(a==='menu'){ const sb=document.getElementById('sidebar'); if(!sb) return; const open = sb.classList.toggle('open'); sb.setAttribute('aria-hidden', !open); if(open) showSidebarBackdrop(); else hideSidebarBackdrop(); return }

  if(a==='close')return b.closest('.modal')?.remove();
  if(a==='start'){await settings.save({...state.settings,onboarded:true});return load()}
  if(a==='install'){if(deferredPrompt){deferredPrompt.prompt();const choice = await deferredPrompt.userChoice; deferredPrompt = null; const btn = document.querySelector('[data-action="install"]'); if(btn) btn.style.display='none'; toast(choice.outcome==='accepted'?'Aplicativo instalado.':'Instalação cancelada.');} else {toast('Instalação não disponível.');}return}
  if(a==='auth'){const token = localStorage.getItem('auth.token');const sb=document.getElementById('sidebar');if(token){if(confirm('Deseja sair?')){localStorage.removeItem('auth.token');if(sb){ sb.classList.remove('open'); sb.setAttribute('aria-hidden','true'); } hideSidebarBackdrop(); await setAuthUI(); await load(); toast('Desconectado.')}}else{ if(sb){ sb.classList.remove('open'); sb.setAttribute('aria-hidden','true'); } hideSidebarBackdrop(); formAuth(); }return }
  if(a==='theme'){const next=document.documentElement.dataset.theme==='dark'?'light':'dark';await settings.save({...state.settings,theme:next});return load()}
  if(a==='theme-set'){await settings.save({...state.settings,theme:b.dataset.theme});return load()}
  if(a==='week'){update({week:addDays(state.week,Number(b.dataset.days))});return render()}
  if(a==='current-week'){update({week:startOfWeek(new Date())});return render()}
  if(a==='new-transaction'){ const sb=document.getElementById('sidebar'); if(sb && sb.classList.contains('open')){ sb.classList.remove('open'); sb.setAttribute('aria-hidden','true'); hideSidebarBackdrop(); } return formTransaction(); }
  if(a==='edit-transaction')return formTransaction(state.transactions.find(x=>x.id===b.dataset.id));
  if(a==='delete-transaction'){if(confirm('Deseja realmente excluir este lançamento?')){await transactions.delete(b.dataset.id);await load();toast('Lançamento excluído.')}return}
  if(a==='filter-type'){update({filters:{...state.filters,type:b.dataset.type}});return render()}
  if(a==='select-week'){update({week:localDate(b.dataset.date)});return go('dashboard')}
  if(a==='new-category')return formCategory();
  if(a==='edit-category')return formCategory(state.categories.find(x=>x.id===b.dataset.id));
  if(a==='delete-category'){if(state.transactions.some(x=>x.categoryId===b.dataset.id))return toast('Esta categoria possui lançamentos e não pode ser excluída.');if(confirm('Excluir esta categoria?')){await categories.delete(b.dataset.id);await load()}return}
  if(a==='categories'){const sb=document.getElementById('sidebar'); if(sb){ sb.classList.remove('open'); sb.setAttribute('aria-hidden','true'); hideSidebarBackdrop(); } return go('categories') }
  if(a==='goal')return formGoal();
  if(a==='export-json')return exportJson({version:1,transactions:state.transactions,categories:state.categories,goals:state.goals,settings:state.settings});
  if(a==='export-csv')return exportCsv(state.transactions);
  if(a==='import')return importBackup();
  if(a==='reset'){if(confirm('Excluir todos os dados deste dispositivo? Esta ação não pode ser desfeita.')){await resetAll();location.reload()}}
});
let searchTimer;document.addEventListener('input',e=>{if(e.target.dataset.filter==='search'){const value=e.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{update({filters:{...state.filters,search:value}});render();const input=document.querySelector('[data-filter="search"]');if(input){input.focus();input.setSelectionRange(value.length,value.length)}},220)}});document.addEventListener('change',e=>{if(e.target.dataset.filter==='category'){update({filters:{...state.filters,category:e.target.value}});render()}if(e.target.dataset.action==='year'){update({week:weekStart(Number(e.target.value),1)});render()}});window.addEventListener('hashchange',render);if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js').catch(e=>console.warn('Service Worker não registrado',e));openDatabase().then(load).then(async ()=>{ await setAuthUI(); handleAuthUrl(); }).catch(e=>{console.error(e);root.textContent='Não foi possível preparar o armazenamento local. Atualize a página e tente novamente.'});





