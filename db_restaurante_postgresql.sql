-- =====================================================================
-- BASE DE DATOS RESTAURANTE - RestaControl (PostgreSQL)
-- Sistema de gestión para restaurantes
-- =====================================================================

-- Crear base de datos
CREATE DATABASE restaurante
    WITH 
    ENCODING 'UTF8'
    LC_COLLATE = 'es_ES.UTF-8'
    LC_CTYPE = 'es_ES.UTF-8';

-- Conectarse a la base de datos
\c restaurante

-- =====================================================================
-- EXTENSIONES Y TIPOS PERSONALIZADOS
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tipos ENUM
CREATE TYPE rol_enum AS ENUM ('Administrador', 'Recepcion', 'Mozo', 'Cajero', 'Cocinero');
CREATE TYPE tipo_reserva_enum AS ENUM ('Salon', 'Terraza', 'Privado');
CREATE TYPE estado_reserva_enum AS ENUM ('Pendiente', 'Confirmada', 'Cancelada', 'Completada');
CREATE TYPE estado_atencion_enum AS ENUM ('Abierta', 'En curso', 'Cerrada');
CREATE TYPE estado_pago_enum AS ENUM ('Pendiente', 'Pagado', 'Parcial');
CREATE TYPE estado_mesa_enum AS ENUM ('Disponible', 'Ocupada', 'Reservada', 'En mantenimiento');
CREATE TYPE estado_pedido_enum AS ENUM ('Pendiente', 'Enviado', 'En preparacion', 'Listo', 'Servido');
CREATE TYPE estado_cocina_enum AS ENUM ('pendiente', 'en preparacion', 'listo', 'despachado');
CREATE TYPE tipo_item_enum AS ENUM ('plato', 'producto', 'otro');
CREATE TYPE tipo_comprobante_enum AS ENUM ('Boleta', 'Factura', 'Ticket');
CREATE TYPE estado_comprobante_enum AS ENUM ('Generado', 'Emitido', 'Anulado');
CREATE TYPE metodo_pago_enum AS ENUM ('Efectivo', 'Tarjeta', 'Transferencia', 'Mixto');
CREATE TYPE unidad_enum AS ENUM ('unidad', 'litro', 'kg', 'gramo');

-- Funciones base para UUID y códigos automáticos
CREATE OR REPLACE FUNCTION fn_generar_codigo(p_prefijo TEXT, p_secuencia TEXT, p_ancho INT DEFAULT 6)
RETURNS TEXT AS $$
DECLARE
    v_numero BIGINT;
BEGIN
    EXECUTE format('SELECT nextval(%L)', p_secuencia) INTO v_numero;
    RETURN p_prefijo || lpad(v_numero::TEXT, p_ancho, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_asignar_codigo()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
        NEW.codigo := fn_generar_codigo(TG_ARGV[0], TG_ARGV[1]);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.fecha_actualizacion := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- TABLAS PRINCIPALES
-- =====================================================================

-- 1. CATEGORÍAS DE PLATOS
CREATE TABLE categorias (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    orden INT NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. PLATOS/MENU
CREATE TABLE platos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(20) NOT NULL UNIQUE,
    id_categoria UUID NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    precio DECIMAL(10, 2) NOT NULL,
    disponible BOOLEAN DEFAULT TRUE,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_categoria) REFERENCES categorias(id) ON DELETE RESTRICT
);

-- 3. CLIENTES
CREATE TABLE clientes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    documento VARCHAR(20) UNIQUE,
    telefono VARCHAR(20),
    email VARCHAR(100),
    direccion TEXT,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. USUARIOS/PERSONAL
