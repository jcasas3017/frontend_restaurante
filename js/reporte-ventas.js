/* =====================================================
   RestaControl — Reporte de ventas y ocupación
   ===================================================== */

(() => {
    const state = {
        chart: null
    };
    const apiBaseUrl = window.APP_CONFIG?.API_BASE_URL ? String(window.APP_CONFIG.API_BASE_URL).replace(/\/+$/, '') : '';

    async function init() {
        const data = await loadReportData();
        renderSummary(data);
        renderTable(data.history || []);
        renderChart(data.history || []);
    }

    async function loadReportData() {
        const backendData = await fetchReportFromApi();
        if (backendData) {
            return normalizeReportData(backendData);
        }
        return normalizeReportData(buildFallbackReportData());
    }

    async function fetchReportFromApi() {
        try {
            const response = await fetch(`${apiBaseUrl}/api/reportes/ventas?periodo=7d`);
            if (!response.ok) {
                console.warn('Backend de ventas no disponible:', response.status);
                return null;
            }
            const payload = await response.json();
            if (!payload || !payload.success || !payload.data || typeof payload.data !== 'object') {
                console.warn('Respuesta de reporte de ventas inválida.');
                return null;
            }
            return payload.data;
        } catch (error) {
            console.warn('Error cargando reporte de ventas desde backend:', error);
            return null;
        }
    }

    function normalizeReportData(data) {
        const history = Array.isArray(data?.history) ? data.history : [];
        const ventasDia = Number(data?.ventasDia ?? 0);
        const ticketPromedio = Number(data?.ticketPromedio ?? 0);
        const ocupacionMedia = Number(data?.ocupacionMedia ?? 0);
        const mejorDia = data?.mejorDia || null;

        return {
            ventasDia,
            ticketPromedio,
            ocupacionMedia,
            mejorDia,
            history
        };
    }

    function buildFallbackReportData() {
        const pedidos = DB.getAll('pedidos');
        const detalles = DB.getAll('detallePedidos');
        const atenciones = DB.getAll('atenciones');
        const mesas = DB.getAll('mesas');

        const today = new Date();
        const lastDays = Array.from({ length: 7 }, (_, index) => {
            const date = new Date(today);
            date.setDate(today.getDate() - (6 - index));
            return date;
        });

        function getSpanishDayLabel(d) {
            const abbr = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
            const dayNum = d.getDate();
            return `${abbr[d.getDay()]} ${dayNum}`;
        }

        const history = lastDays.map((day) => {
            const start = new Date(day);
            start.setHours(0, 0, 0, 0);
            const end = new Date(day);
            end.setHours(23, 59, 59, 999);

            const dayAtenciones = atenciones.filter((item) => {
                if (!item.cierre_en) return false;
                const cierre = new Date(item.cierre_en);
                return cierre >= start && cierre <= end;
            });

            const ventas = dayAtenciones.reduce((sum, item) => {
                const pedido = pedidos.find((p) => Number(p.id_atencion) === Number(item.id));
                if (!pedido) return sum;
                const items = detalles.filter((d) => Number(d.id_pedido) === Number(pedido.id));
                const subtotal = items.reduce((acc, detail) => {
                    const qty = Number(detail.cantidad || 0);
                    const price = Number(detail.precio_unit || 0);
                    const discount = Number(detail.descuento || 0);
                    return acc + (qty * price) - discount;
                }, 0);
                return sum + subtotal;
            }, 0);

            const ocupacion = mesas.length ? Math.round((dayAtenciones.length / mesas.length) * 100) : 0;

            return {
                label: getSpanishDayLabel(day),
                ventas,
                ocupacion,
                atenciones: dayAtenciones.length
            };
        });

        const ventasDia = history[history.length - 1]?.ventas || 0;
        const ticketPromedio = history[history.length - 1]?.atenciones > 0 ? ventasDia / history[history.length - 1].atenciones : 0;
        const ocupacionMedia = history.length ? Math.round(history.reduce((sum, item) => sum + item.ocupacion, 0) / history.length) : 0;
        const mejorDia = history.slice().sort((a, b) => b.ventas - a.ventas)[0] || null;

        return {
            ventasDia,
            ticketPromedio,
            ocupacionMedia,
            mejorDia,
            history
        };
    }

    function renderSummary(data) {
        setText('ventasDia', formatCurrency(data.ventasDia));
        const todayInfo = data.history && data.history.length ? data.history[data.history.length - 1] : null;
        setText('ventasDiaNote', `${todayInfo?.atenciones || 0} atenciones cerradas hoy`);
        setText('ticketPromedio', formatCurrency(data.ticketPromedio));
        setText('ticketPromedioNote', 'Promedio por atención cerrada');
        setText('ocupacionMedia', `${data.ocupacionMedia}%`);
        setText('ocupacionMediaNote', 'Promedio de ocupación en 7 días');
        setText('mejorDia', data.mejorDia ? data.mejorDia.label : '-');
        setText('mejorDiaNote', data.mejorDia ? `${formatCurrency(data.mejorDia.ventas)} • ${data.mejorDia.ocupacion}%` : 'Sin datos suficientes');
    }

    function renderTable(history) {
        const body = byId('reporteVentasBody');
        if (!body) return;

        body.innerHTML = history.map((item) => `
            <tr>
                <td>${escapeHtml(item.label)}</td>
                <td>${escapeHtml(formatCurrency(item.ventas))}</td>
                <td>${escapeHtml(`${item.ocupacion}%`)}</td>
            </tr>
        `).join('');
    }

    function renderChart(history) {
        const canvas = byId('ventasChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const noDataEl = byId('ventasChartNoData');

        if (state.chart) {
            state.chart.destroy();
        }

        // show/hide no-data placeholder
        if (!history || !history.length || history.every(h => !h.ventas && !h.ocupacion)) {
            if (noDataEl) noDataEl.style.display = 'flex';
        } else {
            if (noDataEl) noDataEl.style.display = 'none';

            state.chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: history.map((item) => item.label),
                datasets: [
                    {
                        label: 'Ventas',
                        data: history.map((item) => item.ventas),
                        backgroundColor: 'rgba(244, 98, 58, 0.8)',
                        borderColor: '#f4623a',
                        borderWidth: 1,
                        borderRadius: 6
                    },
                    {
                        label: 'Ocupación %',
                        data: history.map((item) => item.ocupacion),
                        type: 'line',
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.15)',
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
                        max: 100,
                        position: 'right',
                        ticks: {
                            callback: (value) => `${value}%`
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    }
                }
            }
            });
        }
    }

    function formatCurrency(value) {
        const number = Number(value || 0);
        return `S/ ${number.toFixed(2)}`;
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

    window.ReporteVentas = { init };
})();
