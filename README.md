# 🕯️ Ambiência — Player de Trilhas Sonoras por Cenas (RPG, Streams & Eventos)

**Ambiência** é uma aplicação web full-stack projetada para mestres de RPG, streamers e organizadores de eventos. O anfitrião controla a trilha sonora por **botões de situação (cenas)** com **crossfade suave**, **camada independente de som ambiente em loop** (ex.: chuva, lareira, mar) e **sincronização em tempo real via Socket.IO** para que qualquer pessoa escute pelo navegador através de um link curto (`/sala/AB12CD`) sem precisar criar conta.

---

## 🏗️ Arquitetura e Stack

```text
ambiencia/
├── client/                     # Frontend React 18 + Vite + TypeScript + Tailwind CSS
│   ├── src/
│   │   ├── components/
│   │   │   ├── YouTubeEmbedPlayer.tsx   # Ponte oficial da YouTube IFrame Player API
│   │   │   ├── SceneModal.tsx           # Criação/edição de botões de cena
│   │   │   ├── LibraryView.tsx          # Upload MP3 (drag-and-drop) + links YouTube + busca/tags
│   │   │   └── PlaylistEditorView.tsx   # Reordenação drag-and-drop, duplicação e gestão de playlists
│   │   ├── services/api.ts              # Cliente HTTP tipado com autenticação de anfitrião
│   │   ├── types.ts                     # Contratos compartilhados de domínio
│   │   └── App.tsx                      # Engine Dual-Deck Crossfade + Camada Ambiente + Sync Socket.IO
├── server/                     # Backend Node.js + Express + Socket.IO + SQLite (better-sqlite3)
│   ├── src/
│   │   ├── storage/StorageProvider.ts   # Camada abstrata: LocalDiskStorageProvider + S3StorageProvider
│   │   ├── db/database.ts               # Schema SQLite (WAL) e queries
│   │   ├── db/seed.ts                   # Seed automático (faixas, 3 playlists, 6 cenas, sala AB12CD)
│   │   ├── routes/                      # Rotas REST (/tracks, /playlists, /scenes, /rooms)
│   │   ├── socket/roomManager.ts        # Estado de salas em tempo real + compensação de latência
│   │   ├── utils/youtube.ts             # Extração de ID + metadados via YouTube oEmbed oficial
│   │   └── index.ts                     # Processo Node contínuo (HTTP + WebSocket + Static SPA)
├── .env.example                # Exemplo documentado de variáveis de ambiente
├── Dockerfile                  # Build multi-stage para deploy em Render / Railway
└── package.json                # Scripts utilitários na raiz
```

---

## 🚀 Passo a Passo para Iniciar o Servidor Corretamente

### Pré-requisitos
- **Node.js** 20+ (ou 22 / 24 LTS) e **npm**

### Passo 1: Abrir o terminal na pasta do projeto
No **PowerShell** (ou terminal integrado do editor):
```powershell
cd C:\Users\nceci\.gemini\antigravity\scratch\ambiencia
```

### Passo 2: Instalar dependências e compilar (apenas na 1ª vez ou após alterações no código)
```powershell
npm run install:all
npm run build
```
*(O comando `npm run build` compila o frontend React em `client/dist` e o backend TypeScript em `server/dist`).*

### Passo 3: Iniciar o servidor unificado (Porta 3001)
```powershell
npm run start
```
Você verá no terminal:
```text
========================================================
🎵 Ambiência Server rodando na porta 3001
📁 Upload Dir: ...\ambiencia\server\uploads (Provider: local)
🗄️  SQLite DB:  ...\ambiencia\server\data\ambiencia.sqlite
🔑 Senha Anfitrião: [Protegida]
========================================================
```
> **Importante:** Mantenha esse terminal aberto enquanto estiver usando o aplicativo.

### Passo 4: Acessar o Painel do Mestre (Anfitrião)
- Abra no seu navegador: **`http://localhost:3001`**
- Informe a sua senha de anfitrião configurada em `server/.env` (`HOST_PASSWORD`).

> **Modo Desenvolvimento (Opcional — Hot Reload):**
> Caso esteja editando o código-fonte ao vivo, você também pode rodar em dois terminais separados:
> - Terminal 1: `npm run dev:server` (API + Socket.IO na porta `3001`)
> - Terminal 2: `npm run dev:client` (Vite com Hot Reload na porta `5173`)

---

## 🌐 Como Enviar para Outros Jogadores Ouvirem ao Vivo

