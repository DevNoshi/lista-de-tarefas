# Lista de Tarefas

Gerenciador de tarefas com estética minimalista dark, prioridades, progresso em tempo real e **lembretes que chegam mesmo com o navegador fechado** (PWA + Web Push).

## Como os lembretes funcionam

Um site não consegue rodar código com a aba fechada, então o aviso vem de fora:

1. O navegador cria uma *assinatura push* e o front a envia ao servidor junto com as tarefas que têm data futura.
2. O servidor (Node) confere a cada 20 s quais lembretes venceram e dispara um Web Push (VAPID) pelo serviço do próprio navegador (Google, Mozilla, Microsoft ou Apple).
3. O **service worker** (`public/sw.js`) recebe o push e mostra a notificação, mesmo sem nenhuma aba aberta.

As tarefas continuam no `localStorage`; o servidor guarda só uma cópia dos **lembretes pendentes** (texto, prioridade e horário) para poder avisar. Ao abrir o app, o front reenvia tudo, então o servidor se recupera sozinho se perder os dados.

## Tecnologias

- Front-end: HTML5, CSS3, JavaScript ES modules, Service Worker, Web App Manifest
- Back-end: Node.js 20+, Express, [`web-push`](https://github.com/web-push-libs/web-push)
- Persistência: `localStorage` (tarefas) e arquivo JSON no servidor (lembretes)

## Estrutura

```
├── server.js              # API, agendador e envio de push
├── package.json
├── .env.example
└── public/
    ├── index.html
    ├── manifest.webmanifest
    ├── sw.js              # push, clique na notificação e cache offline
    ├── css/style.css
    ├── js/
    │   ├── script.js      # tarefas e interface
    │   └── push.js        # permissão, assinatura e sincronização
    └── imgs/
```

## Como rodar

```bash
npm install
npm start          # http://localhost:3000
```

Em desenvolvimento as chaves VAPID são geradas sozinhas em `data/vapid.json`. Abra `http://localhost:3000` (service workers só funcionam em `localhost` ou HTTPS), clique em **Ativar lembretes**, aceite a permissão e crie uma tarefa com horário daqui a 1–2 minutos.

## Publicar

É preciso **HTTPS** e um processo Node **sempre ligado** (o agendador mora nele).

1. `npm run keys` e copie as chaves para as variáveis de ambiente (`.env.example` lista todas).
2. Configure `VAPID_SUBJECT` com um e-mail real e `TRUST_PROXY=1` se estiver atrás de proxy.
3. Aponte `DATA_DIR` para um disco persistente.
4. Planos gratuitos que "dormem" por inatividade (comum no Render e similares) atrasam ou perdem lembretes; use um plano sempre ativo ou uma VPS pequena.

> Trocar as chaves VAPID invalida as assinaturas antigas: cada usuário precisa clicar em *Ativar lembretes* de novo.

## Limitações

- **Android (Chrome/Firefox/Edge)**: funciona com o navegador fechado.
- **Windows/Linux (Chrome, Edge, Firefox)**: funciona com a janela fechada enquanto o navegador seguir em segundo plano. Se ele for encerrado por completo, o aviso só chega quando for aberto de novo.
- **macOS (Chrome)**: o navegador precisa estar aberto, mesmo sem janelas.
- **iPhone/iPad (iOS 16.4+)**: só funciona depois de *Compartilhar › Adicionar à Tela de Início* e abrindo o app por esse ícone.
- Os lembretes são por dispositivo: não há contas nem sincronização entre aparelhos.

## Evolução

- [ ] Avisar com antecedência (ex.: 15 min antes)
- [ ] Ações na notificação (Concluir / Adiar)
- [ ] Exportação de dados para JSON/CSV
- [ ] Modo "Deep Space" (paleta alternativa)