CREATE TABLE usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    rol rol_enum NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. MESAS
CREATE TABLE mesas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(20) NOT NULL UNIQUE,
    capacidad INT NOT NULL,
    ubicacion VARCHAR(100),
    activa BOOLEAN DEFAULT TRUE,
    estado estado_mesa_enum DEFAULT 'Disponible',
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. RESERVAS
CREATE TABLE reservas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(20) NOT NULL UNIQUE,
    tipo tipo_reserva_enum NOT NULL,
    id_cliente UUID NOT NULL,
    nombre_contacto VARCHAR(150) NOT NULL,
    id_mesa UUID,
    fecha_hora TIMESTAMP NOT NULL,
    cantidad_personas INT NOT NULL,
    estado estado_reserva_enum DEFAULT 'Pendiente',
    confirmada BOOLEAN DEFAULT FALSE,
    notas TEXT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cliente) REFERENCES clientes(id) ON DELETE RESTRICT,
    FOREIGN KEY (id_mesa) REFERENCES mesas(id) ON DELETE SET NULL
);

-- 7. ATENCIONES/SERVICIOS
CREATE TABLE atenciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(20) NOT NULL UNIQUE,
    id_cliente UUID NOT NULL,
    id_reserva UUID,
    id_mesa UUID NOT NULL,
    id_mozo UUID NOT NULL,
    estado estado_atencion_enum DEFAULT 'Abierta',
    estado_pago estado_pago_enum DEFAULT 'Pendiente',
    apertura_en TIMESTAMP NOT NULL,
    cierre_en TIMESTAMP NULL,
    total_pagado DECIMAL(10, 2) DEFAULT 0,
    propina DECIMAL(10, 2) DEFAULT 0,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cliente) REFERENCES clientes(id) ON DELETE RESTRICT,
    FOREIGN KEY (id_reserva) REFERENCES reservas(id) ON DELETE SET NULL,
    FOREIGN KEY (id_mesa) REFERENCES mesas(id) ON DELETE RESTRICT,
    FOREIGN KEY (id_mozo) REFERENCES usuarios(id) ON DELETE RESTRICT
);

-- 8. PEDIDOS
CREATE TABLE pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(20) NOT NULL UNIQUE,
    id_atencion UUID NOT NULL,
    creado_por UUID NOT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado estado_pedido_enum DEFAULT 'Pendiente',
    notas TEXT,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_atencion) REFERENCES atenciones(id) ON DELETE RESTRICT,
    FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
);

-- 9. DETALLE DE PEDIDOS
CREATE TABLE detalle_pedidos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_pedido UUID NOT NULL,
    id_plato UUID,
    id_producto UUID,
    cantidad INT NOT NULL,
    precio_unit DECIMAL(10, 2) NOT NULL,
    descuento DECIMAL(10, 2) DEFAULT 0,
    tipo_item tipo_item_enum DEFAULT 'plato',
    estado_cocina estado_cocina_enum DEFAULT 'pendiente',
    observaciones TEXT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_pedido) REFERENCES pedidos(id) ON DELETE CASCADE,
    FOREIGN KEY (id_plato) REFERENCES platos(id) ON DELETE RESTRICT,
    CHECK (
        (tipo_item = 'plato' AND id_plato IS NOT NULL AND id_producto IS NULL)
        OR
        (tipo_item = 'producto' AND id_producto IS NOT NULL AND id_plato IS NULL)
        OR
        (tipo_item = 'otro' AND id_plato IS NULL AND id_producto IS NULL)
    )
);

-- 10. PRODUCTOS (Bebidas, insumos, etc.)
CREATE TABLE productos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL UNIQUE,
    descripcion TEXT,
    precio DECIMAL(10, 2) NOT NULL,
    stock INT NOT NULL DEFAULT 0,
    stock_minimo INT DEFAULT 10,
    unidad unidad_enum DEFAULT 'unidad',
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE detalle_pedidos
    ADD CONSTRAINT fk_detalle_pedidos_producto
    FOREIGN KEY (id_producto) REFERENCES productos(id) ON DELETE RESTRICT;

