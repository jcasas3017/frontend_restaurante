/* =====================================================
   RestaControl — Reporte de caja por fechas
   ===================================================== */

(() => {
    const state = {
        chart: null,
        from: '',
        to: ''
    };

    const apiBaseUrl = window.APP_CONFIG?.API_BASE_URL
        ? String(window.APP_CONFIG.API_BASE_URL).replace(/\/+$/, '')
        : '';

    async function init() {
        setDefaultRange(7);
        bindEvents();
        await refresh();
    }

    function bindEvents() {
        byId('btnAplicarCaja')?.addEventListener('click', () => {
            refresh();
        });

        byId('btnRango7dCaja')?.addEventListener('click', async () => {
            setDefaultRange(7);
            await refresh();
        });

        byId('btnRango30dCaja')?.addEventListener('click', async () => {
            setDefaultRange(30);
            await refresh();
        });
    }

    function setDefaultRange(days) {
        const today = new Date();
        const from = new Date();
        from.setDate(today.getDate() - (days - 1));

        const fromValue = formatInputDate(from);
        const toValue = formatInputDate(today);

        const fromInput = byId('fechaInicioCaja');
        const toInput = byId('fechaFinCaja');

        if (fromInput) fromInput.value = fromValue;
        if (toInput) toInput.value = toValue;

        state.from = fromValue;
        state.to = toValue;
    }

    async function refresh() {
        const from = byId('fechaInicioCaja')?.value || '';
        const to = byId('fechaFinCaja')?.value || '';

        if (!from || !to) {
            alert('Selecciona fecha inicio y fecha fin.');
            return;
        }

        if (new Date(from) > new Date(to)) {
            alert('La fecha inicio no puede ser mayor que la fecha fin.');
            return;
        }

        state.from = from;
        state.to = to;

        const data = await loadReportData(from, to);
        renderSummary(data.resumen);
        renderMethods(data.metodosPago);
        renderChart(data.history);
        renderTable(data.history);
    }

    async function loadReportData(from, to) {
        const backendData = await fetchFromApi(from, to);
        if (backendData) {
            return normalizeReportData(backendData);
        }
        return normalizeReportData(buildFallbackData(from, to));
    }

    async function fetchFromApi(from, to) {
        const params = new URLSearchParams({
            fechaInicio: from,
            fechaFin: to
        });

        try {
            const response = await fetch(`${apiBaseUrl}/api/reportes/caja?${params.toString()}`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                credentials: 'include'
            });

            if (!response.ok) return null;

            const payload = await response.json();
            if (!payload?.success || !payload?.data) return null;

            return payload.data;
        } catch (error) {
            console.warn('No se pudo consultar reporte de caja:', error);
            return null;
        }
    }

    function normalizeReportData(raw = {}) {
        const resumenRaw = raw.resumen || {};
        const metodosRaw = Array.isArray(raw.metodosPago) ? raw.metodosPago : [];
        const historyRaw = Array.isArray(raw.history) ? raw.history : [];

        const history = historyRaw.map((item) => ({
            fecha: item.fecha || '',
            label: item.label || item.fecha || '',
            bruto: toNumber(item.bruto),
            descuentos: toNumber(item.descuentos),
            propinas: toNumber(item.propinas),
            neto: toNumber(item.neto),
            caja: toNumber(item.caja),
            tickets: toNumber(item.tickets)
        }));

        const resumen = {
            ingresosBrutos: toNumber(resumenRaw.ingresosBrutos ?? history.reduce((sum, item) => sum + item.bruto, 0)),
            descuentos: toNumber(resumenRaw.descuentos ?? history.reduce((sum, item) => sum + item.descuentos, 0)),
            propinas: toNumber(resumenRaw.propinas ?? history.reduce((sum, item) => sum + item.propinas, 0)),
            netoVentas: toNumber(resumenRaw.netoVentas ?? history.reduce((sum, item) => sum + item.neto, 0)),
            montoCaja: toNumber(resumenRaw.montoCaja ?? history.reduce((sum, item) => sum + item.caja, 0)),
            tickets: toNumber(resumenRaw.tickets ?? history.reduce((sum, item) => sum + item.tickets, 0)),
            ticketPromedio: 0,
            anulados: toNumber(resumenRaw.anulados)
        };

        resumen.ticketPromedio = resumen.tickets > 0 ? resumen.montoCaja / resumen.tickets : 0;

        const totalMetodos = metodosRaw.reduce((sum, item) => sum + toNumber(item.monto), 0);
        const metodosPago = metodosRaw.map((item) => {
            const monto = toNumber(item.monto);
            return {
                metodo: item.metodo || 'Sin definir',
                monto,
                tickets: toNumber(item.tickets ?? item.cantidad),
                porcentaje: toNumber(item.porcentaje ?? (totalMetodos > 0 ? (monto * 100) / totalMetodos : 0))
            };
        });

        return {
            resumen,
            metodosPago,
            history
        };
    }

    function buildFallbackData(from, to) {
        const atenciones = DB.getAll('atenciones') || [];
        const pedidos = DB.getAll('pedidos') || [];
        const detalles = DB.getAll('detallePedidos') || [];
        const comprobantes = DB.getAll('comprobantes') || [];

        const fromDate = startOfDay(from);
        const toDate = endOfDay(to);

        const pedidosByAtencion = new Map();
        pedidos.forEach((pedido) => {
            const key = Number(pedido.id_atencion);
            const list = pedidosByAtencion.get(key) || [];
            list.push(pedido);
            pedidosByAtencion.set(key, list);
        });

        const detallesByPedido = new Map();
        detalles.forEach((detalle) => {
            const key = Number(detalle.id_pedido);
            const list = detallesByPedido.get(key) || [];
            list.push(detalle);
            detallesByPedido.set(key, list);
        });

        const comprobantesByAtencion = new Map();
        comprobantes.forEach((comprobante) => {
            const key = Number(comprobante.id_atencion);
            const list = comprobantesByAtencion.get(key) || [];
            list.push(comprobante);
            comprobantesByAtencion.set(key, list);
        });

        const historyByDay = new Map();
        const metodosMap = new Map();

        let totalBruto = 0;
        let totalDescuentos = 0;
        let totalPropinas = 0;
        let totalNeto = 0;
        let totalCaja = 0;
        let totalTickets = 0;

        atenciones.forEach((atencion) => {
            const cierre = toDateValue(atencion.cierre_en || atencion.apertura_en);
            if (!cierre) return;
            if (cierre < fromDate || cierre > toDate) return;

            const estado = normalizeText(atencion.estado);
            if (!(estado.includes('cerrad') || estado.includes('curso') || estado.includes('abierta'))) {
                return;
            }

            const atencionPedidos = pedidosByAtencion.get(Number(atencion.id)) || [];

            let brutoAtencion = 0;
            let descuentosAtencion = 0;
            atencionPedidos.forEach((pedido) => {
                const lines = detallesByPedido.get(Number(pedido.id)) || [];
                lines.forEach((line) => {
                    const cantidad = toNumber(line.cantidad);
                    const precio = toNumber(line.precio_unit);
                    const descuento = toNumber(line.descuento);
                    brutoAtencion += cantidad * precio;
                    descuentosAtencion += descuento;
                });
            });

            const netoAtencion = Math.max(brutoAtencion - descuentosAtencion, 0);
            const propinaAtencion = toNumber(atencion.propina);
            const totalPagadoAtencion = toNumber(atencion.total_pagado);
            const cajaAtencion = totalPagadoAtencion > 0 ? totalPagadoAtencion + propinaAtencion : netoAtencion + propinaAtencion;

            totalBruto += brutoAtencion;
            totalDescuentos += descuentosAtencion;
            totalPropinas += propinaAtencion;
            totalNeto += netoAtencion;
            totalCaja += cajaAtencion;
            totalTickets += 1;

            const dayKey = formatInputDate(cierre);
            const dayCurrent = historyByDay.get(dayKey) || {
                fecha: dayKey,
                label: formatLabelDate(dayKey),
                bruto: 0,
                descuentos: 0,
                propinas: 0,
                neto: 0,
                caja: 0,
                tickets: 0
            };

            dayCurrent.bruto += brutoAtencion;
            dayCurrent.descuentos += descuentosAtencion;
            dayCurrent.propinas += propinaAtencion;
            dayCurrent.neto += netoAtencion;
            dayCurrent.caja += cajaAtencion;
            dayCurrent.tickets += 1;
            historyByDay.set(dayKey, dayCurrent);

            const comprobantesAtencion = comprobantesByAtencion.get(Number(atencion.id)) || [];
            const comprobanteNoAnulado = comprobantesAtencion.find((item) => normalizeText(item.estado) !== 'anulado');
            const metodo = comprobanteNoAnulado?.metodo_pago || 'Sin definir';

            const methodCurrent = metodosMap.get(metodo) || {
                metodo,
                monto: 0,
                tickets: 0,
                porcentaje: 0
            };

            methodCurrent.monto += cajaAtencion;
            methodCurrent.tickets += 1;
            metodosMap.set(metodo, methodCurrent);
        });

        const history = buildDayRange(fromDate, toDate).map((day) => {
            const dayKey = formatInputDate(day);
            return historyByDay.get(dayKey) || {
                fecha: dayKey,
                label: formatLabelDate(dayKey),
                bruto: 0,
                descuentos: 0,
                propinas: 0,
                neto: 0,
                caja: 0,
                tickets: 0
            };
        });

        const metodosPago = Array.from(metodosMap.values())
            .sort((a, b) => b.monto - a.monto)
            .map((item) => ({
                ...item,
                porcentaje: totalCaja > 0 ? (item.monto * 100) / totalCaja : 0
            }));

        const anulados = comprobantes.filter((comprobante) => {
            const emision = toDateValue(comprobante.fecha_emision);
            if (!emision) return false;
            if (emision < fromDate || emision > toDate) return false;
            return normalizeText(comprobante.estado) === 'anulado';
        }).length;

        return {
            resumen: {
                ingresosBrutos: totalBruto,
                descuentos: totalDescuentos,
                propinas: totalPropinas,
                netoVentas: totalNeto,
                montoCaja: totalCaja,
                tickets: totalTickets,
                ticketPromedio: totalTickets > 0 ? totalCaja / totalTickets : 0,
                anulados
            },
            metodosPago,
            history
        };
    }

    function renderSummary(resumen) {
        setText('cajaNetoVentas', formatMoney(resumen.netoVentas));
        setText('cajaNetoVentasNote', `${state.from} al ${state.to}`);

        setText('cajaMontoCaja', formatMoney(resumen.montoCaja));
        setText('cajaMontoCajaNote', `Propinas: ${formatMoney(resumen.propinas)}`);

        setText('cajaDescuentos', formatMoney(resumen.descuentos));
        setText('cajaDescuentosNote', `Bruto: ${formatMoney(resumen.ingresosBrutos)}`);

        setText('cajaTickets', String(toNumber(resumen.tickets)));
        setText('cajaTicketsNote', `Promedio ${formatMoney(resumen.ticketPromedio)} · Anulados ${toNumber(resumen.anulados)}`);
    }

    function renderMethods(items) {
        const body = byId('cajaMetodosBody');
        if (!body) return;

        if (!items.length) {
            body.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center text-muted py-4">No hay pagos en el rango.</td>
                </tr>
            `;
            return;
        }

        body.innerHTML = items.map((item) => `
            <tr>
                <td>
                    <div class="fw-semibold">${escapeHtml(item.metodo)}</div>
                    <div class="small text-muted">${toNumber(item.porcentaje).toFixed(1)}%</div>
                </td>
                <td class="text-end">${toNumber(item.tickets)}</td>
                <td class="text-end fw-semibold">${formatMoney(item.monto)}</td>
            </tr>
        `).join('');
    }

    function renderChart(history) {
        const canvas = byId('cajaChart');
        if (!canvas) return;

        const noDataEl = byId('cajaChartNoData');
        const hasData = history.length && history.some((item) => item.caja > 0 || item.neto > 0);

        if (state.chart) {
            state.chart.destroy();
            state.chart = null;
        }

        if (!hasData) {
            if (noDataEl) noDataEl.style.display = 'flex';
            return;
        }

        if (noDataEl) noDataEl.style.display = 'none';

        state.chart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: history.map((item) => item.label),
                datasets: [
                    {
                        label: 'Neto',
                        data: history.map((item) => item.neto),
                        backgroundColor: 'rgba(37, 99, 235, 0.8)',
                        borderColor: '#2563eb',
                        borderWidth: 1,
                        borderRadius: 6
                    },
                    {
                        label: 'Caja',
                        data: history.map((item) => item.caja),
                        type: 'line',
                        borderColor: '#16a34a',
                        backgroundColor: 'rgba(22, 163, 74, 0.15)',
                        tension: 0.3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => `S/ ${value}`
                        }
                    },
                    y1: {
                        beginAtZero: true,
                        position: 'right',
                        ticks: {
                            callback: (value) => `S/ ${value}`
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    }
                }
            }
        });
    }

    function renderTable(history) {
        const body = byId('reporteCajaBody');
        if (!body) return;

        if (!history.length) {
            body.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted py-4">No hay movimientos para el rango seleccionado.</td>
                </tr>
            `;
            setText('reporteCajaCount', 'Mostrando 0 dias');
            return;
        }

        body.innerHTML = history.map((item) => `
            <tr>
                <td>${escapeHtml(item.label)}</td>
                <td class="text-end">${formatMoney(item.bruto)}</td>
                <td class="text-end">${formatMoney(item.descuentos)}</td>
                <td class="text-end">${formatMoney(item.propinas)}</td>
                <td class="text-end">${formatMoney(item.neto)}</td>
                <td class="text-end fw-semibold">${formatMoney(item.caja)}</td>
                <td class="text-end">${toNumber(item.tickets)}</td>
            </tr>
        `).join('');

        setText('reporteCajaCount', `Mostrando ${history.length} dias`);
    }

    function buildDayRange(fromDate, toDate) {
        const result = [];
        const cursor = new Date(fromDate);

        while (cursor <= toDate) {
            result.push(new Date(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }

        return result;
    }

    function startOfDay(value) {
        const date = toDateValue(value) || new Date();
        date.setHours(0, 0, 0, 0);
        return date;
    }

    function endOfDay(value) {
        const date = toDateValue(value) || new Date();
        date.setHours(23, 59, 59, 999);
        return date;
    }

    function toDateValue(value) {
        if (!value) return null;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatInputDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function formatLabelDate(yyyyMmDd) {
        const date = new Date(`${yyyyMmDd}T00:00:00`);
        return date.toLocaleDateString('es-PE', {
            day: '2-digit',
            month: '2-digit'
        });
    }

    function toNumber(value) {
        const number = Number(value || 0);
        return Number.isFinite(number) ? number : 0;
    }

    function normalizeText(value) {
        return String(value || '').trim().toLowerCase();
    }

    function formatMoney(value) {
        return `S/ ${toNumber(value).toFixed(2)}`;
    }

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function setText(id, text) {
        const el = byId(id);
        if (el) el.textContent = text;
    }

    window.ReporteCaja = { init };
})();
