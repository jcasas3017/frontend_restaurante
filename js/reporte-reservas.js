/* =====================================================
   RestaControl — Reporte de Reservas y Atención
   ===================================================== */

(() => {
    const state = {
        chart: null
    };

    const apiBaseUrl = window.APP_CONFIG?.API_BASE_URL
        ? String(window.APP_CONFIG.API_BASE_URL).replace(/\/+$/, '')
        : '';

    async function init() {
        try {
            showLoading();

            const data = await loadReportData();

            renderSummary(data);
            renderTable(data.history);
            renderChart(data.history);
        } catch (error) {
            console.error('Error cargando el reporte de reservas:', error);
            renderError();
        }
    }

    async function loadReportData() {
        /*
         * Primero intenta obtener los datos reales del backend.
         */
        const backendData = await fetchFromApi();

        if (backendData) {
            return normalize(backendData);
        }

        /*
         * Este fallback puede mantenerse mientras desarrollas.
         * En producción podrías eliminarlo para no ocultar errores.
         */
        console.warn(
            'No se pudo consultar el backend. Se usarán datos locales.'
        );

        return normalize(buildFallback());
    }

    async function fetchFromApi() {
        const url =
            `${apiBaseUrl}/api/reportes/reservas?periodo=7d`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    Accept: 'application/json'
                },

                /*
                 * Déjalo si el backend utiliza cookies o sesión.
                 */
                credentials: 'include'
            });

            if (!response.ok) {
                console.error(
                    `Error HTTP ${response.status} consultando ${url}`
                );

                return null;
            }

            const payload = await response.json();

            if (!payload?.success || !payload?.data) {
                console.error(
                    'Respuesta inválida del backend:',
                    payload
                );

                return null;
            }

            return payload.data;
        } catch (error) {
            console.error(
                'Error de conexión con el reporte de reservas:',
                error
            );

            return null;
        }
    }

    function normalize(raw = {}) {
        const totales = raw.totales || {};

        return {
            totales: {
                totalReservas: toNumber(totales.totalReservas),
                confirmadas: toNumber(totales.confirmadas),
                pendientes: toNumber(totales.pendientes),
                canceladas: toNumber(totales.canceladas),
                atencionesEnCurso: toNumber(
                    totales.atencionesEnCurso
                ),
                avgTiempoMin: toNumber(totales.avgTiempoMin)
            },

            history: Array.isArray(raw.history)
                ? raw.history.map((item) => ({
                    label: item.label || '',
                    confirmadas: toNumber(item.confirmadas),
                    pendientes: toNumber(item.pendientes),
                    canceladas: toNumber(item.canceladas),
                    atenciones: toNumber(item.atenciones)
                }))
                : []
        };
    }

    function buildFallback() {
        /*
         * Validamos que DB exista antes de usarlo.
         */
        if (!window.DB || typeof DB.getAll !== 'function') {
            return {
                totales: {},
                history: []
            };
        }

        const reservas = DB.getAll('reservas') || [];
        const atenciones = DB.getAll('atenciones') || [];
        const today = new Date();

        const lastDays = Array.from(
            { length: 7 },
            (_, index) => {
                const date = new Date(today);

                date.setDate(
                    today.getDate() - (6 - index)
                );

                return date;
            }
        );

        function getLabel(date) {
            const days = [
                'Dom',
                'Lun',
                'Mar',
                'Mié',
                'Jue',
                'Vie',
                'Sáb'
            ];

            return `${days[date.getDay()]} ${date.getDate()}`;
        }

        const history = lastDays.map((day) => {
            const start = new Date(day);
            start.setHours(0, 0, 0, 0);

            const end = new Date(day);
            end.setHours(23, 59, 59, 999);

            const dayReservations = reservas.filter(
                (reservation) => {
                    if (!reservation.fecha_hora) {
                        return false;
                    }

                    const reservationDate =
                        new Date(reservation.fecha_hora);

                    return (
                        reservationDate >= start &&
                        reservationDate <= end
                    );
                }
            );

            const confirmadas = dayReservations.filter(
                (reservation) =>
                    normalizeText(reservation.estado) ===
                    'confirmada'
            ).length;

            const pendientes = dayReservations.filter(
                (reservation) =>
                    normalizeText(reservation.estado) ===
                    'pendiente'
            ).length;

            const canceladas = dayReservations.filter(
                (reservation) =>
                    normalizeText(reservation.estado) ===
                    'cancelada'
            ).length;

            const dayAtenciones = atenciones.filter(
                (atencion) => {
                    if (!atencion.apertura_en) {
                        return false;
                    }

                    const openingDate =
                        new Date(atencion.apertura_en);

                    return (
                        openingDate >= start &&
                        openingDate <= end
                    );
                }
            );

            return {
                label: getLabel(day),
                confirmadas,
                pendientes,
                canceladas,
                atenciones: dayAtenciones.length
            };
        });

        const totales = {
            totalReservas: reservas.length,

            confirmadas: reservas.filter(
                (reservation) =>
                    normalizeText(reservation.estado) ===
                    'confirmada'
            ).length,

            pendientes: reservas.filter(
                (reservation) =>
                    normalizeText(reservation.estado) ===
                    'pendiente'
            ).length,

            canceladas: reservas.filter(
                (reservation) =>
                    normalizeText(reservation.estado) ===
                    'cancelada'
            ).length,

            atencionesEnCurso: atenciones.filter(
                (atencion) =>
                    normalizeText(atencion.estado).includes(
                        'en curso'
                    )
            ).length,

            avgTiempoMin: averageAtencionTimeMin(atenciones)
        };

        return {
            totales,
            history
        };
    }

    function averageAtencionTimeMin(atenciones) {
        const cerradas = atenciones.filter(
            (atencion) =>
                atencion.cierre_en &&
                atencion.apertura_en
        );

        if (!cerradas.length) {
            return 0;
        }

        const minutos = cerradas
            .map((atencion) => {
                const apertura =
                    new Date(atencion.apertura_en);

                const cierre =
                    new Date(atencion.cierre_en);

                return (cierre - apertura) / 60000;
            })
            .filter(
                (value) =>
                    Number.isFinite(value) &&
                    value >= 0
            );

        if (!minutos.length) {
            return 0;
        }

        const promedio =
            minutos.reduce(
                (sum, value) => sum + value,
                0
            ) / minutos.length;

        return Math.round(promedio);
    }

    function renderSummary(data) {
        const totals = data.totales;

        setText(
            'resTotal',
            totals.totalReservas
        );

        setText(
            'resConfirmadas',
            totals.confirmadas
        );

        setText(
            'atencionesCurso',
            totals.atencionesEnCurso
        );

        setText(
            'avgTiempo',
            totals.avgTiempoMin
        );

        /*
         * Aprovechamos las notas existentes del HTML para
         * mostrar pendientes y canceladas.
         */
        setText(
            'resTotalNote',
            `Pendientes: ${totals.pendientes} · ` +
            `Canceladas: ${totals.canceladas}`
        );

        setText(
            'resConfirmadasNote',
            'Reservas confirmadas en el periodo'
        );

        setText(
            'atencionesCursoNote',
            'Atenciones actualmente sin cerrar'
        );

        setText(
            'avgTiempoNote',
            'Promedio de atenciones cerradas'
        );
    }

    function renderTable(history) {
        const body =
            document.getElementById(
                'resumenReservasBody'
            );

        if (!body) {
            return;
        }

        if (!history.length) {
            body.innerHTML = `
                <tr>
                    <td
                        colspan="5"
                        class="text-center text-muted py-4"
                    >
                        No hay información para mostrar.
                    </td>
                </tr>
            `;

            return;
        }

        body.innerHTML = history
            .map((item) => `
                <tr>
                    <td>
                        ${escapeHtml(item.label)}
                    </td>

                    <td>
                        ${item.confirmadas}
                    </td>

                    <td>
                        ${item.pendientes}
                    </td>

                    <td>
                        ${item.canceladas}
                    </td>

                    <td>
                        ${item.atenciones}
                    </td>
                </tr>
            `)
            .join('');
    }

    function renderChart(history) {
        const canvas =
            document.getElementById('reservasChart');

        const noData =
            document.getElementById(
                'reservasChartNoData'
            );

        if (!canvas) {
            return;
        }

        if (state.chart) {
            state.chart.destroy();
            state.chart = null;
        }

        const hasData =
            history.length > 0 &&
            history.some(
                (item) =>
                    item.confirmadas > 0 ||
                    item.pendientes > 0 ||
                    item.canceladas > 0 ||
                    item.atenciones > 0
            );

        if (!hasData) {
            canvas.style.display = 'none';

            if (noData) {
                noData.style.display = 'flex';
            }

            return;
        }

        canvas.style.display = 'block';

        if (noData) {
            noData.style.display = 'none';
        }

        const context = canvas.getContext('2d');

        state.chart = new Chart(context, {
            type: 'bar',

            data: {
                labels: history.map(
                    (item) => item.label
                ),

                datasets: [
                    {
                        label: 'Confirmadas',
                        data: history.map(
                            (item) => item.confirmadas
                        ),
                        backgroundColor:
                            'rgba(34,197,94,0.85)'
                    },
                    {
                        label: 'Pendientes',
                        data: history.map(
                            (item) => item.pendientes
                        ),
                        backgroundColor:
                            'rgba(245,158,11,0.85)'
                    },
                    {
                        label: 'Canceladas',
                        data: history.map(
                            (item) => item.canceladas
                        ),
                        backgroundColor:
                            'rgba(239,68,68,0.85)'
                    },
                    {
                        label: 'Atenciones',
                        data: history.map(
                            (item) => item.atenciones
                        ),
                        backgroundColor:
                            'rgba(13,202,240,0.85)'
                    }
                ]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,

                interaction: {
                    mode: 'index',
                    intersect: false
                },

                plugins: {
                    legend: {
                        position: 'top'
                    }
                },

                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0
                        }
                    }
                }
            }
        });
    }

    function showLoading() {
        setText('resTotal', '...');
        setText('resConfirmadas', '...');
        setText('atencionesCurso', '...');
        setText('avgTiempo', '...');
    }

    function renderError() {
        setText('resTotal', '0');
        setText('resConfirmadas', '0');
        setText('atencionesCurso', '0');
        setText('avgTiempo', '0');

        setText(
            'resTotalNote',
            'No se pudo cargar el reporte'
        );

        setText(
            'resConfirmadasNote',
            'Verifica la conexión con el backend'
        );

        renderTable([]);
        renderChart([]);
    }

    function toNumber(value) {
        const number = Number(value);

        return Number.isFinite(number)
            ? number
            : 0;
    }

    function normalizeText(value) {
        return String(value || '')
            .trim()
            .toLowerCase();
    }

    function escapeHtml(value) {
        if (
            value === null ||
            value === undefined
        ) {
            return '';
        }

        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function setText(id, text) {
        const element =
            document.getElementById(id);

        if (element) {
            element.textContent = String(text);
        }
    }

    window.ReporteReservas = {
        init
    };
})();