-- 11. COMPROBANTES/FACTURAS
CREATE TABLE comprobantes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_atencion UUID NOT NULL,
    numero_comprobante VARCHAR(50) UNIQUE NOT NULL,
    tipo_comprobante tipo_comprobante_enum DEFAULT 'Boleta',
    monto_subtotal DECIMAL(10, 2) NOT NULL,
    monto_igv DECIMAL(10, 2) DEFAULT 0,
    monto_descuento DECIMAL(10, 2) DEFAULT 0,
    monto_total DECIMAL(10, 2) NOT NULL,
    metodo_pago metodo_pago_enum DEFAULT 'Efectivo',
    estado estado_comprobante_enum DEFAULT 'Generado',
    emitido_por UUID NOT NULL,
    fecha_emision TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_atencion) REFERENCES atenciones(id) ON DELETE RESTRICT,
    FOREIGN KEY (emitido_por) REFERENCES usuarios(id) ON DELETE RESTRICT
);

-- =====================================================================
-- ÍNDICES PARA OPTIMIZACIÓN
-- =====================================================================

CREATE INDEX idx_platos_categoria ON platos(id_categoria);
CREATE INDEX idx_platos_disponible ON platos(disponible);
CREATE INDEX idx_clientes_documento ON clientes(documento);
CREATE INDEX idx_clientes_email ON clientes(email);
CREATE INDEX idx_usuarios_rol ON usuarios(rol);
CREATE INDEX idx_usuarios_activo ON usuarios(activo);
CREATE INDEX idx_mesas_estado ON mesas(estado);
CREATE INDEX idx_reservas_cliente ON reservas(id_cliente);
CREATE INDEX idx_reservas_mesa ON reservas(id_mesa);
CREATE INDEX idx_reservas_fecha ON reservas(fecha_hora);
CREATE INDEX idx_atenciones_mesa ON atenciones(id_mesa);
CREATE INDEX idx_atenciones_mozo ON atenciones(id_mozo);
CREATE INDEX idx_atenciones_estado ON atenciones(estado);
CREATE INDEX idx_pedidos_atencion ON pedidos(id_atencion);
CREATE INDEX idx_pedidos_estado ON pedidos(estado);
CREATE INDEX idx_detalle_pedido ON detalle_pedidos(id_pedido);
CREATE INDEX idx_detalle_plato ON detalle_pedidos(id_plato);
CREATE INDEX idx_detalle_producto ON detalle_pedidos(id_producto);
CREATE INDEX idx_productos_stock ON productos(stock);
CREATE INDEX idx_comprobantes_atencion ON comprobantes(id_atencion);
CREATE INDEX idx_comprobantes_fecha ON comprobantes(fecha_emision);

-- =====================================================================
-- SECUENCIAS Y TRIGGERS DE CÓDIGOS AUTOMÁTICOS
-- =====================================================================

CREATE SEQUENCE seq_categorias_codigo START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE seq_platos_codigo START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE seq_clientes_codigo START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE seq_usuarios_codigo START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE seq_mesas_codigo START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE seq_reservas_codigo START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE seq_atenciones_codigo START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE seq_pedidos_codigo START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE seq_productos_codigo START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE seq_comprobantes_numero START WITH 1 INCREMENT BY 1;

CREATE TRIGGER trg_categorias_codigo
BEFORE INSERT ON categorias
FOR EACH ROW
EXECUTE FUNCTION fn_asignar_codigo('CAT', 'seq_categorias_codigo');

CREATE TRIGGER trg_platos_codigo
BEFORE INSERT ON platos
FOR EACH ROW
EXECUTE FUNCTION fn_asignar_codigo('PLA', 'seq_platos_codigo');

CREATE TRIGGER trg_clientes_codigo
BEFORE INSERT ON clientes
FOR EACH ROW
EXECUTE FUNCTION fn_asignar_codigo('CLI', 'seq_clientes_codigo');

