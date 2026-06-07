/* =====================================================
   RestaControl — Lista Mesas API Adapter
   Contrato backend: /api/lista-mesas, /api/atenciones, /api/detalle-pedidos
   ===================================================== */

(() => {
    const API_BASE = `${(window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || 'http://localhost:7070'}/api`;

    const DEFAULT_HEADERS = {
        'Content-Type': 'application/json'
    };

    const CODE_TO_MESSAGE = {
        MESA_NO_DISPONIBLE: 'La mesa no esta disponible.',
        MESA_OCUPADA: 'La mesa ya esta ocupada.',
        RESERVA_NO_VIGENTE: 'La reserva ya no esta vigente.',
        ITEM_NO_VALIDO: 'El item enviado no es valido.',
        STOCK_INSUFICIENTE: 'No hay stock suficiente para el producto.',
        TRANSICION_ESTADO_INVALIDA: 'No se puede cambiar el estado del item con esa transicion.',
        ATENCION_NO_EN_CURSO: 'La atencion no esta en curso.',
        VALIDACION_NEGOCIO: 'No se pudo completar la operacion por una validacion de negocio.'
    };

    class ApiBusinessError extends Error {
        constructor(message, payload = {}) {
            super(message || 'Error de negocio.');
            this.name = 'ApiBusinessError';
            this.code = payload.code || null;
            this.details = payload.details || null;
            this.status = payload.status || 400;
            this.payload = payload;
        }
    }

    function toIsoSeconds(date = new Date()) {
        const d = date instanceof Date ? date : new Date(date);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    async function request(path, options = {}) {
        const response = await fetch(`${API_BASE}${path}`, {
            method: options.method || 'GET',
            headers: {
                ...DEFAULT_HEADERS,
                ...(options.headers || {})
            },
            body: options.body ? JSON.stringify(options.body) : undefined
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch {
            payload = null;
        }

        if (!response.ok || payload?.success === false) {
            const messageFromCode = payload?.code ? CODE_TO_MESSAGE[payload.code] : '';
            throw new ApiBusinessError(
                payload?.message || messageFromCode || 'No se pudo completar la solicitud al servidor.',
                {
                    code: payload?.code,
                    details: payload?.details,
                    status: response.status || 500,
                    payload
                }
            );
        }

        return payload;
    }

    function formatApiError(error) {
        if (error instanceof ApiBusinessError) {
            return {
                code: error.code || 'ERROR_NEGOCIO',
                message: error.message || 'Ocurrio un error de negocio.',
                details: error.details || null,
                status: error.status || 400,
                isBusiness: true
            };
        }

        return {
            code: 'ERROR_RED',
            message: 'No se pudo conectar con el backend.',
            details: null,
            status: 0,
            isBusiness: false
        };
    }

    function toQuery(params = {}) {
        const search = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') return;
            search.set(key, String(value));
        });
        const raw = search.toString();
        return raw ? `?${raw}` : '';
    }

    const ListaMesasApi = {
        apiBase: API_BASE,
        toIsoSeconds,
        formatApiError,

        getTablero(fechaHora = toIsoSeconds()) {
            return request(`/lista-mesas${toQuery({ fechaHora })}`);
        },

        getContextoMesa(idMesa, fechaHora = toIsoSeconds()) {
            return request(`/lista-mesas/${encodeURIComponent(idMesa)}/contexto${toQuery({ fechaHora })}`);
        },

        ocuparMesa(idMesa, body) {
            return request(`/lista-mesas/${encodeURIComponent(idMesa)}/ocupar`, {
                method: 'POST',
                body
            });
        },

        ocuparMesaReservada(idMesa, idReserva, body) {
            return request(`/lista-mesas/${encodeURIComponent(idMesa)}/reservas/${encodeURIComponent(idReserva)}/ocupar`, {
                method: 'POST',
                body
            });
        },

        agregarItemAtencion(idAtencion, body) {
            return request(`/atenciones/${encodeURIComponent(idAtencion)}/items`, {
                method: 'POST',
                body
            });
        },

        cambiarEstadoItem(idDetalle, estadoCocina) {
            return request(`/detalle-pedidos/${encodeURIComponent(idDetalle)}/estado`, {
                method: 'PATCH',
                body: { estadoCocina }
            });
        },

        cobrarAtencion(idAtencion, body) {
            return request(`/atenciones/${encodeURIComponent(idAtencion)}/cobrar`, {
                method: 'POST',
                body
            });
        },

        cancelarReserva(idReserva) {
            return request(`/reservas/${encodeURIComponent(idReserva)}/situacion`, {
                method: 'PATCH',
                body: {
                    estado: 'cancelada',
                    confirmada: false
                }
            });
        },

        listClientes(params = {}) {
            const query = {
                activo: true,
                page: 1,
                size: 100,
                ...params
            };
            return request(`/clientes${toQuery(query)}`);
        },

        buscarClientePorDocumento(documento) {
            return request(`/clientes/buscar-por-documento${toQuery({ documento })}`);
        },

        crearCliente(body) {
            return request('/clientes', {
                method: 'POST',
                body
            });
        },

        listMozos(params = {}) {
            const query = {
                rol: 'mozo',
                activo: true,
                page: 1,
                size: 100,
                ...params
            };
            return request(`/usuarios${toQuery(query)}`);
        },

        listPlatos(params = {}) {
            const query = {
                activo: true,
                disponible: true,
                page: 1,
                size: 200,
                ...params
            };
            return request(`/platos${toQuery(query)}`);
        },

        listProductos(params = {}) {
            const query = {
                activo: true,
                conStock: true,
                page: 1,
                size: 200,
                ...params
            };
            return request(`/productos${toQuery(query)}`);
        }
    };

    window.ListaMesasApi = ListaMesasApi;
})();
