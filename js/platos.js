/* =====================================================
   RestaControl — Platos Page Logic (API)
   CRUD conectado a backend Spring Boot
   ===================================================== */

(() => {
    const state = {
        search: '',
        categoriaId: '',
        activo: '',
        disponible: '',
        page: 1,
        size: 10,
        total: 0,
        platos: [],
        categorias: [],
        editingId: null,
        deletingPlato: null
    };

    const API_BASE  = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || 'http://localhost:7070';
    const API_PLATOS = `${API_BASE}/api/platos`;
    const API_CATS   = `${API_BASE}/api/categorias`;

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        await loadCategorias();
        bindEvents();
        loadPlatos();
    }

    function bindEvents() {
        byId('busquedaPlatos')?.addEventListener('input', (e) => {
            state.search = String(e.target.value || '').trim();
            state.page = 1;
            loadPlatos();
        });

        byId('filtroCategoriaPlatos')?.addEventListener('change', (e) => {
            state.categoriaId = String(e.target.value || '').trim();
            state.page = 1;
            loadPlatos();
        });

        byId('filtroDisponiblePlatos')?.addEventListener('change', (e) => {
            state.disponible = String(e.target.value || '').trim();
            state.page = 1;
            loadPlatos();
        });

        byId('filtroEstadoPlatos')?.addEventListener('change', (e) => {
            state.activo = String(e.target.value || '').trim();
            state.page = 1;
            loadPlatos();
        });

        byId('btnActualizarPlatos')?.addEventListener('click', () => loadPlatos());
        byId('btnNuevoPlato')?.addEventListener('click', () => openForm());
        byId('btnGuardarPlato')?.addEventListener('click', onGuardarPlato);
        byId('btnConfirmarEliminarPlato')?.addEventListener('click', onEliminarPlato);

        byId('btnEditarDesdeVistaPlato')?.addEventListener('click', () => {
            const id = byId('btnEditarDesdeVistaPlato')?.dataset.id;
            if (!id) return;
            hideModal('modalView');
            openForm(id);
        });

        byId('btnPrevPlatos')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (state.page <= 1 || getTotalPages() === 0) return;
            state.page -= 1;
            loadPlatos();
        });

        byId('btnNextPlatos')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (state.page >= getTotalPages() || getTotalPages() === 0) return;
            state.page += 1;
            loadPlatos();
        });

        byId('platosTableBody')?.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const id     = btn.dataset.id;
            const action = btn.dataset.action;
            if (!id || !action) return;

            if      (action === 'view')         await openView(id);
            else if (action === 'edit')         await openForm(id);
            else if (action === 'delete')       await openDelete(id);
            else if (action === 'toggle-estado')      await toggleEstado(id, btn.dataset.activo === 'true');
            else if (action === 'toggle-disponible')  await toggleDisponible(id, btn.dataset.disponible === 'true');
        });
    }

    /* ── Categorías (para select) ─────────────────────────── */

    async function loadCategorias() {
        try {
            const res  = await fetch(`${API_CATS}?page=1&size=100&activo=true`);
            const data = await safeJson(res);
            state.categorias = Array.isArray(data)
                ? data
                : (Array.isArray(data?.data) ? data.data : []);
            populateCategoriaSelect();
        } catch {
            // silencioso — el select quedará vacío
        }
    }

    function populateCategoriaSelect() {
        const selFilter = byId('filtroCategoriaPlatos');
        const selForm   = byId('idCategoriaPlato');

        const options = state.categorias.map(
            (c) => `<option value="${escapeHtmlAttr(c.id)}">${escapeHtml(c.nombre || '')}</option>`
        ).join('');

        if (selFilter) selFilter.innerHTML = '<option value="">Todas las categorías</option>' + options;
        if (selForm)   selForm.innerHTML   = '<option value="">Seleccionar...</option>' + options;
    }

    /* ── Listar ────────────────────────────────────────────── */

    async function loadPlatos() {
        const params = new URLSearchParams({
            page: String(state.page),
            size: String(state.size)
        });
        if (state.search)      params.set('search',      state.search);
        if (state.categoriaId) params.set('categoriaId', state.categoriaId);
        if (state.activo)      params.set('activo',      state.activo      === 'activo'      ? 'true' : 'false');
        if (state.disponible)  params.set('disponible',  state.disponible  === 'disponible'  ? 'true' : 'false');

        setTableLoading(true);

        try {
            const res     = await fetch(`${API_PLATOS}?${params.toString()}`);
            const payload = await safeJson(res);

            if (!res.ok) throw new Error(payload?.message || 'No se pudo obtener la lista de platos.');

            state.platos = Array.isArray(payload)
                ? payload
                : (Array.isArray(payload?.data) ? payload.data : []);

            // Normalize category name once to avoid UI coupling to backend field variants.
            state.platos = state.platos.map((plato) => ({
                ...plato,
                _categoriaNombre: getCategoriaNombre(plato)
            }));

            state.total = Number(payload?.total ?? state.platos.length);
            if (typeof payload?.size === 'number' && payload.size > 0) state.size = payload.size;
            if (typeof payload?.page === 'number') state.page = payload.page <= 0 ? 1 : payload.page;

            renderTable();
        } catch (err) {
            state.platos = [];
            state.total  = 0;
            renderTable();
            showToast(err.message || 'Error cargando platos.', 'danger');
        } finally {
            setTableLoading(false);
        }
    }

    /* ── Tabla ─────────────────────────────────────────────── */

    function renderTable() {
        const tbody = byId('platosTableBody');
        if (!tbody) return;

        if (!state.platos.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No hay platos para mostrar.</td></tr>';
            setText('platosCount', 'Mostrando 0 registros');
            renderPagination();
            return;
        }

        tbody.innerHTML = state.platos.map((plato, idx) => {
            const rowNum    = ((state.page - 1) * state.size) + idx + 1;
            const activo    = toBool(plato.activo);
            const disponible = toBool(plato.disponible);
            const catNombre = plato._categoriaNombre || getCategoriaNombre(plato);
            const precio    = typeof plato.precio === 'number'
                ? `S/ ${plato.precio.toFixed(2)}`
                : escapeHtml(String(plato.precio ?? '-'));

            return `
                <tr>
                    <td><span class="record-id">#${rowNum}</span></td>
                    <td>
                        <div class="fw-semibold">${escapeHtml(plato.nombre || '-')}</div>
                        ${plato.descripcion ? `<small class="text-muted">${escapeHtml(plato.descripcion)}</small>` : ''}
                    </td>
                    <td><span class="badge-pill bp-info">${escapeHtml(catNombre)}</span></td>
                    <td class="fw-semibold">${precio}</td>
                    <td>${renderDisponibleBadge(disponible)}</td>
                    <td>${renderEstadoBadge(activo)}</td>
                    <td class="text-end">
                        <div class="action-buttons">
                            <button class="btn-tbl" title="Ver detalle"       data-action="view"             data-id="${escapeHtmlAttr(plato.id)}"><i class="bi bi-eye text-info"></i></button>
                            <button class="btn-tbl" title="Editar"            data-action="edit"             data-id="${escapeHtmlAttr(plato.id)}"><i class="bi bi-pencil text-warning"></i></button>
                            <button class="btn-tbl" title="${disponible ? 'Marcar no disponible' : 'Marcar disponible'}" data-action="toggle-disponible" data-id="${escapeHtmlAttr(plato.id)}" data-disponible="${String(disponible)}"><i class="bi ${disponible ? 'bi-cart-dash text-secondary' : 'bi-cart-check text-success'}"></i></button>
                            <button class="btn-tbl" title="${activo ? 'Inactivar' : 'Activar'}"              data-action="toggle-estado"        data-id="${escapeHtmlAttr(plato.id)}" data-activo="${String(activo)}"><i class="bi ${activo ? 'bi-pause-circle text-secondary' : 'bi-play-circle text-success'}"></i></button>
                            <button class="btn-tbl" title="Eliminar"          data-action="delete"           data-id="${escapeHtmlAttr(plato.id)}"><i class="bi bi-trash text-danger"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        setText('platosCount', `Mostrando ${state.platos.length} de ${state.total} registros`);
        renderPagination();
    }

    function renderPagination() {
        const totalPages = getTotalPages();
        const current    = totalPages === 0 ? 0 : state.page;

        setText('lblPaginaPlatos', totalPages === 0 ? '-' : `${current} / ${totalPages}`);
        byId('liPrevPlatos')?.classList.toggle('disabled', current <= 1);
        byId('liNextPlatos')?.classList.toggle('disabled', totalPages === 0 || current >= totalPages);
    }

    function getTotalPages() {
        if (!state.total || state.total <= 0 || !state.size || state.size <= 0) return 0;
        return Math.ceil(state.total / state.size);
    }

    /* ── Ver detalle ───────────────────────────────────────── */

    async function openView(id) {
        const plato = await getPlatoById(id);
        if (!plato) return;

        const catNombre = plato._categoriaNombre || getCategoriaNombre(plato);
        const precio    = typeof plato.precio === 'number'
            ? `S/ ${plato.precio.toFixed(2)}`
            : escapeHtml(String(plato.precio ?? '-'));

        setText('viewPlatoId',          String(plato.codigo || plato.id || '-'));
        setText('viewPlatoNombre',      plato.nombre || '-');
        setText('viewPlatoDescripcion', plato.descripcion || '-');
        setText('viewPlatoPrecio',      precio);

        const catEl = byId('viewPlatoCategoria');
        if (catEl) catEl.innerHTML = `<span class="badge-pill bp-info">${escapeHtml(catNombre)}</span>`;

        const dispEl = byId('viewPlatoDisponible');
        if (dispEl) dispEl.innerHTML = renderDisponibleBadge(toBool(plato.disponible));

        const estEl = byId('viewPlatoEstado');
        if (estEl) estEl.innerHTML = renderEstadoBadge(toBool(plato.activo));

        const btnEdit = byId('btnEditarDesdeVistaPlato');
        if (btnEdit) btnEdit.dataset.id = String(plato.id);

        showModal('modalView');
    }

    /* ── Crear / Editar ────────────────────────────────────── */

    async function openForm(id = null) {
        state.editingId = id;
        byId('formPlato')?.classList.remove('was-validated');
        const title = byId('modalPlatoTitle');

        // Rellena el select de categorías siempre
        populateCategoriaSelect();

        if (!id) {
            if (title) title.innerHTML = '<i class="bi bi-egg-fried me-1"></i>Nuevo Plato';
            setValue('platoId',          '');
            setValue('nombrePlato',      '');
            setValue('descripcionPlato', '');
            setValue('precioPlato',      '');
            setValue('idCategoriaPlato', '');
            if (byId('swDisponible')) byId('swDisponible').checked = true;
            if (byId('swActivo'))     byId('swActivo').checked     = true;
            showModal('modalForm');
            return;
        }

        const plato = await getPlatoById(id);
        if (!plato) return;

        if (title) title.innerHTML = '<i class="bi bi-pencil-square me-1"></i>Editar Plato';
        setValue('platoId',          String(plato.id));
        setValue('nombrePlato',      plato.nombre || '');
        setValue('descripcionPlato', plato.descripcion || '');
        setValue('precioPlato',      String(plato.precio ?? ''));
        setValue('idCategoriaPlato', String(plato.idCategoria || plato.categoria?.id || ''));
        if (byId('swDisponible')) byId('swDisponible').checked = toBool(plato.disponible);
        if (byId('swActivo'))     byId('swActivo').checked     = toBool(plato.activo);

        showModal('modalForm');
    }

    async function onGuardarPlato() {
        byId('formPlato')?.classList.add('was-validated');

        const id          = String(byId('platoId')?.value          || '').trim();
        const nombre      = String(byId('nombrePlato')?.value      || '').trim();
        const descripcion = String(byId('descripcionPlato')?.value || '').trim();
        const precio      = parseFloat(byId('precioPlato')?.value  || '0');
        const idCategoria = String(byId('idCategoriaPlato')?.value || '').trim();
        const disponible  = !!byId('swDisponible')?.checked;
        const activo      = !!byId('swActivo')?.checked;

        if (!nombre || !idCategoria || isNaN(precio) || precio < 0) {
            showToast('Completa los campos obligatorios (nombre, categoría y precio válido).', 'danger');
            return;
        }

        const payload  = { idCategoria, nombre, descripcion, precio, disponible, activo };
        const isUpdate = !!id;
        const url      = isUpdate ? `${API_PLATOS}/${encodeURIComponent(id)}` : API_PLATOS;

        try {
            const res  = await fetch(url, {
                method:  isUpdate ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(payload)
            });
            const data = await safeJson(res);
            if (!res.ok) throw new Error(data?.message || 'No se pudo guardar el plato.');

            hideModal('modalForm');
            await loadPlatos();
            showToast(data?.message || (isUpdate ? 'Plato actualizado.' : 'Plato creado.'), 'success');
        } catch (err) {
            showToast(err.message || 'No se pudo guardar el plato.', 'danger');
        }
    }

    /* ── Eliminar ──────────────────────────────────────────── */

    async function openDelete(id) {
        const plato = await getPlatoById(id);
        if (!plato) return;
        state.deletingPlato = plato;

        const msg = byId('deletePlatoTexto');
        if (msg) {
            msg.innerHTML = `Se eliminará el plato <strong>${escapeHtml(plato.nombre || '')}</strong>. Esta acción lo dejará inactivo.`;
        }
        showModal('modalDelete');
    }

    async function onEliminarPlato() {
        if (!state.deletingPlato) return;
        try {
            const res  = await fetch(`${API_PLATOS}/${encodeURIComponent(state.deletingPlato.id)}`, {
                method: 'DELETE'
            });
            const data = await safeJson(res);
            if (!res.ok) throw new Error(data?.message || 'No se pudo eliminar el plato.');

            state.deletingPlato = null;
            hideModal('modalDelete');
            await loadPlatos();
            showToast(data?.message || 'Plato eliminado.', 'success');
        } catch (err) {
            showToast(err.message || 'No se pudo eliminar el plato.', 'danger');
        }
    }

    /* ── Toggle estado / disponibilidad ────────────────────── */

    async function toggleEstado(id, activoActual) {
        try {
            const res  = await fetch(`${API_PLATOS}/${encodeURIComponent(id)}/estado`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ activo: !activoActual })
            });
            const data = await safeJson(res);
            if (!res.ok) throw new Error(data?.message || 'No se pudo actualizar el estado.');
            await loadPlatos();
            showToast(data?.message || 'Estado actualizado.', 'success');
        } catch (err) {
            showToast(err.message || 'No se pudo actualizar el estado.', 'danger');
        }
    }

    async function toggleDisponible(id, disponibleActual) {
        try {
            const res  = await fetch(`${API_PLATOS}/${encodeURIComponent(id)}/disponibilidad`, {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ disponible: !disponibleActual })
            });
            const data = await safeJson(res);
            if (!res.ok) throw new Error(data?.message || 'No se pudo actualizar la disponibilidad.');
            await loadPlatos();
            showToast(data?.message || 'Disponibilidad actualizada.', 'success');
        } catch (err) {
            showToast(err.message || 'No se pudo actualizar la disponibilidad.', 'danger');
        }
    }

    /* ── GET uno ───────────────────────────────────────────── */

    async function getPlatoById(id) {
        const local = state.platos.find((p) => String(p.id) === String(id));
        if (local) return local;
        try {
            const res  = await fetch(`${API_PLATOS}/${encodeURIComponent(id)}`);
            const data = await safeJson(res);
            if (!res.ok) throw new Error(data?.message || 'No se pudo obtener el plato.');
            return data?.data || data;
        } catch (err) {
            showToast(err.message || 'No se pudo obtener el plato.', 'danger');
            return null;
        }
    }

    /* ── UI helpers ────────────────────────────────────────── */

    function setTableLoading(loading) {
        const tbody = byId('platosTableBody');
        if (!tbody || !loading) return;
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm me-2"></div>Cargando...</td></tr>';
    }

    function showToast(message, variant = 'success') {
        if (typeof bootstrap === 'undefined') { window.alert(message); return; }
        const container = ensureToastContainer();
        const icon      = variant === 'danger' ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill';
        const wrapper   = document.createElement('div');
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
        let c = byId('platosToastContainer');
        if (c) return c;
        c = document.createElement('div');
        c.id        = 'platosToastContainer';
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
        if (typeof value === 'string')  return value.toLowerCase() === 'true';
        return !!value;
    }

    function getCategoriaNombre(plato) {
        if (!plato || typeof plato !== 'object') return '-';

        const value = plato.categoriaNombre
            ?? plato.nombreCategoria
            ?? plato.categoria?.nombre
            ?? plato.categoria?.nombreCategoria
            ?? plato.categoriaDto?.nombre
            ?? (typeof plato.categoria === 'string' ? plato.categoria : null);

        const text = String(value ?? '').trim();
        return text || '-';
    }

    function renderEstadoBadge(activo) {
        return activo
            ? '<span class="badge-pill bp-success"><i class="bi bi-check-circle-fill"></i>Activo</span>'
            : '<span class="badge-pill bp-danger"><i class="bi bi-x-circle-fill"></i>Inactivo</span>';
    }

    function renderDisponibleBadge(disponible) {
        return disponible
            ? '<span class="badge-pill bp-success"><i class="bi bi-check-circle-fill"></i>Sí</span>'
            : '<span class="badge-pill bp-danger"><i class="bi bi-x-circle-fill"></i>No</span>';
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

    function byId(id)          { return document.getElementById(id); }
    function setValue(id, val) { const el = byId(id); if (el) el.value = val; }
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
