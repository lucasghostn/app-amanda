const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

// Factory that creates an Express app backed by the provided pg Pool
// Options: { jwtSecret, frontendUrl }
function createApp({ pool, jwtSecret, frontendUrl }){
  if(!pool) throw new Error('pool is required');
  const app = express();
  app.use(cors());
  app.use(express.json());

  const JWT_SECRET = jwtSecret || process.env.JWT_SECRET || 'change-me-in-production';
  const frontend = frontendUrl || process.env.FRONTEND_URL || 'http://localhost:5500';

  // rate limiters
  const authLimiter = rateLimit({ windowMs: 60*1000, max: 6, message: { error: 'Too many auth requests, try again later.' } });
  const generalLimiter = rateLimit({ windowMs: 60*1000, max: 300 });
  app.use(generalLimiter);

  // nodemailer transporter (will only work if SMTP_* env vars set)
  let mailer = null;
  if(process.env.SMTP_HOST && process.env.SMTP_USER){
    mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: (process.env.SMTP_SECURE === 'true'),
      auth: process.env.SMTP_USER? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
  }

  async function sendMail(opts){
    if(!mailer){
      console.log('Mailer not configured. Mail would be:', opts);
      return false;
    }
    try{ await mailer.sendMail(Object.assign({ from: process.env.MAIL_FROM || 'no-reply@example.com' }, opts)); return true; }
    catch(e){ console.error('Failed to send mail', e); return false; }
  }

  async function ensureTables() {
    // users
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT,
        verified BOOLEAN DEFAULT false
      );
    `);

    // categories (per-user)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        type TEXT,
        name TEXT,
        icon TEXT,
        color TEXT,
        default_flag BOOLEAN
      );
    `);

    // transactions (per-user)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        type TEXT,
        amount INTEGER,
        categoryid TEXT,
        categoryname TEXT,
        date TEXT,
        description TEXT,
        createdat BIGINT
      );
    `);

    // goals (per-user)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS goals (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        week TEXT,
        kind TEXT,
        amount INTEGER
      );
    `);

    // settings (per-user)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        json JSONB
      );
    `);

    // email verification tokens
    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        token TEXT PRIMARY KEY,
        user_id TEXT,
        expires_at BIGINT
      );
    `);

    // password reset tokens
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        token TEXT PRIMARY KEY,
        user_id TEXT,
        expires_at BIGINT
      );
    `);
  }

  function authenticate(req, res, next){
    const auth = req.headers.authorization;
    if(!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'unauthorized' });
    const token = auth.slice(7);
    try{
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload; // { id, email }
      return next();
    }catch(e){
      return res.status(401).json({ error: 'invalid_token' });
    }
  }

  // --- Routes ---
  // Auth: register (with verification email)
  app.post('/auth/register', authLimiter, async (req, res) => {
    try{
      const { email, password, name } = req.body;
      if(!email || !password) return res.status(400).json({ error: 'email and password required' });
      const hashed = await bcrypt.hash(password, 10);
      const id = randomUUID();
      await pool.query('INSERT INTO users (id,email,password,name,verified) VALUES ($1,$2,$3,$4,$5)', [id,email,hashed,name||null,false]);

      // create verification token
      const vtoken = randomUUID();
      const expires = Date.now() + 24*3600*1000; // 24h
      await pool.query('INSERT INTO email_verifications (token,user_id,expires_at) VALUES ($1,$2,$3)', [vtoken, id, expires]);

      // attempt to send verification email
      const verifyUrl = `${frontend}?verify=${vtoken}`;
      const mailSent = await sendMail({ to: email, subject: 'Verifique seu email - OrganizaFinancas', text: `Acesse para verificar: ${verifyUrl}`, html: `<p>Verifique seu e-mail clicando <a href="${verifyUrl}">neste link</a>.</p>` });

      const token = jwt.sign({ id, email }, JWT_SECRET, { expiresIn: '30d' });
      res.json({ token, user: { id, email, name }, verificationSent: !!mailSent });
    }catch(e){
      console.error(e);
      if(e.code==='23505') return res.status(400).json({ error: 'email_taken' });
      res.status(500).json({ error: 'server_error' });
    }
  });

  // Auth: verify email (GET)
  app.get('/auth/verify', async (req, res) => {
    const token = req.query.token;
    if(!token) return res.status(400).json({ error: 'token required' });
    const r = await pool.query('SELECT * FROM email_verifications WHERE token=$1 LIMIT 1', [token]);
    const row = r.rows[0];
    if(!row) return res.status(400).json({ error: 'invalid_token' });
    if(row.expires_at < Date.now()) return res.status(400).json({ error: 'token_expired' });
    await pool.query('UPDATE users SET verified=$1 WHERE id=$2', [true, row.user_id]);
    await pool.query('DELETE FROM email_verifications WHERE token=$1', [token]);
    res.json({ ok: true });
  });

  // Auth: login
  app.post('/auth/login', authLimiter, async (req, res) => {
    try{
      const { email, password } = req.body;
      if(!email || !password) return res.status(400).json({ error: 'email and password required' });
      const r = await pool.query('SELECT * FROM users WHERE email=$1 LIMIT 1', [email]);
      const user = r.rows[0];
      if(!user) return res.status(400).json({ error: 'invalid_credentials' });
      const ok = await bcrypt.compare(password, user.password);
      if(!ok) return res.status(400).json({ error: 'invalid_credentials' });
      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
      res.json({ token, user: { id: user.id, email: user.email, name: user.name, verified: user.verified } });
    }catch(e){
      console.error(e);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // Auth: me
  app.get('/auth/me', authenticate, async (req, res) => {
    try{
      const r = await pool.query('SELECT id,email,name,verified FROM users WHERE id=$1 LIMIT 1', [req.user.id]);
      res.json(r.rows[0] || null);
    }catch(e){
      console.error(e);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // Auth: resend verification (authenticated)
  app.post('/auth/resend-verify', authenticate, async (req, res) => {
    try{
      const r = await pool.query('SELECT email FROM users WHERE id=$1 LIMIT 1', [req.user.id]);
      const user = r.rows[0];
      if(!user) return res.status(400).json({ error: 'user_not_found' });
      const vtoken = randomUUID();
      const expires = Date.now() + 24*3600*1000;
      await pool.query('INSERT INTO email_verifications (token,user_id,expires_at) VALUES ($1,$2,$3)', [vtoken, req.user.id, expires]);
      const verifyUrl = `${frontend}?verify=${vtoken}`;
      await sendMail({ to: user.email, subject: 'Verifique seu email - OrganizaFinancas', text: `Acesse para verificar: ${verifyUrl}`, html: `<p>Verifique seu e-mail clicando <a href="${verifyUrl}">neste link</a>.</p>` });
      res.json({ ok: true });
    }catch(e){ console.error(e); res.status(500).json({ error: 'server_error' }); }
  });

  // Password reset request
  app.post('/auth/request-reset', authLimiter, async (req, res) => {
    try{
      const { email } = req.body;
      if(!email) return res.status(400).json({ error: 'email required' });
      const r = await pool.query('SELECT id FROM users WHERE email=$1 LIMIT 1', [email]);
      const user = r.rows[0];
      if(!user) return res.json({ ok: true }); // don't reveal
      const rtoken = randomUUID();
      const expires = Date.now() + 3600*1000; // 1h
      await pool.query('INSERT INTO password_resets (token,user_id,expires_at) VALUES ($1,$2,$3)', [rtoken, user.id, expires]);
      const resetUrl = `${frontend}?reset=${rtoken}`;
      await sendMail({ to: email, subject: 'Redefinir senha - OrganizaFinancas', text: `Redefina sua senha: ${resetUrl}`, html: `<p>Redefina sua senha clicando <a href="${resetUrl}">neste link</a>.</p>` });
      res.json({ ok: true });
    }catch(e){ console.error(e); res.status(500).json({ error: 'server_error' }); }
  });

  // Password reset perform
  app.post('/auth/reset', authLimiter, async (req, res) => {
    try{
      const { token, password } = req.body;
      if(!token || !password) return res.status(400).json({ error: 'token and password required' });
      const r = await pool.query('SELECT * FROM password_resets WHERE token=$1 LIMIT 1', [token]);
      const row = r.rows[0];
      if(!row || row.expires_at < Date.now()) return res.status(400).json({ error: 'invalid_or_expired' });
      const hashed = await bcrypt.hash(password, 10);
      await pool.query('UPDATE users SET password=$1 WHERE id=$2', [hashed, row.user_id]);
      await pool.query('DELETE FROM password_resets WHERE token=$1', [token]);
      res.json({ ok: true });
    }catch(e){ console.error(e); res.status(500).json({ error: 'server_error' }); }
  });

  // Health
  app.get('/health', (req, res) => res.json({ ok: true }));

  // Transactions CRUD (protected)
  app.get('/transactions', authenticate, async (req, res) => {
    const result = await pool.query('SELECT * FROM transactions WHERE user_id=$1 ORDER BY createdat DESC', [req.user.id]);
    res.json(result.rows.map(r=>({ ...r })));
  });

  app.post('/transactions', authenticate, async (req, res) => {
    const t = req.body;
    if (!t || !t.id) return res.status(400).json({ error: 'transaction id is required' });
    const q = `INSERT INTO transactions (id,user_id,type,amount,categoryid,categoryname,date,description,createdat)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO UPDATE SET type=EXCLUDED.type, amount=EXCLUDED.amount, categoryid=EXCLUDED.categoryid, categoryname=EXCLUDED.categoryname, date=EXCLUDED.date, description=EXCLUDED.description, createdat=EXCLUDED.createdat`;
    await pool.query(q, [t.id, req.user.id, t.type,t.amount,t.categoryId,t.categoryName,t.date,t.description,t.createdAt||Date.now()]);
    res.json({ ok: true });
  });

  app.put('/transactions/:id', authenticate, async (req, res) => {
    const id = req.params.id;
    const t = req.body;
    await pool.query(`UPDATE transactions SET type=$1, amount=$2, categoryid=$3, categoryname=$4, date=$5, description=$6 WHERE id=$7 AND user_id=$8`, [t.type,t.amount,t.categoryId,t.categoryName,t.date,t.description,id, req.user.id]);
    res.json({ ok: true });
  });

  app.delete('/transactions/:id', authenticate, async (req, res) => {
    const id = req.params.id;
    await pool.query('DELETE FROM transactions WHERE id=$1 AND user_id=$2', [id, req.user.id]);
    res.json({ ok: true });
  });

  // Categories (protected)
  app.get('/categories', authenticate, async (req, res) => {
    const r = await pool.query('SELECT * FROM categories WHERE user_id=$1 OR user_id IS NULL ORDER BY name', [req.user.id]);
    res.json(r.rows);
  });
  app.post('/categories', authenticate, async (req, res) => {
    const c = req.body;
    if(!c || !c.id) return res.status(400).json({ error: 'category id required' });
    await pool.query(`INSERT INTO categories (id,user_id,type,name,icon,color,default_flag) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO UPDATE SET type=EXCLUDED.type,name=EXCLUDED.name,icon=EXCLUDED.icon,color=EXCLUDED.color,default_flag=EXCLUDED.default_flag`,[c.id, req.user.id, c.type,c.name,c.icon,c.color,c.default||false]);
    res.json({ ok: true });
  });

  // Settings (per-user)
  app.get('/settings', authenticate, async (req, res) => {
    const r = await pool.query('SELECT * FROM settings WHERE user_id=$1 LIMIT 1', [req.user.id]);
    res.json(r.rows[0] || null);
  });
  app.post('/settings', authenticate, async (req, res) => {
    const s = req.body;
    if(!s || !s.id) return res.status(400).json({ error: 'settings id required' });
    await pool.query(`INSERT INTO settings (id,user_id,json) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET json=EXCLUDED.json`, [s.id, req.user.id, s.json || {}]);
    res.json({ ok: true });
  });

  // Simple sync: get all data for current user
  app.get('/export', authenticate, async (req, res) => {
    const t = await pool.query('SELECT * FROM transactions WHERE user_id=$1', [req.user.id]);
    const c = await pool.query('SELECT * FROM categories WHERE user_id=$1 OR user_id IS NULL', [req.user.id]);
    const g = await pool.query('SELECT * FROM goals WHERE user_id=$1', [req.user.id]);
    const s = await pool.query('SELECT * FROM settings WHERE user_id=$1', [req.user.id]);
    res.json({ transactions: t.rows, categories: c.rows, goals: g.rows, settings: s.rows });
  });

  return { app, ensureTables };
}

module.exports = { createApp };
