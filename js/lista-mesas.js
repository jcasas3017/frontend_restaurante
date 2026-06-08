/* =====================================================
   RestaControl — Lista Mesas
   Tablero visual por estado de mesa
   ===================================================== */

(() => {
    const TOTAL_MESAS_TABLERO = 15;
    const DEFAULT_UBICACION = 'Salón principal';
    const RESERVA_DURACION_MINUTOS = 120;
    const api = window.ListaMesasApi || null;
    const state = {
        rows: [],
        selected: null,
        dataSource: 'local',
        fechaHoraFiltro: '',
        catalogs: {
            clientes: null,
            mozos: null,
            platos: null,
            productos: null
        }
    };

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        const btnActualizar = byId('btnActualizarListaMesas');
        if (btnActualizar) btnActualizar.addEventListener('click', render);

        initDateTimeFilters();

        const board = byId('listaMesasBoard');
        if (board) {
            board.addEventListener('click', (event) => {
                const btn = event.target.closest('[data-mesa-numero]');
                if (!btn) return;
                const numero = Number(btn.dataset.mesaNumero);
                const mesa = state.rows.find((row) => row.numero === numero);
                if (!mesa) return;
                handleMesaClick(mesa);
            });
        }

        if (!apiAvailable()) {
            ensureMesa1Ocupada();
            ensureDemoReservation();
        }
        render();
    }

    async function render() {
        const board = byId('listaMesasBoard');
        const count = byId('listaMesasCount');
        if (!board) return;

        const fechaHoraReferencia = getSelectedFechaHoraIso();
        state.fechaHoraFiltro = fechaHoraReferencia;

        const mesas = await buildBoardMesas(fechaHoraReferencia);
        state.rows = mesas;

        board.innerHTML = mesas.map((mesa) => `
            <button class="lm-btn lm-${mesa.estado}" type="button" data-bs-toggle="tooltip" data-bs-title="${escapeHtml(buildTooltipText(mesa))}" data-mesa-numero="${mesa.numero}">
                <span class="lm-icon-wrap">
                    <i class="bi ${mesa.icono}"></i>
                </span>
                <span class="lm-code">${mesa.codigo}</span>
            </button>
        `).join('');

        renderLegendCounts(mesas);
        initTooltips(board);
        renderFiltroActual(fechaHoraReferencia);

        if (count) {
            count.textContent = `Mostrando ${mesas.length} mesas`; 
        }
    }

    function buildTooltipText(mesa) {
        if (mesa.estado === 'ocupada' && mesa.atencionActiva) {
            const nombreApi = mesa.atencionActiva.clienteNombre || mesa.atencionActiva.cliente_nombre;
            const cliente = !apiAvailable() ? DB.getById('clientes', mesa.atencionActiva.id_cliente) : null;
            const nombre = nombreApi || (cliente ? `${cliente.nombres} ${cliente.apellidos}` : 'Cliente');
            return `${mesa.codigo} · Ocupada · ${nombre}`;
        }
        if (mesa.estado === 'reservada' && mesa.reservaActiva) {
            return `${mesa.codigo} · Reservada · ${formatDateTime(mesa.reservaActiva.fecha_hora)}`;
        }
        if (mesa.estado === 'nodisponible') return `${mesa.codigo} · No disponible`;
        return `${mesa.codigo} · Libre`;
    }

    function renderLegendCounts(mesas) {
        const stats = {
            ocupada: 0,
            libre: 0,
            reservada: 0,
            nodisponible: 0
        };

        mesas.forEach((mesa) => {
            if (stats[mesa.estado] !== undefined) stats[mesa.estado] += 1;
        });

        setText('lmCountOcupada', String(stats.ocupada));
        setText('lmCountLibre', String(stats.libre));
        setText('lmCountReservada', String(stats.reservada));
        setText('lmCountNoDisponible', String(stats.nodisponible));
    }

    function apiAvailable() {
        return !!api;
    }

    function extractApiMessage(error, fallback) {
        if (!api || typeof api.formatApiError !== 'function') {
            return fallback || 'No se pudo completar la operación.';
        }
        const formatted = api.formatApiError(error);
        return formatted.message || fallback || 'No se pudo completar la operación.';
    }

    async function buildBoardMesas(fechaHoraReferencia) {
        if (apiAvailable()) {
            try {
                const response = await api.getTablero(fechaHoraReferencia);
                const rows = Array.isArray(response?.data) ? response.data.map(mapApiMesaToBoardRow) : [];
                state.dataSource = 'api';
                if (rows.length) return rows;
            } catch {
                state.dataSource = 'local';
            }
        }

        state.dataSource = 'local';
        return buildBoardMesasLocal(fechaHoraReferencia);
    }

    function buildBoardMesasLocal(fechaHoraReferencia) {
        const mesasDb = DB.getAll('mesas');
        const atenciones = DB.getAll('atenciones');
        const reservas = DB.getAll('reservas');

        const mesaBase = [];
        for (let i = 1; i <= TOTAL_MESAS_TABLERO; i += 1) {
            const codigo = `Mesa ${String(i).padStart(2, '0')}`;
            const mesaReal = mesasDb.find((m) => Number(m.id) === i || extractMesaNumeroFromCodigo(m.codigo) === i);
            mesaBase.push({
                numero: i,
                codigo,
                mesaReal: mesaReal || buildVirtualMesa(i)
            });
        }

        return mesaBase.map(({ numero, codigo, mesaReal }) => {
            const context = resolveMesaContext(numero, mesaReal, atenciones, reservas, fechaHoraReferencia);
            return {
                numero,
                codigo,
                mesaReal,
                estado: context.estado,
                estadoTexto: estadoLabel(context.estado),
                icono: estadoIcon(context.estado),
                atencionActiva: context.atencionActiva,
                reservaActiva: context.reservaActiva
            };
        });
    }

    function mapApiMesaToBoardRow(item, index) {
        const numero = extractMesaNumeroFromCodigo(item?.codigo) || Number(index + 1);
        const estado = mapApiEstadoOperativo(item?.estadoOperativo);
        const mesaId = item?.idMesa || item?.id || null;

        return {
            numero,
            codigo: item?.codigo || `Mesa ${String(numero).padStart(2, '0')}`,
            mesaReal: {
                id: mesaId,
                codigo: item?.codigo || `M-${String(numero).padStart(2, '0')}`,
                capacidad: Number(item?.capacidad || 0),
                ubicacion: item?.ubicacion || DEFAULT_UBICACION,
                activa: Boolean(item?.activa !== false)
            },
            estado,
            estadoTexto: estadoLabel(estado),
            icono: estadoIcon(estado),
            atencionActiva: mapApiAtencion(item?.atencionActiva),
            reservaActiva: mapApiReserva(item?.reservaActiva),
            totalActual: Number(item?.totalActual || 0),
            contextoApi: null
        };
    }

    function mapApiEstadoOperativo(value) {
        const raw = String(value || '').toLowerCase();
        if (raw === 'no_disponible') return 'nodisponible';
        if (raw === 'ocupada') return 'ocupada';
        if (raw === 'reservada') return 'reservada';
        return 'libre';
    }

    function mapApiAtencion(atencion) {
        if (!atencion) return null;
        return {
            id: atencion.idAtencion || atencion.id || null,
            id_cliente: atencion.idCliente || atencion.id_cliente || null,
            id_mesa: atencion.idMesa || atencion.id_mesa || null,
            id_mozo: atencion.idMozo || atencion.id_mozo || null,
            apertura_en: atencion.aperturaEn || atencion.apertura_en || '',
            estado_pago: atencion.estadoPago || atencion.estado_pago || 'Pendiente',
            clienteNombre: atencion.clienteNombre || atencion.cliente_nombre || ''
        };
    }

    function mapApiReserva(reserva) {
        if (!reserva) return null;
        return {
            id: reserva.idReserva || reserva.id || null,
            id_cliente: reserva.idCliente || reserva.id_cliente || null,
            id_mesa: reserva.idMesa || reserva.id_mesa || null,
            nombre_contacto: reserva.nombreContacto || reserva.nombre_contacto || '',
            fecha_hora: reserva.fechaHora || reserva.fecha_hora || '',
            cantidad_personas: reserva.cantidadPersonas || reserva.cantidad_personas || 0,
            estado: reserva.estado || 'Pendiente',
            confirmada: Boolean(reserva.confirmada)
        };
    }

    function resolveMesaContext(numero, mesaReal, atenciones, reservas, fechaHoraReferencia) {
        if (mesaReal && mesaReal.activa === false) {
            return {
                estado: 'nodisponible',
                atencionActiva: null,
                reservaActiva: null
            };
        }

        const mesaId = Number(mesaReal.id || 0);
        const fechaHoraRefTs = toTimestamp(fechaHoraReferencia);

        const atencionActiva = atenciones.find((atencion) => {
            const estado = String(atencion.estado || '').toLowerCase();
            const enCurso = !(estado.includes('cerrad') || estado.includes('cancel'));
            return mesaId > 0 && Number(atencion.id_mesa) === mesaId && enCurso;
        });

        if (atencionActiva) {
            return {
                estado: 'ocupada',
                atencionActiva,
                reservaActiva: null
            };
        }

        const reservasMesa = reservas.filter((reserva) => {
            const estado = String(reserva.estado || '').toLowerCase();
            return mesaId > 0
                && Number(reserva.id_mesa) === mesaId
                && !estado.includes('cancel')
                && isReservaVigenteEnFechaHora(reserva, fechaHoraRefTs);
        });
        const reservaActiva = reservasMesa.sort((a, b) => toTimestamp(a.fecha_hora) - toTimestamp(b.fecha_hora))[0] || null;

        if (reservaActiva) {
            return {
                estado: 'reservada',
                atencionActiva: null,
                reservaActiva
            };
        }

        return {
            estado: 'libre',
            atencionActiva: null,
            reservaActiva: null
        };
    }

    function estadoLabel(estado) {
        if (estado === 'ocupada') return 'Ocupada';
        if (estado === 'reservada') return 'Reservada';
        if (estado === 'nodisponible') return 'No disponible';
        return 'Libre';
    }

    function estadoIcon(estado) {
        if (estado === 'ocupada') return 'bi-people-fill';
        if (estado === 'reservada') return 'bi-bookmark-star-fill';
        if (estado === 'nodisponible') return 'bi-x-octagon-fill';
        return 'bi-door-open-fill';
    }

    async function handleMesaClick(mesa) {
        state.selected = mesa;
        const fechaHoraReferencia = state.fechaHoraFiltro || getSelectedFechaHoraIso();

        if (apiAvailable() && mesa && mesa.mesaReal && mesa.mesaReal.id) {
            try {
                const response = await api.getContextoMesa(mesa.mesaReal.id, fechaHoraReferencia);
                mesa.contextoApi = normalizeApiContext(response?.data);
            } catch {
                mesa.contextoApi = null;
            }
        }

        if (mesa.estado === 'nodisponible') return;
        if (mesa.estado === 'ocupada') {
            if (apiAvailable()) {
                await ensureClientesCatalog();
                await ensureMozosCatalog();
            }
            openModalOcupada(mesa);
            return;
        }
        if (mesa.estado === 'reservada') {
            openModalReservada(mesa);
            return;
        }
        openModalLibre(mesa);
    }

    function normalizeApiContext(contexto) {
        if (!contexto || typeof contexto !== 'object') return null;

        const reservaActiva = mapApiReserva(contexto.reservaActiva || null);
        const atencionActiva = mapApiAtencion(contexto.atencionActiva || null);
        const pedidoActualRaw = contexto.pedidoActual || null;
        const pedidoActual = pedidoActualRaw ? {
            idPedido: pedidoActualRaw.idPedido || pedidoActualRaw.id || null,
            subtotal: Number(pedidoActualRaw.subtotal || 0),
            propina: Number(pedidoActualRaw.propina || 0),
            total: Number(pedidoActualRaw.total || 0),
            items: Array.isArray(pedidoActualRaw.items) ? pedidoActualRaw.items.map((item) => ({
                idDetalle: item.idDetalle || item.id || null,
                idPedido: item.idPedido || pedidoActualRaw.idPedido || null,
                tipoItem: item.tipoItem || item.tipo_item || 'plato',
                nombreItem: item.nombreItem || item.nombre_item || item.platoNombre || 'Ítem',
                cantidad: Number(item.cantidad || 0),
                precioUnit: Number(item.precioUnit || item.precio_unit || 0),
                descuento: Number(item.descuento || 0),
                estadoCocina: item.estadoCocina || item.estado_cocina || 'pendiente',
                subtotal: Number(item.subtotal || 0)
            })) : []
        } : null;

        return {
            mesa: contexto.mesa || null,
            reservaActiva,
            atencionActiva,
            pedidoActual
        };
    }

    function openModalOcupada(mesa) {
        const modalTitle = byId('lmModalTitle');
        const modalBody = byId('lmModalBody');
        const modalFooter = byId('lmModalFooter');
        if (!modalTitle || !modalBody || !modalFooter) return;

        const atencion = getMesaAtencion(mesa);
        if (!atencion) {
            alert('No se encontró una atención activa para esta mesa.');
            return;
        }
        const detalle = buildAtencionDetalle(atencion, mesa);

        modalTitle.textContent = `${mesa.codigo} · Mesa ocupada`;
        modalBody.innerHTML = `
            <div class="row g-4">
                <div class="col-lg-4">
                    <div class="lm-block">
                        <h6 class="lm-block-title">Cliente</h6>
                        <div class="lm-line"><span>Nombre</span><strong>${escapeHtml(detalle.clienteNombre)}</strong></div>
                        <div class="lm-line"><span>Documento</span><strong>${escapeHtml(detalle.clienteDocumento)}</strong></div>
                        <div class="lm-line"><span>Teléfono</span><strong>${escapeHtml(detalle.clienteTelefono)}</strong></div>
                    </div>
                    <div class="lm-block mt-3">
                        <h6 class="lm-block-title">Atención</h6>
                        <div class="lm-line"><span>Mozo</span><strong>${escapeHtml(detalle.mozoNombre)}</strong></div>
                        <div class="lm-line"><span>Apertura</span><strong>${escapeHtml(detalle.apertura)}</strong></div>
                        <div class="lm-line"><span>Estado pago</span><strong>${escapeHtml(detalle.estadoPago)}</strong></div>
                    </div>
                    <div class="lm-block mt-3">
                        <h6 class="lm-block-title">Cobro</h6>
                        <div class="mb-2">
                            <label class="form-label small mb-1">Método de pago</label>
                            <select class="form-select form-select-sm" id="lmMetodoPagoSelect">
                                <option value="Efectivo">Efectivo</option>
                                <option value="Tarjeta">Tarjeta</option>
                                <option value="Yape/Plin">Yape/Plin</option>
                            </select>
                        </div>
                        <div>
                            <label class="form-label small mb-1">Propina (S/)</label>
                            <input class="form-control form-control-sm" id="lmPropinaInput" type="number" min="0" step="0.10" value="0">
                        </div>
                    </div>
                </div>
                <div class="col-lg-8">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle">
                            <thead>
                                <tr>
                                    <th>Pedido</th>
                                    <th>Plato</th>
                                    <th class="text-center">Cant.</th>
                                    <th>Estado</th>
                                    <th class="text-end">Subtotal</th>
                                    <th class="text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody id="lmPedidosTableBody">${renderPedidosRows(detalle.items)}</tbody>
                            <tfoot class="table-group-divider">
                                <tr class="fw-bold" style="background:#f8fafc;">
                                    <td colspan="5" class="text-end pe-3">Total a pagar</td>
                                    <td class="text-end" style="color:var(--brand);">${money(detalle.total)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        `;

        const pagoActivo = String(detalle.estadoPago).toLowerCase() === 'pagado';
        const sinPedidoInicial = !Array.isArray(detalle.items) || !detalle.items.length;
        modalFooter.innerHTML = `
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
            <button type="button" class="btn btn-brand" id="lmCobrarBtn" ${pagoActivo ? 'disabled' : ''}><i class="bi bi-cash-coin me-1"></i>${pagoActivo ? 'Mesa pagada' : 'Cobrar mesa'}</button>
        `;

        const cobrarBtn = byId('lmCobrarBtn');
        if (cobrarBtn && !pagoActivo) {
            cobrarBtn.addEventListener('click', () => openPagoResumen(mesa, atencion, detalle));
        }

        // Handler para acciones de estado por ítem en la tabla
        const pedidosBody = byId('lmPedidosTableBody');
        if (pedidosBody) {
            pedidosBody.addEventListener('click', async (event) => {
                const btn = event.target.closest('[data-item-action][data-item-detalle-id]');
                if (!btn) return;
                const nuevoEstado = btn.dataset.itemAction;
                const detalleId = Number(btn.dataset.itemDetalleId);
                if (!detalleId || !nuevoEstado) return;
                try {
                    if (apiAvailable() && atencion && atencion.id) {
                        await api.cambiarEstadoItem(detalleId, nuevoEstado);
                    } else {
                        DB.update('detallePedidos', detalleId, {
                            estado_cocina: nuevoEstado,
                            actualizado_cocina_en: new Date().toISOString()
                        });
                    }

                    // Refrescar solo la tabla del modal sin cerrar
                    const atencionFresh = await refreshMesaAtencion(mesa, atencion.id);
                    const detalleFresh = buildAtencionDetalle(atencionFresh || atencion, mesa);
                    pedidosBody.innerHTML = renderPedidosRows(detalleFresh.items);
                } catch (error) {
                    alert(extractApiMessage(error, 'No se pudo actualizar el estado del ítem.'));
                }
            });
        }

        const addPlatoBtn = document.createElement('button');
        addPlatoBtn.type = 'button';
        addPlatoBtn.className = 'btn btn-outline-primary';
        addPlatoBtn.id = 'lmAñadirPlatoBtn';
        addPlatoBtn.innerHTML = '<i class="bi bi-plus-circle me-1"></i>Añadir plato';
        addPlatoBtn.addEventListener('click', () => openCatalogoModal(mesa, atencion));
        
        if (modalFooter && !pagoActivo) {
            modalFooter.insertBefore(addPlatoBtn, cobrarBtn);
        }

        if (modalFooter && !pagoActivo && sinPedidoInicial) {
            const anularBtn = document.createElement('button');
            anularBtn.type = 'button';
            anularBtn.className = 'btn btn-outline-danger';
            anularBtn.id = 'lmAnularAtencionBtn';
            anularBtn.innerHTML = '<i class="bi bi-x-circle me-1"></i>Anular';
            anularBtn.addEventListener('click', () => anularAtencionSinPedido(mesa, atencion, detalle));
            modalFooter.insertBefore(anularBtn, modalFooter.firstChild);
        }

        showModal();
    }

    async function anularAtencionSinPedido(mesa, atencion, detalle) {
        if (!atencion || !atencion.id) {
            alert('No se encontró una atención activa para anular.');
            return;
        }

        if (Array.isArray(detalle?.items) && detalle.items.length) {
            alert('No se puede anular porque la atención ya tiene pedidos registrados.');
            return;
        }

        if (!confirm('¿Deseas anular la atención? La mesa volverá a estado libre.')) return;

        if (apiAvailable()) {
            try {
                await api.anularAtencion(atencion.id, { motivo: 'Sin pedido inicial' });
                hideModal();
                await render();
                alert('Atención anulada. Mesa liberada.');
                return;
            } catch (error) {
                alert(extractApiMessage(error, 'No se pudo anular la atención.'));
                return;
            }
        }

        DB.update('atenciones', atencion.id, {
            estado: 'Cancelada',
            cierre_en: new Date().toISOString().slice(0, 16)
        });

        hideModal();
        await render();
        alert('Atención anulada. Mesa liberada.');
    }

    function openPagoResumen(mesa, atencion, detalle) {
        const metodo = byId('lmMetodoPagoSelect');
        const propinaInput = byId('lmPropinaInput');
        const metodoPago = metodo ? metodo.value : 'Efectivo';
        const propina = Number(propinaInput ? propinaInput.value : 0);
        const propinaOk = Number.isFinite(propina) && propina > 0 ? propina : 0;
        const subtotal = round2(detalle.total);
        const total = round2(subtotal + propinaOk);

        const modalTitle = byId('lmModalTitle');
        const modalBody = byId('lmModalBody');
        const modalFooter = byId('lmModalFooter');
        if (!modalTitle || !modalBody || !modalFooter) return;

        modalTitle.textContent = `${mesa.codigo} · Resumen de pago`;
        modalBody.innerHTML = `
            <div class="lm-block mb-3">
                <h6 class="lm-block-title">Datos de cobro</h6>
                <div class="lm-line"><span>Mesa</span><strong>${escapeHtml(mesa.codigo)}</strong></div>
                <div class="lm-line"><span>Atención</span><strong>#${escapeHtml(formatRecordId(atencion.id))}</strong></div>
                <div class="lm-line"><span>Tipo de pago</span><strong>${escapeHtml(metodoPago)}</strong></div>
                <div class="lm-line"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
                <div class="lm-line"><span>Propina</span><strong>${money(propinaOk)}</strong></div>
                <div class="lm-line"><span>Total a pagar</span><strong style="color:var(--brand);">${money(total)}</strong></div>
            </div>
            <p class="small text-muted mb-0">Al confirmar se cerrará la atención, la mesa quedará libre y se generará el comprobante.</p>
        `;

        modalFooter.innerHTML = `
            <button type="button" class="btn btn-outline-secondary" id="lmBackPagoBtn">Volver</button>
            <button type="button" class="btn btn-brand" id="lmConfirmPagoBtn"><i class="bi bi-cash-coin me-1"></i>Confirmar pago</button>
            <button type="button" class="btn btn-success" id="lmConfirmPrintBtn"><i class="bi bi-printer me-1"></i>Pagar e imprimir</button>
        `;

        const backBtn = byId('lmBackPagoBtn');
        if (backBtn) backBtn.addEventListener('click', () => openModalOcupada(mesa));

        const confirmBtn = byId('lmConfirmPagoBtn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                cobrarMesa(atencion, subtotal, metodoPago, propinaOk, false);
            });
        }

        const printBtn = byId('lmConfirmPrintBtn');
        if (printBtn) {
            printBtn.addEventListener('click', () => {
                cobrarMesa(atencion, subtotal, metodoPago, propinaOk, true);
            });
        }
    }

    async function cobrarMesa(atencion, subtotal, metodoPago, propinaOk, imprimir) {
        const total = round2(Number(subtotal || 0) + Number(propinaOk || 0));

        if (apiAvailable() && atencion && atencion.id) {
            try {
                const response = await api.cobrarAtencion(atencion.id, {
                    metodoPago: metodoPago || 'Efectivo',
                    propina: round2(propinaOk),
                    observaciones: '',
                    generarComprobante: Boolean(imprimir)
                });

                if (imprimir && response && response.data) {
                    const comprobanteApi = {
                        id: response.data.idComprobante || atencion.id,
                        fecha: response.data.fechaEmision || new Date().toISOString(),
                        atencion_id: atencion.id,
                        mesa_id: Number(atencion.id_mesa),
                        mesa_codigo: state.selected?.codigo || '',
                        metodo_pago: response.data.metodoPago || metodoPago || 'Efectivo',
                        subtotal: Number(response.data.subtotal || subtotal || 0),
                        propina: Number(response.data.propina || propinaOk || 0),
                        total: Number(response.data.total || total)
                    };
                    printComprobante(comprobanteApi);
                }

                hideModal();
                await render();
                alert(`Pago registrado. Total cobrado: ${money(Number(response?.data?.total || total))}`);
                return;
            } catch (error) {
                alert(extractApiMessage(error, 'No se pudo registrar el cobro.'));
                return;
            }
        }

        DB.update('atenciones', atencion.id, {
            estado_pago: 'Pagado',
            estado: 'Cerrada',
            cierre_en: new Date().toISOString().slice(0, 16)
        });

        // Si la atención venía desde una reserva, la damos por atendida
        // para que la mesa no vuelva a verse como "reservada" tras cobrar.
        if (atencion.id_reserva) {
            DB.update('reservas', atencion.id_reserva, {
                estado: 'Atendida',
                confirmada: true
            });
        }

        const comprobante = DB.insert('comprobantes', {
            fecha: new Date().toISOString(),
            atencion_id: Number(atencion.id),
            mesa_id: Number(atencion.id_mesa),
            metodo_pago: metodoPago || 'Efectivo',
            subtotal: round2(subtotal),
            propina: round2(propinaOk),
            total
        });

        if (imprimir) {
            printComprobante(comprobante);
        }

        hideModal();
        render();
        alert(`Pago registrado. Total cobrado: ${money(total)}`);
    }

    function printComprobante(comprobante) {
        const mesa = DB.getById('mesas', comprobante.mesa_id);
        const atencion = DB.getById('atenciones', comprobante.atencion_id);
        const cliente = atencion ? DB.getById('clientes', atencion.id_cliente) : null;
        const mesaTexto = mesa ? mesa.codigo : (comprobante.mesa_codigo || `Mesa ${comprobante.mesa_id}`);

        const html = `
            <html>
            <head>
                <title>Comprobante #${comprobante.id}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 18px; color: #0f172a; }
                    h3 { margin: 0 0 12px; }
                    .line { display: flex; justify-content: space-between; margin: 5px 0; }
                    .muted { color: #64748b; }
                    .total { font-weight: 700; border-top: 1px dashed #94a3b8; padding-top: 8px; margin-top: 8px; }
                </style>
            </head>
            <body>
                <h3>Comprobante de Pago</h3>
                <div class="line"><span>N° comprobante</span><strong>#${escapeHtml(formatRecordId(comprobante.id))}</strong></div>
                <div class="line"><span>Fecha</span><strong>${escapeHtml(formatDateTime(comprobante.fecha))}</strong></div>
                <div class="line"><span>Mesa</span><strong>${escapeHtml(mesaTexto)}</strong></div>
                <div class="line"><span>Cliente</span><strong>${escapeHtml(cliente ? `${cliente.nombres} ${cliente.apellidos}` : 'Consumidor final')}</strong></div>
                <div class="line"><span>Tipo de pago</span><strong>${escapeHtml(comprobante.metodo_pago || 'Efectivo')}</strong></div>
                <div class="line"><span>Subtotal</span><strong>${money(comprobante.subtotal)}</strong></div>
                <div class="line"><span>Propina</span><strong>${money(comprobante.propina)}</strong></div>
                <div class="line total"><span>Total pagado</span><strong>${money(comprobante.total)}</strong></div>
                <p class="muted">Gracias por su visita.</p>
                <script>window.print();window.close();</script>
            </body>
            </html>
        `;

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('No se pudo abrir la ventana de impresión. Revisa el bloqueador de ventanas emergentes.');
            return;
        }
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
    }

    async function openModalLibre(mesa) {
        const modalTitle = byId('lmModalTitle');
        const modalBody = byId('lmModalBody');
        const modalFooter = byId('lmModalFooter');
        if (!modalTitle || !modalBody || !modalFooter) return;

        await ensureOcuparCatalogsLoaded();

        modalTitle.textContent = `${mesa.codigo} · Mesa libre`;

        modalBody.innerHTML = `
            <div class="row g-3">
                <div class="col-12"><div class="alert alert-info mb-0">Registrar ocupación para ${mesa.codigo} y agregar pedidos iniciales.</div></div>
                <div class="col-md-6">
                    <label class="form-label">Buscar cliente por documento</label>
                    <div class="input-group">
                        <input class="form-control" id="lmClienteDocumentoInput" placeholder="Ej: 71234567" maxlength="20">
                        <button class="btn btn-outline-secondary" type="button" id="lmBuscarClienteBtn"><i class="bi bi-search"></i></button>
                    </div>
                    <input type="hidden" id="lmClienteSelect" value="">
                    <div class="form-text">Selecciona un cliente existente antes de ocupar la mesa.</div>
                </div>
                <div class="col-md-6">
                    <label class="form-label">Mozo</label>
                    <select class="form-select" id="lmMozoSelect">${buildMozosOptions(state.catalogs.mozos)}</select>
                </div>
                <div class="col-12 d-none" id="lmClienteEncontradoPanel"></div>
                <div class="col-12 d-none" id="lmClienteNoEncontradoPanel">
                    <div class="alert alert-warning d-flex align-items-center justify-content-between mb-0">
                        <span>No se encontró cliente con ese documento.</span>
                        <button type="button" class="btn btn-sm btn-warning" id="lmMostrarAltaClienteBtn">Registrar cliente</button>
                    </div>
                </div>
                <div class="col-12 d-none" id="lmAltaClienteInlineWrap">
                    <div class="border rounded p-3 bg-light">
                        <div class="fw-semibold mb-2">Alta rápida de cliente</div>
                        <div class="row g-2">
                            <div class="col-md-3">
                                <label class="form-label small mb-1">Documento</label>
                                <input type="text" class="form-control" id="lmQuickClienteDocumento" maxlength="20">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small mb-1">Nombres</label>
                                <input type="text" class="form-control" id="lmQuickClienteNombres">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small mb-1">Apellidos</label>
                                <input type="text" class="form-control" id="lmQuickClienteApellidos">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small mb-1">Teléfono</label>
                                <input type="text" class="form-control" id="lmQuickClienteTelefono">
                            </div>
                            <div class="col-md-5">
                                <label class="form-label small mb-1">Email</label>
                                <input type="email" class="form-control" id="lmQuickClienteEmail">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small mb-1">Tipo documento</label>
                                <select class="form-select" id="lmQuickClienteTipoDocumento">
                                    <option value="DNI">DNI</option>
                                    <option value="RUC">RUC</option>
                                    <option value="PASAPORTE">PASAPORTE</option>
                                </select>
                            </div>
                            <div class="col-md-4 d-flex align-items-end gap-2">
                                <button type="button" class="btn btn-brand w-100" id="lmCrearClienteInlineBtn"><i class="bi bi-person-plus me-1"></i>Crear cliente</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-12">
                    <label class="form-label">Notas del pedido</label>
                    <textarea class="form-control" id="lmPedidoNotas" rows="2" placeholder="Opcional"></textarea>
                </div>
                <div class="col-12">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="mb-0">Platos del pedido</h6>
                        <button class="btn btn-sm btn-outline-secondary" type="button" id="lmAddItemBtn"><i class="bi bi-plus"></i>Agregar plato</button>
                    </div>
                    <div id="lmItemsContainer"></div>
                    <div class="form-text mt-2">Puedes dejarlo vacío y solo ocupar la mesa; el pedido se puede agregar después.</div>
                </div>
            </div>
        `;

        modalFooter.innerHTML = `
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
            <button type="button" class="btn btn-brand" id="lmConfirmOcuparBtn"><i class="bi bi-check-circle me-1"></i>Ocupar mesa</button>
        `;

        initPedidoItemsEditor();

        const buscarClienteBtn = byId('lmBuscarClienteBtn');
        if (buscarClienteBtn) buscarClienteBtn.addEventListener('click', buscarClienteLibrePorDocumento);

        const mostrarAltaBtn = byId('lmMostrarAltaClienteBtn');
        if (mostrarAltaBtn) {
            mostrarAltaBtn.addEventListener('click', () => {
                const documentoActual = String(byId('lmClienteDocumentoInput')?.value || '').trim();
                mostrarAltaClienteLibre(documentoActual);
            });
        }

        const crearClienteBtn = byId('lmCrearClienteInlineBtn');
        if (crearClienteBtn) crearClienteBtn.addEventListener('click', crearClienteLibreInline);

        const clienteDocInput = byId('lmClienteDocumentoInput');
        if (clienteDocInput) {
            clienteDocInput.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                buscarClienteLibrePorDocumento();
            });
        }

        const addBtn = byId('lmAddItemBtn');
        if (addBtn) addBtn.addEventListener('click', addPedidoItemRow);
        const confirmBtn = byId('lmConfirmOcuparBtn');
        if (confirmBtn) confirmBtn.addEventListener('click', () => confirmOcuparMesa(mesa, null));

        showModal();
    }

    async function openModalReservada(mesa) {
        const modalTitle = byId('lmModalTitle');
        const modalBody = byId('lmModalBody');
        const modalFooter = byId('lmModalFooter');
        if (!modalTitle || !modalBody || !modalFooter) return;

        await ensureOcuparCatalogsLoaded();

        const reserva = (mesa.contextoApi && mesa.contextoApi.reservaActiva) ? mesa.contextoApi.reservaActiva : mesa.reservaActiva;
        const clienteApi = state.catalogs.clientes.find((cliente) => String(cliente.id) === String(reserva ? reserva.id_cliente : ''));
        const cliente = !apiAvailable() && reserva ? DB.getById('clientes', reserva.id_cliente) : null;
        const clienteNombre = clienteApi
            ? clienteApi.nombreCompleto
            : (cliente ? `${cliente.nombres} ${cliente.apellidos}` : (reserva ? reserva.nombre_contacto : 'Cliente'));

        modalTitle.textContent = `${mesa.codigo} · Mesa reservada`;
        modalBody.innerHTML = `
            <div class="row g-3">
                <div class="col-md-6">
                    <div class="lm-block">
                        <h6 class="lm-block-title">Detalle de reserva</h6>
                        <div class="lm-line"><span>Cliente</span><strong>${escapeHtml(clienteNombre)}</strong></div>
                        <div class="lm-line"><span>Fecha</span><strong>${escapeHtml(formatDateTime(reserva ? reserva.fecha_hora : ''))}</strong></div>
                        <div class="lm-line"><span>Personas</span><strong>${reserva ? Number(reserva.cantidad_personas || 0) : 0}</strong></div>
                        <div class="lm-line"><span>Estado</span><strong>${escapeHtml(reserva ? reserva.estado : 'Reservada')}</strong></div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="lm-block">
                        <h6 class="lm-block-title">Pedidos</h6>
                        <p class="mb-0 text-muted small">Aún no hay pedidos registrados para esta reserva.</p>
                    </div>
                </div>
                <div class="col-12">
                    <hr class="my-1">
                    <p class="small text-muted mb-2">Si el cliente llegó, puedes cambiar la mesa a ocupada y registrar pedidos iniciales.</p>
                </div>
                <div class="col-md-6">
                    <label class="form-label">Mozo</label>
                    <select class="form-select" id="lmMozoSelect">${buildMozosOptions(state.catalogs.mozos)}</select>
                </div>
                <div class="col-md-6">
                    <label class="form-label">Notas del pedido</label>
                    <input class="form-control" id="lmPedidoNotas" placeholder="Opcional">
                </div>
                <div class="col-12">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="mb-0">Platos del pedido</h6>
                        <button class="btn btn-sm btn-outline-secondary" type="button" id="lmAddItemBtn"><i class="bi bi-plus"></i>Agregar plato</button>
                    </div>
                    <div id="lmItemsContainer"></div>
                </div>
            </div>
        `;
        modalFooter.innerHTML = `
            <button type="button" class="btn btn-outline-danger" id="lmCancelarReservaBtn"><i class="bi bi-x-circle me-1"></i>Cancelar reserva</button>
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
            <button type="button" class="btn btn-brand" id="lmReservadaToOcupadaBtn"><i class="bi bi-lightning me-1"></i>Cambiar a ocupada</button>
        `;

        initPedidoItemsEditor();
        const addBtn = byId('lmAddItemBtn');
        if (addBtn) addBtn.addEventListener('click', addPedidoItemRow);
        const actionBtn = byId('lmReservadaToOcupadaBtn');
        if (actionBtn) actionBtn.addEventListener('click', () => confirmOcuparMesa(mesa, reserva));
        
        const cancelReservaBtn = byId('lmCancelarReservaBtn');
        if (cancelReservaBtn) {
            cancelReservaBtn.addEventListener('click', () => cancelarReserva(reserva));
        }

        showModal();
    }

    async function confirmOcuparMesa(mesa, reserva) {
        const clienteSelect = byId('lmClienteSelect');
        const mozoSelect = byId('lmMozoSelect');
        const notasInput = byId('lmPedidoNotas');

        const clienteIdRaw = clienteSelect ? String(clienteSelect.value || '') : String(reserva ? reserva.id_cliente : '');
        const mozoIdRaw = mozoSelect ? String(mozoSelect.value || '') : '';
        const clienteId = apiAvailable() ? clienteIdRaw : Number(clienteIdRaw);
        const mozoId = apiAvailable() ? mozoIdRaw : Number(mozoIdRaw);
        if (!clienteId || !mozoId) {
            alert('Selecciona cliente y mozo para registrar la ocupación.');
            return;
        }

        if (apiAvailable() && (!isUuid(clienteId) || !isUuid(mozoId))) {
            alert('El cliente o mozo seleccionado no tiene formato UUID válido. Vuelve a buscar y selecciona datos del backend.');
            return;
        }

        const pedidoItems = collectPedidoItems();

        if (apiAvailable() && mesa && mesa.mesaReal && mesa.mesaReal.id) {
            try {
                const payload = {
                    idCliente: clienteId,
                    idMozo: mozoId,
                    notas: notasInput ? notasInput.value.trim() : '',
                    items: pedidoItems.length
                        ? pedidoItems.map((item) => ({
                            tipoItem: 'plato',
                            idItem: item.platoId,
                            cantidad: item.cantidad,
                            observaciones: ''
                        }))
                        : []
                };

                if (reserva && reserva.id) {
                    await api.ocuparMesaReservada(mesa.mesaReal.id, reserva.id, payload);
                } else {
                    await api.ocuparMesa(mesa.mesaReal.id, payload);
                }

                hideModal();
                await render();
                alert('Mesa ocupada y pedido registrado correctamente.');
                return;
            } catch (error) {
                alert(extractApiMessage(error, 'No se pudo ocupar la mesa.'));
                return;
            }
        }

        const now = new Date();
        const mesaId = ensureMesaPersisted(mesa);

        const atencion = DB.insert('atenciones', {
            id_cliente: clienteId,
            id_reserva: reserva ? Number(reserva.id) : '',
            id_mesa: mesaId,
            id_mozo: mozoId,
            estado: 'En curso',
            estado_pago: 'Pendiente',
            apertura_en: now.toISOString().slice(0, 16),
            cierre_en: ''
        });

        const pedido = DB.insert('pedidos', {
            id_atencion: Number(atencion.id),
            creado_por: mozoId,
            creado_en: now.toISOString(),
            notas: notasInput ? notasInput.value.trim() : ''
        });

        if (pedidoItems.length) {
            pedidoItems.forEach((item) => {
                DB.insert('detallePedidos', {
                    id_pedido: Number(pedido.id),
                    id_plato: Number(item.platoId),
                    cantidad: Number(item.cantidad),
                    precio_unit: Number(item.precio),
                    descuento: 0,
                    estado_cocina: 'pendiente'
                });
            });
        }

        if (reserva) {
            DB.update('reservas', reserva.id, {
                estado: 'Confirmada',
                confirmada: true
            });
        }

        hideModal();
        render();
        alert('Mesa ocupada y pedido registrado correctamente.');
    }

    function buildAtencionDetalle(atencion, mesa = null) {
        if (apiAvailable() && mesa && mesa.contextoApi) {
            const ctx = mesa.contextoApi;
            const pedidoActual = ctx.pedidoActual || null;
            const clienteApi = (state.catalogs.clientes || []).find((cliente) => String(cliente.id) === String(atencion.id_cliente || ctx.reservaActiva?.id_cliente || '')) || null;
            const clienteNombreApi = atencion.clienteNombre || clienteApi?.nombreCompleto || ctx.reservaActiva?.nombre_contacto || 'Cliente';
            const clienteDocumentoApi = clienteApi?.documento || '-';
            const clienteTelefonoApi = clienteApi?.telefono || '-';
            const mozoApi = (state.catalogs.mozos || []).find((usuario) => String(usuario.id) === String(atencion.id_mozo || '')) || null;
            const mozoNombreApi = atencion.mozoNombre || mozoApi?.nombreCompleto || 'Sin mozo';
            const itemsApi = ((pedidoActual && Array.isArray(pedidoActual.items)) ? pedidoActual.items : []).map((item) => ({
                detalleId: item.idDetalle,
                pedidoId: item.idPedido || pedidoActual?.idPedido || '-',
                platoNombre: item.nombreItem,
                cantidad: Number(item.cantidad || 0),
                estadoPlato: normalizeEstadoPlato(item.estadoCocina),
                subtotal: round2(item.subtotal || (Number(item.cantidad || 0) * Number(item.precioUnit || 0)))
            }));

            return {
                clienteNombre: clienteNombreApi,
                clienteDocumento: clienteDocumentoApi,
                clienteTelefono: clienteTelefonoApi,
                mozoNombre: mozoNombreApi,
                apertura: formatDateTime(atencion.apertura_en),
                estadoPago: atencion.estado_pago || 'Pendiente',
                items: itemsApi,
                total: round2((pedidoActual ? pedidoActual.total : 0) || itemsApi.reduce((sum, item) => sum + item.subtotal, 0))
            };
        }

        const cliente = DB.getById('clientes', atencion.id_cliente);
        const mozo = DB.getById('usuarios', atencion.id_mozo);
        const pedidos = DB.getAll('pedidos').filter((pedido) => Number(pedido.id_atencion) === Number(atencion.id));
        const detalles = DB.getAll('detallePedidos');
        const platosById = new Map(DB.getAll('platos').map((plato) => [Number(plato.id), plato]));

        const items = [];
        pedidos.forEach((pedido) => {
            const lineas = detalles.filter((detalle) => Number(detalle.id_pedido) === Number(pedido.id));
            lineas.forEach((linea) => {
                const plato = platosById.get(Number(linea.id_plato));
                const cantidad = Number(linea.cantidad || 0);
                const precio = Number(linea.precio_unit || 0);
                const descuento = Number(linea.descuento || 0);
                const subtotal = round2(cantidad * precio * (1 - descuento / 100));
                items.push({
                    detalleId: Number(linea.id),
                    pedidoId: pedido.id,
                    platoNombre: plato ? plato.nombre : 'Plato no encontrado',
                    cantidad,
                    estadoPlato: normalizeEstadoPlato(linea.estado_cocina),
                    subtotal
                });
            });
        });

        return {
            clienteNombre: cliente ? `${cliente.nombres} ${cliente.apellidos}` : 'Cliente no encontrado',
            clienteDocumento: cliente ? cliente.documento : '-',
            clienteTelefono: cliente ? cliente.telefono : '-',
            mozoNombre: mozo ? `${mozo.nombres} ${mozo.apellidos}` : 'Sin mozo',
            apertura: formatDateTime(atencion.apertura_en),
            estadoPago: atencion.estado_pago || 'Pendiente',
            items,
            total: round2(items.reduce((sum, item) => sum + item.subtotal, 0))
        };
    }

    function renderPedidosRows(items) {
        if (!items.length) {
            return '<tr><td colspan="6" class="text-center text-muted py-4">No hay pedidos registrados.</td></tr>';
        }

        return items.map((item) => {
            const yaFinal = item.estadoPlato === 'cancelado';
            const entregadoBtn = item.estadoPlato !== 'entregado' && !yaFinal
                ? `<button class="btn btn-sm btn-outline-primary py-0 px-2" title="Marcar entregado" data-item-action="entregado" data-item-detalle-id="${item.detalleId}"><i class="bi bi-bag-check"></i></button>`
                : '';
            const cancelarBtn = !yaFinal && item.estadoPlato !== 'entregado'
                ? `<button class="btn btn-sm btn-outline-danger py-0 px-2" title="Cancelar plato" data-item-action="cancelado" data-item-detalle-id="${item.detalleId}"><i class="bi bi-x-circle"></i></button>`
                : '';
            const acciones = (entregadoBtn || cancelarBtn)
                ? `<div class="d-flex gap-1 justify-content-center">${entregadoBtn}${cancelarBtn}</div>`
                : '<span class="text-muted small">—</span>';

            return `
                <tr>
                    <td><span class="record-id">#${item.pedidoId}</span></td>
                    <td>${escapeHtml(item.platoNombre)}</td>
                    <td class="text-center">${item.cantidad}</td>
                    <td>${platoEstadoBadge(item.estadoPlato)}</td>
                    <td class="text-end fw-semibold">${money(item.subtotal)}</td>
                    <td class="text-center">${acciones}</td>
                </tr>
            `;
        }).join('');
    }

    function normalizeEstadoPlato(estado) {
        const raw = String(estado || '').toLowerCase();
        if (raw.includes('entregado')) return 'entregado';
        if (raw.includes('listo')) return 'listo';
        if (raw.includes('cancel')) return 'cancelado';
        return 'pendiente';
    }

    function getMesaAtencion(mesa) {
        if (apiAvailable() && mesa && mesa.contextoApi && mesa.contextoApi.atencionActiva) {
            return mesa.contextoApi.atencionActiva;
        }
        return mesa ? mesa.atencionActiva : null;
    }

    async function refreshMesaAtencion(mesa, atencionId) {
        if (!apiAvailable() || !mesa?.mesaReal?.id) {
            return DB.getById('atenciones', atencionId);
        }
        try {
            const fechaHoraReferencia = state.fechaHoraFiltro || getSelectedFechaHoraIso();
            const response = await api.getContextoMesa(mesa.mesaReal.id, fechaHoraReferencia);
            mesa.contextoApi = normalizeApiContext(response?.data);
            return mesa.contextoApi?.atencionActiva || null;
        } catch {
            return mesa?.contextoApi?.atencionActiva || null;
        }
    }

    function platoEstadoBadge(estado) {
        if (estado === 'entregado') return '<span class="badge-pill" style="background:#e0f2fe;color:#0369a1;"><i class="bi bi-bag-check-fill me-1"></i>Entregado</span>';
        if (estado === 'listo') return '<span class="badge-pill bp-success">Listo</span>';
        if (estado === 'cancelado') return '<span class="badge-pill bp-danger">Cancelado</span>';
        return '<span class="badge-pill bp-warning">Pendiente</span>';
    }

    function initPedidoItemsEditor() {
        const container = byId('lmItemsContainer');
        if (!container) return;
        container.innerHTML = '';
        addPedidoItemRow();
        container.onclick = (event) => {
            const btn = event.target.closest('[data-remove-item]');
            if (!btn) return;
            const row = btn.closest('.lm-item-row');
            if (row) row.remove();
            if (!container.children.length) addPedidoItemRow();
        };
    }

    function addPedidoItemRow() {
        const container = byId('lmItemsContainer');
        if (!container) return;
        const platos = (state.catalogs.platos && state.catalogs.platos.length)
            ? state.catalogs.platos
            : DB.getAll('platos').filter((plato) => plato.activo && plato.disponible !== false);

        const row = document.createElement('div');
        row.className = 'row g-2 align-items-end mb-2 lm-item-row';
        row.innerHTML = `
            <div class="col-md-7">
                <label class="form-label small">Plato</label>
                <select class="form-select" data-item-plato>
                    ${platos.map((plato) => `<option value="${plato.id}" data-precio="${plato.precio}">${escapeHtml(plato.nombre)} (S/ ${Number(plato.precio).toFixed(2)})</option>`).join('')}
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label small">Cantidad</label>
                <input type="number" class="form-control" min="1" value="1" data-item-cantidad>
            </div>
            <div class="col-md-2 text-md-end">
                <button type="button" class="btn btn-outline-danger btn-sm w-100" data-remove-item><i class="bi bi-trash"></i></button>
            </div>
        `;
        container.appendChild(row);
    }

    function collectPedidoItems() {
        const rows = Array.from(document.querySelectorAll('#lmItemsContainer .lm-item-row'));
        return rows.map((row) => {
            const plato = row.querySelector('[data-item-plato]');
            const cantidad = row.querySelector('[data-item-cantidad]');
            const precio = plato?.selectedOptions?.[0]?.dataset?.precio;
            return {
                platoId: Number(plato ? plato.value : 0),
                cantidad: Number(cantidad ? cantidad.value : 0),
                precio: Number(precio || 0)
            };
        }).filter((item) => item.platoId > 0 && item.cantidad > 0);
    }

    async function buscarClienteLibrePorDocumento() {
        const input = byId('lmClienteDocumentoInput');
        const documento = String(input ? input.value : '').trim();
        if (!documento) {
            alert('Ingresa un documento para buscar cliente.');
            return;
        }

        const clienteIdInput = byId('lmClienteSelect');
        if (clienteIdInput) clienteIdInput.value = '';

        let found = null;

        if (apiAvailable() && api && typeof api.buscarClientePorDocumento === 'function') {
            try {
                const response = await api.buscarClientePorDocumento(documento);
                const data = response?.data;
                if (Array.isArray(data)) {
                    found = data.find((cliente) => String(cliente?.documento || '').trim() === documento) || null;
                } else if (data && typeof data === 'object') {
                    found = data;
                }
            } catch {
                found = null;
            }
        }

        if (!found && !apiAvailable()) {
            found = findClienteByDocumentoLocal(documento);
        }

        if (!found) {
            renderClienteLibreNoEncontrado();
            return;
        }

        renderClienteLibreSeleccionado(found);
    }

    function findClienteByDocumentoLocal(documento) {
        const clientes = Array.isArray(state.catalogs.clientes) && state.catalogs.clientes.length
            ? state.catalogs.clientes
            : DB.getAll('clientes').filter((cliente) => cliente.activo).map((cliente) => ({
                id: cliente.id,
                nombreCompleto: `${cliente.nombres || ''} ${cliente.apellidos || ''}`.trim(),
                documento: cliente.documento || '',
                telefono: cliente.telefono || '',
                email: cliente.email || ''
            }));

        return clientes.find((cliente) => String(cliente?.documento || '').trim() === documento) || null;
    }

    function renderClienteLibreSeleccionado(cliente) {
        const clienteIdInput = byId('lmClienteSelect');
        if (clienteIdInput) clienteIdInput.value = String(cliente?.id || '');

        const panelOk = byId('lmClienteEncontradoPanel');
        if (panelOk) {
            const nombre = cliente?.nombreCompleto
                || `${cliente?.nombres || ''} ${cliente?.apellidos || ''}`.trim()
                || 'Cliente';
            panelOk.classList.remove('d-none');
            panelOk.innerHTML = `
                <div class="alert alert-success mb-0">
                    <div class="fw-semibold">Cliente seleccionado: ${escapeHtml(nombre)}</div>
                    <div class="small">Documento: ${escapeHtml(cliente?.documento || '-')} | Teléfono: ${escapeHtml(cliente?.telefono || '-')} | Email: ${escapeHtml(cliente?.email || '-')}</div>
                </div>
            `;
        }

        const panelNo = byId('lmClienteNoEncontradoPanel');
        if (panelNo) panelNo.classList.add('d-none');
    }

    function renderClienteLibreNoEncontrado() {
        const panelOk = byId('lmClienteEncontradoPanel');
        if (panelOk) {
            panelOk.classList.add('d-none');
            panelOk.innerHTML = '';
        }

        const panelNo = byId('lmClienteNoEncontradoPanel');
        if (panelNo) panelNo.classList.remove('d-none');

        const altaWrap = byId('lmAltaClienteInlineWrap');
        if (altaWrap) altaWrap.classList.add('d-none');
    }

    function mostrarAltaClienteLibre(documento) {
        const altaWrap = byId('lmAltaClienteInlineWrap');
        if (!altaWrap) return;
        altaWrap.classList.remove('d-none');
        const docInput = byId('lmQuickClienteDocumento');
        if (docInput && documento) docInput.value = documento;
    }

    async function crearClienteLibreInline() {
        const documento = String(byId('lmQuickClienteDocumento')?.value || '').trim();
        const nombres = String(byId('lmQuickClienteNombres')?.value || '').trim();
        const apellidos = String(byId('lmQuickClienteApellidos')?.value || '').trim();
        const telefono = String(byId('lmQuickClienteTelefono')?.value || '').trim();
        const email = String(byId('lmQuickClienteEmail')?.value || '').trim();
        const tipoDocumento = String(byId('lmQuickClienteTipoDocumento')?.value || 'DNI').trim();

        if (!documento || documento.length < 8 || !nombres || !apellidos) {
            alert('Para crear cliente: documento (mín. 8), nombres y apellidos.');
            return;
        }

        try {
            let nuevo = null;

            if (apiAvailable() && api && typeof api.crearCliente === 'function') {
                const response = await api.crearCliente({
                    tipoDocumento,
                    documento,
                    nombres,
                    apellidos,
                    telefono,
                    email,
                    activo: true
                });
                nuevo = response?.data || null;
            } else {
                nuevo = DB.insert('clientes', {
                    documento,
                    nombres,
                    apellidos,
                    telefono,
                    email,
                    activo: true
                });
            }

            if (!nuevo?.id) {
                alert('Cliente creado sin identificador en la respuesta.');
                return;
            }

            const normalizado = {
                id: nuevo.id,
                nombreCompleto: nuevo.nombreCompleto || nuevo.nombre_completo || `${nuevo.nombres || nombres} ${nuevo.apellidos || apellidos}`.trim() || 'Cliente',
                documento: nuevo.documento || documento,
                telefono: nuevo.telefono || telefono,
                email: nuevo.email || email
            };

            state.catalogs.clientes = [normalizado]
                .concat((state.catalogs.clientes || []).filter((x) => String(x.id) !== String(normalizado.id)));

            const docInput = byId('lmClienteDocumentoInput');
            if (docInput) docInput.value = normalizado.documento;

            const altaWrap = byId('lmAltaClienteInlineWrap');
            if (altaWrap) altaWrap.classList.add('d-none');

            renderClienteLibreSeleccionado(normalizado);
            alert('Cliente creado y seleccionado correctamente.');
        } catch (error) {
            alert(extractApiMessage(error, 'No se pudo crear el cliente.'));
        }
    }

    function buildClientesOptions(clientesSource) {
        const clientes = Array.isArray(clientesSource) && clientesSource.length
            ? clientesSource
            : DB.getAll('clientes').filter((cliente) => cliente.activo).map((cliente) => ({
                id: cliente.id,
                nombreCompleto: `${cliente.nombres} ${cliente.apellidos}`
            }));
        return ['<option value="">Seleccionar cliente...</option>']
            .concat(clientes.map((cliente) => `<option value="${cliente.id}">${escapeHtml(cliente.nombreCompleto || `${cliente.nombres || ''} ${cliente.apellidos || ''}`.trim())}</option>`))
            .join('');
    }

    function buildMozosOptions(mozosSource) {
        const usuarios = Array.isArray(mozosSource) && mozosSource.length
            ? mozosSource
            : DB.getAll('usuarios').filter((usuario) => usuario.activo && isMozoRole(usuario)).map((usuario) => ({
                id: usuario.id,
                nombreCompleto: `${usuario.nombres} ${usuario.apellidos}`
            }));

        if (!usuarios.length) {
            return [
                '<option value="">Seleccionar mozo...</option>',
                '<option value="" disabled>No hay mozos disponibles</option>'
            ].join('');
        }

        return ['<option value="">Seleccionar mozo...</option>']
            .concat(usuarios.map((usuario) => `<option value="${usuario.id}">${escapeHtml(usuario.nombreCompleto || `${usuario.nombres || ''} ${usuario.apellidos || ''}`.trim())}</option>`))
            .join('');
    }

    async function ensureOcuparCatalogsLoaded() {
        if (apiAvailable()) {
            await Promise.all([
                ensureClientesCatalog(),
                ensureMozosCatalog(),
                ensurePlatosCatalog()
            ]);
            return;
        }

        if (!state.catalogs.clientes) {
            state.catalogs.clientes = DB.getAll('clientes')
                .filter((cliente) => cliente.activo)
                .map((cliente) => ({
                    id: cliente.id,
                    nombreCompleto: `${cliente.nombres || ''} ${cliente.apellidos || ''}`.trim(),
                    documento: cliente.documento || '',
                    telefono: cliente.telefono || '',
                    email: cliente.email || ''
                }));
        }
        if (!state.catalogs.mozos) {
            state.catalogs.mozos = DB.getAll('usuarios')
                .filter((usuario) => usuario.activo && isMozoRole(usuario))
                .map((usuario) => ({ id: usuario.id, nombreCompleto: `${usuario.nombres} ${usuario.apellidos}` }));
        }
        if (!state.catalogs.platos) {
            state.catalogs.platos = DB.getAll('platos').filter((plato) => plato.activo && plato.disponible !== false);
        }
    }

    async function ensureClientesCatalog() {
        if (state.catalogs.clientes && state.catalogs.clientes.length) return;
        try {
            const response = await api.listClientes({ activo: true, page: 1, size: 200 });
            const list = Array.isArray(response?.data) ? response.data : [];
            state.catalogs.clientes = list.map((cliente) => ({
                id: cliente.id,
                nombreCompleto: cliente.nombreCompleto || cliente.nombre_completo || `${cliente.nombres || ''} ${cliente.apellidos || ''}`.trim() || 'Cliente',
                documento: cliente.documento || '',
                telefono: cliente.telefono || '',
                email: cliente.email || ''
            }));
        } catch {
            state.catalogs.clientes = [];
        }
    }

    async function ensureMozosCatalog() {
        if (state.catalogs.mozos && state.catalogs.mozos.length) return;
        try {
            const response = await api.listMozos({ rol: 'mozo', activo: true, page: 1, size: 200 });
            let list = Array.isArray(response?.data) ? response.data : [];

            // Fallback: algunos backends no aplican bien rol=mozo y devuelven vacío.
            if (!list.length) {
                const responseAll = await api.listMozos({ rol: '', activo: true, page: 1, size: 300 });
                const listAll = Array.isArray(responseAll?.data) ? responseAll.data : [];
                list = listAll.filter((usuario) => isMozoRole(usuario));
            }

            state.catalogs.mozos = list.map((usuario) => ({
                id: usuario.id,
                nombreCompleto: usuario.nombreCompleto || usuario.nombre_completo || `${usuario.nombres || ''} ${usuario.apellidos || ''}`.trim() || 'Mozo'
            }));
        } catch {
            state.catalogs.mozos = [];
        }
    }

    function isMozoRole(usuario) {
        const raw = String(
            usuario?.rol
            || usuario?.cargo
            || usuario?.tipoRol
            || usuario?.tipo_rol
            || usuario?.role
            || ''
        ).trim().toLowerCase();

        return raw.includes('mozo') || raw.includes('mesero');
    }

    function isUuid(value) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
    }

    async function ensurePlatosCatalog() {
        if (state.catalogs.platos && state.catalogs.platos.length) return;
        try {
            const response = await api.listPlatos({ activo: true, disponible: true, page: 1, size: 300 });
            state.catalogs.platos = Array.isArray(response?.data) ? response.data : [];
        } catch {
            state.catalogs.platos = [];
        }
    }

    async function ensureProductosCatalog() {
        if (state.catalogs.productos && state.catalogs.productos.length) return;
        try {
            const response = await api.listProductos({ activo: true, conStock: true, page: 1, size: 300 });
            state.catalogs.productos = Array.isArray(response?.data) ? response.data : [];
        } catch {
            state.catalogs.productos = [];
        }
    }

    function buildVirtualMesa(numero) {
        return {
            id: null,
            codigo: `M-${String(numero).padStart(2, '0')}`,
            capacidad: 4,
            ubicacion: DEFAULT_UBICACION,
            activa: true,
            __virtual: true
        };
    }

    function ensureMesaPersisted(mesa) {
        if (mesa.mesaReal && mesa.mesaReal.id) return Number(mesa.mesaReal.id);

        const numero = Number(mesa.numero);
        const codigo = `M-${String(numero).padStart(2, '0')}`;
        const existente = DB.getAll('mesas').find((item) => Number(item.id) === numero || String(item.codigo) === codigo);
        if (existente) return Number(existente.id);

        const nuevaMesa = DB.insert('mesas', {
            codigo,
            capacidad: 4,
            ubicacion: DEFAULT_UBICACION,
            activa: true
        });
        return Number(nuevaMesa.id);
    }

    function ensureDemoReservation() {
        const mesas = DB.getAll('mesas').filter((mesa) => mesa.activa && Number(mesa.id) <= TOTAL_MESAS_TABLERO);
        const atenciones = DB.getAll('atenciones');
        const reservas = DB.getAll('reservas');

        const hasReservaVigente = reservas.some((reserva) => {
            const estado = String(reserva.estado || '').toLowerCase();
            return Number(reserva.id_mesa) <= TOTAL_MESAS_TABLERO && !estado.includes('cancel');
        });
        if (hasReservaVigente) return;

        const mesaLibre = mesas.find((mesa) => {
            return !atenciones.some((atencion) => {
                const estado = String(atencion.estado || '').toLowerCase();
                const enCurso = !(estado.includes('cerrad') || estado.includes('cancel'));
                return Number(atencion.id_mesa) === Number(mesa.id) && enCurso;
            });
        });

        const cliente = DB.getAll('clientes').find((item) => item.activo);
        if (!mesaLibre || !cliente) return;

        const fecha = new Date();
        fecha.setHours(fecha.getHours() + 2);

        DB.insert('reservas', {
            tipo: 'Salon',
            id_cliente: Number(cliente.id),
            nombre_contacto: `${cliente.nombres} ${cliente.apellidos}`,
            id_mesa: Number(mesaLibre.id),
            fecha_hora: fecha.toISOString().slice(0, 16),
            cantidad_personas: Number(mesaLibre.capacidad || 4),
            estado: 'Pendiente',
            confirmada: false
        });
    }

    function ensureMesa1Ocupada() {
        let mesa1 = DB.getAll('mesas').find((mesa) => Number(mesa.id) === 1 || extractMesaNumeroFromCodigo(mesa.codigo) === 1) || null;
        if (!mesa1) {
            mesa1 = DB.insert('mesas', {
                codigo: 'M-01',
                capacidad: 4,
                ubicacion: DEFAULT_UBICACION,
                activa: true
            });
        }

        if (mesa1.activa === false) {
            DB.update('mesas', mesa1.id, { activa: true });
        }

        const ocupada = DB.getAll('atenciones').some((atencion) => {
            const estado = String(atencion.estado || '').toLowerCase();
            const enCurso = !(estado.includes('cerrad') || estado.includes('cancel'));
            return Number(atencion.id_mesa) === Number(mesa1.id) && enCurso;
        });
        if (ocupada) return;

        const cliente = DB.getAll('clientes').find((item) => item.activo);
        const mozo = DB.getAll('usuarios').find((item) => item.activo);
        if (!cliente || !mozo) return;

        DB.insert('atenciones', {
            id_cliente: Number(cliente.id),
            id_reserva: '',
            id_mesa: Number(mesa1.id),
            id_mozo: Number(mozo.id),
            estado: 'En curso',
            estado_pago: 'Pendiente',
            apertura_en: new Date().toISOString().slice(0, 16),
            cierre_en: ''
        });
    }

    function extractMesaNumeroFromCodigo(codigo) {
        const match = String(codigo || '').match(/(\d+)/);
        return match ? Number(match[1]) : 0;
    }


    function showModal() {
        const modalEl = byId('modalListaMesas');
        if (!modalEl || typeof bootstrap === 'undefined') return;
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }

    function initTooltips(scope) {
        if (typeof bootstrap === 'undefined') return;
        const root = scope || document;
        const nodes = root.querySelectorAll('[data-bs-toggle="tooltip"]');
        nodes.forEach((node) => {
            bootstrap.Tooltip.getOrCreateInstance(node, {
                trigger: 'hover focus',
                placement: 'top'
            });
        });
    }

    function hideModal() {
        const modalEl = byId('modalListaMesas');
        if (!modalEl || typeof bootstrap === 'undefined') return;
        bootstrap.Modal.getOrCreateInstance(modalEl).hide();
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

    function initDateTimeFilters() {
        const fechaInput = byId('lmFechaFiltro');
        const horaInput = byId('lmHoraFiltro');
        const ahoraBtn = byId('lmAhoraFiltro');
        if (!fechaInput || !horaInput) return;

        setFiltroAhora();

        fechaInput.addEventListener('change', render);
        horaInput.addEventListener('change', render);

        if (ahoraBtn) {
            ahoraBtn.addEventListener('click', () => {
                setFiltroAhora();
                render();
            });
        }
    }

    function setFiltroAhora() {
        const fechaInput = byId('lmFechaFiltro');
        const horaInput = byId('lmHoraFiltro');
        const now = new Date();
        if (fechaInput) fechaInput.value = toDateInputValue(now);
        if (horaInput) horaInput.value = toTimeInputValue(now);
    }

    function renderFiltroActual(fechaHoraIso) {
        const label = byId('lmFiltroActual');
        if (!label) return;
        label.textContent = `Disponibilidad para ${formatDateTime(fechaHoraIso)}`;
    }

    function getSelectedFechaHoraIso() {
        const fechaInput = byId('lmFechaFiltro');
        const horaInput = byId('lmHoraFiltro');
        const fecha = fechaInput ? fechaInput.value : '';
        const hora = horaInput ? horaInput.value : '';

        if (fecha && hora) return `${fecha}T${hora}:00`;
        return toIsoSecondsSafe(new Date());
    }

    function toIsoSecondsSafe(date) {
        if (api && typeof api.toIsoSeconds === 'function') {
            return api.toIsoSeconds(date);
        }

        const d = date instanceof Date ? date : new Date(date);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function toDateInputValue(date) {
        const d = date instanceof Date ? date : new Date(date);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function toTimeInputValue(date) {
        const d = date instanceof Date ? date : new Date(date);
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function isReservaVigenteEnFechaHora(reserva, fechaHoraRefTs) {
        const inicio = toTimestamp(reserva ? reserva.fecha_hora : null);
        if (!Number.isFinite(fechaHoraRefTs) || inicio === Number.MAX_SAFE_INTEGER) return false;
        const fin = inicio + (RESERVA_DURACION_MINUTOS * 60 * 1000);
        return fechaHoraRefTs >= inicio && fechaHoraRefTs < fin;
    }

    function formatRecordId(value) {
        if (value === undefined || value === null || value === '') return '-';
        return String(value);
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

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async function cancelarReserva(reserva) {
        if (!reserva || !confirm('¿Deseas cancelar esta reserva? La mesa pasará a libre.')) return;

        if (apiAvailable() && reserva.id) {
            try {
                await api.cancelarReserva(reserva.id);
                hideModal();
                render();
                alert('Reserva cancelada. Mesa liberada.');
                return;
            } catch (error) {
                alert(extractApiMessage(error, 'No se pudo cancelar la reserva.'));
                return;
            }
        }
        
        DB.update('reservas', reserva.id, {
            estado: 'Cancelada',
            confirmada: false
        });
        
        hideModal();
        render();
        alert('Reserva cancelada. Mesa liberada.');
    }

    async function openCatalogoModal(mesa, atencion) {
        if (apiAvailable()) {
            await Promise.all([ensurePlatosCatalog(), ensureProductosCatalog()]);
        }
        const platos = (state.catalogs.platos && state.catalogs.platos.length)
            ? state.catalogs.platos
            : DB.getAll('platos').filter((plato) => plato.activo && plato.disponible !== false);
        const productos = (state.catalogs.productos && state.catalogs.productos.length)
            ? state.catalogs.productos
            : DB.getAll('productos').filter((p) => p.activo && Number(p.stock || 0) > 0);

        const buildCards = (items, tipo) => items.map((item) => `
            <div class="col-lg-4 col-md-6">
                <div class="card h-100" style="cursor:pointer;transition:all 0.15s;"
                    data-item-id="${item.id}"
                    data-item-tipo="${tipo}"
                    data-item-nombre="${escapeHtml(item.nombre)}"
                    data-item-precio="${item.precio}"
                    ${tipo === 'producto' ? `data-item-stock="${item.stock}"` : ''}>
                    <div class="card-body">
                        <h6 class="card-title mb-1">${escapeHtml(item.nombre)}</h6>
                        <p class="card-text small text-muted mb-2">${escapeHtml(item.descripcion || '')}</p>
                        <div class="d-flex justify-content-between align-items-center">
                            <span class="badge bg-brand">S/ ${Number(item.precio).toFixed(2)}</span>
                            ${tipo === 'producto' ? `<span class="badge bg-secondary"><i class="bi bi-boxes me-1"></i>Stock: ${item.stock}</span>` : '<span class="badge bg-success"><i class="bi bi-fire me-1"></i>Cocina</span>'}
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        const platosHtml = platos.length
            ? buildCards(platos, 'plato')
            : '<p class="text-muted text-center py-3">No hay platos disponibles.</p>';

        const productosHtml = productos.length
            ? buildCards(productos, 'producto')
            : '<p class="text-muted text-center py-3">No hay productos con stock disponible.</p>';

        const modalTitle = byId('lmModalTitle');
        const modalBody = byId('lmModalBody');
        const modalFooter = byId('lmModalFooter');
        if (!modalTitle || !modalBody || !modalFooter) return;

        modalTitle.textContent = `${mesa.codigo} · Agregar ítem`;
        modalBody.innerHTML = `
            <ul class="nav nav-tabs mb-3" id="catalogoTabs">
                <li class="nav-item"><button class="nav-link active" data-tab="platos"><i class="bi bi-egg-fried me-1"></i>Platos <span class="badge bg-success ms-1">${platos.length}</span></button></li>
                <li class="nav-item"><button class="nav-link" data-tab="productos"><i class="bi bi-bag me-1"></i>Productos <span class="badge bg-secondary ms-1">${productos.length}</span></button></li>
            </ul>
            <div id="tabPlatos" class="row g-3">${platosHtml}</div>
            <div id="tabProductos" class="row g-3 d-none">${productosHtml}</div>
        `;

        modalFooter.innerHTML = `<button type="button" class="btn btn-outline-secondary" id="lmBackCatalogoBtn">Volver</button>`;

        const backBtn = byId('lmBackCatalogoBtn');
        if (backBtn) backBtn.addEventListener('click', () => openModalOcupada(mesa));

        // Tab switching
        const tabs = modalBody.querySelectorAll('[data-tab]');
        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                tabs.forEach((t) => t.classList.remove('active'));
                tab.classList.add('active');
                byId('tabPlatos').classList.toggle('d-none', tab.dataset.tab !== 'platos');
                byId('tabProductos').classList.toggle('d-none', tab.dataset.tab !== 'productos');
            });
        });

        // Card click (ambos tabs)
        modalBody.addEventListener('click', (event) => {
            const card = event.target.closest('[data-item-id][data-item-tipo]');
            if (!card) return;
            const itemId = Number(card.dataset.itemId);
            const tipo = card.dataset.itemTipo;
            const nombre = card.dataset.itemNombre;
            const precio = Number(card.dataset.itemPrecio);
            const stock = tipo === 'producto' ? Number(card.dataset.itemStock) : null;
            openDetalleItemModal(mesa, atencion, itemId, tipo, nombre, precio, stock);
        });
    }

    function openDetalleItemModal(mesa, atencion, itemId, tipo, nombre, precio, stock) {
        const modalTitle = byId('lmModalTitle');
        const modalBody = byId('lmModalBody');
        const modalFooter = byId('lmModalFooter');
        if (!modalTitle || !modalBody || !modalFooter) return;

        const esProducto = tipo === 'producto';
        modalTitle.textContent = escapeHtml(nombre);
        modalBody.innerHTML = `
            <div class="row g-3">
                <div class="col-12">
                    <div class="lm-block">
                        <h6 class="lm-block-title">${esProducto ? '<i class="bi bi-bag me-1"></i>Producto (sin cocina)' : '<i class="bi bi-fire me-1"></i>Plato (va a cocina)'}</h6>
                        <div class="lm-line"><span>Nombre</span><strong>${escapeHtml(nombre)}</strong></div>
                        <div class="lm-line"><span>Precio unitario</span><strong>S/ ${precio.toFixed(2)}</strong></div>
                        ${esProducto ? `<div class="lm-line"><span>Stock disponible</span><strong>${stock}</strong></div>` : ''}
                    </div>
                </div>
                <div class="col-md-6">
                    <label class="form-label">Cantidad</label>
                    <input class="form-control" id="detalleItemCantidad" type="number" min="1" ${esProducto ? `max="${stock}"` : ''} value="1">
                </div>
                <div class="col-md-6">
                    <label class="form-label">Subtotal</label>
                    <input class="form-control" id="detalleItemSubtotal" type="text" readonly value="S/ ${precio.toFixed(2)}">
                </div>
                ${!esProducto ? `
                <div class="col-12">
                    <label class="form-label">Observaciones para cocina</label>
                    <textarea class="form-control" id="detalleItemObservaciones" rows="2" placeholder="Ej: Sin cebolla, bien hecho..."></textarea>
                </div>` : ''}
            </div>
        `;

        modalFooter.innerHTML = `
            <button type="button" class="btn btn-outline-secondary" id="lmBackDetalleBtn">Volver</button>
            <button type="button" class="btn btn-brand" id="lmConfirmAgregarBtn">
                <i class="bi ${esProducto ? 'bi-bag-check' : 'bi-send'} me-1"></i>Agregar
            </button>
        `;

        const cantidadInput = byId('detalleItemCantidad');
        const subtotalInput = byId('detalleItemSubtotal');
        if (cantidadInput && subtotalInput) {
            cantidadInput.addEventListener('input', () => {
                const cant = Math.max(1, Number(cantidadInput.value) || 1);
                subtotalInput.value = `S/ ${round2(cant * precio).toFixed(2)}`;
            });
        }

        const backBtn = byId('lmBackDetalleBtn');
        if (backBtn) backBtn.addEventListener('click', () => openCatalogoModal(mesa, atencion));

        const confirmBtn = byId('lmConfirmAgregarBtn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                const cant = Math.max(1, Number(cantidadInput ? cantidadInput.value : 1) || 1);
                if (esProducto) {
                    if (cant > stock) { alert(`Solo hay ${stock} unidades en stock.`); return; }
                    agregarProductoAtencion(atencion, itemId, cant, precio);
                } else {
                    const obs = byId('detalleItemObservaciones') ? byId('detalleItemObservaciones').value.trim() : '';
                    agregarPlatoAtencion(atencion, itemId, cant, precio, obs);
                }
            });
        }
    }

    async function agregarPlatoAtencion(atencion, platoId, cantidad, precioUnit, observaciones) {
        if (!atencion || cantidad <= 0 || platoId <= 0) { alert('Datos inválidos.'); return; }

        if (apiAvailable() && atencion.id) {
            try {
                await api.agregarItemAtencion(atencion.id, {
                    tipoItem: 'plato',
                    idItem: platoId,
                    cantidad,
                    observaciones: observaciones || ''
                });
                hideModal();
                render();
                alert('Plato agregado. Se enviará a cocina.');
                return;
            } catch (error) {
                alert(extractApiMessage(error, 'No se pudo agregar el plato.'));
                return;
            }
        }

        const pedidos = DB.getAll('pedidos').filter((pedido) => Number(pedido.id_atencion) === Number(atencion.id));
        const pedido = pedidos.length > 0 ? pedidos[0] : null;
        if (!pedido) { alert('No hay pedido activo en esta atención.'); return; }

        DB.insert('detallePedidos', {
            id_pedido: Number(pedido.id),
            id_plato: Number(platoId),
            id_producto: null,
            tipo_item: 'plato',
            cantidad: Number(cantidad),
            precio_unit: round2(precioUnit),
            descuento: 0,
            estado_cocina: 'pendiente',
            observaciones: observaciones
        });

        hideModal();
        render();
        alert('Plato agregado. Se enviará a cocina.');
    }

    async function agregarProductoAtencion(atencion, productoId, cantidad, precioUnit) {
        if (!atencion || cantidad <= 0 || productoId <= 0) { alert('Datos inválidos.'); return; }

        if (apiAvailable() && atencion.id) {
            try {
                await api.agregarItemAtencion(atencion.id, {
                    tipoItem: 'producto',
                    idItem: productoId,
                    cantidad,
                    observaciones: ''
                });
                hideModal();
                render();
                alert('Producto agregado correctamente.');
                return;
            } catch (error) {
                alert(extractApiMessage(error, 'No se pudo agregar el producto.'));
                return;
            }
        }

        const pedidos = DB.getAll('pedidos').filter((pedido) => Number(pedido.id_atencion) === Number(atencion.id));
        const pedido = pedidos.length > 0 ? pedidos[0] : null;
        if (!pedido) { alert('No hay pedido activo en esta atención.'); return; }

        const producto = DB.getById('productos', productoId);
        if (!producto) { alert('Producto no encontrado.'); return; }

        const stockActual = Number(producto.stock || 0);
        if (stockActual < cantidad) { alert(`Stock insuficiente. Quedan ${stockActual} unidades.`); return; }

        // Insertar en detalle ya como entregado (no va a cocina) y descontar stock
        DB.insert('detallePedidos', {
            id_pedido: Number(pedido.id),
            id_plato: null,
            id_producto: Number(productoId),
            tipo_item: 'producto',
            cantidad: Number(cantidad),
            precio_unit: round2(precioUnit),
            descuento: 0,
            estado_cocina: 'entregado',
            observaciones: ''
        });

        DB.update('productos', productoId, { stock: stockActual - cantidad });

        hideModal();
        render();
        alert(`Producto agregado y stock descontado. Stock restante: ${stockActual - cantidad}`);
    }
})();
