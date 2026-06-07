(() => {
    const STORAGE_KEY = 'entregable1-tareas-v1';

    const dom = {
        form: document.getElementById('taskForm'),
        taskId: document.getElementById('taskId'),
        titulo: document.getElementById('titulo'),
        descripcion: document.getElementById('descripcion'),
        fechaVencimiento: document.getElementById('fechaVencimiento'),
        prioridad: document.getElementById('prioridad'),
        btnCancelar: document.getElementById('btnCancelar'),
        btnNueva: document.getElementById('btnNuevaDesdeTabla'),
        tbody: document.querySelector('#tablaTareas tbody'),
        sumTotal: document.getElementById('sumTotal'),
        sumAlta: document.getElementById('sumAlta'),
        sumVencidas: document.getElementById('sumVencidas'),
        sumSemana: document.getElementById('sumSemana'),
        btnConfirmDelete: document.getElementById('btnConfirmDelete')
    };

    const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
    let pendingDeleteId = null;

    function loadTasks() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                const sample = [
                    {
                        id: 1,
                        titulo: 'Diseñar navbar y estructura base',
                        descripcion: 'Implementar encabezado responsive y layout general.',
                        fechaVencimiento: addDays(2),
                        prioridad: 'Alta'
                    },
                    {
                        id: 2,
                        titulo: 'Crear tabla de tareas simuladas',
                        descripcion: 'Agregar datos de prueba y estilos de tabla responsiva.',
                        fechaVencimiento: addDays(4),
                        prioridad: 'Media'
                    },
                    {
                        id: 3,
                        titulo: 'Configurar modal de eliminación',
                        descripcion: 'Mostrar confirmación antes de borrar una tarea.',
                        fechaVencimiento: addDays(7),
                        prioridad: 'Baja'
                    }
                ];
                saveTasks(sample);
                return sample;
            }
            return JSON.parse(raw);
        } catch {
            return [];
        }
    }

    function saveTasks(tasks) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    }

    function addDays(days) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
    }

    function priorityBadge(priority) {
        if (priority === 'Alta') return '<span class="badge-priority badge-alta">Alta</span>';
        if (priority === 'Media') return '<span class="badge-priority badge-media">Media</span>';
        return '<span class="badge-priority badge-baja">Baja</span>';
    }

    function renderTable() {
        const tasks = loadTasks();

        if (!tasks.length) {
            dom.tbody.innerHTML = '<tr><td colspan="5" class="text-center table-empty py-4">No hay tareas registradas.</td></tr>';
            updateSummary(tasks);
            return;
        }

        dom.tbody.innerHTML = tasks
            .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento))
            .map((task) => `
                <tr>
                    <td class="fw-semibold">${escapeHtml(task.titulo)}</td>
                    <td>${escapeHtml(task.descripcion)}</td>
                    <td>${formatDate(task.fechaVencimiento)}</td>
                    <td>${priorityBadge(task.prioridad)}</td>
                    <td class="text-end">
                        <button class="btn btn-sm btn-outline-primary me-1" data-action="edit" data-id="${task.id}">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${task.id}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>`)
            .join('');

        updateSummary(tasks);
    }

    function updateSummary(tasks) {
        const today = new Date();
        const weekLimit = new Date();
        weekLimit.setDate(today.getDate() + 7);

        const alta = tasks.filter((t) => t.prioridad === 'Alta').length;
        const vencidas = tasks.filter((t) => new Date(t.fechaVencimiento) < stripTime(today)).length;
        const semana = tasks.filter((t) => {
            const due = new Date(t.fechaVencimiento);
            return due >= stripTime(today) && due <= weekLimit;
        }).length;

        dom.sumTotal.textContent = String(tasks.length);
        dom.sumAlta.textContent = String(alta);
        dom.sumVencidas.textContent = String(vencidas);
        dom.sumSemana.textContent = String(semana);
    }

    function stripTime(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    function formatDate(yyyyMmDd) {
        const [y, m, d] = yyyyMmDd.split('-');
        return `${d}/${m}/${y}`;
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function clearForm() {
        dom.taskId.value = '';
        dom.form.reset();
        dom.titulo.focus();
    }

    function setForm(task) {
        dom.taskId.value = String(task.id);
        dom.titulo.value = task.titulo;
        dom.descripcion.value = task.descripcion;
        dom.fechaVencimiento.value = task.fechaVencimiento;
        dom.prioridad.value = task.prioridad;
        dom.titulo.focus();
    }

    function upsertTask(event) {
        event.preventDefault();

        if (!dom.form.checkValidity()) {
            dom.form.classList.add('was-validated');
            return;
        }

        const tasks = loadTasks();
        const payload = {
            titulo: dom.titulo.value.trim(),
            descripcion: dom.descripcion.value.trim(),
            fechaVencimiento: dom.fechaVencimiento.value,
            prioridad: dom.prioridad.value
        };

        if (dom.taskId.value) {
            const id = Number(dom.taskId.value);
            const idx = tasks.findIndex((t) => t.id === id);
            if (idx !== -1) tasks[idx] = { ...tasks[idx], ...payload };
        } else {
            const nextId = tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1;
            tasks.push({ id: nextId, ...payload });
        }

        saveTasks(tasks);
        dom.form.classList.remove('was-validated');
        clearForm();
        renderTable();
    }

    function onTableClick(event) {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        const id = Number(button.dataset.id);
        const tasks = loadTasks();
        const task = tasks.find((t) => t.id === id);
        if (!task) return;

        if (button.dataset.action === 'edit') {
            setForm(task);
            document.getElementById('formulario').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        if (button.dataset.action === 'delete') {
            pendingDeleteId = id;
            deleteModal.show();
        }
    }

    function confirmDelete() {
        if (!pendingDeleteId) return;
        const tasks = loadTasks().filter((t) => t.id !== pendingDeleteId);
        saveTasks(tasks);
        pendingDeleteId = null;
        deleteModal.hide();
        renderTable();
    }

    dom.form.addEventListener('submit', upsertTask);
    dom.btnCancelar.addEventListener('click', () => {
        dom.form.classList.remove('was-validated');
        clearForm();
    });
    dom.btnNueva.addEventListener('click', () => {
        clearForm();
        document.getElementById('formulario').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    dom.tbody.addEventListener('click', onTableClick);
    dom.btnConfirmDelete.addEventListener('click', confirmDelete);

    renderTable();
})();

