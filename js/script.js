const taskInput = document.getElementById('taskInput');
const taskList = document.getElementById('taskList');
const langSelector = document.getElementById('langSelector');

const strings = {
    pt: { title: "// GERENCIADOR_DE_SISTEMA", placeholder: "> NOVA_TAREFA...", btn: "[EXECUTAR]" },
    en: { title: "// SYSTEM_TASK_MANAGER", placeholder: "> NEW_TASK...", btn: "[EXECUTE]" }
};

// Adicionar tarefa
document.getElementById('addTaskBtn').addEventListener('click', () => {
    if (!taskInput.value) return;
    const li = document.createElement('li');
    li.innerHTML = `<span>${taskInput.value}</span> <button onclick="this.parentElement.remove()">X</button>`;
    li.onclick = () => li.classList.toggle('done');
    taskList.appendChild(li);
    taskInput.value = '';
});

// Tradução dinâmica
langSelector.addEventListener('change', (e) => {
    const s = strings[e.target.value];
    document.getElementById('title').textContent = s.title;
    taskInput.placeholder = s.placeholder;
    document.getElementById('addTaskBtn').textContent = s.btn;
});

// Dark mode global
document.getElementById('toggleDarkMode').onclick = () => document.body.classList.toggle('light-theme');