# 🕯️ Ambiência — Player de Trilhas Sonoras por Cenas (RPG, Streams & Eventos)

**Ambiência** é uma aplicação web full-stack projetada para mestres de RPG, streamers e organizadores de eventos. O anfitrião controla a trilha sonora por **botões de situação (cenas)** com **crossfade suave**, **camada independente de som ambiente em loop** (ex.: chuva, lareira, mar) e **sincronização em tempo real via Socket.IO** para que qualquer pessoa escute pelo navegador através de um link curto (`/sala/AB12CD`) sem precisar criar conta.

---

## 🏗️ Arquitetura e Stack

```
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

## 🚀 Instalação e Execução Local

### Pré-requisitos
- **Node.js** 20+ (ou 22 / 24 LTS) e **npm**

### 1. Configurar variáveis de ambiente
Copie o arquivo `.env.example` para `server/.env`:
```bash
cp .env.example server/.env
```
*(Por padrão, a senha do anfitrião é `HOST_PASSWORD=mestre123`, o banco SQLite fica em `server/data/ambiencia.sqlite` e os uploads ficam em `server/uploads`).*

### 2. Instalar dependências
Na pasta raiz do projeto:
```bash
npm run install:all
```

### 3. Iniciar em modo de desenvolvimento
Você pode rodar o backend (porta `3001`) e o frontend Vite (porta `5173`):
```bash
# Terminal 1 — Servidor Node + Socket.IO + SQLite
npm run dev:server

# Terminal 2 — Cliente React + Vite
npm run dev:client
```
Acesse **`http://localhost:5173`** no navegador.

> **Modo de Produção Único (porta 3001):**
> ```bash
> npm run build
> npm run start
> ```
> O Express servirá tanto a API/Socket.IO quanto o bundle estático do frontend em `http://localhost:3001`.

---

## 🎮 Guia de Uso

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

### 4. Modo Ouvinte e Compartilhamento Ao Vivo (`/sala/AB12CD`)
- Clique em **Compartilhar** no topo para copiar o link da sala (ex.: `http://localhost:5173/sala/AB12CD`) ou em **+ Nova Sala** para gerar um novo código curto.
- Qualquer pessoa que abrir o link verá o botão **"Entrar e ouvir"** (necessário para desbloquear a política de autoplay dos navegadores modernos).
- O servidor sincroniza faixa atual, posição, play/pausa, cena ativa e camada ambiente via **Socket.IO**, estimando a latência de rede via ping/pong (`clock:ping` / `clock:pong`) e corrigindo automaticamente desvios superiores a **~1 segundo**.

---

## ☁️ Deploy Passo a Passo (Render ou Railway)

Como o **Ambiência** utiliza conexões persistentes WebSocket (**Socket.IO**) e mantém estado de sincronização em memória + SQLite, ele deve ser hospedado como um **Serviço Web Contínuo (Web Service)**, e **não** em plataformas serverless (como Vercel Functions).

### Opção A: Deploy no Render.com
1. Suba este repositório no GitHub/GitLab.
2. No painel do **Render**, clique em **New +** → **Web Service** e conecte o repositório.
3. Configure o serviço:
   - **Runtime:** `Docker` (utilizará automaticamente o `Dockerfile` na raiz).
   - **Instance Type:** Starter (ou superior, para suportar **Persistent Disk**).
4. **Adicionar Disco Persistente (Volume):**
   - Vá na aba **Disks** do serviço → **Add Disk**.
   - **Name:** `ambiencia-data`
   - **Mount Path:** `/data`
   - **Size:** `10 GB` (ou conforme sua biblioteca de MP3).
5. **Variáveis de Ambiente (`Environment`):**
   - `NODE_ENV=production`
   - `PORT=3001`
   - `HOST_PASSWORD=sua_senha_forte_aqui`
   - `UPLOAD_DIR=/data/uploads`
   - `DATABASE_PATH=/data/ambiencia.sqlite`
   - `MAX_UPLOAD_MB=50`
   - `STORAGE_PROVIDER=local`
6. **Domínio e HTTPS:**
   - O Render fornece HTTPS automático (`https://seu-app.onrender.com`) e suporta domínios customizados em **Settings → Custom Domains**. O Express já está configurado com `app.set('trust proxy', 1)`.

### Opção B: Deploy no Railway.app
1. No painel do **Railway**, clique em **New Project** → **Deploy from GitHub repo**.
2. O Railway detectará automaticamente o `Dockerfile` na raiz.
3. Clique com o botão direito no serviço → **Attach Volume** e defina o mount path como `/data`.
4. Na aba **Variables**, configure as mesmas variáveis listadas acima (`UPLOAD_DIR=/data/uploads`, `DATABASE_PATH=/data/ambiencia.sqlite`, `HOST_PASSWORD`, etc.).
5. Em **Settings → Networking**, clique em **Generate Domain** (ou conecte seu domínio próprio com HTTPS automático).

---

## 🪣 Como Migrar os Uploads para S3 / Cloudflare R2 (Sem Disco Persistente)

Caso você escolha um plano de hospedagem sem volume de disco persistente para os arquivos de áudio, o backend já possui a classe `S3StorageProvider` implementada em [`server/src/storage/StorageProvider.ts`](server/src/storage/StorageProvider.ts) usando o AWS SDK v3 (`@aws-sdk/client-s3`).

Para migrar do disco local para **Cloudflare R2** ou **Amazon S3**, basta alterar as variáveis de ambiente (sem precisar mudar nenhuma linha de código):

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
- Quando `STORAGE_PROVIDER=s3`:
  - Novos uploads MP3 são enviados diretamente para o bucket via `PutObjectCommand`.
  - A rota `/api/tracks/:id/stream` redireciona (`302`) para a URL pública do CDN (`S3_PUBLIC_BASE_URL`) ou gera automaticamente uma **Presigned URL** temporária (`GetObjectCommand` com `getSignedUrl`), preservando suporte nativo a HTTP Range requests diretamente da borda do S3/R2!

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
