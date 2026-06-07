/* =====================================================
   RestaControl — Cocina Page Logic
   Read-only kitchen board with order items and status
   ===================================================== */

(() => {
    const AUTO_REFRESH_MS = 15000;

    const state = {
        search: '',
        estado: 'todos',
        autoRefreshId: null
    };

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        bindEvents();
        render();
        startAutoRefresh();
    }

    function bindEvents() {
        const inputBusqueda = byId('busquedaCocina');
        const filtroEstado = byId('filtroEstadoCocina');
        const btnActualizar = byId('btnActualizarCocina');
        const tableBody = byId('kitchenOrdersBody');

        if (inputBusqueda) {
            inputBusqueda.addEventListener('input', (event) => {
                state.search = event.target.value.trim().toLowerCase();
                render();
            });
        }

        if (filtroEstado) {
            filtroEstado.addEventListener('change', (event) => {
                state.estado = event.target.value;
                render();
            });
        }

        if (btnActualizar) {
            btnActualizar.addEventListener('click', render);
        }

        if (tableBody) {
            tableBody.addEventListener('click', handleTableActions);
        }
    }

    function render() {
        const rows = buildKitchenRows();
        const filtered = applyFilters(rows);

        renderTable(filtered, rows.length);
        renderStats(rows);
    }

    function buildKitchenRows() {
        const pedidos = DB.getAll('pedidos');
        const detalles = DB.getAll('detallePedidos');
        const platos = DB.getAll('platos');
        const atenciones = DB.getAll('atenciones');
        const mesas = DB.getAll('mesas');

        const platosById = new Map(platos.map((plato) => [Number(plato.id), plato]));
        const atencionesById = new Map(atenciones.map((atencion) => [Number(atencion.id), atencion]));
        const mesasById = new Map(mesas.map((mesa) => [Number(mesa.id), mesa]));

        return pedidos
            .flatMap((pedido) => {
                const items = detalles.filter((detalle) => Number(detalle.id_pedido) === Number(pedido.id));
                const atencion = atencionesById.get(Number(pedido.id_atencion));
                const mesa = atencion ? mesasById.get(Number(atencion.id_mesa)) : null;
                const horaEnvio = formatDateTime(pedido.creado_en);

                if (!items.length) {
                    const estadoSinDetalle = normalizeEstadoCocina(pedido.estado_cocina || deriveEstadoFromAtencion(atencion));
                    return [{
                        detalleId: null,
                        pedidoId: pedido.id,
                        mesaCodigo: mesa ? mesa.codigo : 'Sin mesa',
                        platoNombre: 'Sin detalle de platos',
                        cantidad: 0,
                        horaEnvio,
                        envioTs: toTimestamp(pedido.creado_en),
                        estado: estadoSinDetalle,
                        estadoTexto: estadoLabel(estadoSinDetalle),
                        observaciones: ''
                    }];
                }

                return items
                    .filter((item) => !item.tipo_item || item.tipo_item === 'plato')
                    .map((item) => {
                    const plato = platosById.get(Number(item.id_plato));
                    const estadoItem = normalizeEstadoCocina(item.estado_cocina || pedido.estado_cocina || deriveEstadoFromAtencion(atencion));
                    return {
                        detalleId: Number(item.id),
                        pedidoId: pedido.id,
                        mesaCodigo: mesa ? mesa.codigo : 'Sin mesa',
                        platoNombre: plato ? plato.nombre : 'Plato no encontrado',
                        cantidad: Number(item.cantidad || 0),
                        horaEnvio,
                        envioTs: toTimestamp(pedido.creado_en),
                        estado: estadoItem,
                        estadoTexto: estadoLabel(estadoItem),
                        observaciones: String(item.observaciones || '').trim()
                    };
                });
            })
            .sort((a, b) => {
                if (a.envioTs !== b.envioTs) return a.envioTs - b.envioTs;
                if (a.pedidoId !== b.pedidoId) return a.pedidoId - b.pedidoId;
                return Number(a.detalleId || 0) - Number(b.detalleId || 0);
            });
    }

    function applyFilters(rows) {
        return rows.filter((row) => {
            const matchEstado = state.estado === 'todos' || row.estado === state.estado;
            const hayTexto = !state.search
                || String(row.pedidoId).includes(state.search)
                || row.mesaCodigo.toLowerCase().includes(state.search)
                || row.platoNombre.toLowerCase().includes(state.search)
                || row.estadoTexto.toLowerCase().includes(state.search);

            return matchEstado && hayTexto;
        });
    }

    function renderTable(rows, total) {
        const tbody = byId('kitchenOrdersBody');
        const count = byId('kitchenCount');
        if (!tbody) return;

        if (!rows.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted py-4">
                        No hay pedidos de cocina para los filtros seleccionados.
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = rows.map((row) => `
                <tr>
                    <td><span class="record-id">#${row.pedidoId}</span></td>
                    <td><span class="badge-pill bp-gray">${row.mesaCodigo}</span></td>
                    <td class="fw-semibold">
                        ${escapeHtml(row.platoNombre)}
                        ${row.observaciones ? `<br><small class="text-warning" style="font-weight:500;" data-bs-toggle="tooltip" title="${escapeHtml(row.observaciones)}"><i class="bi bi-info-circle-fill me-1"></i>${escapeHtml(row.observaciones.substring(0, 30))}${row.observaciones.length > 30 ? '...' : ''}</small>` : ''}
                    </td>
                    <td class="text-center">${row.cantidad}</td>
                    <td class="text-muted">${row.horaEnvio}</td>
                    <td>${estadoBadge(row.estado)}</td>
                    <td class="text-end">${controlButtons(row)}</td>
                </tr>
            `).join('');

            // Inicializar tooltips para observaciones
            if (typeof bootstrap !== 'undefined') {
                const tooltips = tbody.querySelectorAll('[data-bs-toggle="tooltip"]');
                tooltips.forEach((el) => {
                    bootstrap.Tooltip.getOrCreateInstance(el);
                });
            }
        }

        if (count) {
            count.textContent = `Mostrando ${rows.length} de ${total} ítems`;
        }
    }

    function renderStats(rows) {
        const total = rows.length;
        const pendientes = rows.filter((row) => row.estado === 'pendiente').length;
        const cancelados = rows.filter((row) => row.estado === 'cancelado').length;
        const listos = rows.filter((row) => row.estado === 'listo').length;
        const entregados = rows.filter((row) => row.estado === 'entregado').length;

        setText('kpiTotal', String(total));
        setText('kpiPendiente', String(pendientes));
        setText('kpiCancelado', String(cancelados));
        setText('kpiListo', String(listos));
        setText('kpiEntregado', String(entregados));
    }

    function normalizeEstadoCocina(estado) {
        const raw = String(estado || '').trim().toLowerCase();
        if (raw.includes('cancel')) return 'cancelado';
        if (raw.includes('entregado')) return 'entregado';
        if (raw.includes('listo')) return 'listo';
        return 'pendiente';
    }

    function deriveEstadoFromAtencion(atencion) {
        if (!atencion) return 'pendiente';

        const estado = String(atencion.estado || '').toLowerCase();
        const estadoPago = String(atencion.estado_pago || '').toLowerCase();

        if (estado.includes('cancel')) return 'cancelado';
        if (estadoPago === 'pagado' || estado === 'cerrada') return 'listo';
        return 'pendiente';
    }

    function estadoBadge(estado) {
        if (estado === 'entregado') {
            return '<span class="badge-pill" style="background:#e0f2fe;color:#0369a1;"><i class="bi bi-bag-check-fill"></i>Entregado</span>';
        }
        if (estado === 'listo') {
            return '<span class="badge-pill bp-success"><i class="bi bi-check-circle-fill"></i>Listo para entrega</span>';
        }
        if (estado === 'cancelado') {
            return '<span class="badge-pill bp-danger"><i class="bi bi-x-circle-fill"></i>Cancelado</span>';
        }
        return '<span class="badge-pill bp-warning"><i class="bi bi-clock-fill"></i>Pendiente</span>';
    }

    function estadoLabel(estado) {
        if (estado === 'entregado') return 'Entregado';
        if (estado === 'listo') return 'Listo para entrega';
        if (estado === 'cancelado') return 'Cancelado';
        return 'Pendiente';
    }

    function controlButtons(row) {
        if (!row.detalleId) {
            return '<span class="text-muted small">Sin control</span>';
        }

        return `
            <div class="kitchen-controls">
                <button class="btn-tbl ${row.estado === 'pendiente' ? 'is-active' : ''}" title="Pendiente" data-action="pendiente" data-detalle-id="${row.detalleId}">
                    <i class="bi bi-clock text-warning"></i>
                </button>
                <button class="btn-tbl ${row.estado === 'listo' ? 'is-active' : ''}" title="Listo para entrega" data-action="listo" data-detalle-id="${row.detalleId}">
                    <i class="bi bi-check2-circle text-success"></i>
                </button>
                <button class="btn-tbl ${row.estado === 'entregado' ? 'is-active' : ''}" title="Marcar entregado" data-action="entregado" data-detalle-id="${row.detalleId}">
                    <i class="bi bi-bag-check text-primary"></i>
                </button>
                <button class="btn-tbl ${row.estado === 'cancelado' ? 'is-active' : ''}" title="Cancelado" data-action="cancelado" data-detalle-id="${row.detalleId}">
                    <i class="bi bi-x-circle text-danger"></i>
                </button>
            </div>
        `;
    }

    function handleTableActions(event) {
        const btn = event.target.closest('[data-action][data-detalle-id]');
        if (!btn) return;

        const action = normalizeEstadoCocina(btn.dataset.action);
        const detalleId = Number(btn.dataset.detalleId);
        if (!detalleId) return;

        DB.update('detallePedidos', detalleId, {
            estado_cocina: action,
            actualizado_cocina_en: new Date().toISOString()
        });

        render();
    }

    function startAutoRefresh() {
        stopAutoRefresh();
        state.autoRefreshId = window.setInterval(render, AUTO_REFRESH_MS);
        window.addEventListener('beforeunload', stopAutoRefresh, { once: true });
    }

    function stopAutoRefresh() {
        if (!state.autoRefreshId) return;
        window.clearInterval(state.autoRefreshId);
        state.autoRefreshId = null;
    }

    function toTimestamp(isoValue) {
        if (!isoValue) return Number.MAX_SAFE_INTEGER;
        const ts = new Date(isoValue).getTime();
        return Number.isNaN(ts) ? Number.MAX_SAFE_INTEGER : ts;
    }

    function formatDateTime(isoValue) {
        if (!isoValue) return 'Sin hora';
        const date = new Date(isoValue);
        if (Number.isNaN(date.getTime())) return 'Sin hora';

        return date.toLocaleString('es-PE', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function setText(id, text) {
        const el = byId(id);
        if (el) el.textContent = text;
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
})();

