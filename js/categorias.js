/* =====================================================
   RestaControl — Categorías Page Logic (API)
   CRUD conectado a backend Spring Boot
   ===================================================== */

(() => {
    const state = {
        search: '',
        activo: '',
        page: 1,
        size: 10,
        total: 0,
        categorias: [],
        editingId: null,
        deletingCategoria: null
    };

    const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || 'http://localhost:7070';
    const API_CATS = `${API_BASE}/api/categorias`;

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        bindEvents();
        loadCategorias();
    }

    function bindEvents() {
        byId('busquedaCategorias')?.addEventListener('input', (e) => {
            state.search = String(e.target.value || '').trim();
            state.page = 1;
            loadCategorias();
        });

        byId('filtroEstadoCategorias')?.addEventListener('change', (e) => {
            state.activo = String(e.target.value || '').trim();
            state.page = 1;
            loadCategorias();
        });

        byId('btnFiltrarCategorias')?.addEventListener('click', () => {
            state.page = 1;
            loadCategorias();
        });

        byId('btnActualizarCategorias')?.addEventListener('click', () => loadCategorias());
        byId('btnNuevoCategoria')?.addEventListener('click', () => openForm());
        byId('btnGuardarCategoria')?.addEventListener('click', onGuardarCategoria);
        byId('btnConfirmarEliminarCategoria')?.addEventListener('click', onEliminarCategoria);

        byId('btnEditarDesdeVistaCategoria')?.addEventListener('click', () => {
            const id = byId('btnEditarDesdeVistaCategoria')?.dataset.id;
            if (!id) return;
            hideModal('modalView');
            openForm(id);
        });

        byId('btnPrevCategorias')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (state.page <= 1 || getTotalPages() === 0) return;
            state.page -= 1;
            loadCategorias();
        });

        byId('btnNextCategorias')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (state.page >= getTotalPages() || getTotalPages() === 0) return;
            state.page += 1;
            loadCategorias();
        });

        byId('categoriasTableBody')?.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const id = btn.dataset.id;
            const action = btn.dataset.action;
            if (!id || !action) return;

            if (action === 'view') await openView(id);
            else if (action === 'edit') await openForm(id);
            else if (action === 'delete') await openDelete(id);
            else if (action === 'toggle') await toggleEstado(id, btn.dataset.activo === 'true');
        });
    }

    async function loadCategorias() {
        const params = new URLSearchParams({
            page: String(state.page),
            size: String(state.size)
        });

        if (state.search) params.set('search', state.search);
        if (state.activo) params.set('activo', state.activo === 'activo' ? 'true' : 'false');

        setTableLoading(true);

        try {
            const response = await fetch(`${API_CATS}?${params.toString()}`);
            const payload = await safeJson(response);

            if (!response.ok) {
                throw new Error(payload?.message || 'No se pudo obtener la lista de categorías.');
            }

            state.categorias = Array.isArray(payload)
                ? payload
                : (Array.isArray(payload?.data) ? payload.data : []);

            state.total = Number(payload?.total ?? state.categorias.length);

            if (typeof payload?.size === 'number' && payload.size > 0) state.size = payload.size;
            if (typeof payload?.page === 'number') state.page = payload.page <= 0 ? 1 : payload.page;

            renderTable();
        } catch (error) {
            state.categorias = [];
            state.total = 0;
            renderTable();
            showToast(error.message || 'Error cargando categorías.', 'danger');
        } finally {
            setTableLoading(false);
        }
    }

    function renderTable() {
        const tbody = byId('categoriasTableBody');
        if (!tbody) return;

        if (!state.categorias.length) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No hay categorías para mostrar.</td></tr>';
            setText('categoriasCount', 'Mostrando 0 registros');
            renderPagination();
            return;
        }

        tbody.innerHTML = state.categorias.map((cat, idx) => {
            const rowNumber = ((state.page - 1) * state.size) + idx + 1;
            const activo = toBool(cat.activo);
            return `
                <tr>
                    <td><span class="record-id">#${rowNumber}</span></td>
                    <td><span class="fw-semibold">${escapeHtml(cat.nombre || '-')}</span></td>
                    <td>${escapeHtml(String(cat.orden ?? '-'))}</td>
                    <td>${renderEstadoBadge(activo)}</td>
                    <td class="text-end">
                        <div class="action-buttons">
                            <button class="btn-tbl" title="Ver detalle" data-action="view" data-id="${escapeHtmlAttr(cat.id)}"><i class="bi bi-eye text-info"></i></button>
                            <button class="btn-tbl" title="Editar" data-action="edit" data-id="${escapeHtmlAttr(cat.id)}"><i class="bi bi-pencil text-warning"></i></button>
                            <button class="btn-tbl" title="${activo ? 'Inactivar' : 'Activar'}" data-action="toggle" data-id="${escapeHtmlAttr(cat.id)}" data-activo="${String(activo)}"><i class="bi ${activo ? 'bi-pause-circle text-secondary' : 'bi-play-circle text-success'}"></i></button>
                            <button class="btn-tbl" title="Eliminar" data-action="delete" data-id="${escapeHtmlAttr(cat.id)}"><i class="bi bi-trash text-danger"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        setText('categoriasCount', `Mostrando ${state.categorias.length} de ${state.total} registros`);
        renderPagination();
    }

    function renderPagination() {
        const totalPages = getTotalPages();
        const current = totalPages === 0 ? 0 : state.page;

        setText('lblPaginaCategorias', totalPages === 0 ? '-' : `${current} / ${totalPages}`);
        byId('liPrevCategorias')?.classList.toggle('disabled', current <= 1);
        byId('liNextCategorias')?.classList.toggle('disabled', totalPages === 0 || current >= totalPages);
    }

    function getTotalPages() {
        if (!state.total || state.total <= 0 || !state.size || state.size <= 0) return 0;
        return Math.ceil(state.total / state.size);
    }

    async function openView(id) {
        const cat = await getCategoriaById(id);
        if (!cat) return;

        setText('viewCategoriaId', String(cat.codigo || cat.id || '-'));
        setText('viewCategoriaNombre', cat.nombre || '-');
        setText('viewCategoriaOrden', String(cat.orden ?? '-'));

        const estadoWrap = byId('viewCategoriaEstado');
        if (estadoWrap) estadoWrap.innerHTML = renderEstadoBadge(toBool(cat.activo));

        const btnEdit = byId('btnEditarDesdeVistaCategoria');
        if (btnEdit) btnEdit.dataset.id = String(cat.id);

        showModal('modalView');
    }

    async function openForm(id = null) {
        state.editingId = id;

        byId('formCategoria')?.classList.remove('was-validated');
        const title = byId('modalFormLabel');

        if (!id) {
            if (title) title.innerHTML = '<i class="bi bi-tags"></i>Nueva Categoría';
            setValue('categoriaId', '');
            setValue('nombreCategoria', '');
            setValue('ordenCategoria', '1');
            if (byId('switchActivo')) byId('switchActivo').checked = true;
            showModal('modalForm');
            return;
        }

        const cat = await getCategoriaById(id);
        if (!cat) return;

        if (title) title.innerHTML = '<i class="bi bi-pencil-square"></i>Editar Categoría';
        setValue('categoriaId', String(cat.id));
        setValue('nombreCategoria', cat.nombre || '');
        setValue('ordenCategoria', String(cat.orden ?? '1'));
        if (byId('switchActivo')) byId('switchActivo').checked = toBool(cat.activo);

        showModal('modalForm');
    }

    async function onGuardarCategoria() {
        byId('formCategoria')?.classList.add('was-validated');

        const id = String(byId('categoriaId')?.value || '').trim();
        const nombre = String(byId('nombreCategoria')?.value || '').trim();
        const orden = Number(byId('ordenCategoria')?.value || 0);
        const activo = !!byId('switchActivo')?.checked;

        if (!nombre || orden < 1) {
            showToast('Completa los campos obligatorios (nombre y orden mayor a 0).', 'danger');
            return;
        }

        const payload = { nombre, orden, activo };
        const isUpdate = !!id;
        const url = isUpdate ? `${API_CATS}/${encodeURIComponent(id)}` : API_CATS;

        try {
            const response = await fetch(url, {
                method: isUpdate ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await safeJson(response);
            if (!response.ok) throw new Error(data?.message || 'No se pudo guardar la categoría.');

            hideModal('modalForm');
            await loadCategorias();
            showToast(data?.message || (isUpdate ? 'Categoría actualizada.' : 'Categoría creada.'), 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo guardar la categoría.', 'danger');
        }
    }

    async function openDelete(id) {
        const cat = await getCategoriaById(id);
        if (!cat) return;
        state.deletingCategoria = cat;

        const msg = byId('deleteCategoriaTex­to');
        if (msg) {
            msg.innerHTML = `Se eliminará la categoría <strong>${escapeHtml(cat.nombre || '')}</strong>. Esta acción la dejará inactiva.`;
        }

        showModal('modalDelete');
    }

    async function onEliminarCategoria() {
        if (!state.deletingCategoria) return;

        try {
            const response = await fetch(`${API_CATS}/${encodeURIComponent(state.deletingCategoria.id)}`, {
                method: 'DELETE'
            });

            const data = await safeJson(response);
            if (!response.ok) throw new Error(data?.message || 'No se pudo eliminar la categoría.');

            state.deletingCategoria = null;
            hideModal('modalDelete');
            await loadCategorias();
            showToast(data?.message || 'Categoría eliminada.', 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo eliminar la categoría.', 'danger');
        }
    }

    async function toggleEstado(id, activoActual) {
        try {
            const response = await fetch(`${API_CATS}/${encodeURIComponent(id)}/estado`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activo: !activoActual })
            });

            const data = await safeJson(response);
            if (!response.ok) throw new Error(data?.message || 'No se pudo actualizar el estado.');

            await loadCategorias();
            showToast(data?.message || 'Estado actualizado.', 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo actualizar el estado.', 'danger');
        }
    }

    async function getCategoriaById(id) {
        const local = state.categorias.find((c) => String(c.id) === String(id));
        if (local) return local;

        try {
            const response = await fetch(`${API_CATS}/${encodeURIComponent(id)}`);
            const data = await safeJson(response);
            if (!response.ok) throw new Error(data?.message || 'No se pudo obtener la categoría.');
            return data?.data || data;
        } catch (error) {
            showToast(error.message || 'No se pudo obtener la categoría.', 'danger');
            return null;
        }
    }

    function setTableLoading(loading) {
        const tbody = byId('categoriasTableBody');
        if (!tbody) return;
        if (loading) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm me-2"></div>Cargando...</td></tr>';
        }
    }

    function showToast(message, variant = 'success') {
        if (typeof bootstrap === 'undefined') { window.alert(message); return; }

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
        let c = byId('categoriasToastContainer');
        if (c) return c;
        c = document.createElement('div');
        c.id = 'categoriasToastContainer';
        c.className = 'toast-container position-fixed top-0 end-0 p-3';
        c.style.zIndex = '1100';
        document.body.appendChild(c);
        return c;
    }

    async function safeJson(response) {
        try { return await response.json(); } catch { return null; }
    }

    function toBool(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') return value.toLowerCase() === 'true';
        return !!value;
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
