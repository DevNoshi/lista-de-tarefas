const API = '/api';
const DEBOUNCE_MS = 400;

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('Service worker:', err));
  }
}

const post = (path, body) => fetch(API + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

function urlBase64ToUint8Array(b64) {
  const padded = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

function sameKey(buffer, bytes) {
  if (!buffer) return false;
  const a = new Uint8Array(buffer);
  return a.length === bytes.length && a.every((v, i) => v === bytes[i]);
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

// 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on'
export async function getState() {
  if (!supported) return isIOS && !isStandalone() ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await currentSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

// Precisa ser chamado direto de um clique (o navegador exige gesto do usuário para pedir permissão).
export async function enable() {
  if ((await Notification.requestPermission()) !== 'granted') return false;

  const reg = await navigator.serviceWorker.ready;
  const res = await fetch(`${API}/vapid-public-key`);
  if (!res.ok) throw new Error('Servidor indisponível');
  const appKey = urlBase64ToUint8Array((await res.json()).key);

  let sub = await reg.pushManager.getSubscription();
  // Se as chaves do servidor mudaram, a assinatura antiga não serve mais
  if (sub && !sameKey(sub.options.applicationServerKey, appKey)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
  return !!sub;
}

export async function disable() {
  const sub = await currentSubscription();
  if (!sub) return;
  await post('/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

export async function sendTest() {
  const sub = await currentSubscription();
  if (!sub) return false;
  return (await post('/test', { subscription: sub.toJSON() })).ok;
}

// Só lembretes futuros, de tarefas pendentes. A data do input vem sem fuso, então
// convertemos para UTC (ISO) aqui, no navegador que sabe o fuso do usuário.
const toReminders = tasks => tasks
  .filter(t => !t.done && t.date && new Date(t.date).getTime() > Date.now())
  .map(t => ({ id: String(t.id), text: t.text, priority: t.priority, dueAt: new Date(t.date).toISOString() }));

let latest = null;
let timer;

async function flush() {
  if (!latest || !supported || Notification.permission !== 'granted') return false;
  const sub = await currentSubscription();
  if (!sub) return false;
  try {
    const res = await post('/sync', { subscription: sub.toJSON(), reminders: toReminders(latest) });
    if (!res.ok) console.warn('Sincronização recusada:', res.status);
    return res.ok;
  } catch (err) {
    console.warn('Sincronização adiada (sem conexão?)', err);
    return false;
  }
}

// Chamado a cada mudança nas tarefas. Agrupa rajadas de mudanças numa só requisição.
export function sync(tasks, immediate = false) {
  latest = tasks;
  clearTimeout(timer);
  if (immediate) return flush();
  timer = setTimeout(flush, DEBOUNCE_MS);
  return Promise.resolve(true);
}

addEventListener('online', flush);
