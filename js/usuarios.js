/* =====================================================
   RestaControl — Usuarios Page Logic (API)
   CRUD conectado a backend Spring Boot
   ===================================================== */

(() => {
    const state = {
        search: '',
        rol: '',
        activo: '',
        page: 1,
        size: 10,
        total: 0,
        usuarios: [],
        editingId: null,
        deletingUser: null
    };

    const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || 'http://localhost:7070';
    const API_USERS = `${API_BASE}/api/usuarios`;

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        bindEvents();
        loadUsuarios();
    }

    function bindEvents() {
        byId('busquedaUsuarios')?.addEventListener('input', (e) => {
            state.search = String(e.target.value || '').trim();
            state.page = 1;
            loadUsuarios();
        });

        byId('filtroRolUsuarios')?.addEventListener('change', (e) => {
            state.rol = String(e.target.value || '').trim();
            state.page = 1;
            loadUsuarios();
        });

        byId('filtroEstadoUsuarios')?.addEventListener('change', (e) => {
            state.activo = String(e.target.value || '').trim();
            state.page = 1;
            loadUsuarios();
        });

        byId('btnActualizarUsuarios')?.addEventListener('click', () => loadUsuarios());
        byId('btnPrevUsuarios')?.addEventListener('click', (e) => {
            e.preventDefault();
            const totalPages = getTotalPages();
            if (state.page <= 1 || totalPages === 0) return;
            state.page -= 1;
            loadUsuarios();
        });

        byId('btnNextUsuarios')?.addEventListener('click', (e) => {
            e.preventDefault();
            const totalPages = getTotalPages();
            if (state.page >= totalPages || totalPages === 0) return;
            state.page += 1;
            loadUsuarios();
        });

        byId('btnNuevoUsuario')?.addEventListener('click', () => openForm());
        byId('btnGuardarUsuario')?.addEventListener('click', onGuardarUsuario);
        byId('btnConfirmarEliminarUsuario')?.addEventListener('click', onEliminarUsuario);
        byId('btnEditarDesdeVista')?.addEventListener('click', () => {
            const id = byId('btnEditarDesdeVista')?.dataset.id;
            if (!id) return;
            hideModal('modalView');
            openForm(id);
        });

        byId('usuariosTableBody')?.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const id = btn.dataset.id;
            const action = btn.dataset.action;
            if (!id || !action) return;

            if (action === 'view') {
                await openView(id);
            } else if (action === 'edit') {
                await openForm(id);
            } else if (action === 'delete') {
                await openDelete(id);
            } else if (action === 'toggle') {
                await toggleEstado(id, btn.dataset.activo === 'true');
            }
        });
    }

    async function loadUsuarios() {
        const params = new URLSearchParams({
            page: String(state.page),
            size: String(state.size)
        });

        if (state.search) params.set('search', state.search);
        if (state.rol) params.set('rol', state.rol);
        if (state.activo) params.set('activo', state.activo === 'activo' ? 'true' : 'false');

        try {
            const response = await fetch(`${API_USERS}?${params.toString()}`);
            const payload = await safeJson(response);

            if (!response.ok) {
                throw new Error(payload?.message || 'No se pudo obtener la lista de usuarios.');
            }

            state.usuarios = Array.isArray(payload)
                ? payload
                : (Array.isArray(payload?.data) ? payload.data : []);

            state.total = Number(payload?.total ?? state.usuarios.length);

            if (typeof payload?.size === 'number' && payload.size > 0) {
                state.size = payload.size;
            }

            if (typeof payload?.page === 'number') {
                state.page = payload.page <= 0 ? 1 : payload.page;
            }

            renderTable();
        } catch (error) {
            state.usuarios = [];
            state.total = 0;
            renderTable();
            showError(error.message || 'Error cargando usuarios.');
        }
    }

    function renderTable() {
        const tbody = byId('usuariosTableBody');
        if (!tbody) return;

        if (!state.usuarios.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No hay usuarios para mostrar.</td></tr>';
            setText('usuariosCount', 'Mostrando 0 registros');
            renderPagination();
            return;
        }

        tbody.innerHTML = state.usuarios.map((u, idx) => {
            const rowNumber = ((state.page - 1) * state.size) + idx + 1;
            const activo = toBool(u.activo);
            return `
                <tr>
                    <td><span class="record-id">#${rowNumber}</span></td>
                    <td class="fw-semibold">${escapeHtml(u.nombres || '-')}</td>
                    <td>${escapeHtml(u.apellidos || '-')}</td>
                    <td>${renderRolBadge(u.rol)}</td>
                    <td>${renderEstadoBadge(activo)}</td>
                    <td class="text-end">
                        <div class="action-buttons">
                            <button class="btn-tbl" title="Ver" data-action="view" data-id="${escapeHtmlAttr(u.id)}"><i class="bi bi-eye text-info"></i></button>
                            <button class="btn-tbl" title="Editar" data-action="edit" data-id="${escapeHtmlAttr(u.id)}"><i class="bi bi-pencil text-warning"></i></button>
                            <button class="btn-tbl" title="${activo ? 'Inactivar' : 'Activar'}" data-action="toggle" data-id="${escapeHtmlAttr(u.id)}" data-activo="${String(activo)}"><i class="bi ${activo ? 'bi-pause-circle text-secondary' : 'bi-play-circle text-success'}"></i></button>
                            <button class="btn-tbl" title="Eliminar" data-action="delete" data-id="${escapeHtmlAttr(u.id)}"><i class="bi bi-trash text-danger"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        const shown = state.usuarios.length;
        setText('usuariosCount', `Mostrando ${shown} de ${state.total} registros`);
        renderPagination();
    }

    function renderPagination() {
        const totalPages = getTotalPages();
        const current = totalPages === 0 ? 0 : state.page;

        setText('lblPaginaUsuarios', totalPages === 0 ? '-' : `${current} / ${totalPages}`);

        const prev = byId('liPrevUsuarios');
        const next = byId('liNextUsuarios');

        prev?.classList.toggle('disabled', current <= 1);
        next?.classList.toggle('disabled', totalPages === 0 || current >= totalPages);
    }

    function getTotalPages() {
        if (!state.total || state.total <= 0 || !state.size || state.size <= 0) return 0;
        return Math.ceil(state.total / state.size);
    }

    async function openView(id) {
        const user = await getUsuarioById(id);
        if (!user) return;

        setText('viewUsuarioId', String(user.codigo || user.id || '-'));
        setText('viewUsuarioNombres', user.nombres || '-');
        setText('viewUsuarioApellidos', user.apellidos || '-');

        const rolWrap = byId('viewUsuarioRol');
        if (rolWrap) rolWrap.innerHTML = renderRolBadge(user.rol);

        const estadoWrap = byId('viewUsuarioEstado');
        if (estadoWrap) estadoWrap.innerHTML = renderEstadoBadge(toBool(user.activo));

        const btnEdit = byId('btnEditarDesdeVista');
        if (btnEdit) btnEdit.dataset.id = String(user.id);

        showModal('modalView');
    }

    async function openForm(id = null) {
        state.editingId = id;

        const form = byId('formUsuario');
        form?.classList.remove('was-validated');

        const title = byId('modalUsuarioTitle');
        const passwordBlock = byId('passwordBlock');

        if (!id) {
            if (title) title.innerHTML = '<i class="bi bi-person-badge"></i>Nuevo Usuario';
            setValue('usuarioId', '');
            setValue('nombresUsuario', '');
            setValue('apellidosUsuario', '');
            setValue('usernameUsuario', '');
            setValue('rolUsuario', '');
            setValue('passwordUsuario', '');
            if (byId('swUsuarioActivo')) byId('swUsuarioActivo').checked = true;
            if (passwordBlock) passwordBlock.style.display = '';
            showModal('modalForm');
            return;
        }

        const user = await getUsuarioById(id);
        if (!user) return;

        if (title) title.innerHTML = '<i class="bi bi-pencil-square"></i>Editar Usuario';
        setValue('usuarioId', String(user.id));
        setValue('nombresUsuario', user.nombres || '');
        setValue('apellidosUsuario', user.apellidos || '');
        setValue('usernameUsuario', user.username || '');
        setValue('rolUsuario', user.rol || '');
        setValue('passwordUsuario', '');
        if (byId('swUsuarioActivo')) byId('swUsuarioActivo').checked = toBool(user.activo);
        if (passwordBlock) passwordBlock.style.display = 'none';

        showModal('modalForm');
    }

    async function onGuardarUsuario() {
        const form = byId('formUsuario');
        form?.classList.add('was-validated');

        const id = String(byId('usuarioId')?.value || '').trim();
        const nombres = String(byId('nombresUsuario')?.value || '').trim();
        const apellidos = String(byId('apellidosUsuario')?.value || '').trim();
        const username = String(byId('usernameUsuario')?.value || '').trim();
        const rol = String(byId('rolUsuario')?.value || '').trim();
        const password = String(byId('passwordUsuario')?.value || '').trim();
        const activo = !!byId('swUsuarioActivo')?.checked;

        if (!nombres || !apellidos || !username || !rol || (!id && !password)) {
            showError('Completa todos los campos obligatorios.');
            return;
        }

        const payload = { nombres, apellidos, username, rol, activo };
        if (!id) payload.password = password;

        const isUpdate = !!id;
        const url = isUpdate ? `${API_USERS}/${encodeURIComponent(id)}` : API_USERS;

        try {
            const response = await fetch(url, {
                method: isUpdate ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await safeJson(response);
            if (!response.ok) {
                throw new Error(data?.message || 'No se pudo guardar el usuario.');
            }

            hideModal('modalForm');
            await loadUsuarios();
            showInfo(data?.message || (isUpdate ? 'Usuario actualizado.' : 'Usuario creado.'));
        } catch (error) {
            showError(error.message || 'No se pudo guardar el usuario.');
        }
    }

    async function openDelete(id) {
        const user = await getUsuarioById(id);
        if (!user) return;
        state.deletingUser = user;

        const msg = byId('deleteUsuarioTexto');
        if (msg) {
            msg.innerHTML = `Se eliminará <strong>${escapeHtml(user.nombres || '')} ${escapeHtml(user.apellidos || '')}</strong>. Esta acción lo dejará inactivo.`;
        }

        showModal('modalDelete');
    }

    async function onEliminarUsuario() {
        if (!state.deletingUser) return;

        const session = Auth.getSession();
        const headers = {};
        if (session?.username) {
            headers['X-Current-Username'] = session.username;
        }

        try {
            const response = await fetch(`${API_USERS}/${encodeURIComponent(state.deletingUser.id)}`, {
                method: 'DELETE',
                headers
            });

            const data = await safeJson(response);
            if (!response.ok) {
                throw new Error(data?.message || 'No se pudo eliminar el usuario.');
            }

            state.deletingUser = null;
            hideModal('modalDelete');
            await loadUsuarios();
            showInfo(data?.message || 'Usuario eliminado.');
        } catch (error) {
            showError(error.message || 'No se pudo eliminar el usuario.');
        }
    }

    async function toggleEstado(id, activoActual) {
        try {
            const response = await fetch(`${API_USERS}/${encodeURIComponent(id)}/estado`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ activo: !activoActual })
            });

            const data = await safeJson(response);
            if (!response.ok) {
                throw new Error(data?.message || 'No se pudo actualizar el estado.');
            }

            await loadUsuarios();
            showInfo(data?.message || 'Estado actualizado.');
        } catch (error) {
            showError(error.message || 'No se pudo actualizar el estado.');
        }
    }

    async function getUsuarioById(id) {
        const local = state.usuarios.find((u) => String(u.id) === String(id));
        if (local) return local;

        try {
            const response = await fetch(`${API_USERS}/${encodeURIComponent(id)}`);
            const data = await safeJson(response);
            if (!response.ok) throw new Error(data?.message || 'No se pudo obtener el usuario.');
            return data?.data || data;
        } catch (error) {
            showError(error.message || 'No se pudo obtener el usuario.');
            return null;
        }
    }

    function showInfo(message) {
        if (message) showToast(message, 'success');
    }

    function showError(message) {
        if (message) showToast(message, 'danger');
    }

    function showToast(message, variant = 'success') {
        if (typeof bootstrap === 'undefined') {
            window.alert(message);
            return;
        }

        const container = ensureToastContainer();
        const toastId = `toast-${Date.now()}`;
        const icon = variant === 'danger' ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill';
        const title = variant === 'danger' ? 'Error' : 'Exito';

        const wrapper = document.createElement('div');
        wrapper.className = `toast align-items-center text-bg-${variant} border-0`;
        wrapper.id = toastId;
        wrapper.setAttribute('role', 'alert');
        wrapper.setAttribute('aria-live', 'assertive');
        wrapper.setAttribute('aria-atomic', 'true');
        wrapper.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    <i class="bi ${icon} me-2"></i>${escapeHtml(message)}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;

        container.appendChild(wrapper);
        const toast = bootstrap.Toast.getOrCreateInstance(wrapper, { delay: 2600 });
        toast.show();

        wrapper.addEventListener('hidden.bs.toast', () => {
            wrapper.remove();
        });
    }

    function ensureToastContainer() {
        let container = byId('usuariosToastContainer');
        if (container) return container;

        container = document.createElement('div');
        container.id = 'usuariosToastContainer';
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '1100';
        document.body.appendChild(container);
        return container;
    }

    async function safeJson(response) {
        try {
            return await response.json();
        } catch {
            return null;
        }
    }

    function toBool(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') return value.toLowerCase() === 'true';
        return !!value;
    }

    function renderRolBadge(rol) {
        const clean = String(rol || 'Sin rol');
        const normalized = clean.toLowerCase();

        if (normalized === 'administrador') return '<span class="badge-pill bp-orange"><i class="bi bi-shield-fill"></i>Administrador</span>';
        if (normalized === 'recepcion') return '<span class="badge-pill bp-info"><i class="bi bi-headset"></i>Recepcion</span>';
        if (normalized === 'mozo') return '<span class="badge-pill bp-purple"><i class="bi bi-person-walking"></i>Mozo</span>';
        if (normalized === 'cajero') return '<span class="badge-pill bp-teal"><i class="bi bi-cash-coin"></i>Cajero</span>';
        if (normalized === 'cocinero' || normalized === 'cocina') return '<span class="badge-pill bp-gray"><i class="bi bi-fire"></i>Cocinero</span>';

        return `<span class="badge-pill bp-gray"><i class="bi bi-person-badge"></i>${escapeHtml(clean)}</span>`;
    }

    function renderEstadoBadge(activo) {
        return activo
            ? '<span class="badge-pill bp-success"><i class="bi bi-check-circle-fill"></i>Activo</span>'
            : '<span class="badge-pill bp-danger"><i class="bi bi-x-circle-fill"></i>Inactivo</span>';
    }

    function showModal(id) {
        const el = byId(id);
        if (!el || typeof bootstrap === 'undefined') return;
        bootstrap.Modal.getOrCreateInstance(el).show();
    }

    function hideModal(id) {
        const el = byId(id);
        if (!el || typeof bootstrap === 'undefined') return;
        bootstrap.Modal.getOrCreateInstance(el).hide();
    }

    function byId(id) { return document.getElementById(id); }
    function setValue(id, value) { const el = byId(id); if (el) el.value = value; }
    function setText(id, text) { const el = byId(id); if (el) el.textContent = text; }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function escapeHtmlAttr(value) {
        return escapeHtml(value).replace(/`/g, '&#096;');
    }
})();