CREATE TRIGGER trg_usuarios_codigo
BEFORE INSERT ON usuarios
FOR EACH ROW
EXECUTE FUNCTION fn_asignar_codigo('USR', 'seq_usuarios_codigo');

CREATE TRIGGER trg_mesas_codigo
BEFORE INSERT ON mesas
FOR EACH ROW
EXECUTE FUNCTION fn_asignar_codigo('MESA', 'seq_mesas_codigo');

CREATE TRIGGER trg_reservas_codigo
BEFORE INSERT ON reservas
FOR EACH ROW
EXECUTE FUNCTION fn_asignar_codigo('RES', 'seq_reservas_codigo');

CREATE TRIGGER trg_atenciones_codigo
BEFORE INSERT ON atenciones
FOR EACH ROW
EXECUTE FUNCTION fn_asignar_codigo('ATE', 'seq_atenciones_codigo');

CREATE TRIGGER trg_pedidos_codigo
BEFORE INSERT ON pedidos
FOR EACH ROW
EXECUTE FUNCTION fn_asignar_codigo('PED', 'seq_pedidos_codigo');

CREATE TRIGGER trg_productos_codigo
BEFORE INSERT ON productos
FOR EACH ROW
EXECUTE FUNCTION fn_asignar_codigo('PROD', 'seq_productos_codigo');

CREATE OR REPLACE FUNCTION fn_asignar_numero_comprobante()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.numero_comprobante IS NULL OR NEW.numero_comprobante = '' THEN
        NEW.numero_comprobante := fn_generar_codigo('COM', 'seq_comprobantes_numero');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_comprobantes_numero
BEFORE INSERT ON comprobantes
FOR EACH ROW
EXECUTE FUNCTION fn_asignar_numero_comprobante();

-- =====================================================================
-- DATOS DE PRUEBA (SEEDS)
-- =====================================================================

-- Insertar Categorías
INSERT INTO categorias (id, codigo, nombre, orden, activo) VALUES
('00000000-0000-0000-0000-000000000101', 'CAT000001', 'Entradas', 1, TRUE),
('00000000-0000-0000-0000-000000000102', 'CAT000002', 'Fondos', 2, TRUE),
('00000000-0000-0000-0000-000000000103', 'CAT000003', 'Bebidas', 3, TRUE),
('00000000-0000-0000-0000-000000000104', 'CAT000004', 'Postres', 4, FALSE);

-- Insertar Platos
INSERT INTO platos (id, codigo, id_categoria, nombre, descripcion, precio, disponible, activo) VALUES
('00000000-0000-0000-0000-000000001101', 'PLA000001', '00000000-0000-0000-0000-000000000101', 'Causa limeña', 'Papa amarilla, pollo y palta.', 18.50, TRUE, TRUE),
('00000000-0000-0000-0000-000000001102', 'PLA000002', '00000000-0000-0000-0000-000000000102', 'Lomo saltado', 'Clasico con papas crocantes.', 32.00, TRUE, TRUE),
('00000000-0000-0000-0000-000000001103', 'PLA000003', '00000000-0000-0000-0000-000000000102', 'Aji de gallina', 'Guiso cremoso tradicional.', 28.00, FALSE, TRUE),
('00000000-0000-0000-0000-000000001104', 'PLA000004', '00000000-0000-0000-0000-000000000103', 'Chicha morada', 'Bebida de maiz morado.', 9.50, TRUE, TRUE);

-- Insertar Clientes
INSERT INTO clientes (id, codigo, nombres, apellidos, documento, telefono, email, activo) VALUES
('00000000-0000-0000-0000-000000002101', 'CLI000001', 'Lucia', 'Fernandez', '71234567', '987111222', 'lucia@demo.com', TRUE),
('00000000-0000-0000-0000-000000002102', 'CLI000002', 'Carlos', 'Ramos', '70333444', '987333555', 'carlos@demo.com', TRUE),
('00000000-0000-0000-0000-000000002103', 'CLI000003', 'Patricia', 'Gomez', '72888999', '982000111', 'patty@demo.com', FALSE);

