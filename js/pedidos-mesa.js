/* =====================================================
   RestaControl — Pedidos por Mesa
   Muestra mesas ocupadas y detalle en modal
   ===================================================== */

(() => {
    const state = {
        search: ''
    };

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        bindEvents();
        renderBoard();
    }

    function bindEvents() {
        const busqueda = byId('busquedaMesaPedido');
        const btnActualizar = byId('btnActualizarMesasPedido');
        const board = byId('mesasPedidoBoard');

        if (busqueda) {
            busqueda.addEventListener('input', (event) => {
                state.search = event.target.value.trim().toLowerCase();
                renderBoard();
            });
        }

        if (btnActualizar) {
            btnActualizar.addEventListener('click', renderBoard);
        }

        if (board) {
            board.addEventListener('click', (event) => {
                const card = event.target.closest('[data-atencion-id]');
                if (!card) return;
                openDetailModal(Number(card.dataset.atencionId));
            });
        }
    }

    function renderBoard() {
        const board = byId('mesasPedidoBoard');
        const count = byId('mesasPedidoCount');
        if (!board) return;

        const rows = buildOccupiedRows();
        const filtered = applySearch(rows);

        if (!filtered.length) {
            board.innerHTML = `
                <div class="text-center text-muted py-4 border rounded-3">
                    No hay mesas ocupadas para mostrar.
                </div>
            `;
        } else {
            board.innerHTML = filtered.map((row) => `
                <article class="mesa-card" data-atencion-id="${row.atencionId}">
                    <div class="mesa-card-head">
                        <div class="mesa-icon"><i class="bi bi-grid-3x3-gap-fill"></i></div>
                        <div>
                            <div class="mesa-code">${escapeHtml(row.mesaCodigo)}</div>
                            <div class="mesa-sub">${escapeHtml(row.mesaUbicacion)}</div>
                        </div>
                    </div>
                    <div class="mesa-card-body">
                        <div class="mesa-line"><span>Cliente</span><strong>${escapeHtml(row.clienteNombre)}</strong></div>
                        <div class="mesa-line"><span>Mozo</span><strong>${escapeHtml(row.mozoNombre)}</strong></div>
                        <div class="mesa-line"><span>Apertura</span><strong>${escapeHtml(row.aperturaTexto)}</strong></div>
                    </div>
                    <div class="mesa-card-foot">
                        <span class="badge-pill bp-info"><i class="bi bi-receipt"></i>${row.totalPedidos} pedidos</span>
                        <span class="badge-pill bp-warning"><i class="bi bi-basket2"></i>${row.totalItems} ítems</span>
                    </div>
                </article>
            `).join('');
        }

        if (count) {
            count.textContent = `Mostrando ${filtered.length} mesas ocupadas`;
        }
    }

    function buildOccupiedRows() {
        const atenciones = DB.getAll('atenciones');
        const mesas = DB.getAll('mesas');
        const clientes = DB.getAll('clientes');
        const usuarios = DB.getAll('usuarios');
        const pedidos = DB.getAll('pedidos');
        const detalles = DB.getAll('detallePedidos');

        const mesasById = new Map(mesas.map((mesa) => [Number(mesa.id), mesa]));
        const clientesById = new Map(clientes.map((cliente) => [Number(cliente.id), cliente]));
        const usuariosById = new Map(usuarios.map((usuario) => [Number(usuario.id), usuario]));

        return atenciones
            .filter(isAtencionOcupada)
            .map((atencion) => {
                const mesa = mesasById.get(Number(atencion.id_mesa));
                const cliente = clientesById.get(Number(atencion.id_cliente));
                const mozo = usuariosById.get(Number(atencion.id_mozo));
                const pedidosMesa = pedidos.filter((pedido) => Number(pedido.id_atencion) === Number(atencion.id));
                const pedidoIds = new Set(pedidosMesa.map((pedido) => Number(pedido.id)));
                const items = detalles.filter((detalle) => pedidoIds.has(Number(detalle.id_pedido)));

                return {
                    atencionId: Number(atencion.id),
                    mesaCodigo: mesa ? mesa.codigo : 'Sin mesa',
                    mesaUbicacion: mesa ? mesa.ubicacion : 'Sin ubicación',
                    clienteNombre: cliente ? `${cliente.nombres} ${cliente.apellidos}` : 'Cliente no encontrado',
                    mozoNombre: mozo ? `${mozo.nombres} ${mozo.apellidos}` : 'Sin mozo',
                    aperturaTexto: formatDateTime(atencion.apertura_en),
                    aperturaTs: toTimestamp(atencion.apertura_en),
                    totalPedidos: pedidosMesa.length,
                    totalItems: items.reduce((sum, item) => sum + Number(item.cantidad || 0), 0)
                };
            })
            .sort((a, b) => a.aperturaTs - b.aperturaTs);
    }

    function applySearch(rows) {
        if (!state.search) return rows;

        return rows.filter((row) => {
            return row.mesaCodigo.toLowerCase().includes(state.search)
                || row.mesaUbicacion.toLowerCase().includes(state.search)
                || row.clienteNombre.toLowerCase().includes(state.search)
                || row.mozoNombre.toLowerCase().includes(state.search);
        });
    }

    function openDetailModal(atencionId) {
        const data = buildModalData(atencionId);
        if (!data) return;

        setText('modalMesaTitulo', `${data.mesaCodigo} · ${data.clienteNombre}`);
        setHtml('modalMesaEstadoBadge', estadoBadge(data.estadoAtencion, data.estadoPago));

        setHtml('clienteInfoBlock', `
            <div class="detail-row"><span class="detail-lbl">Nombre</span><span class="detail-val fw-semibold">${escapeHtml(data.clienteNombre)}</span></div>
            <div class="detail-row"><span class="detail-lbl">Documento</span><span class="detail-val">${escapeHtml(data.clienteDocumento)}</span></div>
            <div class="detail-row"><span class="detail-lbl">Teléfono</span><span class="detail-val">${escapeHtml(data.clienteTelefono)}</span></div>
        `);

        setHtml('resumenAtencionBlock', `
            <div class="detail-row"><span class="detail-lbl">Atención</span><span class="detail-val">#${data.atencionId}</span></div>
            <div class="detail-row"><span class="detail-lbl">Mesa</span><span class="detail-val">${escapeHtml(data.mesaCodigo)} · ${escapeHtml(data.mesaUbicacion)}</span></div>
            <div class="detail-row"><span class="detail-lbl">Mozo</span><span class="detail-val">${escapeHtml(data.mozoNombre)}</span></div>
            <div class="detail-row"><span class="detail-lbl">Apertura</span><span class="detail-val">${escapeHtml(data.aperturaTexto)}</span></div>
        `);

        const tbody = byId('detallePedidosMesaBody');
        if (tbody) {
            if (!data.items.length) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center text-muted py-4">No hay pedidos para esta mesa.</td>
                    </tr>
                `;
            } else {
                tbody.innerHTML = data.items.map((item) => `
                    <tr>
                        <td><span class="record-id">#${item.pedidoId}</span></td>
                        <td>
                            <div class="fw-semibold">${escapeHtml(item.platoNombre)}</div>
                            <div class="text-muted small">${escapeHtml(item.horaPedido)}</div>
                        </td>
                        <td class="text-center">${item.cantidad}</td>
                        <td class="text-end">${money(item.precioUnit)}</td>
                        <td class="text-end fw-semibold">${money(item.subtotal)}</td>
                    </tr>
                `).join('');
            }
        }

        setText('totalMesaMonto', money(data.total));
        setText('modalMesaNotas', data.notas || 'Sin notas.');

        const modalEl = byId('modalMesaDetalle');
        if (!modalEl || typeof bootstrap === 'undefined') return;
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }

    function buildModalData(atencionId) {
        const atencion = DB.getById('atenciones', atencionId);
        if (!atencion) return null;

        const mesa = DB.getById('mesas', atencion.id_mesa);
        const cliente = DB.getById('clientes', atencion.id_cliente);
        const mozo = DB.getById('usuarios', atencion.id_mozo);
        const pedidos = DB.getAll('pedidos').filter((pedido) => Number(pedido.id_atencion) === Number(atencion.id));
        const detalles = DB.getAll('detallePedidos');
        const platosById = new Map(DB.getAll('platos').map((plato) => [Number(plato.id), plato]));

        const items = [];
        const notas = [];

        pedidos.forEach((pedido) => {
            const lineas = detalles.filter((detalle) => Number(detalle.id_pedido) === Number(pedido.id));
            if (pedido.notas) notas.push(pedido.notas);

            lineas.forEach((linea) => {
                const plato = platosById.get(Number(linea.id_plato));
                const cantidad = Number(linea.cantidad || 0);
                const precioUnit = Number(linea.precio_unit || 0);
                const descuento = Number(linea.descuento || 0);
                const subtotal = round2(cantidad * precioUnit * (1 - descuento / 100));

                items.push({
                    pedidoId: Number(pedido.id),
                    platoNombre: plato ? plato.nombre : 'Plato no encontrado',
                    cantidad,
                    precioUnit,
                    subtotal,
                    horaPedido: formatDateTime(pedido.creado_en)
                });
            });
        });

        return {
            atencionId: Number(atencion.id),
            estadoAtencion: atencion.estado || 'En curso',
            estadoPago: atencion.estado_pago || 'Pendiente',
            mesaCodigo: mesa ? mesa.codigo : 'Sin mesa',
            mesaUbicacion: mesa ? mesa.ubicacion : 'Sin ubicación',
            clienteNombre: cliente ? `${cliente.nombres} ${cliente.apellidos}` : 'Cliente no encontrado',
            clienteDocumento: cliente ? cliente.documento : '-',
            clienteTelefono: cliente ? cliente.telefono : '-',
            mozoNombre: mozo ? `${mozo.nombres} ${mozo.apellidos}` : 'Sin mozo',
            aperturaTexto: formatDateTime(atencion.apertura_en),
            items,
            notas: notas.join(' | '),
            total: round2(items.reduce((sum, item) => sum + item.subtotal, 0))
        };
    }

    function isAtencionOcupada(atencion) {
        const estado = String(atencion.estado || '').toLowerCase();
        return !(estado.includes('cerrad') || estado.includes('cancel'));
    }

    function estadoBadge(estadoAtencion, estadoPago) {
        const estado = String(estadoAtencion || '').toLowerCase();
        if (estado.includes('cancel')) {
            return '<span class="badge-pill bp-danger">Cancelada</span>';
        }
        if (estado.includes('cerrad')) {
            return '<span class="badge-pill bp-gray">Cerrada</span>';
        }
        const pago = String(estadoPago || '').toLowerCase();
        if (pago === 'pagado') {
            return '<span class="badge-pill bp-success">Pagado</span>';
        }
        return '<span class="badge-pill bp-warning">En curso</span>';
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

    function toTimestamp(isoValue) {
        if (!isoValue) return Number.MAX_SAFE_INTEGER;
        const ts = new Date(isoValue).getTime();
        return Number.isNaN(ts) ? Number.MAX_SAFE_INTEGER : ts;
    }

    function money(value) {
        return `S/ ${Number(value || 0).toFixed(2)}`;
    }

    function round2(value) {
        return Math.round(Number(value || 0) * 100) / 100;
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function setText(id, text) {
        const el = byId(id);
        if (el) el.textContent = text;
    }

    function setHtml(id, html) {
        const el = byId(id);
        if (el) el.innerHTML = html;
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
