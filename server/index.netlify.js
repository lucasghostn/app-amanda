const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

// Create pool and instantiate shared app
const connectionString = process.env.DATABASE_URL || process.env.PGURI || 'postgres://localhost:5432/organiza';
const pool = new Pool({ connectionString });
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

const { createApp } = require(path.resolve(__dirname, './app'));
const { app, ensureTables } = createApp({ pool, jwtSecret: JWT_SECRET, frontendUrl: FRONTEND_URL });

module.exports = { app, pool, ensureTables };