-- Insertar Usuarios
INSERT INTO usuarios (id, codigo, nombres, apellidos, username, password, rol, activo) VALUES
('00000000-0000-0000-0000-000000003101', 'USR000001', 'Marcos', 'Salazar', 'marcos', 'admin123', 'Administrador', TRUE),
('00000000-0000-0000-0000-000000003102', 'USR000002', 'Elena', 'Torres', 'elena', 'recep123', 'Recepcion', TRUE),
('00000000-0000-0000-0000-000000003103', 'USR000003', 'Dario', 'Lopez', 'dario', 'mozo123', 'Mozo', TRUE),
('00000000-0000-0000-0000-000000003104', 'USR000004', 'Sofia', 'Marin', 'sofia', 'cajero123', 'Cajero', FALSE);

-- Insertar Mesas
INSERT INTO mesas (id, codigo, capacidad, ubicacion, activa, estado) VALUES
('00000000-0000-0000-0000-000000004101', 'MESA000001', 4, 'Ventana', TRUE, 'Disponible'),
('00000000-0000-0000-0000-000000004102', 'MESA000002', 2, 'Salon central', TRUE, 'Disponible'),
('00000000-0000-0000-0000-000000004103', 'MESA000003', 6, 'Terraza', TRUE, 'Disponible'),
('00000000-0000-0000-0000-000000004104', 'MESA000004', 8, 'VIP', FALSE, 'En mantenimiento');

-- Insertar Reservas
INSERT INTO reservas (id, codigo, tipo, id_cliente, nombre_contacto, id_mesa, fecha_hora, cantidad_personas, estado, confirmada) VALUES
('00000000-0000-0000-0000-000000005101', 'RES000001', 'Salon', '00000000-0000-0000-0000-000000002101', 'Lucia Fernandez', '00000000-0000-0000-0000-000000004101', '2026-04-09 20:00:00', 4, 'Confirmada', TRUE),
('00000000-0000-0000-0000-000000005102', 'RES000002', 'Terraza', '00000000-0000-0000-0000-000000002102', 'Carlos Ramos', '00000000-0000-0000-0000-000000004103', '2026-04-10 13:00:00', 3, 'Pendiente', FALSE);

-- Insertar Atenciones
INSERT INTO atenciones (id, codigo, id_cliente, id_reserva, id_mesa, id_mozo, estado, estado_pago, apertura_en, cierre_en) VALUES
('00000000-0000-0000-0000-000000006101', 'ATE000001', '00000000-0000-0000-0000-000000002101', '00000000-0000-0000-0000-000000005101', '00000000-0000-0000-0000-000000004101', '00000000-0000-0000-0000-000000003103', 'En curso', 'Pendiente', '2026-04-09 20:05:00', NULL),
('00000000-0000-0000-0000-000000006102', 'ATE000002', '00000000-0000-0000-0000-000000002102', NULL, '00000000-0000-0000-0000-000000004102', '00000000-0000-0000-0000-000000003103', 'Cerrada', 'Pagado', '2026-04-09 13:10:00', '2026-04-09 14:30:00');

-- Insertar Pedidos
INSERT INTO pedidos (id, codigo, id_atencion, creado_por, creado_en, estado, notas) VALUES
('00000000-0000-0000-0000-000000007101', 'PED000001', '00000000-0000-0000-0000-000000006101', '00000000-0000-0000-0000-000000003103', '2026-04-09 20:10:00', 'Pendiente', 'Sin cebolla en uno.'),
('00000000-0000-0000-0000-000000007102', 'PED000002', '00000000-0000-0000-0000-000000006102', '00000000-0000-0000-0000-000000003103', '2026-04-09 13:15:00', 'Servido', '');

