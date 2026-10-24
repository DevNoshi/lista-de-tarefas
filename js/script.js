(() => {
  const $ = id => document.getElementById(id);
  const input = $('taskInput'), dateEl = $('taskDate'), prioEl = $('taskPriority');
  const list = $('taskList'), bar = $('prog-bar'), count = $('count'), clock = $('clock');
  const KEY = 'lista-de-tarefas';
  const WEIGHT = { high: 3, medium: 2, low: 1 };
  const LABEL = { high: 'Alta', medium: 'Média', low: 'Baixa' };
  let tasks = load(), filter = 'all';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(tasks)); } catch {}
  }

  // Relógio e data
  const pad = n => String(n).padStart(2, '0');
  function tick() {
    const d = new Date();
    clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    if (d.getSeconds() === 0) render(); // atualiza tarefas atrasadas
  }
  $('today').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  setInterval(tick, 1000); tick();

  function fmt(iso) {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function add() {
    const text = input.value.trim();
    if (!text) { input.focus(); input.classList.add('shake'); return; }
    tasks.push({ id: Date.now(), text, date: dateEl.value, priority: prioEl.value, done: false, fresh: true });
    input.value = ''; dateEl.value = '';
    save(); render(); input.focus();
  }

  function visible() {
    return tasks
      .filter(t => filter === 'all' || (filter === 'done') === t.done)
      .sort((a, b) =>
        a.done - b.done ||
        WEIGHT[b.priority] - WEIGHT[a.priority] ||
        (a.date || '9').localeCompare(b.date || '9'));
  }

  function row(t) {
    const li = document.createElement('li');
    li.className = `task ${t.priority}${t.done ? ' done' : ''}`;
    if (t.fresh) { li.classList.add('new'); delete t.fresh; }
    li.dataset.id = t.id;

    const check = document.createElement('button');
    check.className = 'check'; check.setAttribute('aria-label', t.done ? 'Marcar como pendente' : 'Concluir tarefa');
    check.setAttribute('aria-pressed', t.done);

    const body = document.createElement('div'); body.className = 'body';
    const title = document.createElement('span'); title.className = 'title'; title.textContent = t.text;
    const meta = document.createElement('span'); meta.className = 'meta';
    const late = t.date && !t.done && new Date(t.date) < new Date();
    meta.textContent = `${LABEL[t.priority]}${t.date ? ' · ' + fmt(t.date) : ''}${late ? ' · Atrasada' : ''}`;
    if (late) meta.classList.add('late');
    body.append(title, meta);

    const del = document.createElement('button');
    del.className = 'del'; del.setAttribute('aria-label', 'Excluir tarefa'); del.textContent = '×';

    li.append(check, body, del);
    return li;
  }

  function render() {
    list.replaceChildren();
    const items = visible();
    items.forEach(t => list.append(row(t)));
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = tasks.length ? 'Nenhuma tarefa neste filtro.' : 'Sem tarefas por aqui. Adicione a primeira acima.';
      list.append(li);
    }
    const done = tasks.filter(t => t.done).length;
    count.textContent = tasks.length - done;
    bar.style.width = tasks.length ? `${(done / tasks.length) * 100}%` : '0%';
  }

  // Eventos
  $('addTaskBtn').addEventListener('click', add);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  input.addEventListener('animationend', () => input.classList.remove('shake'));

  list.addEventListener('click', e => {
    const li = e.target.closest('.task'); if (!li) return;
    const t = tasks.find(x => x.id === Number(li.dataset.id));
    if (e.target.closest('.check')) { t.done = !t.done; save(); render(); }
    if (e.target.closest('.del')) {
      li.classList.add('out');
      setTimeout(() => { tasks = tasks.filter(x => x !== t); save(); render(); }, 250);
    }
  });

  document.querySelector('.filters').addEventListener('click', e => {
    const chip = e.target.closest('.chip[data-filter]'); if (!chip) return;
    filter = chip.dataset.filter;
    document.querySelectorAll('.chip[data-filter]').forEach(c => c.classList.toggle('active', c === chip));
    render();
  });
  $('clearDone').addEventListener('click', () => { tasks = tasks.filter(t => !t.done); save(); render(); });

  // Luz que segue o cursor (só com mouse)
  const glow = document.querySelector('.glow');
  if (matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let tx = innerWidth / 2, ty = innerHeight / 3, gx = tx, gy = ty;
    addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; });
    (function loop() {
      gx += (tx - gx) * 0.08; gy += (ty - gy) * 0.08;
      glow.style.transform = `translate(${gx}px, ${gy}px)`;
      requestAnimationFrame(loop);
    })();
  }

  render();
})();
