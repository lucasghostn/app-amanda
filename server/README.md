OrganizaFinanças API (Postgres + Express)

This API backs the OrganizaFinanças frontend (https://lucasghostn.github.io/app-amanda/).

Quick start (Docker Compose):

1. Copy env example if you want to customize:
   cp server/.env.example server/.env

2. Start services:
   docker-compose up --build

3. API endpoints (default):
   GET  http://localhost:4000/health
   GET  http://localhost:4000/transactions
   POST http://localhost:4000/transactions  (body: transaction object)
   GET  http://localhost:4000/export  (download all data)

Notes:
- This is a minimal dev setup without authentication. For production add authentication (JWT / OAuth), rate limiting and TLS.
- The Postgres data is persisted in a named Docker volume 'pgdata'.