-- Insertar Detalle de Pedidos
INSERT INTO detalle_pedidos (id, id_pedido, id_plato, cantidad, precio_unit, descuento, tipo_item, estado_cocina) VALUES
('00000000-0000-0000-0000-000000008101', '00000000-0000-0000-0000-000000007101', '00000000-0000-0000-0000-000000001102', 2, 32.00, 0, 'plato', 'pendiente'),
('00000000-0000-0000-0000-000000008102', '00000000-0000-0000-0000-000000007101', '00000000-0000-0000-0000-000000001104', 4, 9.50, 2, 'plato', 'pendiente'),
('00000000-0000-0000-0000-000000008103', '00000000-0000-0000-0000-000000007102', '00000000-0000-0000-0000-000000001101', 1, 18.50, 0, 'plato', 'pendiente');

-- Insertar Productos
INSERT INTO productos (id, codigo, nombre, descripcion, precio, stock, stock_minimo, unidad, activo) VALUES
('00000000-0000-0000-0000-000000009101', 'PROD000001', 'Inca Kola 500ml', 'Gaseosa nacional 500ml', 5.00, 50, 20, 'unidad', TRUE),
('00000000-0000-0000-0000-000000009102', 'PROD000002', 'Coca Cola 500ml', 'Gaseosa importada 500ml', 5.50, 40, 20, 'unidad', TRUE),
('00000000-0000-0000-0000-000000009103', 'PROD000003', 'Cerveza Pilsen', 'Cerveza lata 355ml', 9.00, 30, 15, 'unidad', TRUE),
('00000000-0000-0000-0000-000000009104', 'PROD000004', 'Agua San Luis', 'Agua mineral 625ml', 3.50, 60, 30, 'unidad', TRUE),
('00000000-0000-0000-0000-000000009105', 'PROD000005', 'Jugo de naranja', 'Jugo natural 300ml', 7.00, 20, 10, 'unidad', TRUE);

-- =====================================================================
-- VISTAS ÚTILES
-- =====================================================================

-- Vista: Atenciones con detalles del cliente y mesa
CREATE OR REPLACE VIEW v_atenciones_detalle AS
SELECT 
    a.id,
    c.nombres AS cliente_nombres,
    c.apellidos AS cliente_apellidos,
    m.codigo AS mesa_codigo,
    u.nombres AS mozo_nombres,
    a.estado,
    a.estado_pago,
    a.apertura_en,
    a.cierre_en
FROM atenciones a
JOIN clientes c ON a.id_cliente = c.id
JOIN mesas m ON a.id_mesa = m.id
JOIN usuarios u ON a.id_mozo = u.id;

-- Vista: Pedidos con detalles (platos y productos)
CREATE OR REPLACE VIEW v_pedidos_detalle AS
SELECT 
    p.id AS pedido_id,
    COALESCE(pl.nombre, pr.nombre) AS item_nombre,
    dp.tipo_item,
    dp.cantidad,
    dp.precio_unit,
    (dp.cantidad * dp.precio_unit - dp.descuento) AS subtotal,
    dp.estado_cocina,
    dp.observaciones
FROM pedidos p
JOIN detalle_pedidos dp ON p.id = dp.id_pedido
LEFT JOIN platos pl ON dp.id_plato = pl.id AND dp.tipo_item = 'plato'
LEFT JOIN productos pr ON dp.id_producto = pr.id AND dp.tipo_item = 'producto'
ORDER BY p.id, COALESCE(pl.nombre, pr.nombre);

-- Vista: Reservas pendientes
CREATE OR REPLACE VIEW v_reservas_pendientes AS
SELECT 
    r.id,
    c.nombres AS cliente_nombres,
    r.fecha_hora,
    r.cantidad_personas,
    m.codigo AS mesa_codigo,
    r.estado
FROM reservas r
JOIN clientes c ON r.id_cliente = c.id
LEFT JOIN mesas m ON r.id_mesa = m.id
WHERE r.estado = 'Pendiente'
ORDER BY r.fecha_hora ASC;

