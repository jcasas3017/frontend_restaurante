/* =====================================================
   RestaControl — Data Layer (localStorage)
   Shared across all module pages
   ===================================================== */

const DB = (() => {
    const STORAGE_KEY = 'restacontrol-v2';

    const seeds = {
        categorias: [
            { id: 1, nombre: 'Entradas',  orden: 1, activo: true },
            { id: 2, nombre: 'Fondos',    orden: 2, activo: true },
            { id: 3, nombre: 'Bebidas',   orden: 3, activo: true },
            { id: 4, nombre: 'Postres',   orden: 4, activo: false }
        ],
        platos: [
            { id: 1, id_categoria: 1, nombre: 'Causa limeña',    descripcion: 'Papa amarilla, pollo y palta.',    precio: 18.50, disponible: true,  activo: true  },
            { id: 2, id_categoria: 2, nombre: 'Lomo saltado',     descripcion: 'Clasico con papas crocantes.',     precio: 32.00, disponible: true,  activo: true  },
            { id: 3, id_categoria: 2, nombre: 'Aji de gallina',   descripcion: 'Guiso cremoso tradicional.',       precio: 28.00, disponible: false, activo: true  },
            { id: 4, id_categoria: 3, nombre: 'Chicha morada',    descripcion: 'Bebida de maiz morado.',           precio:  9.50, disponible: true,  activo: true  }
        ],
        clientes: [
            { id: 1, nombres: 'Lucia',   apellidos: 'Fernandez', documento: '71234567', telefono: '987111222', email: 'lucia@demo.com',   activo: true  },
            { id: 2, nombres: 'Carlos',  apellidos: 'Ramos',     documento: '70333444', telefono: '987333555', email: 'carlos@demo.com',  activo: true  },
            { id: 3, nombres: 'Patricia',apellidos: 'Gomez',     documento: '72888999', telefono: '982000111', email: 'patty@demo.com',   activo: false }
        ],
        usuarios: [
            { id: 1, nombres: 'Marcos',  apellidos: 'Salazar', rol: 'Administrador', activo: true  },
            { id: 2, nombres: 'Elena',   apellidos: 'Torres',  rol: 'Recepcion',     activo: true  },
            { id: 3, nombres: 'Dario',   apellidos: 'Lopez',   rol: 'Mozo',          activo: true  },
            { id: 4, nombres: 'Sofia',   apellidos: 'Marin',   rol: 'Cajero',        activo: false }
        ],
        mesas: [
            { id: 1, codigo: 'M-01', capacidad: 4, ubicacion: 'Ventana',       activa: true  },
            { id: 2, codigo: 'M-02', capacidad: 2, ubicacion: 'Salon central', activa: true  },
            { id: 3, codigo: 'T-01', capacidad: 6, ubicacion: 'Terraza',       activa: true  },
            { id: 4, codigo: 'M-03', capacidad: 8, ubicacion: 'VIP',           activa: false }
        ],
        reservas: [
            { id: 1, tipo: 'Salon',   id_cliente: 1, nombre_contacto: 'Lucia Fernandez', id_mesa: 1, fecha_hora: '2026-04-09T20:00', cantidad_personas: 4, estado: 'Confirmada', confirmada: true  },
            { id: 2, tipo: 'Terraza', id_cliente: 2, nombre_contacto: 'Carlos Ramos',    id_mesa: 3, fecha_hora: '2026-04-10T13:00', cantidad_personas: 3, estado: 'Pendiente',  confirmada: false }
        ],
        atenciones: [
            { id: 1, id_cliente: 1, id_reserva: 1, id_mesa: 1, id_mozo: 3, estado: 'En curso',  estado_pago: 'Pendiente', apertura_en: '2026-04-09T20:05', cierre_en: '' },
            { id: 2, id_cliente: 2, id_reserva: '', id_mesa: 2, id_mozo: 3, estado: 'Cerrada',   estado_pago: 'Pagado',    apertura_en: '2026-04-09T13:10', cierre_en: '2026-04-09T14:30' }
        ],
        pedidos: [
            { id: 1, id_atencion: 1, creado_por: 3, creado_en: '2026-04-09T20:10', notas: 'Sin cebolla en uno.' },
            { id: 2, id_atencion: 2, creado_por: 3, creado_en: '2026-04-09T13:15', notas: '' }
        ],
        detallePedidos: [
            { id: 1, id_pedido: 1, id_plato: 2, cantidad: 2, precio_unit: 32.00, descuento: 0, tipo_item: 'plato', estado_cocina: 'pendiente', observaciones: '' },
            { id: 2, id_pedido: 1, id_plato: 4, cantidad: 4, precio_unit:  9.50, descuento: 2, tipo_item: 'plato', estado_cocina: 'pendiente', observaciones: '' },
            { id: 3, id_pedido: 2, id_plato: 1, cantidad: 1, precio_unit: 18.50, descuento: 0, tipo_item: 'plato', estado_cocina: 'pendiente', observaciones: '' }
        ],
        productos: [
            { id: 1, nombre: 'Inca Kola 500ml',  descripcion: 'Gaseosa nacional 500ml',      precio: 5.00,  stock: 50, unidad: 'unidad', activo: true },
            { id: 2, nombre: 'Coca Cola 500ml',   descripcion: 'Gaseosa importada 500ml',     precio: 5.50,  stock: 40, unidad: 'unidad', activo: true },
            { id: 3, nombre: 'Cerveza Pilsen',     descripcion: 'Cerveza lata 355ml',          precio: 9.00,  stock: 30, unidad: 'unidad', activo: true },
            { id: 4, nombre: 'Agua San Luis',      descripcion: 'Agua mineral 625ml',          precio: 3.50,  stock: 60, unidad: 'unidad', activo: true },
            { id: 5, nombre: 'Jugo de naranja',    descripcion: 'Jugo natural 300ml',          precio: 7.00,  stock: 20, unidad: 'unidad', activo: true }
        ],
        comprobantes: []
    };

    function _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) { _save(seeds); return JSON.parse(JSON.stringify(seeds)); }
            return JSON.parse(raw);
        } catch { _save(seeds); return JSON.parse(JSON.stringify(seeds)); }
    }

    function _save(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function getAll(entity) {
        return _load()[entity] || [];
    }

    function getById(entity, id) {
        return getAll(entity).find(r => r.id === Number(id));
    }

    function insert(entity, record) {
        const data = _load();
        const list = data[entity] || [];
        const nextId = list.reduce((m, r) => Math.max(m, r.id || 0), 0) + 1;
        const newRecord = { id: nextId, ...record };
        list.push(newRecord);
        data[entity] = list;
        _save(data);
        return newRecord;
    }

    function update(entity, id, record) {
        const data = _load();
        data[entity] = (data[entity] || []).map(r => r.id === Number(id) ? { ...r, ...record, id: Number(id) } : r);
        _save(data);
    }

    function remove(entity, id) {
        const data = _load();
        data[entity] = (data[entity] || []).filter(r => r.id !== Number(id));
        _save(data);
    }

    function reset() { _save(JSON.parse(JSON.stringify(seeds))); }

    return { getAll, getById, insert, update, remove, reset };
})();

