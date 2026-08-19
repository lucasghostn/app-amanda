# OrganizaFinanças

Aplicativo PWA para controle pessoal de finanças. Frontend leve em HTML/CSS/JS com armazenamento local (IndexedDB) e suporte a backend com autenticação e sincronização.

Project demo: https://lucasghostn.github.io/app-amanda/

---

## Visão geral atual

Este repositório agora contém:
- Frontend PWA estático (pasta raiz).
- Backend Node.js/Express preparado para rodar como servidor tradicional ou como Netlify Function (código em `server/` e `netlify/functions/server.js`).
- Sincronização por usuário com verificação de e-mail obrigatória antes do sync (recomendado por segurança).
- Autenticação: registro, login, verificação por e-mail, pedido de reset de senha (endpoints em `/auth/*`).

Observação: o ambiente de execução aqui não pode fazer push ao seu GitHub ou configurar variáveis do Netlify — essas ações devem ser realizadas na sua máquina/conta.

---

## Novidades importantes (desde a versão offline)

- Backend refatorado como uma fábrica (`server/app.js`) para suportar execução tradicional e serverless com a mesma lógica.
- Netlify: um único handler serverless (`netlify/functions/server.js`) usa `serverless-http` para expor as rotas Express.
- Sincronização: o cliente exige que o usuário tenha verificado o e-mail antes de subir/baixar os dados do servidor.
- UI: sidebar redesenhada, agora com backdrop escuro ao abrir; avatar suportando `avatarUrl` (imagem) no backend — cai para iniciais se não houver imagem.

---

## Executar localmente (frontend)

1. Abra a pasta do projeto no VS Code.
2. Use um servidor estático (ex.: Live Server) ou `npx serve .` para servir os arquivos estáticos. A aplicação requer um servidor por causa dos módulos ES e Service Worker.

Observação: se ainda usar somente a versão offline, nada mais é necessário — os dados permanecem no IndexedDB do navegador.

---

## Executar backend localmente

Opções:

A) Rodar como servidor tradicional (útil em desenvolvimento)

1. Entre em `server/`.
2. npm install
3. Configure as variáveis de ambiente (ex.: via `.env` ou diretamente no ambiente):
   - DATABASE_URL (Postgres connection string)
   - JWT_SECRET (segredo para tokens)
   - FRONTEND_URL (url pública do frontend, usada em emails de verificação — ex.: https://seu-site.netlify.app)
   - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM (opcional, para envio de emails)
4. npm start

B) Rodar localmente como Netlify Function (recomendado para testar a implantação Netlify)

1. Instale o CLI do Netlify: `npm install -g netlify-cli`
2. No root do projeto, rode: `netlify dev` — isso emula as functions e também serve o frontend estático.
3. Configure as variáveis de ambiente no painel do Netlify ou usando um arquivo `.env` local para `netlify dev`.

---

## Variáveis de ambiente (essenciais)

- DATABASE_URL  — string de conexão do Postgres (postgres://user:pass@host:port/db)
- JWT_SECRET    — segredo forte para assinaturas JWT
- FRONTEND_URL  — URL pública do frontend (usada nos links de verificação por e-mail)
- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM — (opcionais) para envio real de e-mails

Netlify-specific: adicione essas variáveis no painel Site → Site settings → Build & deploy → Environment.

---

## Deploy (Netlify)

1. Push do repositório ao GitHub (branch `main` ou outra configurada).
2. No Netlify, crie um novo site apontando para o repositório.
3. Defina as Environment variables listadas acima no painel do Netlify.
4. Build command: nenhum — o frontend é estático; apenas a pasta raiz será publicada. Se usar um processo de build (ex.: bundler), configure o comando e o dir de publicação.
5. As Netlify Functions ficam disponíveis em `/.netlify/functions/server/*` por padrão; para facilitar o consumo pelo frontend, use a URL completa da função como API_BASE (ex.: `https://<site>.netlify.app/.netlify/functions/server`).

Dica: pode definir um valor `window.APP_CONFIG.apiBase` durante o deploy (ou usar um arquivo `app-config.js` gerado no build) para apontar o frontend para a função correta.

---

## Git / Patch / Push

Se este ambiente gerou alterações locais (ex.: `update.patch`), aplique-as e faça o push a partir do seu PC Windows com PowerShell. Exemplo (no diretório do repositório):

1. Salve o patch no repositório: `git am update.patch` ou `git apply update.patch && git add -A && git commit -m "Apply patch"`
2. Configure seu remoto e autentique: `git remote add origin https://github.com/seu-usuario/app-amanda.git` (se necessário)
3. Push: `git push origin main`

Nota de segurança: se algum token ou PAT foi exposto, revogue-o imediatamente e gere novos credenciais.

---

## Testes e verificação rápida após deploy

1. Registrar um usuário: verifique que o servidor retorna um token e um record de usuário.
2. Receber/verificar e-mail: se SMTP não estiver configurado, os e-mails são impressos nos logs (útil para testes locais). Em produção, configure SMTP.
3. Fazer login e testar sincronização: após verificação do e-mail (requerido), o cliente sincroniza local → server → substitui dados locais com o estado canônico do servidor.
4. Checar avatar: se o endpoint `/auth/me` retornar `avatarUrl`, o frontend mostrará a imagem no sidebar; caso contrário, exibirá iniciais.
5. Verificar UI: abrir a sidebar deve exibir o backdrop escuro; clicar fora ou no backdrop fecha a sidebar.

---

## Dicas de segurança e produção

- Use JWT_SECRET forte e rotacione quando necessário.
- Não armazene senhas em texto — o servidor usa bcrypt (já configurado).
- Considere usar HttpOnly cookies para tokens em produção (melhor segurança CSRF) — hoje o cliente usa localStorage para simplicidade.
- Para emails em produção, prefira serviços gerenciados (SendGrid, Mailgun, Amazon SES) em vez de SMTP direto quando possível.

---

## Desenvolvimento futuro (opções)

- Separar endpoints em múltiplas Netlify Functions (atualmente usamos um único handler `server` para simplicidade).
- Adicionar upload de avatar (requer bucket/armazenamento e endpoint de upload).
- Melhorar segurança: cookies HttpOnly, refresh tokens, e fluxos de logout remotos.

---

## Estrutura resumida (importante)

- `js/` — frontend JavaScript (UI, IndexedDB, sync)
- `css/` — estilos globais
- `server/` — backend Express factory e utilitários
- `netlify/functions/` — Netlify function wrapper
- `update.patch` — (se presente) patch com commits gerados neste ambiente

---

Se quiser, atualizo este README com instruções ainda mais detalhadas para o seu fluxo (ex.: comandos PowerShell prontos para Windows, ou um script `deploy-netlify.ps1`). Diga qual você prefere.