-- Vista: Resumen de atenciones abiertas
CREATE OR REPLACE VIEW v_atenciones_abiertas AS
SELECT 
    a.id,
    m.codigo AS mesa,
    c.nombres,
    a.apertura_en,
    COUNT(dp.id) AS total_items
FROM atenciones a
JOIN mesas m ON a.id_mesa = m.id
JOIN clientes c ON a.id_cliente = c.id
LEFT JOIN pedidos p ON a.id = p.id_atencion
LEFT JOIN detalle_pedidos dp ON p.id = dp.id_pedido
WHERE a.estado IN ('Abierta', 'En curso')
GROUP BY a.id, m.codigo, c.nombres, a.apertura_en
ORDER BY a.apertura_en DESC;

-- =====================================================================
-- FUNCIONES ALMACENADAS
-- =====================================================================

-- Función: Calcular total de pedido
CREATE OR REPLACE FUNCTION fn_total_pedido(p_id_pedido UUID)
RETURNS DECIMAL AS $$
DECLARE
    total DECIMAL(10,2);
BEGIN
    SELECT COALESCE(SUM(cantidad * precio_unit - descuento), 0)
    INTO total
    FROM detalle_pedidos
    WHERE id_pedido = p_id_pedido;
    RETURN total;
END;
$$ LANGUAGE plpgsql;

-- Función: Obtener estado actual de mesa
CREATE OR REPLACE FUNCTION fn_estado_mesa(p_id_mesa UUID)
RETURNS estado_mesa_enum AS $$
DECLARE
    estado estado_mesa_enum;
BEGIN
    SELECT m.estado
    INTO estado
    FROM mesas m
    WHERE m.id = p_id_mesa;
    RETURN estado;
END;
$$ LANGUAGE plpgsql;

-- Función: Total de ventas en rango de fechas
CREATE OR REPLACE FUNCTION fn_total_ventas_rango(
    p_fecha_inicio TIMESTAMP,
    p_fecha_fin TIMESTAMP
)
RETURNS DECIMAL AS $$
DECLARE
    total DECIMAL(10,2);
BEGIN
    SELECT COALESCE(SUM(c.monto_total), 0)
    INTO total
    FROM comprobantes c
    WHERE c.fecha_emision BETWEEN p_fecha_inicio AND p_fecha_fin
    AND c.estado = 'Emitido';
    RETURN total;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- PROCEDIMIENTOS ALMACENADOS
-- =====================================================================

-- Procedimiento: Crear nueva atención
CREATE OR REPLACE FUNCTION sp_crear_atencion(
    p_id_cliente UUID,
    p_id_mesa UUID,
    p_id_mozo UUID
)
RETURNS UUID AS $$
DECLARE
    v_id_atencion UUID;
BEGIN
    INSERT INTO atenciones (id_cliente, id_mesa, id_mozo, apertura_en)
    VALUES (p_id_cliente, p_id_mesa, p_id_mozo, NOW())
    RETURNING id INTO v_id_atencion;
    
    UPDATE mesas SET estado = 'Ocupada' WHERE id = p_id_mesa;
    
    RETURN v_id_atencion;
END;
$$ LANGUAGE plpgsql;

-- Procedimiento: Cerrar atención
CREATE OR REPLACE FUNCTION sp_cerrar_atencion(
    p_id_atencion UUID
)
RETURNS VOID AS $$
BEGIN
    UPDATE atenciones 
    SET estado = 'Cerrada', 
        cierre_en = NOW(),
        estado_pago = 'Pendiente'
    WHERE id = p_id_atencion;
    
    UPDATE mesas 
    SET estado = 'Disponible' 
    WHERE id = (SELECT id_mesa FROM atenciones WHERE id = p_id_atencion);
END;
$$ LANGUAGE plpgsql;

