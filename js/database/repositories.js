import * as db from './database.js';

const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || 'http://localhost:4000';

async function safeFetchJson(url, opts){
  const token = localStorage.getItem('auth.token');
  opts = opts || {};
  opts.headers = Object.assign({}, opts.headers || {}, token ? { Authorization: 'Bearer ' + token } : {});
  const res = await fetch(url, opts);
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
function normalizeTransaction(r){
  if(!r) return r;
  return {
    id: r.id,
    type: r.type,
    amount: Number(r.amount),
    categoryId: r.categoryId || r.categoryid || r.category_id || null,
    categoryName: r.categoryName || r.categoryname || r.category_name || null,
    date: r.date,
    description: r.description,
    createdAt: r.createdAt || r.createdat || Number(r.created_at) || Date.now()
  };
}

function normalizeCategory(r){
  if(!r) return r;
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    icon: r.icon,
    color: r.color,
    default: !!(r.default || r.default_flag || r.default_flag === true)
  };
}

function normalizeGoal(r){
  if(!r) return r;
  return {
    id: r.id,
    week: r.week,
    kind: r.kind,
    amount: Number(r.amount)
  };
}

function normalizeSettings(r){
  if(!r) return null;
  if(r.json && typeof r.json === 'object') return { id: r.id, ...r.json };
  // some responses may return the settings object directly
  return r;
}

async function fetchArrayAndCache(url, normalizeFn, storeName){
  const data = await safeFetchJson(url);
  if(!Array.isArray(data)) return [];
  const normalized = data.map(normalizeFn);
  // update local cache in background
  try{ await Promise.all(normalized.map(item=>db.put(storeName,item))); }catch(e){}
  return normalized;
}

export const transactions = {
  all: async () => {
    try { return await fetchArrayAndCache(`${API_BASE}/transactions`, normalizeTransaction, 'transactions'); }
    catch (e) { return db.getAll('transactions'); }
  },
  save: async (value) => {
    try {
      await safeFetchJson(`${API_BASE}/transactions`, {method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(value)});
      // keep local cache in sync
      try{ await db.put('transactions', value); }catch(e){}
      return value;
    } catch (e) {
      return db.put('transactions', value);
    }
  },
  delete: async (id) => {
    try { await fetch(`${API_BASE}/transactions/${id}`, {method:'DELETE'}); try{ await db.remove('transactions', id); }catch(e){}; return; }
    catch (e) { return db.remove('transactions', id); }
  }
};

export const categories = {
  all: async () => {
    try { return await fetchArrayAndCache(`${API_BASE}/categories`, normalizeCategory, 'categories'); }
    catch (e) { return db.getAll('categories'); }
  },
  save: async (value) => {
    try { await safeFetchJson(`${API_BASE}/categories`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(value)});
      try{ await db.put('categories', value); }catch(e){}
      return value;
    }
    catch (e) { return db.put('categories', value); }
  },
  delete: async (id) => {
    try { await fetch(`${API_BASE}/categories/${id}`, {method:'DELETE'}); try{ await db.remove('categories', id); }catch(e){}; return; }
    catch (e) { return db.remove('categories', id); }
  }
};

export const settings = {
  all: async () => {
    try {
      const res = await safeFetchJson(`${API_BASE}/settings`);
      if(!res) return [];
      const s = normalizeSettings(res);
      if(s) {
        try{ await db.put('settings', s); }catch(e){}
        return [s];
      }
      return [];
    }
    catch (e) { return db.getAll('settings'); }
  },
  save: async (value) => {
    try { await safeFetchJson(`${API_BASE}/settings`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(value)}); try{ await db.put('settings', value); }catch(e){}; return value; }
    catch (e) { return db.put('settings', value); }
  }
};

export const goals = {
  all: async () => {
    try { return await fetchArrayAndCache(`${API_BASE}/goals`, normalizeGoal, 'goals'); }
    catch (e) { return db.getAll('goals'); }
  },
  save: async (value) => {
    try { await safeFetchJson(`${API_BASE}/goals`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(value)}); try{ await db.put('goals', value); }catch(e){}; return value; }
    catch (e) { return db.put('goals', value); }
  },
  delete: async (id) => {
    try { await fetch(`${API_BASE}/goals/${id}`, {method:'DELETE'}); try{ await db.remove('goals', id); }catch(e){}; return; }
    catch (e) { return db.remove('goals', id); }
  }
};

export const resetAll = async () => Promise.all(['transactions','categories','settings','goals'].map(db.clear));







