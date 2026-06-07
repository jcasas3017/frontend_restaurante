/* =====================================================
   RestaControl — Mesas Page Logic (API)
   CRUD conectado a backend Spring Boot
   ===================================================== */

(() => {
    const state = {
        search: '',
        estado: '',
        activo: '',
        page: 1,
        size: 10,
        total: 0,
        mesas: [],
        estados: [],
        deletingMesa: null
    };

    const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || 'http://localhost:7070';
    const API_MESAS = `${API_BASE}/api/mesas`;
    const API_ESTADOS = `${API_MESAS}/estados`;
    const API_NEXT_CODIGO = `${API_MESAS}/next-codigo`;
    const CATALOG_STATES = ['disponible', 'mantenimiento'];

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        bindEvents();
        await loadEstados();
        await loadMesas();
    }

    function bindEvents() {
        byId('busquedaMesas')?.addEventListener('input', (e) => {
            state.search = String(e.target.value || '').trim();
            state.page = 1;
            loadMesas();
        });

        byId('filtroSituacionMesas')?.addEventListener('change', (e) => {
            state.estado = String(e.target.value || '').trim();
            state.page = 1;
            loadMesas();
        });

        byId('filtroActivoMesas')?.addEventListener('change', (e) => {
            state.activo = String(e.target.value || '').trim();
            state.page = 1;
            loadMesas();
        });

        byId('btnActualizarMesas')?.addEventListener('click', () => loadMesas());
        byId('btnNuevaMesa')?.addEventListener('click', () => openForm());
        byId('btnGuardarMesa')?.addEventListener('click', onGuardarMesa);
        byId('btnConfirmarEliminarMesa')?.addEventListener('click', onEliminarMesa);

        byId('btnEditarDesdeVistaMesa')?.addEventListener('click', () => {
            const id = byId('btnEditarDesdeVistaMesa')?.dataset.id;
            if (!id) return;
            hideModal('modalView');
            openForm(id);
        });

        byId('btnPrevMesas')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (state.page <= 1 || getTotalPages() === 0) return;
            state.page -= 1;
            loadMesas();
        });

        byId('btnNextMesas')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (state.page >= getTotalPages() || getTotalPages() === 0) return;
            state.page += 1;
            loadMesas();
        });

        byId('mesasTableBody')?.addEventListener('click', async (event) => {
            const btn = event.target.closest('[data-action]');
            if (!btn) return;
            const id = String(btn.dataset.id || '').trim();
            if (!id) return;

            const action = btn.dataset.action;
            if (action === 'view') await openView(id);
            if (action === 'edit') await openForm(id);
            if (action === 'delete') await openDelete(id);
            if (action === 'toggle-activo') await toggleActivo(id, btn.dataset.activo === 'true');
            if (action === 'toggle-situacion') await toggleSituacion(id, btn.dataset.estado || '');
        });
    }

    async function loadEstados() {
        try {
            const response = await fetch(API_ESTADOS);
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo cargar estados de mesa.');

            const raw = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
            state.estados = raw
                .map(normalizeEstado)
                .filter((x) => x && CATALOG_STATES.includes(x.value));

            if (!state.estados.length) {
                state.estados = [
                    { value: 'disponible', label: 'Disponible' },
                    { value: 'mantenimiento', label: 'Mantenimiento' }
                ];
            }
        } catch {
            state.estados = [
                { value: 'disponible', label: 'Disponible' },
                { value: 'mantenimiento', label: 'Mantenimiento' }
            ];
        }

        renderEstadoOptions();
    }

    function normalizeEstado(item) {
        if (item == null) return null;
        if (typeof item === 'string') {
            const value = item.trim().toLowerCase();
            if (!value) return null;
            return { value, label: toTitleCase(value) };
        }
        if (typeof item !== 'object') return null;

        const value = String(item.value ?? item.codigo ?? item.id ?? item.estado ?? '').trim().toLowerCase();
        const label = String(item.label ?? item.nombre ?? item.descripcion ?? value).trim();
        if (!value) return null;
        return { value, label: label || toTitleCase(value) };
    }

    function renderEstadoOptions() {
        const filtro = byId('filtroSituacionMesas');
        const form = byId('mesaEstado');

        const options = state.estados
            .map((x) => `<option value="${escapeHtmlAttr(x.value)}">${escapeHtml(x.label)}</option>`)
            .join('');

        if (filtro) filtro.innerHTML = '<option value="">Todas las situaciones</option>' + options;
        if (form) form.innerHTML = options;
    }

    async function loadMesas() {
        const params = new URLSearchParams({
            page: String(state.page),
            size: String(state.size)
        });

        if (state.search) params.set('search', state.search);
        if (state.estado) params.set('estado', state.estado);
        if (state.activo) params.set('activo', state.activo === 'activo' ? 'true' : 'false');

        setTableLoading(true);

        try {
            const response = await fetch(`${API_MESAS}?${params.toString()}`);
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo listar mesas.');

            state.mesas = Array.isArray(payload)
                ? payload
                : (Array.isArray(payload?.data) ? payload.data : []);

            state.total = Number(payload?.total ?? state.mesas.length);
            if (typeof payload?.size === 'number' && payload.size > 0) state.size = payload.size;
            if (typeof payload?.page === 'number') state.page = payload.page <= 0 ? 1 : payload.page;

            renderTable();
        } catch (error) {
            state.mesas = [];
            state.total = 0;
            renderTable();
            showToast(error.message || 'Error cargando mesas.', 'danger');
        } finally {
            setTableLoading(false);
        }
    }

    function renderTable() {
        const tbody = byId('mesasTableBody');
        if (!tbody) return;

        if (!state.mesas.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No hay mesas para mostrar.</td></tr>';
            setText('mesasCount', 'Mostrando 0 registros');
            renderPagination();
            return;
        }

        tbody.innerHTML = state.mesas.map((mesa, index) => {
            const rowNum = ((state.page - 1) * state.size) + index + 1;
            const activo = toBool(mesa.activo);
            const situacion = String(mesa.estado || 'disponible').toLowerCase();
            return `
                <tr>
                    <td><span class="record-id">#${rowNum}</span></td>
                    <td><span class="fw-bold font-monospace">${escapeHtml(mesa.codigo || '-')}</span></td>
                    <td><i class="bi bi-people text-muted me-1"></i>${Number(mesa.capacidad || 0)} personas</td>
                    <td>${escapeHtml(mesa.ubicacion || '-')}</td>
                    <td>${renderSituacionBadge(situacion)}</td>
                    <td>${renderActivoBadge(activo)}</td>
                    <td class="text-end"><div class="action-buttons">
                        <button class="btn-tbl" title="Ver" data-action="view" data-id="${escapeHtmlAttr(mesa.id)}"><i class="bi bi-eye text-info"></i></button>
                        <button class="btn-tbl" title="Editar" data-action="edit" data-id="${escapeHtmlAttr(mesa.id)}"><i class="bi bi-pencil text-warning"></i></button>
                        <button class="btn-tbl" title="Cambiar situación" data-action="toggle-situacion" data-id="${escapeHtmlAttr(mesa.id)}" data-estado="${escapeHtmlAttr(situacion)}"><i class="bi bi-arrow-repeat text-primary"></i></button>
                        <button class="btn-tbl" title="${activo ? 'Inactivar' : 'Activar'}" data-action="toggle-activo" data-id="${escapeHtmlAttr(mesa.id)}" data-activo="${String(activo)}"><i class="bi ${activo ? 'bi-pause-circle text-secondary' : 'bi-play-circle text-success'}"></i></button>
                        <button class="btn-tbl" title="Eliminar" data-action="delete" data-id="${escapeHtmlAttr(mesa.id)}"><i class="bi bi-trash text-danger"></i></button>
                    </div></td>
                </tr>
            `;
        }).join('');

        setText('mesasCount', `Mostrando ${state.mesas.length} de ${state.total} registros`);
        renderPagination();
    }

    function renderPagination() {
        const totalPages = getTotalPages();
        const current = totalPages === 0 ? 0 : state.page;

        setText('lblPaginaMesas', totalPages === 0 ? '-' : `${current} / ${totalPages}`);
        byId('liPrevMesas')?.classList.toggle('disabled', current <= 1);
        byId('liNextMesas')?.classList.toggle('disabled', totalPages === 0 || current >= totalPages);
    }

    function getTotalPages() {
        if (!state.total || !state.size || state.total <= 0 || state.size <= 0) return 0;
        return Math.ceil(state.total / state.size);
    }

    async function openView(id) {
        const mesa = await getMesaById(id);
        if (!mesa) return;

        setText('viewMesaId', String(mesa.codigo || mesa.id || '-'));
        setText('viewMesaCodigo', mesa.codigo || '-');
        setText('viewMesaCapacidad', `${Number(mesa.capacidad || 0)} personas`);
        setText('viewMesaUbicacion', mesa.ubicacion || '-');

        const sitEl = byId('viewMesaSituacion');
        if (sitEl) sitEl.innerHTML = renderSituacionBadge(String(mesa.estado || '').toLowerCase());

        const actEl = byId('viewMesaActivo');
        if (actEl) actEl.innerHTML = renderActivoBadge(toBool(mesa.activo));

        const btnEdit = byId('btnEditarDesdeVistaMesa');
        if (btnEdit) btnEdit.dataset.id = String(mesa.id);

        showModal('modalView');
    }

    async function openForm(id = null) {
        byId('formMesa')?.classList.remove('was-validated');

        if (!id) {
            setTextHtml('modalMesaTitle', '<i class="bi bi-grid-3x3-gap"></i>Nueva Mesa');
            setValue('mesaId', '');
            setValue('mesaCodigo', 'Autogenerado');
            setValue('mesaCapacidad', '4');
            setValue('mesaUbicacion', '');
            setValue('mesaEstado', state.estados[0]?.value || 'disponible');
            if (byId('swMesaActiva')) byId('swMesaActiva').checked = true;
            showModal('modalForm');
            await loadNextCodigoPreview();
            return;
        }

        const mesa = await getMesaById(id);
        if (!mesa) return;

        setTextHtml('modalMesaTitle', '<i class="bi bi-pencil-square"></i>Editar Mesa');
        setValue('mesaId', String(mesa.id));
        setValue('mesaCodigo', mesa.codigo || '');
        setValue('mesaCapacidad', String(mesa.capacidad ?? 1));
        setValue('mesaUbicacion', mesa.ubicacion || '');
        setValue('mesaEstado', String(mesa.estado || 'disponible').toLowerCase());
        if (byId('swMesaActiva')) byId('swMesaActiva').checked = toBool(mesa.activo);

        showModal('modalForm');
    }

    async function loadNextCodigoPreview() {
        try {
            const response = await fetch(API_NEXT_CODIGO);
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo obtener siguiente código.');

            const data = payload?.data;
            const codigo = typeof data === 'string'
                ? data
                : (data?.codigo || payload?.codigo || 'Autogenerado');

            setValue('mesaCodigo', String(codigo || 'Autogenerado'));
        } catch {
            setValue('mesaCodigo', 'Autogenerado');
        }
    }

    async function onGuardarMesa() {
        byId('formMesa')?.classList.add('was-validated');

        const id = String(byId('mesaId')?.value || '').trim();
        const capacidad = Number(byId('mesaCapacidad')?.value || 0);
        const ubicacion = String(byId('mesaUbicacion')?.value || '').trim();
        const estado = String(byId('mesaEstado')?.value || 'disponible').trim().toLowerCase();
        const activo = !!byId('swMesaActiva')?.checked;

        if (Number.isNaN(capacidad) || capacidad < 1) {
            showToast('Completa una capacidad válida.', 'danger');
            return;
        }

        const body = { capacidad: Math.floor(capacidad), ubicacion, estado, activo };
        const isEdit = !!id;
        const url = isEdit ? `${API_MESAS}/${encodeURIComponent(id)}` : API_MESAS;

        try {
            const response = await fetch(url, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo guardar la mesa.');

            hideModal('modalForm');
            await loadMesas();
            showToast(payload?.message || (isEdit ? 'Mesa actualizada.' : 'Mesa creada.'), 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo guardar la mesa.', 'danger');
        }
    }

    async function openDelete(id) {
        const mesa = await getMesaById(id);
        if (!mesa) return;

        state.deletingMesa = mesa;
        const msg = byId('deleteMesaTexto');
        if (msg) msg.innerHTML = `Se eliminará la mesa <strong>${escapeHtml(mesa.codigo || '')}</strong>. Esta acción la dejará inactiva.`;
        showModal('modalDelete');
    }

    async function onEliminarMesa() {
        if (!state.deletingMesa) return;

        try {
            const response = await fetch(`${API_MESAS}/${encodeURIComponent(state.deletingMesa.id)}`, {
                method: 'DELETE'
            });
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo eliminar la mesa.');

            hideModal('modalDelete');
            state.deletingMesa = null;
            await loadMesas();
            showToast(payload?.message || 'Mesa eliminada.', 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo eliminar la mesa.', 'danger');
        }
    }

    async function toggleActivo(id, activoActual) {
        try {
            const response = await fetch(`${API_MESAS}/${encodeURIComponent(id)}/estado`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activo: !activoActual })
            });
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo cambiar activo.');

            await loadMesas();
            showToast(payload?.message || 'Activo actualizado.', 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo cambiar activo.', 'danger');
        }
    }

    async function toggleSituacion(id, estadoActual) {
        const next = getNextEstado(estadoActual);

        try {
            const response = await fetch(`${API_MESAS}/${encodeURIComponent(id)}/situacion`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: next })
            });
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo cambiar situación.');

            await loadMesas();
            showToast(payload?.message || `Situación cambiada a ${toTitleCase(next)}.`, 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo cambiar situación.', 'danger');
        }
    }

    function getNextEstado(current) {
        const values = state.estados.map((x) => x.value);
        if (!values.length) return 'disponible';
        const normalizedCurrent = CATALOG_STATES.includes(String(current || '').toLowerCase())
            ? String(current || '').toLowerCase()
            : values[0];
        const idx = values.indexOf(normalizedCurrent);
        if (idx < 0) return values[0];
        return values[(idx + 1) % values.length];
    }

    async function getMesaById(id) {
        const local = state.mesas.find((x) => String(x.id) === String(id));
        if (local) return local;

        try {
            const response = await fetch(`${API_MESAS}/${encodeURIComponent(id)}`);
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo obtener la mesa.');
            return payload?.data || payload;
        } catch (error) {
            showToast(error.message || 'No se pudo obtener la mesa.', 'danger');
            return null;
        }
    }

    function renderSituacionBadge(estado) {
        const value = String(estado || '').toLowerCase();
        const label = getEstadoLabel(value);
        if (value === 'disponible') return '<span class="badge-pill bp-success"><i class="bi bi-check-circle-fill"></i>' + escapeHtml(label) + '</span>';
        if (value === 'ocupada') return '<span class="badge-pill bp-danger"><i class="bi bi-x-circle-fill"></i>' + escapeHtml(label) + '</span>';
        if (value === 'reservada') return '<span class="badge-pill bp-orange"><i class="bi bi-bookmark-fill"></i>' + escapeHtml(label) + '</span>';
        return '<span class="badge-pill bp-gray"><i class="bi bi-tools"></i>' + escapeHtml(label) + '</span>';
    }

    function getEstadoLabel(value) {
        const found = state.estados.find((x) => x.value === value);
        return found?.label || toTitleCase(value || 'sin estado');
    }

    function renderActivoBadge(activo) {
        return activo
            ? '<span class="badge-pill bp-success"><i class="bi bi-check-circle-fill"></i>Activa</span>'
            : '<span class="badge-pill bp-danger"><i class="bi bi-x-circle-fill"></i>Inactiva</span>';
    }

    function setTableLoading(loading) {
        const tbody = byId('mesasTableBody');
        if (!tbody || !loading) return;
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm me-2"></div>Cargando...</td></tr>';
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
        let container = byId('mesasToastContainer');
        if (container) return container;
        container = document.createElement('div');
        container.id = 'mesasToastContainer';
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

    function toTitleCase(value) {
        return String(value || '')
            .toLowerCase()
            .split('_')
            .join(' ')
            .split(' ')
            .filter(Boolean)
            .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
            .join(' ');
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