-- Procedimiento: Registrar pago de atención
CREATE OR REPLACE FUNCTION sp_registrar_pago(
    p_id_atencion UUID,
    p_monto DECIMAL,
    p_metodo VARCHAR
)
RETURNS VOID AS $$
BEGIN
    UPDATE atenciones 
    SET total_pagado = p_monto,
        estado_pago = 'Pagado'
    WHERE id = p_id_atencion;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- Trigger: Actualizar fecha_actualizacion en categorias
CREATE OR REPLACE FUNCTION fn_actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.fecha_actualizacion := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_categorias_actualizar_timestamp
BEFORE UPDATE ON categorias
FOR EACH ROW
EXECUTE FUNCTION fn_actualizar_timestamp();

CREATE TRIGGER trg_platos_actualizar_timestamp
BEFORE UPDATE ON platos
FOR EACH ROW
EXECUTE FUNCTION fn_actualizar_timestamp();

CREATE TRIGGER trg_clientes_actualizar_timestamp
BEFORE UPDATE ON clientes
FOR EACH ROW
EXECUTE FUNCTION fn_actualizar_timestamp();

CREATE TRIGGER trg_usuarios_actualizar_timestamp
BEFORE UPDATE ON usuarios
FOR EACH ROW
EXECUTE FUNCTION fn_actualizar_timestamp();

CREATE TRIGGER trg_mesas_actualizar_timestamp
BEFORE UPDATE ON mesas
FOR EACH ROW
EXECUTE FUNCTION fn_actualizar_timestamp();

CREATE TRIGGER trg_reservas_actualizar_timestamp
BEFORE UPDATE ON reservas
FOR EACH ROW
EXECUTE FUNCTION fn_actualizar_timestamp();

CREATE TRIGGER trg_atenciones_actualizar_timestamp
BEFORE UPDATE ON atenciones
FOR EACH ROW
EXECUTE FUNCTION fn_actualizar_timestamp();

CREATE TRIGGER trg_pedidos_actualizar_timestamp
BEFORE UPDATE ON pedidos
FOR EACH ROW
EXECUTE FUNCTION fn_actualizar_timestamp();

CREATE TRIGGER trg_detalle_pedidos_actualizar_timestamp
BEFORE UPDATE ON detalle_pedidos
FOR EACH ROW
EXECUTE FUNCTION fn_actualizar_timestamp();

CREATE TRIGGER trg_productos_actualizar_timestamp
BEFORE UPDATE ON productos
FOR EACH ROW
EXECUTE FUNCTION fn_actualizar_timestamp();

CREATE TRIGGER trg_comprobantes_actualizar_timestamp
BEFORE UPDATE ON comprobantes
FOR EACH ROW
EXECUTE FUNCTION fn_actualizar_timestamp();

-- =====================================================================
-- COMENTARIOS Y DOCUMENTACIÓN
-- =====================================================================

COMMENT ON TABLE categorias IS 'Categorías de platos disponibles en el restaurante';
COMMENT ON TABLE platos IS 'Menú de platos del restaurante con precios y disponibilidad';
COMMENT ON TABLE clientes IS 'Registro de clientes del restaurante';
COMMENT ON TABLE usuarios IS 'Personal del restaurante con roles y permisos';
COMMENT ON TABLE mesas IS 'Mesas disponibles en el restaurante';
COMMENT ON TABLE reservas IS 'Reservas de mesas realizadas por clientes';
COMMENT ON TABLE atenciones IS 'Servicios/atenciones brindadas a los clientes';
COMMENT ON TABLE pedidos IS 'Pedidos realizados durante una atención';
COMMENT ON TABLE detalle_pedidos IS 'Detalles de items en cada pedido';
COMMENT ON TABLE productos IS 'Productos de venta (bebidas, insumos, etc.)';
COMMENT ON TABLE comprobantes IS 'Comprobantes de venta (boletas, facturas)';

-- =====================================================================
-- FIN DEL SCRIPT PostgreSQL
-- =====================================================================