⚠️ **Atenção sobre `localhost`:**
Quando você abre o painel em `http://localhost:3001` e clica em **Compartilhar**, o navegador copia `http://localhost:3001/sala/AB12CD`.
A palavra `localhost` significa *"este próprio computador"* — ela serve para você testar o **Modo Ouvinte** em outra aba do seu próprio PC, mas **não abrirá no computador ou celular de outra pessoa**.

Para enviar aos seus jogadores, escolha uma das opções abaixo:

### Opção 1: Compartilhar pela Internet direto do seu PC (Grátis, sem criar conta)
1. Deixe o **Terminal 1** rodando o servidor (`npm run start`).
2. Abra um **segundo terminal PowerShell (Terminal 2)** e execute o túnel público da Cloudflare:
   ```powershell
   npx cloudflared tunnel --url http://localhost:3001
   ```
   *(Se perguntar `Ok to proceed? (y)`, digite `y` e pressione Enter).*
3. Aguarde aparecer no terminal uma caixa com seu link público `.trycloudflare.com`:
   ```text
   +--------------------------------------------------------------------------------------------+
   |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
   |  https://exemplo-aleatorio-123.trycloudflare.com                                           |
   +--------------------------------------------------------------------------------------------+
   ```
4. **Abra esse endereço `https://...trycloudflare.com` no seu navegador** (ou adicione `/sala/AB12CD` no final dele) e clique no botão **Compartilhar**:
   ```text
   https://exemplo-aleatorio-123.trycloudflare.com/sala/AB12CD
   ```
5. Envie esse link no **Discord / WhatsApp** da mesa:
   - Os jogadores abrem o link no navegador (PC ou celular, sem conta e sem senha).
   - Eles clicam no botão **"Entrar e ouvir"** para liberar o áudio do navegador.
   - Tudo o que você tocar (cenas `1` a `9`, MP3 do seu computador, vídeos do YouTube e camada de som ambiente) tocará em sincronia no navegador deles!

### Opção 2: Jogadores na mesma casa (Mesma rede Wi-Fi)
1. Descubra o IP local do seu computador rodando `ipconfig` no PowerShell (ex.: `192.168.1.15`).
2. Envie para os jogadores no mesmo Wi-Fi:
   ```text
   http://192.168.1.15:3001/sala/AB12CD
   ```

---

## 🎮 Guia das Funcionalidades

### 1. Dados de Exemplo Pré-carregados (Seed Automático)
Ao iniciar pela primeira vez, o servidor popula automaticamente o banco SQLite e gera arquivos de áudio demonstrativos em `UPLOAD_DIR`:
- **3 Playlists pré-criadas:**
  1. *Exploração & Ermos*
  2. *Combate & Masmorras*
  3. *Taverna & Descanso Curto*
- **6 Botões de Situação (Cenas) com atalhos de teclado (`1` a `6`):**
  - `1` 🌲 **Floresta** *(Playlist Exploração + Camada Ambiente de Chuva)*
  - `2` ⚔️ **Batalha** *(Playlist Combate)*
  - `3` 🏰 **Taverna** *(Playlist Taverna + Camada Ambiente de Lareira)*
  - `4` 🌊 **Mar** *(Playlist Exploração + Camada Ambiente de Ondas)*
  - `5` 🕯️ **Suspense** *(Playlist Combate)*
  - `6` 🌧️ **Chuva** *(Playlist Exploração + Camada Ambiente de Chuva Intensa)*

### 2. Entrada de Músicas (`Biblioteca`)
- **Upload de MP3:** Arraste e solte arquivos `.mp3` ou use o seletor. O app valida formato, assinatura binária do áudio e tamanho máximo (`MAX_UPLOAD_MB`, padrão `50 MB`).
- **Links do YouTube:** Cole qualquer URL do YouTube (`youtube.com/watch?v=...`, `youtu.be/...`). O backend extrai o ID de 11 caracteres e busca título e miniatura via endpoint oficial **YouTube oEmbed**. A reprodução acontece **exclusivamente pela YouTube IFrame Player API oficial** embutida no navegador — nenhum áudio ou vídeo do YouTube é baixado ou convertido.

### 3. Crossfade e Camada de Som Ambiente
- **Dual-Deck Crossfade (0 a 10 s):** Na barra lateral esquerda, ajuste o tempo de crossfade. Dois elementos `<audio>` alternam entre si realizando fade-out na faixa atual e fade-in na nova faixa quando você troca de cena ou avança na fila.
- **Camada Ambiente em Loop:** Selecione qualquer faixa de ambiente (ex.: *Chuva*, *Lareira*, *Mar*) na barra lateral para tocar em loop contínuo junto com a música principal, com controle de volume independente.

