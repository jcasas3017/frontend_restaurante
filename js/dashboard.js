/* =====================================================
   RestaControl — Dashboard Page Logic
   Carga métricas desde la base de datos local y opcionalmente desde backend API.
   ===================================================== */

(() => {
    const apiBaseUrl = window.APP_CONFIG?.API_BASE_URL ? String(window.APP_CONFIG.API_BASE_URL).replace(/\/+$/, '') : null;

    async function init() {
        await render();
    }

    async function render() {
        const data = await loadDashboardData();
        renderStats(data);
        renderReservas(data.reservas.rows);
        renderAtenciones(data.atenciones.rows);
    }

    async function loadDashboardData() {
        const fallback = loadDashboardDataFromLocalDb();
        if (!apiAvailable()) {
            return fallback;
        }

        const dashboardFromApi = await fetchDashboardFromApi();
        return dashboardFromApi || fallback;
    }

    async function fetchDashboardFromApi() {
        if (!window.APP_CONFIG || !window.APP_CONFIG.API_BASE_URL) {
            return null;
        }

        try {
            const baseUrl = String(window.APP_CONFIG.API_BASE_URL).replace(/\/+$/, '');
            const response = await fetch(`${baseUrl}/api/dashboard`);
            if (!response.ok) {
                console.warn('Backend dashboard no disponible:', response.status);
                return null;
            }
            const payload = await response.json();
            if (!payload || typeof payload.data !== 'object') {
                console.warn('Respuesta de dashboard backend inválida.');
                return null;
            }
            return payload.data;
        } catch (error) {
            console.warn('Error cargando dashboard desde backend:', error);
            return null;
        }
    }

    function loadDashboardDataFromLocalDb() {
        const categorias = DB.getAll('categorias');
        const platos = DB.getAll('platos');
        const mesas = DB.getAll('mesas');
        const reservas = DB.getAll('reservas');
        const atenciones = DB.getAll('atenciones');
        const pedidos = DB.getAll('pedidos');
        const detalles = DB.getAll('detallePedidos');
        const usuarios = DB.getAll('usuarios');

        const reservasActivas = reservas.filter((reserva) => String(reserva.estado || '').toLowerCase() !== 'cancelada');
        const reservasConfirmadas = reservasActivas.filter((reserva) => String(reserva.estado || '').toLowerCase() === 'confirmada');
        const atencionesEnCurso = atenciones.filter((atencion) => String(atencion.estado || '').toLowerCase() === 'en curso');
        const cerradasHoy = atenciones.filter((atencion) => {
            if (String(atencion.estado || '').toLowerCase() !== 'cerrada') return false;
            if (!atencion.cierre_en) return false;
            const cierre = new Date(atencion.cierre_en);
            const hoy = new Date();
            return cierre.getFullYear() === hoy.getFullYear()
                && cierre.getMonth() === hoy.getMonth()
                && cierre.getDate() === hoy.getDate();
        });

        const reservasRows = reservasActivas
            .slice()
            .sort((a, b) => new Date(a.fecha_hora) - new Date(b.fecha_hora))
            .slice(0, 5)
            .map((reserva, index) => ({
                index: index + 1,
                cliente: reserva.nombre_contacto || `Cliente ${reserva.id_cliente || ''}`,
                mesa: getMesaCodigo(reserva.id_mesa),
                fechaHora: formatDateTime(reserva.fecha_hora),
                personas: reserva.cantidad_personas || 0,
                estado: reserva.estado || 'Pendiente'
            }));

        const atencionesRows = atenciones
            .slice()
            .sort((a, b) => sortAtencionRows(a, b))
            .slice(0, 5)
            .map((atencion, index) => ({
                index: index + 1,
                cliente: getClienteNombre(atencion.id_cliente),
                mesa: getMesaCodigo(atencion.id_mesa),
                mozo: getUsuarioNombre(atencion.id_mozo),
                estado: atencion.estado || 'Desconocido',
                pago: atencion.estado_pago || 'Pendiente'
            }));

        return {
            categorias: {
                active: categorias.filter((categoria) => Boolean(categoria.activo)).length,
                total: categorias.length
            },
            platos: {
                available: platos.filter((plato) => plato.activo && plato.disponible !== false).length,
                total: platos.length
            },
            mesas: {
                active: mesas.filter((mesa) => Boolean(mesa.activa)).length,
                total: mesas.length
            },
            reservas: {
                active: reservasActivas.length,
                confirmed: reservasConfirmadas.length,
                rows: reservasRows
            },
            atenciones: {
                inProgress: atencionesEnCurso.length,
                closedToday: cerradasHoy.length,
                rows: atencionesRows
            },
            pedidos: {
                total: pedidos.length,
                items: detalles.length
            }
        };
    }

    function sortAtencionRows(a, b) {
        const estadoPri = getAtencionPriority(a.estado);
        const estadoSec = getAtencionPriority(b.estado);
        if (estadoPri !== estadoSec) return estadoPri - estadoSec;
        const fechaA = new Date(a.apertura_en || '');
        const fechaB = new Date(b.apertura_en || '');
        return fechaA - fechaB;
    }

    function getAtencionPriority(estado) {
        const raw = String(estado || '').toLowerCase();
        if (raw.includes('en curso')) return 0;
        if (raw.includes('cerrada')) return 1;
        return 2;
    }

    function renderStats(data) {
        setText('dashCategoriasActivas', String(data.categorias.active));
        setText('dashCategoriasNote', `de ${data.categorias.total} registradas`);

        setText('dashPlatosDisponibles', String(data.platos.available));
        setText('dashPlatosNote', `de ${data.platos.total} en carta`);

        setText('dashMesasActivas', String(data.mesas.active));
        setText('dashMesasNote', `de ${data.mesas.total} configuradas`);

        setText('dashReservasVigentes', String(data.reservas.active));
        setText('dashReservasNote', `${data.reservas.confirmed} confirmadas`);

        setText('dashAtencionesEnCurso', String(data.atenciones.inProgress));
        setText('dashAtencionesNote', `${data.atenciones.closedToday} cerradas hoy`);

        setText('dashPedidosRegistrados', String(data.pedidos.total));
        setText('dashPedidosNote', `${data.pedidos.items} ítems en detalle`);
    }

    function renderReservas(rows) {
        const container = byId('dashReservasBody');
        if (!container) return;
        if (!rows.length) {
            container.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No hay reservas vigentes.</td></tr>';
            return;
        }

        container.innerHTML = rows.map((row, idx) => {
            const displayIndex = (row && (row.index !== undefined && row.index !== null)) ? row.index : (idx + 1);
            return `
            <tr>
                <td><span class="record-id">#${displayIndex}</span></td>
                <td><span class="fw-semibold">${escapeHtml(row.cliente)}</span></td>
                <td>${escapeHtml(row.mesa)}</td>
                <td>${escapeHtml(row.fechaHora)}</td>
                <td>${escapeHtml(String(row.personas))}</td>
                <td>${renderBadge(row.estado)}</td>
            </tr>
        `;
        }).join('');
    }

    function renderAtenciones(rows) {
        const container = byId('dashAtencionesBody');
        if (!container) return;
        if (!rows.length) {
            container.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No hay atenciones para mostrar.</td></tr>';
            return;
        }

        container.innerHTML = rows.map((row, idx) => {
            const displayIndex = (row && (row.index !== undefined && row.index !== null)) ? row.index : (idx + 1);
            return `
            <tr>
                <td><span class="record-id">#${displayIndex}</span></td>
                <td>${escapeHtml(row.cliente)}</td>
                <td>${escapeHtml(row.mesa)}</td>
                <td>${escapeHtml(row.mozo)}</td>
                <td>${renderBadge(row.estado)}</td>
                <td>${renderBadge(row.pago, true)}</td>
            </tr>
        `;
        }).join('');
    }

    function renderBadge(value, isPago = false) {
        const raw = String(value || '').replace(/_/g, ' ').toLowerCase();
        let klass = 'bp-secondary';
        if (isPago) {
            if (raw.includes('pag')) klass = 'bp-success';
            else if (raw.includes('pend')) klass = 'bp-warning';
            else if (raw.includes('cancel')) klass = 'bp-danger';
        } else {
            if (raw.includes('en curso')) klass = 'bp-info';
            else if (raw.includes('confirmada') || raw.includes('pagada')) klass = 'bp-success';
            else if (raw.includes('pend')) klass = 'bp-warning';
            else if (raw.includes('cerr')) klass = 'bp-gray';
            else if (raw.includes('cancel')) klass = 'bp-danger';
        }
        const label = String(value || '').replace(/_/g, ' ');
        return `<span class="badge-pill ${klass}">${escapeHtml(label)}</span>`;
    }

    function getMesaCodigo(idMesa) {
        const mesa = DB.getById('mesas', idMesa);
        return mesa ? mesa.codigo : `Mesa ${idMesa || '-'} `;
    }

    function getClienteNombre(idCliente) {
        const cliente = DB.getById('clientes', idCliente);
        if (!cliente) return `Cliente ${idCliente || ''}`;
        return `${cliente.nombres || ''} ${cliente.apellidos || ''}`.trim();
    }

    function getUsuarioNombre(idUsuario) {
        const usuario = DB.getById('usuarios', idUsuario);
        if (!usuario) return `Usuario ${idUsuario || ''}`;
        return `${usuario.nombres || ''} ${usuario.apellidos || ''}`.trim();
    }

    function apiAvailable() {
        return Boolean(apiBaseUrl);
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

    function formatDateTime(isoValue) {
        if (!isoValue) return '-';
        const date = new Date(isoValue);
        if (Number.isNaN(date.getTime())) return String(isoValue);
        return date.toLocaleString('es-PE', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function setText(id, text) {
        const el = byId(id);
        if (el) el.textContent = text;
    }

    window.Dashboard = { init };
})();
