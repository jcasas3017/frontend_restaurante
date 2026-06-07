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
        ultimoComprobante: null
    };

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        bindEvents();
        loadMesas();
        render();
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
                render();
            });
        }

        if (pedidoSelect) {
            pedidoSelect.addEventListener('change', (event) => {
                state.pedidoId = event.target.value;
                render();
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
            btnActualizar.addEventListener('click', render);
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

    function loadMesas() {
        const mesaSelect = byId('mesaPagoSelect');
        if (!mesaSelect) return;

        const mesas = DB.getAll('mesas').filter((mesa) => mesa.activa);
        mesaSelect.innerHTML = mesas.map((mesa) => `<option value="${mesa.id}">${mesa.codigo} (${mesa.ubicacion})</option>`).join('');

        if (!state.mesaId && mesas.length) {
            const mesaConPendiente = mesas.find((mesa) => getAtencionesPendientesByMesa(mesa.id).length > 0);
            state.mesaId = String((mesaConPendiente || mesas[0]).id);
            mesaSelect.value = state.mesaId;
        }
    }

    function render() {
        if (!state.mesaId) {
            clearUI();
            return;
        }

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

        const mesa = DB.getById('mesas', state.mesaId);
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

    function cobrarMesa() {
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

        const atencionesPendientes = getAtencionesPendientesByMesa(state.mesaId);
        atencionesPendientes.forEach((atencion) => {
            DB.update('atenciones', atencion.id, {
                estado_pago: 'Pagado',
                estado: atencion.estado === 'Cerrada' ? atencion.estado : 'Cerrada',
                cierre_en: atencion.cierre_en || new Date().toISOString().slice(0, 16)
            });
        });

        const nuevoComprobante = DB.insert('comprobantes', {
            fecha: new Date().toISOString(),
            mesa_id: Number(state.mesaId),
            mesa_codigo: comprobante.mesaCodigo,
            metodo_pago: comprobante.metodoPago,
            subtotal: round2(comprobante.subtotal),
            propina: round2(comprobante.propina),
            total: round2(comprobante.total),
            items: comprobante.items
        });

        state.ultimoComprobante = {
            ...comprobante,
            numero: nuevoComprobante.id,
            fecha: nuevoComprobante.fecha
        };

        render();
        alert('Pago registrado correctamente.');
    }

    function buildComprobanteData() {
        if (!state.mesaId) return null;

        const items = getDetalleItemsByMesa(state.mesaId);
        const mesa = DB.getById('mesas', state.mesaId);
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
        const mesaAtenciones = getAtencionesPendientesByMesa(mesaId);
        if (!mesaAtenciones.length) return [];

        const atencionIds = new Set(mesaAtenciones.map((atencion) => Number(atencion.id)));
        const pedidos = DB.getAll('pedidos').filter((pedido) => atencionIds.has(Number(pedido.id_atencion)));
        const pedidoMap = new Map(pedidos.map((pedido) => [Number(pedido.id), pedido]));
        const pedidoIds = new Set(pedidos.map((pedido) => Number(pedido.id)));

        const platos = DB.getAll('platos');
        const categorias = DB.getAll('categorias');

        return DB.getAll('detallePedidos')
            .filter((item) => pedidoIds.has(Number(item.id_pedido)))
            .map((item) => {
                const plato = platos.find((p) => Number(p.id) === Number(item.id_plato));
                const categoria = plato ? categorias.find((c) => Number(c.id) === Number(plato.id_categoria)) : null;
                const subtotal = calcSubtotal(item.cantidad, item.precio_unit, item.descuento);
                const pedido = pedidoMap.get(Number(item.id_pedido));
                const atencion = pedido
                    ? mesaAtenciones.find((a) => Number(a.id) === Number(pedido.id_atencion))
                    : null;
                const mesa = atencion ? DB.getById('mesas', atencion.id_mesa) : null;

                return {
                    ...item,
                    platoNombre: plato ? plato.nombre : `Plato #${item.id_plato}`,
                    categoriaNombre: categoria ? categoria.nombre : 'Sin categoria',
                    mesaCodigo: mesa ? mesa.codigo : 'Mesa',
                    subtotal
                };
            });
    }

    function getPedidosByMesa(mesaId) {
        const atenciones = getAtencionesPendientesByMesa(mesaId);
        if (!atenciones.length) return [];

        const atencionIds = new Set(atenciones.map((atencion) => Number(atencion.id)));
        const mesa = DB.getById('mesas', mesaId);

        return DB.getAll('pedidos')
            .filter((pedido) => atencionIds.has(Number(pedido.id_atencion)))
            .map((pedido) => ({
                ...pedido,
                mesaCodigo: mesa ? mesa.codigo : 'Mesa'
            }));
    }

    function getAtencionesPendientesByMesa(mesaId) {
        return DB.getAll('atenciones').filter((atencion) => (
            Number(atencion.id_mesa) === Number(mesaId) &&
            atencion.estado_pago !== 'Pagado'
        ));
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
        const atencionesMesa = DB.getAll('atenciones').filter(
            (atencion) => Number(atencion.id_mesa) === Number(mesaId)
        );

        if (!atencionesMesa.length) {
            return { nombre: 'Sin cliente', documento: '-' };
        }

        const atencionConClientePendiente = atencionesMesa.find(
            (atencion) => atencion.estado_pago !== 'Pagado' && atencion.id_cliente
        );

        const atencionConCliente = atencionConClientePendiente || atencionesMesa.find((atencion) => atencion.id_cliente);
        if (!atencionConCliente) {
            return { nombre: 'Sin cliente', documento: '-' };
        }

        const cliente = DB.getById('clientes', atencionConCliente.id_cliente);
        if (!cliente) {
            return { nombre: 'Sin cliente', documento: '-' };
        }

        const nombreCompleto = [cliente.nombres, cliente.apellidos].filter(Boolean).join(' ').trim() || 'Sin cliente';
        return {
            nombre: nombreCompleto,
            documento: cliente.documento || '-'
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