---

## ☁️ Deploy Passo a Passo na Nuvem 24h (Render ou Railway)

Caso queira deixar o site hospedado na nuvem 24 horas por dia (sem depender do seu PC ligado), utilize o `Dockerfile` incluso:

### Opção A: Deploy no Railway.app
1. Suba este repositório no GitHub.
2. No painel do **Railway**, clique em **New Project** → **Deploy from GitHub repo**.
3. O Railway detectará automaticamente o `Dockerfile` na raiz.
4. Clique com o botão direito no serviço → **Attach Volume** e defina o mount path como `/data`.
5. Na aba **Variables**, configure:
   - `NODE_ENV=production`
   - `PORT=3001`
   - `HOST_PASSWORD=sua_senha_forte_aqui`
   - `UPLOAD_DIR=/data/uploads`
   - `DATABASE_PATH=/data/ambiencia.sqlite`
   - `MAX_UPLOAD_MB=50`
   - `STORAGE_PROVIDER=local`
6. Em **Settings → Networking**, clique em **Generate Domain** para obter seu endereço `https://seu-app.up.railway.app`.

### Opção B: Deploy no Render.com
1. No painel do **Render**, clique em **New +** → **Web Service** e conecte seu repositório GitHub.
2. Selecione **Runtime:** `Docker`.
3. Na aba **Disks**, adicione um disco persistente (**Mount Path:** `/data`).
4. Configure as variáveis de ambiente listadas acima (`UPLOAD_DIR=/data/uploads`, `DATABASE_PATH=/data/ambiencia.sqlite`, `HOST_PASSWORD`, etc.).

---

## 🪣 Como Migrar os Uploads para S3 / Cloudflare R2 (Sem Disco Persistente)

Caso escolha um plano gratuito na nuvem sem volume de disco persistente para os arquivos de áudio, o backend possui a classe `S3StorageProvider` implementada em [`server/src/storage/StorageProvider.ts`](server/src/storage/StorageProvider.ts) usando `@aws-sdk/client-s3`.

Basta alterar as variáveis de ambiente:

```env
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://<SEU_ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=ambiencia-audio
S3_ACCESS_KEY_ID=sua_access_key_id
S3_SECRET_ACCESS_KEY=sua_secret_access_key
# Opcional: se o bucket tiver domínio público / CDN configurado:
S3_PUBLIC_BASE_URL=https://cdn.seudominio.com
```

---

## 🔮 Limitações Conhecidas e Ideias de Evolução

### Limitações Atuais
1. **Restrições da YouTube IFrame API em Mobile/Background:** Navegadores móveis (especialmente iOS Safari) pausam iframes do YouTube quando a aba vai para segundo plano, e vídeos com bloqueio de incorporação (`embed disabled by owner`) não podem ser reproduzidos fora do YouTube. Para máxima confiabilidade em segundo plano e suporte a crossfade de dois canais, priorize faixas `.mp3`.
2. **Autenticação Simples de Anfitrião Único:** O controle é protegido por senha global (`HOST_PASSWORD`) ou token da sala (`hostToken`), pensado para agilidade em mesas de RPG sem exigir cadastro prévio.
3. **Banco SQLite Local:** Ideal para uma instância única contínua; caso escale horizontalmente para múltiplas réplicas de servidor, seria necessário migrar o banco para PostgreSQL e usar o adapter Redis do Socket.IO.

### Ideias de Evolução
- **Contas de Usuário (OAuth Discord / Google):** Permitir que vários mestres criem perfis independentes, salvando suas próprias bibliotecas, playlists e painéis de cenas na nuvem.
- **Chat da Sala e Rolador de Dados Integrado:** Adicionar um painel lateral na visão `/sala/:code` para que jogadores conversem, enviem reações sonoras ou disparem rolagens (`1d20+5`) sincronizadas com efeitos sonoros.
- **Fila Colaborativa e Votação:** Modo opcional para festas e streams onde ouvintes podem sugerir links do YouTube ou votar na próxima faixa da fila.
- **Soundboard de Efeitos Instantâneos (One-Shot SFX):** Painel adicional de efeitos curtos (espadas, trovão, porta rangendo, dado rolando) disparados sobre a música principal.
