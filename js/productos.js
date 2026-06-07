/* =====================================================
   RestaControl — Productos Page Logic (API)
   Productos sin preparación en cocina
   ===================================================== */

(() => {
    const state = {
        search: '',
        filtroEstado: '',
        page: 1,
        size: 10,
        total: 0,
        productos: [],
        unidades: []
    };

    const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || 'http://localhost:7070';
    const API_PROD = `${API_BASE}/api/productos`;
    const API_UNIDADES = `${API_PROD}/unidades`;

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        bindEvents();
        await loadUnidades();
        loadProductos();
    }

    async function loadUnidades() {
        const select = byId('productoUnidad');
        try {
            const response = await fetch(API_UNIDADES);
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo cargar unidades.');

            const raw = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
            const normalized = raw
                .map((item) => normalizeUnidad(item))
                .filter((item) => item && item.value);

            if (!normalized.length) throw new Error('No se recibieron unidades.');

            state.unidades = normalized;

            if (select) {
                select.innerHTML = state.unidades
                    .map((u) => `<option value="${escapeHtmlAttr(u.value)}">${escapeHtml(u.label)}</option>`)
                    .join('');
            }
        } catch {
            // Fallback: conservar opciones estáticas del HTML actual.
            if (!select) return;
            state.unidades = Array.from(select.options).map((opt) => ({
                value: String(opt.value || '').trim(),
                label: String(opt.textContent || '').trim() || String(opt.value || '').trim()
            })).filter((u) => u.value);
        }
    }

    function normalizeUnidad(item) {
        if (!item && item !== 0) return null;
        if (typeof item === 'string') {
            const value = item.trim();
            if (!value) return null;
            return { value, label: value };
        }
        if (typeof item !== 'object') return null;

        const value = String(item.value ?? item.codigo ?? item.id ?? '').trim();
        const label = String(item.label ?? item.nombre ?? item.descripcion ?? value).trim();
        if (!value) return null;
        return { value, label: label || value };
    }

    function bindEvents() {
        byId('busquedaProductos')?.addEventListener('input', (e) => {
            state.search = String(e.target.value || '').trim();
            state.page = 1;
            loadProductos();
        });

        byId('filtroEstadoProducto')?.addEventListener('change', (e) => {
            state.filtroEstado = String(e.target.value || '');
            state.page = 1;
            loadProductos();
        });

        byId('btnActualizarProductos')?.addEventListener('click', () => loadProductos());
        byId('btnNuevoProducto')?.addEventListener('click', () => openForm());
        byId('btnGuardarProducto')?.addEventListener('click', onGuardarProducto);
        byId('btnConfirmarStock')?.addEventListener('click', onConfirmarStock);

        byId('btnPrevProductos')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (state.page <= 1 || getTotalPages() === 0) return;
            state.page -= 1;
            loadProductos();
        });

        byId('btnNextProductos')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (state.page >= getTotalPages() || getTotalPages() === 0) return;
            state.page += 1;
            loadProductos();
        });

        byId('productosTableBody')?.addEventListener('click', async (event) => {
            const btn = event.target.closest('[data-action]');
            if (!btn) return;
            const id = String(btn.dataset.id || '').trim();
            if (!id) return;

            const action = btn.dataset.action;
            if (action === 'editar') await openForm(id);
            if (action === 'stock') await openStock(id);
            if (action === 'toggle') await toggleActivo(id, btn.dataset.activo === 'true');
        });
    }

    async function loadProductos() {
        const params = new URLSearchParams({
            page: String(state.page),
            size: String(state.size)
        });

        if (state.search) params.set('search', state.search);

        // El backend maneja activo=true/false. "sinstock" se filtra en frontend.
        if (state.filtroEstado === 'activo') params.set('activo', 'true');
        if (state.filtroEstado === 'inactivo') params.set('activo', 'false');

        setTableLoading(true);

        try {
            const response = await fetch(`${API_PROD}?${params.toString()}`);
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo listar productos.');

            const data = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);

            state.productos = state.filtroEstado === 'sinstock'
                ? data.filter((p) => Number(p.stock || 0) === 0)
                : data;

            state.total = state.filtroEstado === 'sinstock'
                ? state.productos.length
                : Number(payload?.total ?? state.productos.length);

            if (typeof payload?.size === 'number' && payload.size > 0) state.size = payload.size;
            if (typeof payload?.page === 'number') state.page = payload.page <= 0 ? 1 : payload.page;

            renderKPIs(state.productos);
            renderTable();
        } catch (error) {
            state.productos = [];
            state.total = 0;
            renderKPIs([]);
            renderTable();
            showToast(error.message || 'Error cargando productos.', 'danger');
        } finally {
            setTableLoading(false);
        }
    }

    function renderKPIs(items) {
        setText('kpiTotalProductos', String(items.length));
        setText('kpiDisponibles', String(items.filter((p) => toBool(p.activo) && Number(p.stock || 0) > 0).length));
        setText('kpiStockBajo', String(items.filter((p) => toBool(p.activo) && Number(p.stock || 0) > 0 && Number(p.stock || 0) <= 5).length));
        setText('kpiSinStock', String(items.filter((p) => Number(p.stock || 0) === 0).length));
    }

    function renderTable() {
        const tbody = byId('productosTableBody');
        if (!tbody) return;

        if (!state.productos.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No hay productos para mostrar.</td></tr>';
            setText('productosCount', 'Mostrando 0 productos');
            renderPagination();
            return;
        }

        tbody.innerHTML = state.productos.map((p, index) => {
            const rowNum = ((state.page - 1) * state.size) + index + 1;
            const stock = Number(p.stock || 0);
            const activo = toBool(p.activo);
            const stockBadge = stock === 0
                ? `<span class="badge bg-danger">${stock}</span>`
                : stock <= 5
                    ? `<span class="badge bg-warning text-dark">${stock}</span>`
                    : `<span class="badge bg-success">${stock}</span>`;

            const estadoBadge = activo
                ? '<span class="badge-pill bp-success">Activo</span>'
                : '<span class="badge-pill bp-gray">Inactivo</span>';

            return `
                <tr>
                    <td><span class="record-id">#${rowNum}</span></td>
                    <td><div class="fw-semibold">${escapeHtml(p.nombre || '-')}</div></td>
                    <td><small class="text-muted">${escapeHtml(p.descripcion || '-')}</small></td>
                    <td class="fw-semibold">S/ ${Number(p.precio || 0).toFixed(2)}</td>
                    <td class="text-center">${stockBadge}</td>
                    <td><span class="badge-pill bp-gray">${escapeHtml(getUnidadLabel(p.unidad || 'unidad'))}</span></td>
                    <td>${estadoBadge}</td>
                    <td class="text-end">
                        <div class="d-flex gap-1 justify-content-end">
                            <button class="btn btn-sm btn-outline-secondary" title="Ajustar stock" data-action="stock" data-id="${escapeHtmlAttr(p.id)}"><i class="bi bi-boxes"></i></button>
                            <button class="btn btn-sm btn-outline-primary" title="Editar" data-action="editar" data-id="${escapeHtmlAttr(p.id)}"><i class="bi bi-pencil"></i></button>
                            <button class="btn btn-sm ${activo ? 'btn-outline-warning' : 'btn-outline-success'}" title="${activo ? 'Desactivar' : 'Activar'}" data-action="toggle" data-id="${escapeHtmlAttr(p.id)}" data-activo="${String(activo)}">
                                <i class="bi ${activo ? 'bi-pause-circle' : 'bi-play-circle'}"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        setText('productosCount', `Mostrando ${state.productos.length} de ${state.total} productos`);
        renderPagination();
    }

    function renderPagination() {
        const totalPages = getTotalPages();
        const current = totalPages === 0 ? 0 : state.page;
        setText('lblPaginaProductos', totalPages === 0 ? '-' : `${current} / ${totalPages}`);
        byId('liPrevProductos')?.classList.toggle('disabled', current <= 1);
        byId('liNextProductos')?.classList.toggle('disabled', totalPages === 0 || current >= totalPages);
    }

    function getTotalPages() {
        if (!state.total || !state.size || state.total <= 0 || state.size <= 0) return 0;
        return Math.ceil(state.total / state.size);
    }

    async function openForm(id = null) {
        byId('formProducto')?.classList.remove('was-validated');

        if (!id) {
            setTextHtml('modalProductoLabel', '<i class="bi bi-bag me-2"></i>Nuevo Producto');
            setValue('productoId', '');
            setValue('productoNombre', '');
            setValue('productoDescripcion', '');
            setValue('productoPrecio', '');
            setValue('productoStock', '0');
            setValue('productoStockMinimo', '0');
            setValue('productoUnidad', state.unidades[0]?.value || 'unidad');
            setValue('productoActivo', 'true');
            showModal('modalProducto');
            return;
        }

        const p = await getProductoById(id);
        if (!p) return;

        setTextHtml('modalProductoLabel', '<i class="bi bi-pencil me-2"></i>Editar Producto');
        setValue('productoId', String(p.id));
        setValue('productoNombre', p.nombre || '');
        setValue('productoDescripcion', p.descripcion || '');
        setValue('productoPrecio', String(p.precio ?? '0'));
        setValue('productoStock', String(p.stock ?? '0'));
        setValue('productoStockMinimo', String(p.stockMinimo ?? '0'));
        setValue('productoUnidad', p.unidad || 'unidad');
        setValue('productoActivo', String(toBool(p.activo)));

        showModal('modalProducto');
    }

    async function onGuardarProducto() {
        byId('formProducto')?.classList.add('was-validated');

        const id = String(byId('productoId')?.value || '').trim();
        const nombre = String(byId('productoNombre')?.value || '').trim();
        const descripcion = String(byId('productoDescripcion')?.value || '').trim();
        const precio = Number(byId('productoPrecio')?.value || 0);
        const stock = Number(byId('productoStock')?.value || 0);
        const stockMinimo = Number(byId('productoStockMinimo')?.value || 0);
        const unidad = String(byId('productoUnidad')?.value || 'unidad').trim();
        const activo = String(byId('productoActivo')?.value || 'true') === 'true';

        if (!nombre || Number.isNaN(precio) || precio < 0 || Number.isNaN(stock) || stock < 0 || Number.isNaN(stockMinimo) || stockMinimo < 0) {
            showToast('Completa los campos requeridos correctamente.', 'danger');
            return;
        }

        const body = {
            nombre,
            descripcion,
            precio: Math.round(precio * 100) / 100,
            stock: Math.floor(stock),
            stockMinimo: Math.floor(stockMinimo),
            unidad,
            activo
        };

        const isEdit = !!id;
        const url = isEdit ? `${API_PROD}/${encodeURIComponent(id)}` : API_PROD;

        try {
            const response = await fetch(url, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo guardar el producto.');

            hideModal('modalProducto');
            await loadProductos();
            showToast(payload?.message || (isEdit ? 'Producto actualizado.' : 'Producto creado.'), 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo guardar el producto.', 'danger');
        }
    }

    async function openStock(id) {
        const p = await getProductoById(id);
        if (!p) return;

        setValue('stockProductoId', String(p.id));
        setValue('nuevoStock', String(p.stock ?? '0'));
        setTextHtml('modalStockTitle', `<i class="bi bi-boxes me-2"></i>Stock: ${escapeHtml(p.nombre || 'Producto')}`);
        showModal('modalStock');
    }

    async function onConfirmarStock() {
        const id = String(byId('stockProductoId')?.value || '').trim();
        const nuevoStock = Number(byId('nuevoStock')?.value || -1);
        if (!id || Number.isNaN(nuevoStock) || nuevoStock < 0) {
            showToast('Stock inválido.', 'danger');
            return;
        }

        const actual = await getProductoById(id);
        if (!actual) return;

        const body = {
            nombre: actual.nombre,
            descripcion: actual.descripcion || '',
            precio: Number(actual.precio || 0),
            stock: Math.floor(nuevoStock),
            stockMinimo: Number(actual.stockMinimo || 0),
            unidad: actual.unidad || 'unidad',
            activo: toBool(actual.activo)
        };

        try {
            const response = await fetch(`${API_PROD}/${encodeURIComponent(id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo actualizar stock.');

            hideModal('modalStock');
            await loadProductos();
            showToast(payload?.message || 'Stock actualizado.', 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo actualizar stock.', 'danger');
        }
    }

    async function toggleActivo(id, activoActual) {
        try {
            const response = await fetch(`${API_PROD}/${encodeURIComponent(id)}/estado`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ activo: !activoActual })
            });
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo cambiar estado del producto.');

            await loadProductos();
            showToast(payload?.message || 'Estado actualizado.', 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo cambiar estado del producto.', 'danger');
        }
    }

    async function getProductoById(id) {
        const local = state.productos.find((x) => String(x.id) === String(id));
        if (local) return local;

        try {
            const response = await fetch(`${API_PROD}/${encodeURIComponent(id)}`);
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo obtener producto.');
            return payload?.data || payload;
        } catch (error) {
            showToast(error.message || 'No se pudo obtener producto.', 'danger');
            return null;
        }
    }

    function setTableLoading(loading) {
        const tbody = byId('productosTableBody');
        if (!tbody || !loading) return;
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm me-2"></div>Cargando...</td></tr>';
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
        let container = byId('productosToastContainer');
        if (container) return container;
        container = document.createElement('div');
        container.id = 'productosToastContainer';
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

    function getUnidadLabel(value) {
        const key = String(value || '').trim();
        if (!key) return '-';
        const found = state.unidades.find((u) => u.value === key);
        return found?.label || key;
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

    function escapeHtml(text) {
        return String(text || '')
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
