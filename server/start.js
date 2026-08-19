require('dotenv').config();
const path = require('path');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.PGURI || '******localhost:5432/organiza';
const pool = new Pool({ connectionString });
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

const { createApp } = require(path.resolve(__dirname, './app'));
const { app, ensureTables } = createApp({ pool, jwtSecret: JWT_SECRET, frontendUrl: FRONTEND_URL });

const PORT = process.env.PORT || 4000;

(async () => {
  try{
    await ensureTables();
    app.listen(PORT, () => console.log(`API listening on ${PORT}, DB=${connectionString}`));
  }catch(e){
    console.error('Failed to start', e);
    process.exit(1);
  }
})();
