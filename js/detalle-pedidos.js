/* =====================================================
   RestaControl — Detalle de Pedidos Page Logic
   Handles: render by table, payment with tip, receipt printing
   ===================================================== */

(() => {
    const state = {
        mesaId: '',
        pedidoId: '',
        search: '',
        propina: 0,
        ultimoComprobante: null,
        mesas: [],
        currentContexto: null
    };

    const api = window.ListaMesasApi || null;
    const USE_API_ONLY = true;

    document.addEventListener('DOMContentLoaded', () => { void init(); });

    async function init() {
        bindEvents();
        await loadMesas();
        await render();
    }

    function bindEvents() {
        const mesaSelect = byId('mesaPagoSelect');
        const pedidoSelect = byId('filtroPedido');
        const busqueda = byId('busquedaPlato');
        const propinaInput = byId('propinaInput');
        const btnActualizar = byId('btnActualizar');
        const btnCobrar = byId('btnCobrarMesa');
        const btnImprimir = byId('btnImprimirComprobante');

        if (mesaSelect) {
            mesaSelect.addEventListener('change', (event) => {
                state.mesaId = event.target.value;
                state.pedidoId = '';
                void render();
            });
        }

        if (pedidoSelect) {
            pedidoSelect.addEventListener('change', (event) => {
                state.pedidoId = event.target.value;
                void render();
            });
        }

        if (busqueda) {
            busqueda.addEventListener('input', (event) => {
                state.search = event.target.value.trim().toLowerCase();
                renderTable();
            });
        }

        if (propinaInput) {
            propinaInput.addEventListener('input', (event) => {
                const value = Number(event.target.value);
                state.propina = Number.isFinite(value) && value > 0 ? value : 0;
                renderPaymentSummary();
            });
        }

        if (btnActualizar) {
            btnActualizar.addEventListener('click', () => void render());
        }

        if (btnCobrar) {
            btnCobrar.addEventListener('click', cobrarMesa);
        }

        if (btnImprimir) {
            btnImprimir.addEventListener('click', () => {
                const comprobante = state.ultimoComprobante || buildComprobanteData();
                if (!comprobante || !comprobante.items.length) {
                    alert('No hay ítems para imprimir en esta mesa.');
                    return;
                }
                printComprobante(comprobante);
            });
        }
    }

    async function loadMesas() {
        const mesaSelect = byId('mesaPagoSelect');
        if (!mesaSelect) return;

        if (apiAvailable()) {
            try {
                const response = await api.getTablero();
                const mesasApi = Array.isArray(response?.data) ? response.data : [];
                state.mesas = mesasApi.map((item) => ({
                    id: item.idMesa || item.id || '',
                    codigo: item.codigo || `Mesa ${item.idMesa || item.id}`,
                    ubicacion: item.ubicacion || '',
                    activa: item.activa !== false,
                    contexto: null
                }));
            } catch (error) {
                console.error('Error cargando mesas desde API:', error);
                state.mesas = [];
            }
        } else {
            console.error('Modo API-only activado y no hay backend disponible para mesas.');
            state.mesas = [];
        }

        const mesasActivas = state.mesas.filter((mesa) => mesa.activa);
        if (!mesasActivas.length) {
            mesaSelect.innerHTML = '';
            state.mesaId = '';
            return;
        }

        mesaSelect.innerHTML = mesasActivas.map((mesa) => `<option value="${mesa.id}">${mesa.codigo}${mesa.ubicacion ? ` (${mesa.ubicacion})` : ''}</option>`).join('');

        if (!state.mesaId) {
            state.mesaId = String(mesasActivas[0].id);
            mesaSelect.value = state.mesaId;
        }
    }

    async function render() {
        if (!state.mesaId) {
            clearUI();
            return;
        }

        await ensureCurrentMesaContext();
        fillPedidosFilter();
        renderTable();
        renderStats();
        renderPaymentSummary();
    }

    function fillPedidosFilter() {
        const pedidoSelect = byId('filtroPedido');
        if (!pedidoSelect) return;

        const pedidos = getPedidosByMesa(state.mesaId);
        const current = state.pedidoId;

        pedidoSelect.innerHTML = ['<option value="">Todos los pedidos</option>']
            .concat(
                pedidos.map((pedido) => `<option value="${pedido.id}">#${pedido.id} - ${pedido.mesaCodigo}</option>`)
            )
            .join('');

        if (current && pedidos.some((pedido) => String(pedido.id) === String(current))) {
            pedidoSelect.value = current;
        } else {
            state.pedidoId = '';
            pedidoSelect.value = '';
        }
    }

    function renderTable() {
        const tbody = byId('detallePedidosBody');
        const conteo = byId('tablaConteo');
        const totalEl = byId('tablaTotal');
        if (!tbody) return;

        const allItems = getDetalleItemsByMesa(state.mesaId);
        let filtered = allItems;

        if (state.pedidoId) {
            filtered = filtered.filter((item) => String(item.id_pedido) === String(state.pedidoId));
        }

        if (state.search) {
            filtered = filtered.filter((item) => item.platoNombre.toLowerCase().includes(state.search));
        }

        if (!filtered.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center text-muted py-4">
                        No hay detalles de pedidos para los filtros seleccionados.
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = filtered.map((item) => `
                <tr>
                    <td><span class="record-id">#${item.id}</span></td>
                    <td><a href="pedidos.html" class="text-decoration-none fw-semibold">Pedido #${item.id_pedido}</a></td>
                    <td>
                        <div class="fw-semibold">${item.platoNombre}</div>
                        <div class="text-muted small">${item.categoriaNombre}</div>
                    </td>
                    <td class="text-center">${item.cantidad}</td>
                    <td class="text-end">${money(item.precio_unit)}</td>
                    <td class="text-end text-muted">${item.descuento}%</td>
                    <td class="text-end fw-semibold">${money(item.subtotal)}</td>
                    <td class="text-end">
                        <span class="badge-pill bp-info">${item.mesaCodigo}</span>
                    </td>
                </tr>
            `).join('');
        }

        const total = filtered.reduce((sum, item) => sum + item.subtotal, 0);
        if (totalEl) totalEl.textContent = money(total);
        if (conteo) conteo.textContent = `Mostrando ${filtered.length} de ${allItems.length} ítems`;
    }

    function renderStats() {
        const items = getDetalleItemsByMesa(state.mesaId);
        const pedidos = getPedidosByMesa(state.mesaId);

        const statPedido = byId('statPedidoActivo');
        const statTotal = byId('statTotalItems');
        const statSubtotal = byId('statSubtotal');

        const mesa = getMesaById(state.mesaId);
        const etiquetaPedido = pedidos.length
            ? `#${pedidos[0].id} - ${mesa ? mesa.codigo : 'Mesa'}`
            : `${mesa ? mesa.codigo : 'Mesa'} sin pedidos`;

        if (statPedido) statPedido.textContent = etiquetaPedido;
        if (statTotal) statTotal.textContent = String(items.reduce((sum, item) => sum + Number(item.cantidad || 0), 0));
        if (statSubtotal) statSubtotal.textContent = money(items.reduce((sum, item) => sum + item.subtotal, 0));
    }

    function renderPaymentSummary() {
        const items = getDetalleItemsByMesa(state.mesaId);
        const clienteInfo = getClienteInfoByMesa(state.mesaId);
        const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
        const propina = state.propina;
        const total = subtotal + propina;

        setText('pagoCliente', clienteInfo.nombre);
        setText('pagoClienteDoc', clienteInfo.documento);
        setText('pagoSubtotal', money(subtotal));
        setText('pagoPropina', money(propina));
        setText('pagoTotal', money(total));
    }

    async function cobrarMesa() {
        if (!state.mesaId) {
            alert('Seleccione una mesa para cobrar.');
            return;
        }

        const comprobante = buildComprobanteData();
        if (!comprobante || !comprobante.items.length) {
            alert('La mesa seleccionada no tiene pedidos pendientes.');
            return;
        }

        const confirmar = confirm(`Confirma el cobro de ${comprobante.mesaCodigo} por ${money(comprobante.total)}?`);
        if (!confirmar) return;

        if (!apiAvailable()) {
            alert('No es posible cobrar la mesa porque el backend no está disponible.');
            return;
        }

        const atencion = state.currentContexto?.atencionActiva;
        if (!atencion || !atencion.id) {
            alert('No se encontró una atención activa para esta mesa.');
            return;
        }

        try {
            const response = await api.cobrarAtencion(atencion.id, {
                metodoPago: comprobante.metodoPago || 'Efectivo',
                propina: round2(comprobante.propina),
                observaciones: '',
                generarComprobante: true
            });

            const data = response?.data || {};
            const comprobanteApi = {
                id: data.idComprobante || `PED-${atencion.id}`,
                fecha: data.fechaEmision || new Date().toISOString(),
                mesaCodigo: comprobante.mesaCodigo,
                clienteNombre: comprobante.clienteNombre,
                clienteDocumento: comprobante.clienteDocumento,
                metodoPago: data.metodoPago || comprobante.metodoPago || 'Efectivo',
                subtotal: Number(data.subtotal || comprobante.subtotal || 0),
                propina: Number(data.propina || comprobante.propina || 0),
                total: Number(data.total || comprobante.total || 0),
                items: comprobante.items
            };

            state.ultimoComprobante = comprobanteApi;
            await render();

            if (data.generarComprobante !== false && comprobanteApi.items.length) {
                printComprobante(comprobanteApi);
            }

            alert(`Pago registrado. Total cobrado: ${money(comprobanteApi.total)}`);
        } catch (error) {
            alert(extractApiMessage(error, 'No se pudo registrar el cobro.'));
        }
    }

    function buildComprobanteData() {
        if (!state.mesaId) return null;

        const items = getDetalleItemsByMesa(state.mesaId);
        const mesa = getMesaById(state.mesaId);
        const clienteInfo = getClienteInfoByMesa(state.mesaId);
        const metodoPago = byId('metodoPagoSelect') ? byId('metodoPagoSelect').value : 'Efectivo';

        const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
        const propina = state.propina;
        const total = subtotal + propina;

        return {
            numero: state.ultimoComprobante ? state.ultimoComprobante.numero : 'PREVIO',
            fecha: new Date().toISOString(),
            mesaCodigo: mesa ? mesa.codigo : 'Mesa',
            clienteNombre: clienteInfo.nombre,
            clienteDocumento: clienteInfo.documento,
            metodoPago,
            subtotal,
            propina,
            total,
            items: items.map((item) => ({
                plato: item.platoNombre,
                cantidad: item.cantidad,
                unitario: item.precio_unit,
                descuento: item.descuento,
                subtotal: item.subtotal
            }))
        };
    }

    function printComprobante(comprobante) {
        const fechaFmt = new Date(comprobante.fecha).toLocaleString('es-PE');
        const lines = comprobante.items.map((item) => `
            <tr>
                <td>${item.plato}</td>
                <td style="text-align:center;">${item.cantidad}</td>
                <td style="text-align:right;">${money(item.unitario)}</td>
                <td style="text-align:right;">${item.descuento}%</td>
                <td style="text-align:right;">${money(item.subtotal)}</td>
            </tr>
        `).join('');

        const html = `
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <title>Comprobante ${comprobante.numero}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; color: #222; }
                    h2 { margin: 0 0 4px; }
                    p { margin: 2px 0; }
                    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
                    th, td { border-bottom: 1px solid #ddd; padding: 6px 4px; font-size: 12px; }
                    th { text-align: left; background: #f5f5f5; }
                    .totales { margin-top: 12px; width: 280px; margin-left: auto; }
                    .totales div { display: flex; justify-content: space-between; margin: 2px 0; }
                    .totales .total { font-weight: 700; font-size: 16px; }
                    .footer { margin-top: 16px; font-size: 12px; text-align: center; color: #666; }
                </style>
            </head>
            <body>
                <h2>RestaControl</h2>
                <p>Comprobante: ${comprobante.numero}</p>
                <p>Mesa: ${comprobante.mesaCodigo}</p>
                <p>Cliente: ${comprobante.clienteNombre}</p>
                <p>Documento: ${comprobante.clienteDocumento}</p>
                <p>Fecha: ${fechaFmt}</p>
                <p>Metodo de pago: ${comprobante.metodoPago}</p>

                <table>
                    <thead>
                        <tr>
                            <th>Plato</th>
                            <th style="text-align:center;">Cant.</th>
                            <th style="text-align:right;">P. Unit.</th>
                            <th style="text-align:right;">Desc.</th>
                            <th style="text-align:right;">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>${lines}</tbody>
                </table>

                <div class="totales">
                    <div><span>Subtotal</span><span>${money(comprobante.subtotal)}</span></div>
                    <div><span>Propina</span><span>${money(comprobante.propina)}</span></div>
                    <div class="total"><span>Total</span><span>${money(comprobante.total)}</span></div>
                </div>

                <div class="footer">Gracias por su visita.</div>
                <script>
                    window.onload = function () {
                        window.print();
                        window.onafterprint = function () { window.close(); };
                    };
                <\/script>
            </body>
            </html>
        `;

        const w = window.open('', '_blank', 'width=900,height=700');
        if (!w) {
            alert('No se pudo abrir la ventana de impresion. Habilite las ventanas emergentes.');
            return;
        }

        w.document.open();
        w.document.write(html);
        w.document.close();
    }

    function getDetalleItemsByMesa(mesaId) {
        const contexto = state.currentContexto;
        if (!contexto || !contexto.pedidoActual || String(contexto.mesaId) !== String(mesaId)) return [];

        const pedidoActual = contexto.pedidoActual;
        const mesa = getMesaById(mesaId);

        return Array.isArray(pedidoActual.items) ? pedidoActual.items.map((item) => {
            const subtotal = Number(item.subtotal || calcSubtotal(item.cantidad, item.precioUnit, item.descuento));
            return {
                id: item.idDetalle || item.id || '',
                id_pedido: item.idPedido || pedidoActual.idPedido || '',
                platoNombre: item.nombreItem || item.platoNombre || item.productoNombre || 'Ítem',
                categoriaNombre: item.categoriaNombre || '',
                cantidad: Number(item.cantidad || 0),
                precio_unit: Number(item.precioUnit || item.precio_unit || 0),
                descuento: Number(item.descuento || 0),
                subtotal,
                mesaCodigo: mesa ? mesa.codigo : 'Mesa'
            };
        }) : [];
    }

    function getPedidosByMesa(mesaId) {
        const contexto = state.currentContexto;
        if (!contexto || !contexto.pedidoActual || String(contexto.mesaId) !== String(mesaId)) return [];
        const pedidos = [];
        const pedidoActual = contexto.pedidoActual;
        if (pedidoActual && (pedidoActual.idPedido || pedidoActual.id)) {
            const mesa = getMesaById(mesaId);
            pedidos.push({
                id: pedidoActual.idPedido || pedidoActual.id || '',
                mesaCodigo: mesa ? mesa.codigo : 'Mesa'
            });
        }
        return pedidos;
    }

    function getAtencionesPendientesByMesa(mesaId) {
        const contexto = state.currentContexto;
        if (!contexto || !contexto.atencionActiva || String(contexto.mesaId) !== String(mesaId)) return [];
        return [contexto.atencionActiva];
    }

    function getClienteInfoByMesa(mesaId) {
        const contexto = state.currentContexto;
        if (!contexto || !contexto.atencionActiva || String(contexto.mesaId) !== String(mesaId)) {
            return { nombre: 'Sin cliente', documento: '-' };
        }

        const atencion = contexto.atencionActiva;
        const nombre = atencion.clienteNombre || atencion.cliente_nombre || 'Sin cliente';
        const documento = atencion.clienteDocumento || atencion.cliente_documento || '-';
        return {
            nombre,
            documento
        };
    }

    async function ensureCurrentMesaContext() {
        if (!state.mesaId) {
            state.currentContexto = null;
            return null;
        }

        if (!apiAvailable()) {
            state.currentContexto = null;
            return null;
        }

        try {
            const response = await api.getContextoMesa(state.mesaId);
            const contexto = normalizeApiContext(response?.data || {});
            state.currentContexto = {
                mesaId: state.mesaId,
                ...contexto
            };
            return state.currentContexto;
        } catch (error) {
            console.error('Error cargando contexto de mesa:', error);
            state.currentContexto = null;
            return null;
        }
    }

    function apiAvailable() {
        return USE_API_ONLY && !!api;
    }

    function normalizeApiContext(raw) {
        const atencionActiva = raw.atencionActiva ? normalizeApiAtencion(raw.atencionActiva) : null;
        const pedidoActual = raw.pedidoActual ? normalizePedidoActual(raw.pedidoActual) : null;
        return { atencionActiva, pedidoActual };
    }

    function normalizeApiAtencion(raw) {
        return {
            id: raw.idAtencion || raw.id || null,
            id_cliente: raw.idCliente || raw.id_cliente || null,
            clienteNombre: raw.clienteNombre || raw.cliente_nombre || null,
            clienteDocumento: raw.clienteDocumento || raw.cliente_documento || null,
            estado_pago: raw.estadoPago || raw.estado_pago || null,
            apertura_en: raw.aperturaEn || raw.apertura_en || null,
            estado: raw.estado || null
        };
    }

    function normalizePedidoActual(raw) {
        if (!raw || typeof raw !== 'object') return null;
        return {
            idPedido: raw.idPedido || raw.id || null,
            subtotal: Number(raw.subtotal || 0),
            propina: Number(raw.propina || 0),
            total: Number(raw.total || 0),
            items: Array.isArray(raw.items) ? raw.items.map((item) => ({
                idDetalle: item.idDetalle || item.id || null,
                idPedido: item.idPedido || raw.idPedido || raw.id || null,
                tipoItem: item.tipoItem || item.tipo_item || 'plato',
                idItem: item.idItem || item.idPlato || item.idProducto || item.id || null,
                nombreItem: item.nombreItem || item.nombre_item || item.platoNombre || item.productoNombre || 'Ítem',
                cantidad: Number(item.cantidad || 0),
                precioUnit: Number(item.precioUnit || item.precio_unit || 0),
                descuento: Number(item.descuento || 0),
                estadoCocina: item.estadoCocina || item.estado_cocina || 'pendiente',
                subtotal: Number(item.subtotal || 0)
            })) : []
        };
    }

    function getMesaById(mesaId) {
        return state.mesas.find((mesa) => String(mesa.id) === String(mesaId)) || null;
    }

    function clearUI() {
        const tbody = byId('detallePedidosBody');
        if (tbody) tbody.innerHTML = '';

        setText('statPedidoActivo', '-');
        setText('statTotalItems', '0');
        setText('statSubtotal', money(0));
        setText('tablaTotal', money(0));
        setText('tablaConteo', 'Mostrando 0 de 0 ítems');
        setText('pagoCliente', '-');
        setText('pagoClienteDoc', '-');
        setText('pagoSubtotal', money(0));
        setText('pagoPropina', money(0));
        setText('pagoTotal', money(0));
    }

    function getClienteInfoByMesa(mesaId) {
        const contexto = state.currentContexto;
        if (!contexto || !contexto.atencionActiva || String(contexto.mesaId) !== String(mesaId)) {
            return { nombre: 'Sin cliente', documento: '-' };
        }

        const atencion = contexto.atencionActiva;
        const nombreCompleto = atencion.clienteNombre || atencion.cliente_nombre || 'Sin cliente';
        const documento = atencion.clienteDocumento || atencion.cliente_documento || '-';

        return {
            nombre: nombreCompleto,
            documento
        };
    }

    function calcSubtotal(cantidad, precio, descuentoPct) {
        const bruto = Number(cantidad) * Number(precio);
        const descuento = bruto * (Number(descuentoPct) / 100);
        return round2(bruto - descuento);
    }

    function money(value) {
        return `S/ ${Number(value || 0).toFixed(2)}`;
    }

    function round2(value) {
        return Math.round(Number(value) * 100) / 100;
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function setText(id, text) {
        const el = byId(id);
        if (el) el.textContent = text;
    }
})();

