/* =====================================================
   RestaControl — Reservas Page Logic (API)
   CRUD conectado a backend Spring Boot
   ===================================================== */

(() => {
    const state = {
        search: '',
        estado: '',
        idMesa: '',
        idCliente: '',
        page: 1,
        size: 10,
        total: 0,
        reservas: [],
        estados: [],
        clientes: [],
        mesas: [],
        usuarioSesion: null,
        selectedCliente: null,
        deletingReserva: null
    };

    const API_BASE = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || 'http://localhost:7070';
    const API_RESERVAS = `${API_BASE}/api/reservas`;
    const API_LISTA_MESAS = `${API_BASE}/api/lista-mesas`;
    const API_ESTADOS = `${API_RESERVAS}/estados`;
    const API_EXPORT_EXCEL = `${API_RESERVAS}/exportar-excel`;
    const API_CLIENTES = `${API_BASE}/api/clientes`;
    const API_MESAS = `${API_BASE}/api/mesas`;

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        bindEvents();
        resolveUsuarioSesion();
        await Promise.all([loadEstados(), loadClientes(), loadMesas()]);
        await loadReservas();
    }

    function resolveUsuarioSesion() {
        const authSession = (typeof Auth !== 'undefined' && typeof Auth.getSession === 'function')
            ? Auth.getSession()
            : null;

        let rawSession = null;
        try {
            rawSession = JSON.parse(sessionStorage.getItem('rc_sess') || 'null');
        } catch {
            rawSession = null;
        }

        const s = authSession || rawSession;
        if (!s) {
            state.usuarioSesion = null;
            setValue('reservaCreadaPor', 'Usuario no identificado');
            return;
        }

        state.usuarioSesion = s;
        const display = s.name
            ? `${s.name}${s.username ? ` (${s.username})` : ''}`
            : (s.username || 'Usuario');
        setValue('reservaCreadaPor', display);
    }

    function bindEvents() {
        byId('busquedaReservas')?.addEventListener('input', (e) => {
            state.search = String(e.target.value || '').trim();
            state.page = 1;
            loadReservas();
        });

        byId('filtroEstadoReservas')?.addEventListener('change', (e) => {
            state.estado = String(e.target.value || '').trim();
            state.page = 1;
            loadReservas();
        });

        byId('filtroMesaReservas')?.addEventListener('change', (e) => {
            state.idMesa = String(e.target.value || '').trim();
            state.page = 1;
            loadReservas();
        });

        byId('filtroClienteReservas')?.addEventListener('change', (e) => {
            state.idCliente = String(e.target.value || '').trim();
            state.page = 1;
            loadReservas();
        });

        byId('btnActualizarReservas')?.addEventListener('click', () => loadReservas());
        byId('btnExportarReservasExcel')?.addEventListener('click', onExportarReservasExcel);
        byId('btnNuevaReserva')?.addEventListener('click', () => openForm());
        byId('btnGuardarReserva')?.addEventListener('click', onGuardarReserva);
        byId('btnConsultarDisponibilidadMesa')?.addEventListener('click', onConsultarDisponibilidadMesas);
        byId('btnConfirmarEliminarReserva')?.addEventListener('click', onEliminarReserva);
        byId('btnBuscarClienteReserva')?.addEventListener('click', onBuscarClientePorDni);
        byId('btnMostrarAltaCliente')?.addEventListener('click', () => {
            byId('altaClienteInlineWrap')?.classList.remove('d-none');
            setValue('quickClienteDocumento', String(byId('clienteDniBusqueda')?.value || '').trim());
        });
        byId('btnCrearClienteInline')?.addEventListener('click', onCrearClienteInline);

        byId('clienteDniBusqueda')?.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            onBuscarClientePorDni();
        });

        byId('reservaFechaHora')?.addEventListener('change', resetDisponibilidadMesasUI);
        byId('reservaIdMesa')?.addEventListener('change', () => {
            const panel = byId('reservaDisponibilidadPanel');
            if (panel && !panel.classList.contains('d-none')) {
                onConsultarDisponibilidadMesas();
            }
        });

        byId('reservaDisponibilidadPanel')?.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-mesa-disponible-id]');
            if (!btn) return;
            const mesaId = String(btn.dataset.mesaDisponibleId || '').trim();
            if (!mesaId) return;
            setValue('reservaIdMesa', mesaId);
            showToast('Mesa seleccionada desde disponibilidad.', 'success');
            onConsultarDisponibilidadMesas();
        });

        byId('btnEditarDesdeVistaReserva')?.addEventListener('click', () => {
            const id = byId('btnEditarDesdeVistaReserva')?.dataset.id;
            if (!id) return;
            hideModal('modalView');
            openForm(id);
        });

        byId('btnPrevReservas')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (state.page <= 1 || getTotalPages() === 0) return;
            state.page -= 1;
            loadReservas();
        });

        byId('btnNextReservas')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (state.page >= getTotalPages() || getTotalPages() === 0) return;
            state.page += 1;
            loadReservas();
        });

        byId('reservasTableBody')?.addEventListener('click', async (event) => {
            const btn = event.target.closest('[data-action]');
            if (!btn) return;
            const id = String(btn.dataset.id || '').trim();
            if (!id) return;

            const action = btn.dataset.action;
            if (action === 'view') await openView(id);
            if (action === 'edit') await openForm(id);
            if (action === 'delete') await openDelete(id);
            if (action === 'confirmar') await confirmarRapido(id);
            if (action === 'situacion') await toggleSituacion(id, btn.dataset.estado || '', btn.dataset.confirmada === 'true');
        });
    }

    async function loadEstados() {
        try {
            const response = await fetch(API_ESTADOS);
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo cargar estados de reserva.');

            const data = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
            state.estados = data.map(normalizeEstado).filter(Boolean);

            if (!state.estados.length) {
                state.estados = defaultEstados();
            }
        } catch {
            state.estados = defaultEstados();
        }

        renderEstadoOptions();
    }

    function defaultEstados() {
        return [
            { value: 'pendiente', label: 'Pendiente' },
            { value: 'confirmada', label: 'Confirmada' },
            { value: 'cancelada', label: 'Cancelada' },
            { value: 'atendida', label: 'Atendida' }
        ];
    }

    function normalizeEstado(item) {
        if (item == null) return null;
        if (typeof item === 'string') {
            const value = item.trim().toLowerCase();
            if (!value) return null;
            return { value, label: toTitleCase(value) };
        }
        if (typeof item !== 'object') return null;

        const value = String(item.value ?? item.codigo ?? item.id ?? item.estado ?? '').trim().toLowerCase();
        const label = String(item.label ?? item.nombre ?? item.descripcion ?? value).trim();
        if (!value) return null;
        return { value, label: label || toTitleCase(value) };
    }

    function renderEstadoOptions() {
        const filtro = byId('filtroEstadoReservas');
        const form = byId('reservaEstado');

        const options = state.estados
            .map((x) => `<option value="${escapeHtmlAttr(x.value)}">${escapeHtml(x.label)}</option>`)
            .join('');

        if (filtro) filtro.innerHTML = '<option value="">Todos los estados</option>' + options;
        if (form) form.innerHTML = options;
    }

    async function loadClientes() {
        try {
            const response = await fetch(`${API_CLIENTES}?activo=true&page=1&size=100`);
            const payload = await safeJson(response);
            const data = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
            state.clientes = data;
        } catch {
            state.clientes = [];
        }
        renderClienteOptions();
    }

    function renderClienteOptions() {
        const filtro = byId('filtroClienteReservas');

        const options = state.clientes.map((c) => {
            const name = `${c.nombres || ''} ${c.apellidos || ''}`.trim() || c.documento || 'Cliente';
            return `<option value="${escapeHtmlAttr(c.id)}">${escapeHtml(name)}</option>`;
        }).join('');

        if (filtro) filtro.innerHTML = '<option value="">Todos los clientes</option>' + options;
    }

    async function onBuscarClientePorDni() {
        const dni = String(byId('clienteDniBusqueda')?.value || '').trim();
        if (!dni) {
            showToast('Ingresa un documento para buscar.', 'danger');
            return;
        }

        try {
            const response = await fetch(`${API_CLIENTES}?search=${encodeURIComponent(dni)}&page=1&size=20`);
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo buscar cliente.');

            const data = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
            const found = data.find((c) => String(c.documento || '').trim() === dni) || null;

            if (!found) {
                state.selectedCliente = null;
                setValue('reservaIdCliente', '');
                byId('clienteEncontradoPanel')?.classList.add('d-none');
                byId('clienteNoEncontradoPanel')?.classList.remove('d-none');
                byId('altaClienteInlineWrap')?.classList.add('d-none');
                setValue('quickClienteDocumento', dni);
                return;
            }

            setClienteSeleccionado(found);
        } catch (error) {
            showToast(error.message || 'No se pudo buscar cliente.', 'danger');
        }
    }

    async function onCrearClienteInline() {
        const documento = String(byId('quickClienteDocumento')?.value || '').trim();
        const nombres = String(byId('quickClienteNombres')?.value || '').trim();
        const apellidos = String(byId('quickClienteApellidos')?.value || '').trim();
        const telefono = String(byId('quickClienteTelefono')?.value || '').trim();
        const email = String(byId('quickClienteEmail')?.value || '').trim();
        const tipoDocumento = String(byId('quickClienteTipoDocumento')?.value || 'DNI').trim();

        if (!documento || documento.length < 8 || !nombres || !apellidos) {
            showToast('Para crear cliente: documento (mín. 8), nombres y apellidos.', 'danger');
            return;
        }

        try {
            const response = await fetch(API_CLIENTES, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tipoDocumento,
                    documento,
                    nombres,
                    apellidos,
                    telefono,
                    email,
                    activo: true
                })
            });

            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo crear cliente.');

            const nuevo = payload?.data || null;
            if (!nuevo?.id) throw new Error('Cliente creado sin id en respuesta.');

            state.clientes = [nuevo, ...state.clientes.filter((x) => String(x.id) !== String(nuevo.id))];
            renderClienteOptions();
            setClienteSeleccionado(nuevo);
            showToast(payload?.message || 'Cliente creado correctamente.', 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo crear cliente.', 'danger');
        }
    }

    function setClienteSeleccionado(cliente) {
        state.selectedCliente = cliente;

        const fullName = `${cliente.nombres || ''} ${cliente.apellidos || ''}`.trim() || cliente.nombreContacto || 'Cliente';
        setValue('reservaIdCliente', String(cliente.id || ''));

        const contactoActual = String(byId('reservaNombreContacto')?.value || '').trim();
        if (!contactoActual || contactoActual === '-') {
            setValue('reservaNombreContacto', fullName);
        }

        const panel = byId('clienteEncontradoPanel');
        if (panel) {
            panel.classList.remove('d-none');
            panel.innerHTML = `
                <div class="alert alert-success mb-0">
                    <div class="fw-semibold">Cliente seleccionado: ${escapeHtml(fullName)}</div>
                    <div class="small">Documento: ${escapeHtml(cliente.documento || '-')} | Teléfono: ${escapeHtml(cliente.telefono || '-')} | Email: ${escapeHtml(cliente.email || '-')}</div>
                </div>
            `;
        }

        byId('clienteNoEncontradoPanel')?.classList.add('d-none');
        byId('altaClienteInlineWrap')?.classList.add('d-none');
    }

    function resetClienteSearchUI() {
        state.selectedCliente = null;
        setValue('reservaIdCliente', '');
        setValue('clienteDniBusqueda', '');
        setValue('quickClienteDocumento', '');
        setValue('quickClienteNombres', '');
        setValue('quickClienteApellidos', '');
        setValue('quickClienteTelefono', '');
        setValue('quickClienteEmail', '');
        setValue('quickClienteTipoDocumento', 'DNI');

        byId('clienteEncontradoPanel')?.classList.add('d-none');
        byId('clienteNoEncontradoPanel')?.classList.add('d-none');
        byId('altaClienteInlineWrap')?.classList.add('d-none');
    }

    async function loadMesas() {
        try {
            const response = await fetch(`${API_MESAS}?activo=true&page=1&size=100`);
            const payload = await safeJson(response);
            const data = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
            state.mesas = data;
        } catch {
            state.mesas = [];
        }
        renderMesaOptions();
    }

    function renderMesaOptions() {
        const filtro = byId('filtroMesaReservas');
        const form = byId('reservaIdMesa');

        const options = state.mesas.map((m) => {
            const label = `${m.codigo || 'Mesa'} (${Number(m.capacidad || 0)} pax)`;
            return `<option value="${escapeHtmlAttr(m.id)}">${escapeHtml(label)}</option>`;
        }).join('');

        if (filtro) filtro.innerHTML = '<option value="">Todas las mesas</option>' + options;
        if (form) form.innerHTML = '<option value="">Seleccionar mesa...</option>' + options;
    }

    async function loadReservas() {
        return loadReservasWithParams();
    }

    function buildReservasParams() {
        const params = new URLSearchParams({
            page: String(state.page),
            size: String(state.size)
        });

        if (state.search) params.set('search', state.search);
        if (state.estado) params.set('estado', state.estado);
        if (state.idMesa) params.set('idMesa', state.idMesa);
        if (state.idCliente) params.set('idCliente', state.idCliente);

        return params;
    }

    async function loadReservasWithParams() {
        const params = buildReservasParams();

        setTableLoading(true);

        try {
            const response = await fetch(`${API_RESERVAS}?${params.toString()}`);
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo listar reservas.');

            state.reservas = Array.isArray(payload)
                ? payload
                : (Array.isArray(payload?.data) ? payload.data : []);

            state.total = Number(payload?.total ?? state.reservas.length);
            if (typeof payload?.size === 'number' && payload.size > 0) state.size = payload.size;
            if (typeof payload?.page === 'number') state.page = payload.page <= 0 ? 1 : payload.page;

            renderTable();
        } catch (error) {
            state.reservas = [];
            state.total = 0;
            renderTable();
            showToast(error.message || 'Error cargando reservas.', 'danger');
        } finally {
            setTableLoading(false);
        }
    }

    async function onExportarReservasExcel() {
        const params = buildReservasParams();
        params.delete('page');
        params.delete('size');

        const btn = byId('btnExportarReservasExcel');
        const oldHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Exportando...';
        }

        try {
            const response = await fetch(`${API_EXPORT_EXCEL}?${params.toString()}`, {
                method: 'GET'
            });

            if (!response.ok) {
                const payload = await safeJson(response);
                throw new Error(payload?.message || 'No se pudo exportar el Excel.');
            }

            const blob = await response.blob();
            const filename = getFilenameFromDisposition(response.headers.get('content-disposition')) || `reservas_${new Date().toISOString().slice(0, 10)}.xlsx`;
            downloadBlob(blob, filename);
            showToast('Exportación Excel generada correctamente.', 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo exportar el Excel.', 'danger');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = oldHtml || '<i class="bi bi-file-earmark-excel me-1"></i>Exportar Excel';
            }
        }
    }

    function renderTable() {
        const tbody = byId('reservasTableBody');
        if (!tbody) return;

        if (!state.reservas.length) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No hay reservas para mostrar.</td></tr>';
            setText('reservasCount', 'Mostrando 0 registros');
            renderPagination();
            return;
        }

        tbody.innerHTML = state.reservas.map((r, index) => {
            const rowNum = ((state.page - 1) * state.size) + index + 1;
            const mesaLabel = getMesaLabel(r.idMesa);
            const clienteLabel = getClienteLabel(r.idCliente, r.nombreContacto);
            const estado = String(r.estado || 'pendiente').toLowerCase();
            const confirmada = toBool(r.confirmada);

            return `
                <tr>
                    <td><span class="record-id">#${rowNum}</span></td>
                    <td><span class="badge-pill bp-info">${escapeHtml(r.tipo || '-')}</span></td>
                    <td class="fw-semibold">${escapeHtml(clienteLabel)}</td>
                    <td>${escapeHtml(mesaLabel)}</td>
                    <td>${escapeHtml(formatDateTime(r.fechaHora))}</td>
                    <td>${Number(r.cantidadPersonas || 0)}</td>
                    <td>${renderEstadoBadge(estado)}</td>
                    <td>${renderConfirmadaBadge(confirmada)}</td>
                    <td class="text-end"><div class="action-buttons">
                        <button class="btn-tbl" title="Ver" data-action="view" data-id="${escapeHtmlAttr(r.id)}"><i class="bi bi-eye text-info"></i></button>
                        <button class="btn-tbl" title="Editar" data-action="edit" data-id="${escapeHtmlAttr(r.id)}"><i class="bi bi-pencil text-warning"></i></button>
                        <button class="btn-tbl" title="Confirmar rápido" data-action="confirmar" data-id="${escapeHtmlAttr(r.id)}"><i class="bi bi-check2-circle text-success"></i></button>
                        <button class="btn-tbl" title="Cambiar situación" data-action="situacion" data-id="${escapeHtmlAttr(r.id)}" data-estado="${escapeHtmlAttr(estado)}" data-confirmada="${String(confirmada)}"><i class="bi bi-arrow-repeat text-primary"></i></button>
                        <button class="btn-tbl" title="Eliminar" data-action="delete" data-id="${escapeHtmlAttr(r.id)}"><i class="bi bi-trash text-danger"></i></button>
                    </div></td>
                </tr>
            `;
        }).join('');

        setText('reservasCount', `Mostrando ${state.reservas.length} de ${state.total} registros`);
        renderPagination();
    }

    function getMesaLabel(idMesa) {
        const m = state.mesas.find((x) => String(x.id) === String(idMesa));
        if (!m) return '-';
        return `${m.codigo || 'Mesa'} · ${m.ubicacion || '-'}`;
    }

    function getClienteLabel(idCliente, fallback) {
        const c = state.clientes.find((x) => String(x.id) === String(idCliente));
        if (c) return `${c.nombres || ''} ${c.apellidos || ''}`.trim() || fallback || '-';
        return fallback || '-';
    }

    function renderPagination() {
        const totalPages = getTotalPages();
        const current = totalPages === 0 ? 0 : state.page;

        setText('lblPaginaReservas', totalPages === 0 ? '-' : `${current} / ${totalPages}`);
        byId('liPrevReservas')?.classList.toggle('disabled', current <= 1);
        byId('liNextReservas')?.classList.toggle('disabled', totalPages === 0 || current >= totalPages);
    }

    function getTotalPages() {
        if (!state.total || !state.size || state.total <= 0 || state.size <= 0) return 0;
        return Math.ceil(state.total / state.size);
    }

    async function openView(id) {
        const r = await getReservaById(id);
        if (!r) return;

        setText('viewReservaId', String(r.codigo || r.id || '-'));
        const tipoEl = byId('viewReservaTipo');
        if (tipoEl) tipoEl.innerHTML = `<span class="badge-pill bp-info">${escapeHtml(r.tipo || '-')}</span>`;

        setText('viewReservaCliente', getClienteLabel(r.idCliente, r.nombreContacto));
        setText('viewReservaContacto', r.nombreContacto || '-');
        setText('viewReservaMesa', getMesaLabel(r.idMesa));
        setText('viewReservaFechaHora', formatDateTime(r.fechaHora));
        setText('viewReservaPersonas', String(r.cantidadPersonas || 0));

        const estadoEl = byId('viewReservaEstado');
        if (estadoEl) estadoEl.innerHTML = renderEstadoBadge(String(r.estado || 'pendiente').toLowerCase());

        const confEl = byId('viewReservaConfirmada');
        if (confEl) confEl.innerHTML = renderConfirmadaBadge(toBool(r.confirmada));

        setText('viewReservaObservacion', r.observacion || '-');

        const btnEdit = byId('btnEditarDesdeVistaReserva');
        if (btnEdit) btnEdit.dataset.id = String(r.id);

        showModal('modalView');
    }

    async function openForm(id = null) {
        byId('formReserva')?.classList.remove('was-validated');

        if (!id) {
            setTextHtml('modalReservaTitle', '<i class="bi bi-calendar-check"></i>Nueva Reserva');
            setValue('reservaId', '');
            setValue('reservaTipo', 'Salon');
            resetClienteSearchUI();
            setValue('reservaNombreContacto', '');
            setValue('reservaIdMesa', '');
            setValue('reservaFechaHora', '');
            setValue('reservaCantidadPersonas', '2');
            setValue('reservaEstado', 'pendiente');
            resolveUsuarioSesion();
            setValue('reservaObservacion', '');
            if (byId('swReservaConfirmada')) byId('swReservaConfirmada').checked = false;
            resetDisponibilidadMesasUI();
            showModal('modalForm');
            return;
        }

        const r = await getReservaById(id);
        if (!r) return;

        setTextHtml('modalReservaTitle', '<i class="bi bi-pencil-square"></i>Editar Reserva');
        setValue('reservaId', String(r.id));
        setValue('reservaTipo', r.tipo || 'Salon');
        resetClienteSearchUI();
        setValue('reservaIdCliente', String(r.idCliente || ''));
        setValue('reservaNombreContacto', r.nombreContacto || '');
        setValue('reservaIdMesa', String(r.idMesa || ''));
        setValue('reservaFechaHora', toDateTimeLocal(r.fechaHora));
        setValue('reservaCantidadPersonas', String(r.cantidadPersonas ?? 2));
        setValue('reservaEstado', String(r.estado || 'pendiente').toLowerCase());
        resolveUsuarioSesion();
        setValue('reservaObservacion', r.observacion || '');
        if (byId('swReservaConfirmada')) byId('swReservaConfirmada').checked = toBool(r.confirmada);
        resetDisponibilidadMesasUI();

        const cliente = state.clientes.find((x) => String(x.id) === String(r.idCliente));
        if (cliente) {
            setValue('clienteDniBusqueda', String(cliente.documento || ''));
            setClienteSeleccionado(cliente);
        }

        showModal('modalForm');
    }

    async function onGuardarReserva() {
        byId('formReserva')?.classList.add('was-validated');

        const id = String(byId('reservaId')?.value || '').trim();
        const tipo = String(byId('reservaTipo')?.value || '').trim();
        const idCliente = String(byId('reservaIdCliente')?.value || '').trim();
        const nombreContacto = String(byId('reservaNombreContacto')?.value || '').trim();
        const idMesa = String(byId('reservaIdMesa')?.value || '').trim();
        const fechaHoraRaw = String(byId('reservaFechaHora')?.value || '').trim();
        const cantidadPersonas = Number(byId('reservaCantidadPersonas')?.value || 0);
        const estado = String(byId('reservaEstado')?.value || 'pendiente').trim().toLowerCase();
        const observacion = String(byId('reservaObservacion')?.value || '').trim();
        const confirmada = !!byId('swReservaConfirmada')?.checked;

        if (!tipo || !idCliente || !nombreContacto || !idMesa || !fechaHoraRaw || Number.isNaN(cantidadPersonas) || cantidadPersonas < 1) {
            showToast('Completa los campos obligatorios de la reserva.', 'danger');
            return;
        }

        const body = {
            tipo,
            idCliente,
            nombreContacto,
            idMesa,
            fechaHora: normalizeDateTime(fechaHoraRaw),
            cantidadPersonas: Math.floor(cantidadPersonas),
            estado,
            observacion,
            confirmada
        };

        const disponibilidad = await validarDisponibilidadMesaParaReserva({
            idMesa,
            fechaHora: body.fechaHora,
            reservaIdActual: id || null
        });
        if (!disponibilidad.ok) {
            showToast(disponibilidad.message, 'danger');
            return;
        }

        const isEdit = !!id;
        const url = isEdit ? `${API_RESERVAS}/${encodeURIComponent(id)}` : API_RESERVAS;

        try {
            const response = await fetch(url, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo guardar la reserva.');

            hideModal('modalForm');
            await loadReservas();
            showToast(payload?.message || (isEdit ? 'Reserva actualizada.' : 'Reserva creada.'), 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo guardar la reserva.', 'danger');
        }
    }

    async function openDelete(id) {
        const r = await getReservaById(id);
        if (!r) return;

        state.deletingReserva = r;
        const msg = byId('deleteReservaTexto');
        if (msg) msg.innerHTML = `Se eliminará la reserva <strong>${escapeHtml(r.codigo || r.id || '')}</strong>. Esta acción la dejará inactiva.`;
        showModal('modalDelete');
    }

    async function onEliminarReserva() {
        if (!state.deletingReserva) return;

        try {
            const response = await fetch(`${API_RESERVAS}/${encodeURIComponent(state.deletingReserva.id)}`, {
                method: 'DELETE'
            });
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo eliminar la reserva.');

            hideModal('modalDelete');
            state.deletingReserva = null;
            await loadReservas();
            showToast(payload?.message || 'Reserva eliminada.', 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo eliminar la reserva.', 'danger');
        }
    }

    async function confirmarRapido(id) {
        try {
            const response = await fetch(`${API_RESERVAS}/${encodeURIComponent(id)}/estado`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmada: true })
            });
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo confirmar reserva.');

            await loadReservas();
            showToast(payload?.message || 'Reserva confirmada.', 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo confirmar reserva.', 'danger');
        }
    }

    async function toggleSituacion(id, estadoActual, confirmadaActual) {
        const next = getNextEstado(estadoActual);
        const confirmada = next === 'confirmada' ? true : confirmadaActual;

        try {
            const response = await fetch(`${API_RESERVAS}/${encodeURIComponent(id)}/situacion`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: next, confirmada })
            });
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo cambiar situación de reserva.');

            await loadReservas();
            showToast(payload?.message || `Situación cambiada a ${toTitleCase(next)}.`, 'success');
        } catch (error) {
            showToast(error.message || 'No se pudo cambiar situación de reserva.', 'danger');
        }
    }

    function getNextEstado(current) {
        const values = state.estados.map((x) => x.value);
        if (!values.length) return 'pendiente';
        const idx = values.indexOf(String(current || '').toLowerCase());
        if (idx < 0) return values[0];
        return values[(idx + 1) % values.length];
    }

    async function getReservaById(id) {
        const local = state.reservas.find((x) => String(x.id) === String(id));
        if (local) return local;

        try {
            const response = await fetch(`${API_RESERVAS}/${encodeURIComponent(id)}`);
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo obtener la reserva.');
            return payload?.data || payload;
        } catch (error) {
            showToast(error.message || 'No se pudo obtener la reserva.', 'danger');
            return null;
        }
    }

    function renderEstadoBadge(estado) {
        const value = String(estado || '').toLowerCase();
        const label = getEstadoLabel(value);
        if (value === 'confirmada') return `<span class="badge-pill bp-success"><i class="bi bi-check-circle-fill"></i>${escapeHtml(label)}</span>`;
        if (value === 'pendiente') return `<span class="badge-pill bp-warning"><i class="bi bi-clock"></i>${escapeHtml(label)}</span>`;
        if (value === 'cancelada') return `<span class="badge-pill bp-danger"><i class="bi bi-x-circle-fill"></i>${escapeHtml(label)}</span>`;
        return `<span class="badge-pill bp-info"><i class="bi bi-check2-all"></i>${escapeHtml(label)}</span>`;
    }

    function renderConfirmadaBadge(confirmada) {
        return confirmada
            ? '<span class="badge-pill bp-success"><i class="bi bi-check-lg"></i>Sí</span>'
            : '<span class="badge-pill bp-danger"><i class="bi bi-x-lg"></i>No</span>';
    }

    function getEstadoLabel(value) {
        const found = state.estados.find((x) => x.value === value);
        return found?.label || toTitleCase(value || 'sin estado');
    }

    function formatDateTime(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleString('es-PE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function normalizeDateTime(value) {
        if (!value) return value;
        return value.length === 16 ? `${value}:00` : value;
    }

    async function onConsultarDisponibilidadMesas() {
        const fechaHoraRaw = String(byId('reservaFechaHora')?.value || '').trim();
        if (!fechaHoraRaw) {
            showToast('Selecciona fecha y hora para consultar disponibilidad.', 'danger');
            return;
        }

        const fechaHora = normalizeDateTime(fechaHoraRaw);
        const mesaSeleccionada = String(byId('reservaIdMesa')?.value || '').trim();

        try {
            const query = new URLSearchParams({
                fechaHora,
                page: '1',
                size: '200'
            });
            const response = await fetch(`${API_LISTA_MESAS}?${query.toString()}`);
            const payload = await safeJson(response);
            if (!response.ok) throw new Error(payload?.message || 'No se pudo consultar disponibilidad de mesas.');

            const rows = Array.isArray(payload?.data) ? payload.data : [];
            const disponibles = rows.filter((mesa) => {
                const estado = String(mesa?.estadoOperativo || '').toLowerCase();
                return estado === 'libre' && mesa?.activa !== false;
            });

            renderDisponibilidadMesasPanel(disponibles, mesaSeleccionada, fechaHora);
        } catch (error) {
            showToast(error.message || 'No se pudo consultar disponibilidad de mesas.', 'danger');
        }
    }

    function renderDisponibilidadMesasPanel(disponibles, mesaSeleccionada, fechaHora) {
        const panel = byId('reservaDisponibilidadPanel');
        if (!panel) return;

        const fechaLabel = formatDateTime(fechaHora);
        if (!disponibles.length) {
            panel.classList.remove('d-none');
            panel.innerHTML = `
                <div class="reserva-disponibilidad alert alert-warning mb-0">
                    <div class="fw-semibold"><i class="bi bi-exclamation-triangle me-1"></i>No hay mesas disponibles para ${escapeHtml(fechaLabel)}.</div>
                </div>
            `;
            return;
        }

        const chips = disponibles.map((mesa) => {
            const mesaId = String(mesa.idMesa || mesa.id || '');
            const codigo = String(mesa.codigo || 'Mesa');
            const capacidad = Number(mesa.capacidad || 0);
            const active = mesaSeleccionada && mesaId === mesaSeleccionada;
            return `<button type="button" class="btn ${active ? 'btn-primary' : 'btn-outline-success'} btn-sm" data-mesa-disponible-id="${escapeHtmlAttr(mesaId)}">${escapeHtml(codigo)}${capacidad > 0 ? ` (${capacidad} pax)` : ''}</button>`;
        }).join('');

        panel.classList.remove('d-none');
        panel.innerHTML = `
            <div class="reserva-disponibilidad">
                <div class="reserva-disponibilidad-title">Mesas disponibles para ${escapeHtml(fechaLabel)}: ${disponibles.length}</div>
                <div class="reserva-mesas-chips">${chips}</div>
            </div>
        `;
    }

    function resetDisponibilidadMesasUI() {
        const panel = byId('reservaDisponibilidadPanel');
        if (!panel) return;
        panel.classList.add('d-none');
        panel.innerHTML = '';
    }

    async function validarDisponibilidadMesaParaReserva({ idMesa, fechaHora, reservaIdActual }) {
        if (!idMesa || !fechaHora) {
            return {
                ok: false,
                message: 'No se pudo validar disponibilidad: faltan mesa o fecha/hora.'
            };
        }

        try {
            const query = new URLSearchParams({ fechaHora });
            const response = await fetch(`${API_LISTA_MESAS}/${encodeURIComponent(idMesa)}/contexto?${query.toString()}`);
            const payload = await safeJson(response);
            if (!response.ok) {
                throw new Error(payload?.message || 'No se pudo validar la disponibilidad de la mesa.');
            }

            const data = payload?.data || {};
            const estadoOperativo = String(data.estadoOperativo || '').toLowerCase();
            const reservaActiva = data.reservaActiva || null;
            const idReservaActiva = String(reservaActiva?.idReserva || reservaActiva?.id || '').trim();
            const esMismaReservaEnEdicion = !!reservaIdActual && !!idReservaActiva && String(reservaIdActual) === idReservaActiva;

            if (!esMismaReservaEnEdicion && estadoBloqueaReserva(estadoOperativo)) {
                const horaRef = reservaActiva?.fechaHora ? ` (${formatDateTime(reservaActiva.fechaHora)})` : '';
                return {
                    ok: false,
                    message: `La mesa no está disponible para esa fecha y hora.${horaRef}`
                };
            }

            return { ok: true, message: '' };
        } catch (error) {
            return {
                ok: false,
                message: error?.message || 'No se pudo validar la disponibilidad de la mesa.'
            };
        }
    }

    function estadoBloqueaReserva(estadoOperativo) {
        return estadoOperativo === 'ocupada'
            || estadoOperativo === 'reservada'
            || estadoOperativo === 'no_disponible'
            || estadoOperativo === 'nodisponible';
    }

    function toDateTimeLocal(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return String(value).slice(0, 16);
        }
        const pad = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function setTableLoading(loading) {
        const tbody = byId('reservasTableBody');
        if (!tbody || !loading) return;
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm me-2"></div>Cargando...</td></tr>';
    }

    function showToast(message, variant = 'success') {
        if (typeof bootstrap === 'undefined') {
            window.alert(message);
            return;
        }

        const container = ensureToastContainer();
        const icon = variant === 'danger' ? 'bi-exclamation-triangle-fill' : 'bi-check-circle-fill';
        const wrapper = document.createElement('div');
        wrapper.className = `toast align-items-center text-bg-${variant} border-0`;
        wrapper.setAttribute('role', 'alert');
        wrapper.setAttribute('aria-live', 'assertive');
        wrapper.setAttribute('aria-atomic', 'true');
        wrapper.innerHTML = `
            <div class="d-flex">
                <div class="toast-body"><i class="bi ${icon} me-2"></i>${escapeHtml(message)}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Cerrar"></button>
            </div>
        `;
        container.appendChild(wrapper);
        const toast = bootstrap.Toast.getOrCreateInstance(wrapper, { delay: 2600 });
        toast.show();
        wrapper.addEventListener('hidden.bs.toast', () => wrapper.remove());
    }

    function ensureToastContainer() {
        let container = byId('reservasToastContainer');
        if (container) return container;
        container = document.createElement('div');
        container.id = 'reservasToastContainer';
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '1100';
        document.body.appendChild(container);
        return container;
    }

    async function safeJson(response) {
        try { return await response.json(); } catch { return null; }
    }

    function getFilenameFromDisposition(value) {
        if (!value) return '';
        const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(value);
        if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);

        const plainMatch = /filename=([^;]+)/i.exec(value);
        if (plainMatch?.[1]) return plainMatch[1].replace(/"/g, '').trim();

        return '';
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename || 'export.xlsx';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function toBool(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') return value.toLowerCase() === 'true';
        return !!value;
    }

    function toTitleCase(value) {
        return String(value || '')
            .toLowerCase()
            .split('_')
            .join(' ')
            .split(' ')
            .filter(Boolean)
            .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
            .join(' ');
    }

    function showModal(id) {
        const el = byId(id);
        if (!el || typeof bootstrap === 'undefined') return;
        bootstrap.Modal.getOrCreateInstance(el).show();
    }

    function hideModal(id) {
        const el = byId(id);
        if (!el || typeof bootstrap === 'undefined') return;
        bootstrap.Modal.getOrCreateInstance(el).hide();
    }

    function byId(id) { return document.getElementById(id); }
    function setText(id, text) { const el = byId(id); if (el) el.textContent = text; }
    function setTextHtml(id, html) { const el = byId(id); if (el) el.innerHTML = html; }
    function setValue(id, val) { const el = byId(id); if (el) el.value = val; }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function escapeHtmlAttr(value) {
        return escapeHtml(value).replace(/`/g, '&#096;');
    }
})();
