# OrganizaFinanças

Aplicativo financeiro pessoal, local e offline, criado com HTML, CSS e JavaScript moderno. Não exige conta, servidor nem coleta de dados: as informações são salvas no IndexedDB do navegador.

## Recursos

- Lançamentos de ganhos e gastos, com edição, exclusão, busca e filtros.
- Categorias personalizáveis, metas semanais, resumo e relatórios por semana.
- Semanas ISO 8601 geradas automaticamente e navegação por hash compatível com GitHub Pages.
- Tema claro, escuro ou conforme o sistema.
- Backup JSON, importação validada e exportação CSV.
- PWA com cache dos arquivos do aplicativo para uso offline após a primeira visita.

## Executar localmente

Abra a pasta em um servidor estático — por exemplo, a extensão **Live Server** do VS Code — e acesse o endereço mostrado, como `http://127.0.0.1:5500`. O uso de servidor é necessário para módulos ES e Service Worker; não abra o `index.html` diretamente pelo explorador de arquivos.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie todos os arquivos desta pasta.
2. No repositório, abra **Settings → Pages** e confirme que a opção **GitHub Actions** está ativa.
3. O workflow em `.github/workflows/deploy-pages.yml` publica automaticamente a pasta raiz quando houver push na branch `main`.
4. Aguarde o endereço `https://seu-usuario.github.io/nome-do-repositorio/` aparecer em **Actions → Pages**.

Todos os caminhos são relativos, portanto a aplicação funciona em subpastas do GitHub Pages sem ajustes de código. O arquivo `.nojekyll` garante que arquivos estáticos e assets não sejam processados pelo Jekyll.

## PWA

Em HTTPS (GitHub Pages) ou `localhost`, abra o menu do navegador Android e selecione **Instalar aplicativo**. Após a primeira carga, desligue a rede e recarregue para verificar o cache offline.

## Testes críticos

Com o servidor local em execução, abra `tests/critical-tests.html`. A página verifica cálculo em centavos, formatação e conversão de moeda, semanas ISO na virada de ano e resumo financeiro.

## Estrutura

- `js/database`: camada exclusiva do IndexedDB.
- `js/services`: cálculos, importação e exportação.
- `js/core`: estado centralizado.
- `js/utils`: datas locais/ISO e dinheiro em centavos.
- `service-worker.js`: cache da aplicação estática.

## Limitações e próximos passos

O armazenamento é local ao navegador/dispositivo; faça backups JSON periódicos. A moeda atual é BRL. Os testes manuais recomendados incluem criar, editar e excluir um lançamento, navegar entre semanas, exportar, limpar os dados e importar o backup novamente.
