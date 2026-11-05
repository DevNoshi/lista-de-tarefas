import express from 'express';
import webpush from 'web-push';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const CHECK_EVERY_MS = Number(process.env.CHECK_EVERY_MS) || 20_000;
const MAX_REMINDERS = 200;            // por dispositivo
const MAX_LATE_MS = 24 * 60 * 60e3;   // não avisa tarefas vencidas há mais de 24h
const MAX_TRIES = 3;
const PRIORITIES = { low: 'baixa', medium: 'média', high: 'alta' };

// Só aceitamos endpoints dos serviços de push dos navegadores.
// Sem isso, qualquer cliente poderia fazer o servidor chamar URLs arbitrárias (SSRF).
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,                 // Chrome, Brave, Opera, Android
  /(^|\.)push\.services\.mozilla\.com$/,    // Firefox
  /(^|\.)notify\.windows\.com$/,            // Edge
  /(^|\.)push\.apple\.com$/,                // Safari / iOS
];

fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- VAPID ----------
function loadVapid() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    return { publicKey: VAPID_PUBLIC_KEY, privateKey: VAPID_PRIVATE_KEY };
  }
  const file = path.join(DATA_DIR, 'vapid.json');
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* gera abaixo */ }
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
  console.warn('[vapid] Chaves geradas em data/vapid.json. Em produção, defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.');
  return keys;
}
const vapid = loadVapid();
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:contato@example.com', vapid.publicKey, vapid.privateKey);

// ---------- "Banco" em arquivo JSON ----------
// devices[hash(endpoint)] = { subscription, reminders: [{ id, text, priority, dueAt, sent, tries }], updatedAt }
function loadDb() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return data && typeof data.devices === 'object' ? data : { devices: {} };
  } catch { return { devices: {} }; }
}
let db = loadDb();
function saveDb() {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE); // escrita atômica
}
const deviceKey = endpoint => createHash('sha256').update(endpoint).digest('hex');

// ---------- Validação ----------
function validSubscription(s) {
  if (!s || typeof s !== 'object') return false;
  const { endpoint, keys } = s;
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  let url;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== 'https:' || !PUSH_HOSTS.some(re => re.test(url.hostname))) return false;
  return !!keys
    && typeof keys.p256dh === 'string' && keys.p256dh.length <= 200
    && typeof keys.auth === 'string' && keys.auth.length <= 100;
}
const cleanSubscription = s => ({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } });

function cleanReminders(list) {
  if (!Array.isArray(list) || list.length > MAX_REMINDERS) return null;
  const byId = new Map();
  for (const r of list) {
    const due = Date.parse(r?.dueAt);
    const id = String(r?.id ?? '').slice(0, 40);
    if (!id || Number.isNaN(due) || !(r.priority in PRIORITIES)) return null;
    byId.set(id, {
      id,
      text: String(r.text ?? '').trim().slice(0, 120),
      priority: r.priority,
      dueAt: new Date(due).toISOString(),
      sent: false,
      tries: 0,
    });
  }
  return [...byId.values()];
}

// ---------- Push ----------
const send = (subscription, payload) =>
  webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 6 * 60 * 60, urgency: 'high' });

const isGone = err => err?.statusCode === 404 || err?.statusCode === 410;

let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const now = Date.now();
    let changed = false;

    for (const [key, device] of Object.entries(db.devices)) {
      for (const r of device.reminders) {
        if (r.sent) continue;
        const due = Date.parse(r.dueAt);
        if (due > now) continue;

        changed = true;
        if (now - due > MAX_LATE_MS) { r.sent = true; continue; }

        try {
          await send(device.subscription, {
            title: 'Lembrete de tarefa',
            body: `${r.text} · Prioridade ${PRIORITIES[r.priority]}`,
            tag: `task-${r.id}`,
            url: '/',
          });
          r.sent = true;
        } catch (err) {
          if (isGone(err)) { delete db.devices[key]; break; } // assinatura expirou/foi revogada
          r.tries += 1;
          if (r.tries >= MAX_TRIES) r.sent = true;
          console.error(`[push] falha (${err?.statusCode ?? err?.message}) tentativa ${r.tries}`);
        }
      }
      // limpa o que já foi enviado há mais de 24h
      if (db.devices[key]) {
        device.reminders = device.reminders.filter(r => !(r.sent && now - Date.parse(r.dueAt) > MAX_LATE_MS));
      }
    }
    if (changed) saveDb();
  } finally {
    ticking = false;
  }
}

// ---------- API ----------
const app = express();
app.set('trust proxy', process.env.TRUST_PROXY ? 1 : false);
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  next();
});
app.use(express.json({ limit: '50kb' }));

// Limite simples por IP: 60 requisições/minuto nas rotas de escrita
const hits = new Map();
setInterval(() => hits.clear(), 60_000).unref();
function limiter(req, res, next) {
  const n = (hits.get(req.ip) ?? 0) + 1;
  hits.set(req.ip, n);
  if (n > 60) return res.status(429).json({ error: 'muitas requisições' });
  next();
}

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/api/vapid-public-key', (_req, res) => res.json({ key: vapid.publicKey }));

// O cliente manda sua lista inteira de lembretes futuros; o servidor substitui a anterior.
// Idempotente: se o servidor perder os dados, a próxima sincronização reconstrói tudo.
app.post('/api/sync', limiter, (req, res) => {
  const { subscription, reminders } = req.body ?? {};
  if (!validSubscription(subscription)) return res.status(400).json({ error: 'subscription inválida' });
  const next = cleanReminders(reminders);
  if (!next) return res.status(400).json({ error: 'lembretes inválidos' });

  const key = deviceKey(subscription.endpoint);
  const prev = db.devices[key]?.reminders ?? [];
  for (const r of next) {
    const old = prev.find(p => p.id === r.id && p.dueAt === r.dueAt);
    if (old) { r.sent = old.sent; r.tries = old.tries; } // não reenvia o que já foi avisado
  }
  db.devices[key] = { subscription: cleanSubscription(subscription), reminders: next, updatedAt: Date.now() };
  saveDb();
  res.json({ ok: true, count: next.length });
});

app.post('/api/unsubscribe', limiter, (req, res) => {
  const { endpoint } = req.body ?? {};
  if (typeof endpoint === 'string') {
    delete db.devices[deviceKey(endpoint)];
    saveDb();
  }
  res.json({ ok: true });
});

app.post('/api/test', limiter, async (req, res) => {
  const { subscription } = req.body ?? {};
  if (!validSubscription(subscription)) return res.status(400).json({ error: 'subscription inválida' });
  try {
    await send(cleanSubscription(subscription), {
      title: 'Lembretes ativados',
      body: 'Você será avisado no horário das tarefas, mesmo com o navegador fechado.',
      tag: 'test',
      url: '/',
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[test]', err?.statusCode ?? err?.message);
    res.status(502).json({ error: 'falha ao enviar' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: 'requisição inválida' });
});

// ---------- Start ----------
const timer = setInterval(tick, CHECK_EVERY_MS);
const server = app.listen(PORT, () => console.log(`Lista de Tarefas em http://localhost:${PORT}`));

function shutdown() {
  clearInterval(timer);
  server.close(() => { saveDb(); process.exit(0); });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
