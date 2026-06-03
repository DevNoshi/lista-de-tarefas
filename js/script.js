// ==========================================
// NEXUS TASK ENGINE // CORE_LOGIC_2026
// ==========================================

const state = { 
    tasks: JSON.parse(localStorage.getItem('tasks') || '[]') 
};

function render() {
    const list = document.getElementById('taskList');
    const prog = document.getElementById('prog-bar');
    const count = document.getElementById('count');
    
    // Atualizar métricas
    const total = state.tasks.length;
    const done = state.tasks.filter(t => t.done).length;
    
    if (prog) prog.style.width = total ? `${(done / total) * 100}%` : '0%';
    if (count) count.textContent = total;

    // Renderizar lista com os novos componentes fluidos
    list.innerHTML = state.tasks.map((t, i) => `
        <li class="task-item ${t.priority} ${t.done ? 'done' : ''}">
            <div>
                <strong>${t.text.toUpperCase()}</strong><br>
                <small style="opacity:0.6">${t.date || 'SEM PRAZO'}</small>
            </div>
            
            <div style="display:flex; gap:15px; align-items:center;">
                <div class="toggle-btn ${t.done ? 'active' : ''}" onclick="toggle(${i})"></div>
                
                <button class="btn-del" onclick="del(${i})">×</button>
            </div>
        </li>
    `).join('');
    
    // Persistência
    localStorage.setItem('tasks', JSON.stringify(state.tasks));
}

// Ações do Sistema
window.toggle = (i) => { 
    state.tasks[i].done = !state.tasks[i].done; 
    render(); 
};

window.del = (i) => { 
    state.tasks.splice(i, 1); 
    render(); 
};

// Evento Principal
document.getElementById('addTaskBtn').addEventListener('click', () => {
    const input = document.getElementById('taskInput');
    const date = document.getElementById('taskDate').value;
    const priority = document.getElementById('taskPriority').value;
    
    if (input.value.trim()) {
        state.tasks.push({ 
            text: input.value, 
            date: date, 
            priority: priority, 
            done: false 
        });
        input.value = ''; // Limpa o input após o envio
        render();
    }
});

// Relógio do Sistema
setInterval(() => {
    const clock = document.getElementById('clock');
    if(clock) clock.textContent = new Date().toLocaleTimeString();
}, 1000);

// Inicialização
render();

// ==========================================
// NEXUS DROID // LOGIC_ENGINE_2026
// ==========================================

function summonDroid() {
    // Array de piadas e zoeiras imersivas
    const jokes = [
        "ATUALIZAR ARQUIVOS MESTRES? DEVE SER MEU LANCE!",
        "CORRIGIR BUG DE SEGURANÇA? DEVE SER MEU LANCE!",
        "SINCRONIZAR COM A REDE CENTRAL? DEVE SER MEU LANCE!",
        "EXECUTAR BACKUP DE MEMÓRIA CRÍTICO? DEVE SER MEU LANCE!",
        "COMPILAR NOVO NÚCLEO DO SISTEMA? DEVE SER MEU LANCE!",
        "DÚVIDA? PERGUNTA AO ORÁCULO... DEVE SER MEU LANCE!"
    ];

    const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];

    const jokesList = [
        { text: randomJoke, date: "*DROID_SUMMON", priority: "low", done: false }
    ];

    // Adiciona a "zoeira" como uma nova tarefa de baixa prioridade (cyan)
    state.tasks.push(...jokesList);

    // Renderiza novamente a lista de tarefas para incluir a nova piada
    render();
}

document.getElementById('nexus-droid').addEventListener('click', summonDroid);