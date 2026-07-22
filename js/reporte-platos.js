/* =====================================================
   RestaControl — Reporte de platos mas consumidos
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
        byId('btnAplicarPlatos')?.addEventListener('click', () => {
            refresh();
        });

        byId('btnRango7dPlatos')?.addEventListener('click', async () => {
            setDefaultRange(7);
            await refresh();
        });

        byId('btnRango30dPlatos')?.addEventListener('click', async () => {
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

        const fromInput = byId('fechaInicioPlatos');
        const toInput = byId('fechaFinPlatos');

        if (fromInput) fromInput.value = fromValue;
        if (toInput) toInput.value = toValue;

        state.from = fromValue;
        state.to = toValue;
    }

    async function refresh() {
        const from = byId('fechaInicioPlatos')?.value || '';
        const to = byId('fechaFinPlatos')?.value || '';

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
        renderSummary(data);
        renderChart(data.trend);
        renderTable(data.items);
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
            const response = await fetch(`${apiBaseUrl}/api/reportes/platos-consumidos?${params.toString()}`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                credentials: 'include'
            });

            if (!response.ok) return null;

            const payload = await response.json();
            if (!payload?.success || !payload?.data) return null;

            return payload.data;
        } catch (error) {
            console.warn('No se pudo consultar reporte de platos:', error);
            return null;
        }
    }

    function normalizeReportData(raw = {}) {
        const resumen = raw.resumen || {};
        const items = Array.isArray(raw.items) ? raw.items : [];
        const trend = Array.isArray(raw.trend) ? raw.trend : [];

        const normalizedItems = items.map((item, index) => ({
            rank: Number(item.rank || index + 1),
            idPlato: item.idPlato ?? item.id_plato ?? null,
            nombre: item.nombre || 'Plato sin nombre',
            categoria: item.categoria || '-',
            cantidad: toNumber(item.cantidad),
            monto: toNumber(item.monto),
            participacionPct: toNumber(item.participacionPct ?? item.participacion)
        }));

        const totalMonto = toNumber(
            resumen.totalVentasPlatos ?? normalizedItems.reduce((sum, item) => sum + item.monto, 0)
        );

        const normalizedWithPct = normalizedItems.map((item) => ({
            ...item,
            participacionPct: item.participacionPct > 0
                ? item.participacionPct
                : (totalMonto > 0 ? (item.monto * 100) / totalMonto : 0)
        }));

        return {
            resumen: {
                totalPorciones: toNumber(
                    resumen.totalPorciones ?? normalizedWithPct.reduce((sum, item) => sum + item.cantidad, 0)
                ),
                totalVentasPlatos: totalMonto,
                platoTop: resumen.platoTop || normalizedWithPct[0] || null
            },
            items: normalizedWithPct,
            trend: trend.map((item) => ({
                fecha: item.fecha || '',
                label: item.label || item.fecha || '',
                cantidad: toNumber(item.cantidad),
                monto: toNumber(item.monto)
            }))
        };
    }

    function buildFallbackData(from, to) {
        const platos = DB.getAll('platos') || [];
        const categorias = DB.getAll('categorias') || [];
        const atenciones = DB.getAll('atenciones') || [];
        const pedidos = DB.getAll('pedidos') || [];
        const detalles = DB.getAll('detallePedidos') || [];

        const categoriaById = new Map(categorias.map((categoria) => [Number(categoria.id), categoria]));
        const platoById = new Map(platos.map((plato) => [Number(plato.id), plato]));
        const atencionById = new Map(atenciones.map((atencion) => [Number(atencion.id), atencion]));

        const fromDate = startOfDay(from);
        const toDate = endOfDay(to);

        const totalsByPlato = new Map();
        const trendByDay = new Map();

        detalles.forEach((detalle) => {
            if (normalizeText(detalle.tipo_item) !== 'plato') return;

            const pedido = pedidos.find((item) => Number(item.id) === Number(detalle.id_pedido));
            if (!pedido) return;

            const atencion = atencionById.get(Number(pedido.id_atencion));
            const refDate = toDateValue(atencion?.cierre_en || pedido.creado_en || atencion?.apertura_en);
            if (!refDate) return;
            if (refDate < fromDate || refDate > toDate) return;

            const plato = platoById.get(Number(detalle.id_plato));
            const categoria = plato ? categoriaById.get(Number(plato.id_categoria)) : null;

            const cantidad = toNumber(detalle.cantidad);
            const bruto = cantidad * toNumber(detalle.precio_unit);
            const descuento = toNumber(detalle.descuento);
            const subtotal = Math.max(bruto - descuento, 0);

            const key = Number(detalle.id_plato || 0);
            const current = totalsByPlato.get(key) || {
                idPlato: key || null,
                nombre: plato?.nombre || `Plato #${key}`,
                categoria: categoria?.nombre || '-',
                cantidad: 0,
                monto: 0
            };

            current.cantidad += cantidad;
            current.monto += subtotal;
            totalsByPlato.set(key, current);

            const dayKey = formatInputDate(refDate);
            const dayCurrent = trendByDay.get(dayKey) || { fecha: dayKey, label: formatLabelDate(dayKey), cantidad: 0, monto: 0 };
            dayCurrent.cantidad += cantidad;
            dayCurrent.monto += subtotal;
            trendByDay.set(dayKey, dayCurrent);
        });

        const items = Array.from(totalsByPlato.values())
            .sort((a, b) => {
                if (b.cantidad !== a.cantidad) return b.cantidad - a.cantidad;
                return b.monto - a.monto;
            })
            .map((item, index) => ({
                rank: index + 1,
                ...item
            }));

        const totalVentasPlatos = items.reduce((sum, item) => sum + item.monto, 0);
        const totalPorciones = items.reduce((sum, item) => sum + item.cantidad, 0);

        const trend = buildDayRange(fromDate, toDate).map((day) => {
            const dayKey = formatInputDate(day);
            return trendByDay.get(dayKey) || {
                fecha: dayKey,
                label: formatLabelDate(dayKey),
                cantidad: 0,
                monto: 0
            };
        });

        return {
            resumen: {
                totalPorciones,
                totalVentasPlatos,
                platoTop: items[0] || null
            },
            items,
            trend
        };
    }

    function renderSummary(data) {
        const resumen = data.resumen || {};
        const top = resumen.platoTop;

        setText('platosTotalPorciones', String(toNumber(resumen.totalPorciones)));
        setText('platosTotalPorcionesNote', `${data.items.length} platos con ventas`);

        setText('platosTotalVentas', formatMoney(resumen.totalVentasPlatos));
        setText('platosTotalVentasNote', `${state.from} al ${state.to}`);

        setText('platosTopNombre', top?.nombre || '-');
        if (top) {
            setText('platosTopDetalle', `${toNumber(top.cantidad)} porciones · ${formatMoney(top.monto)}`);
        } else {
            setText('platosTopDetalle', 'Sin datos en el rango');
        }
    }

    function renderChart(trend) {
        const canvas = byId('platosChart');
        if (!canvas) return;

        const noDataEl = byId('platosChartNoData');
        const hasData = trend.length && trend.some((item) => item.cantidad > 0 || item.monto > 0);

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
                labels: trend.map((item) => item.label),
                datasets: [
                    {
                        label: 'Porciones',
                        data: trend.map((item) => item.cantidad),
                        backgroundColor: 'rgba(244, 162, 97, 0.80)',
                        borderColor: '#f4a261',
                        borderWidth: 1,
                        borderRadius: 6
                    },
                    {
                        label: 'Monto',
                        data: trend.map((item) => item.monto),
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
                        beginAtZero: true
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

    function renderTable(items) {
        const body = byId('reportePlatosBody');
        if (!body) return;

        if (!items.length) {
            body.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted py-4">
                        No hay platos vendidos en este rango.
                    </td>
                </tr>
            `;
            setText('reportePlatosCount', 'Mostrando 0 platos');
            return;
        }

        body.innerHTML = items.map((item, index) => {
            const pct = toNumber(item.participacionPct);
            return `
                <tr>
                    <td><span class="record-id">#${index + 1}</span></td>
                    <td class="fw-semibold">${escapeHtml(item.nombre)}</td>
                    <td>${escapeHtml(item.categoria)}</td>
                    <td class="text-end">${toNumber(item.cantidad)}</td>
                    <td class="text-end">${formatMoney(item.monto)}</td>
                    <td class="text-end">${pct.toFixed(1)}%</td>
                </tr>
            `;
        }).join('');

        setText('reportePlatosCount', `Mostrando ${items.length} platos`);
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

    function formatMoney(value) {
        return `S/ ${toNumber(value).toFixed(2)}`;
    }

    function toNumber(value) {
        const number = Number(value || 0);
        return Number.isFinite(number) ? number : 0;
    }

    function normalizeText(value) {
        return String(value || '').trim().toLowerCase();
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

    window.ReportePlatosConsumidos = { init };
})();
