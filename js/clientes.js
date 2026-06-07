/* =====================================================
   RestaControl — Clientes Page Logic (API)
   CRUD conectado a backend Spring Boot
   ===================================================== */

(() => {
    const state = {
        search: '',
        activo: '',
        page: 1,
        size: 10,
        total: 0,
        clientes: [],
        deletingCliente: null
    };

    const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || 'http://localhost:7070';
    const API_CLIENTES = `${API_BASE}/api/clientes`;

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        bindEvents();
        loadClientes();
    }

    function bindEvents() {
        byId('busquedaClientes')?.addEventListener('input', (e) => {
            state.search = String(e.target.value || '').trim();
            state.page = 1;
            loadClientes();
        });

        byId('filtroEstadoClientes')?.addEventListener('change', (e) => {
            state.activo = String(e.target.value || '').trim();
            state.page = 1;
            loadClientes();
        });

        byId('btnActualizarClientes')?.addEventListener('click', () => loadClientes());
        byId('btnNuevoCliente')?.addEventListener('click', () => openForm());
        byId('btnGuardarCliente')?.addEventListener('click', onGuardarCliente);
        byId('btnConfirmarEliminarCliente')?.addEventListener('click', onEliminarCliente);

        byId('btnEditarDesdeVistaCliente')?.addEventListener('click', () => {
            const id = byId('btnEditarDesdeVistaCliente')?.dataset.id;
            if (!id) return;
            hideModal('modalView');
            openForm(id);
        });

        byId('btnPrevClientes')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (state.page <= 1 || getTotalPages() === 0) return;
            state.page -= 1;
            loadClientes();
        });

        byId('btnNextClientes')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (state.page >= getTotalPages() || getTotalPages() === 0) return;
            state.page += 1;
            loadClientes();
        });

        byId('clientesTableBody')?.addEventListener('click', async (event) => {
            const btn = event.target.closest('[data-action]');
            if (!btn) return;
            const id = String(btn.dataset.id || '').trim();
            if (!id) return;

            const action = btn.dataset.action;
            if (action === 'view') await openView(id);
            if (action === 'edit') await openForm(id);
            if (action === 'delete') await openDelete(id);
            if (action === 'toggle') await toggleEstado(id, btn.dataset.activo === 'true');
        });
    }

    async function loadClientes() {
        const params = new URLSearchParams({
            page: String(state.page),
            size: String(state.size)
        });

        if (state.search) params.set('search', state.search);
        if (state.activo) params.set('activo', state.activo === 'activo' ? 'true' : 'false');

        setTableLoading(true);

        try {
            const response = await fetch(`${API_CLIENTES}?${params.toString()}`);
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo listar clientes.');

            state.clientes = Array.isArray(payload)
                ? payload
                : (Array.isArray(payload?.data) ? payload.data : []);

            state.total = Number(payload?.total ?? state.clientes.length);
            if (typeof payload?.size === 'number' && payload.size > 0) state.size = payload.size;
            if (typeof payload?.page === 'number') state.page = payload.page <= 0 ? 1 : payload.page;

            renderTable();
        } catch (error) {
            state.clientes = [];
            state.total = 0;
            renderTable();
            showToast(error.message || 'Error cargando clientes.', 'danger');
        } finally {
            setTableLoading(false);
        }
    }

    function renderTable() {
        const tbody = byId('clientesTableBody');
        if (!tbody) return;

        if (!state.clientes.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No hay clientes para mostrar.</td></tr>';
            setText('clientesCount', 'Mostrando 0 registros');
            renderPagination();
            return;
        }

        tbody.innerHTML = state.clientes.map((c, index) => {
            const rowNum = ((state.page - 1) * state.size) + index + 1;
            const activo = toBool(c.activo);
            return `
                <tr>
                    <td><span class="record-id">#${rowNum}</span></td>
                    <td class="fw-semibold">${escapeHtml(c.nombres || '-')}</td>
                    <td>${escapeHtml(c.apellidos || '-')}</td>
                    <td><code>${escapeHtml(c.documento || '-')}</code></td>
                    <td>${escapeHtml(c.telefono || '-')}</td>
                    <td class="text-muted small">${escapeHtml(c.email || '-')}</td>
                    <td>${renderEstadoBadge(activo)}</td>
                    <td class="text-end"><div class="action-buttons">
                        <button class="btn-tbl" title="Ver" data-action="view" data-id="${escapeHtmlAttr(c.id)}"><i class="bi bi-eye text-info"></i></button>
                        <button class="btn-tbl" title="Editar" data-action="edit" data-id="${escapeHtmlAttr(c.id)}"><i class="bi bi-pencil text-warning"></i></button>
                        <button class="btn-tbl" title="${activo ? 'Inactivar' : 'Activar'}" data-action="toggle" data-id="${escapeHtmlAttr(c.id)}" data-activo="${String(activo)}"><i class="bi ${activo ? 'bi-pause-circle text-secondary' : 'bi-play-circle text-success'}"></i></button>
                        <button class="btn-tbl" title="Eliminar" data-action="delete" data-id="${escapeHtmlAttr(c.id)}"><i class="bi bi-trash text-danger"></i></button>
                    </div></td>
                </tr>
            `;
        }).join('');

        setText('clientesCount', `Mostrando ${state.clientes.length} de ${state.total} registros`);
        renderPagination();
    }

    function renderPagination() {
        const totalPages = getTotalPages();
        const current = totalPages === 0 ? 0 : state.page;

        setText('lblPaginaClientes', totalPages === 0 ? '-' : `${current} / ${totalPages}`);
        byId('liPrevClientes')?.classList.toggle('disabled', current <= 1);
        byId('liNextClientes')?.classList.toggle('disabled', totalPages === 0 || current >= totalPages);
    }

    function getTotalPages() {
        if (!state.total || !state.size || state.total <= 0 || state.size <= 0) return 0;
        return Math.ceil(state.total / state.size);
    }

    async function openView(id) {
        const c = await getClienteById(id);
        if (!c) return;

        setText('viewClienteId', String(c.codigo || c.id || '-'));
        setText('viewClienteNombres', c.nombres || '-');
        setText('viewClienteApellidos', c.apellidos || '-');
        setText('viewClienteDocumento', c.documento || '-');
        setText('viewClienteTelefono', c.telefono || '-');
        setText('viewClienteEmail', c.email || '-');

        const estado = byId('viewClienteEstado');
        if (estado) estado.innerHTML = renderEstadoBadge(toBool(c.activo));

        const btnEdit = byId('btnEditarDesdeVistaCliente');
        if (btnEdit) btnEdit.dataset.id = String(c.id);

        showModal('modalView');
    }

    async function openForm(id = null) {
        byId('formCliente')?.classList.remove('was-validated');

        if (!id) {
            setTextHtml('modalClienteTitle', '<i class="bi bi-people"></i>Nuevo Cliente');
            setValue('clienteId', '');
            setValue('clienteNombres', '');
            setValue('clienteApellidos', '');
            setValue('clienteTipoDocumento', 'DNI');
            setValue('clienteDocumento', '');
            setValue('clienteTelefono', '');
            setValue('clienteEmail', '');
            if (byId('swClienteActivo')) byId('swClienteActivo').checked = true;
            showModal('modalForm');
            return;
        }

        const c = await getClienteById(id);
        if (!c) return;

        setTextHtml('modalClienteTitle', '<i class="bi bi-pencil-square"></i>Editar Cliente');
        setValue('clienteId', String(c.id));
        setValue('clienteNombres', c.nombres || '');
        setValue('clienteApellidos', c.apellidos || '');
        setValue('clienteTipoDocumento', c.tipoDocumento || 'DNI');
        setValue('clienteDocumento', c.documento || '');
        setValue('clienteTelefono', c.telefono || '');
        setValue('clienteEmail', c.email || '');
        if (byId('swClienteActivo')) byId('swClienteActivo').checked = toBool(c.activo);

        showModal('modalForm');
    }

    async function onGuardarCliente() {
        byId('formCliente')?.classList.add('was-validated');

        const id = String(byId('clienteId')?.value || '').trim();
        const nombres = String(byId('clienteNombres')?.value || '').trim();
        const apellidos = String(byId('clienteApellidos')?.value || '').trim();
        const tipoDocumento = String(byId('clienteTipoDocumento')?.value || 'DNI').trim();
        const documento = String(byId('clienteDocumento')?.value || '').trim();
        const telefono = String(byId('clienteTelefono')?.value || '').trim();
        const email = String(byId('clienteEmail')?.value || '').trim();
        const activo = !!byId('swClienteActivo')?.checked;

        if (!nombres || !apellidos || !documento || documento.length < 8) {
            showToast('Completa nombres, apellidos y documento (mínimo 8).', 'danger');
            return;
        }

        const body = { nombres, apellidos, tipoDocumento, documento, telefono, email, activo };

        const isEdit = !!id;
        const url = isEdit ? `${API_CLIENTES}/${encodeURIComponent(id)}` : API_CLIENTES;

        try {
            const response = await fetch(url, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo guardar el cliente.');

            hideModal('modalForm');
            await loadClientes();
            showToast(payload?.message || (isEdit ? 'Cliente actualizado.' : 'Cliente creado.'), 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo guardar el cliente.', 'danger');
        }
    }

    async function openDelete(id) {
        const c = await getClienteById(id);
        if (!c) return;

        state.deletingCliente = c;
        const msg = byId('deleteClienteTexto');
        if (msg) {
            msg.innerHTML = `Se eliminará <strong>${escapeHtml(c.nombres || '')} ${escapeHtml(c.apellidos || '')}</strong>. Esta acción lo dejará inactivo.`;
        }
        showModal('modalDelete');
    }

    async function onEliminarCliente() {
        if (!state.deletingCliente) return;

        try {
            const response = await fetch(`${API_CLIENTES}/${encodeURIComponent(state.deletingCliente.id)}`, {
                method: 'DELETE'
            });
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo eliminar el cliente.');

            hideModal('modalDelete');
            state.deletingCliente = null;
            await loadClientes();
            showToast(payload?.message || 'Cliente eliminado.', 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo eliminar el cliente.', 'danger');
        }
    }

    async function toggleEstado(id, activoActual) {
        try {
            const response = await fetch(`${API_CLIENTES}/${encodeURIComponent(id)}/estado`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activo: !activoActual })
            });
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo actualizar el estado.');

            await loadClientes();
            showToast(payload?.message || 'Estado actualizado.', 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo actualizar el estado.', 'danger');
        }
    }

    async function getClienteById(id) {
        const local = state.clientes.find((x) => String(x.id) === String(id));
        if (local) return local;

        try {
            const response = await fetch(`${API_CLIENTES}/${encodeURIComponent(id)}`);
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo obtener el cliente.');
            return payload?.data || payload;
        } catch (error) {
            showToast(error.message || 'No se pudo obtener el cliente.', 'danger');
            return null;
        }
    }

    function setTableLoading(loading) {
        const tbody = byId('clientesTableBody');
        if (!tbody || !loading) return;
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm me-2"></div>Cargando...</td></tr>';
    }

    function renderEstadoBadge(activo) {
        return activo
            ? '<span class="badge-pill bp-success"><i class="bi bi-check-circle-fill"></i>Activo</span>'
            : '<span class="badge-pill bp-danger"><i class="bi bi-x-circle-fill"></i>Inactivo</span>';
    }

    function showToast(message, variant = 'success') {
        if (typeof bootstrap === 'undefined') {
            window.alert(message);
            return;
        }

        const container = ensureToastContainer();
        const icon = variant === 'danger' ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill';
        const wrapper = document.createElement('div');
        wrapper.className = `toast align-items-center text-bg-${variant} border-0`;
        wrapper.setAttribute('role', 'alert');
        wrapper.setAttribute('aria-live', 'assertive');
        wrapper.setAttribute('aria-atomic', 'true');
        wrapper.innerHTML = `
            <div class="d-flex">
                <div class="toast-body"><i class="bi ${icon} me-2"></i>${escapeHtml(message)}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Cerrar"></button>
            </div>
        `;
        container.appendChild(wrapper);
        const toast = bootstrap.Toast.getOrCreateInstance(wrapper, { delay: 2600 });
        toast.show();
        wrapper.addEventListener('hidden.bs.toast', () => wrapper.remove());
    }

    function ensureToastContainer() {
        let container = byId('clientesToastContainer');
        if (container) return container;
        container = document.createElement('div');
        container.id = 'clientesToastContainer';
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '1100';
        document.body.appendChild(container);
        return container;
    }

    async function safeJson(response) {
        try { return await response.json(); } catch { return null; }
    }

    function toBool(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') return value.toLowerCase() === 'true';
        return !!value;
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
    function setText(id, text) { const el = byId(id); if (el) el.textContent = text; }
    function setTextHtml(id, html) { const el = byId(id); if (el) el.innerHTML = html; }
    function setValue(id, val) { const el = byId(id); if (el) el.value = val; }

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
