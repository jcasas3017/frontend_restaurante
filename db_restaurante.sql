-- =====================================================================
-- BASE DE DATOS RESTAURANTE - RestaControl
-- Sistema de gestión para restaurantes
-- =====================================================================

-- Crear base de datos
CREATE DATABASE IF NOT EXISTS restaurante;
USE restaurante;

-- =====================================================================
-- TABLAS PRINCIPALES
-- =====================================================================

-- 1. CATEGORÍAS DE PLATOS
CREATE TABLE IF NOT EXISTS categorias (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    orden INT NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. PLATOS/MENU
CREATE TABLE IF NOT EXISTS platos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    id_categoria INT NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    precio DECIMAL(10, 2) NOT NULL,
    disponible BOOLEAN DEFAULT TRUE,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id_categoria) REFERENCES categorias(id) ON DELETE RESTRICT
);

-- 3. CLIENTES
CREATE TABLE IF NOT EXISTS clientes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    documento VARCHAR(20) UNIQUE,
    telefono VARCHAR(20),
    email VARCHAR(100),
    direccion TEXT,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 4. USUARIOS/PERSONAL
CREATE TABLE IF NOT EXISTS usuarios (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    rol ENUM('Administrador', 'Recepcion', 'Mozo', 'Cajero', 'Cocinero') NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 5. MESAS
CREATE TABLE IF NOT EXISTS mesas (
    id INT PRIMARY KEY AUTO_INCREMENT,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    capacidad INT NOT NULL,
    ubicacion VARCHAR(100),
    activa BOOLEAN DEFAULT TRUE,
    estado ENUM('Disponible', 'Ocupada', 'Reservada', 'En mantenimiento') DEFAULT 'Disponible',
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 6. RESERVAS
CREATE TABLE IF NOT EXISTS reservas (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tipo ENUM('Salon', 'Terraza', 'Privado') NOT NULL,
    id_cliente INT NOT NULL,
    nombre_contacto VARCHAR(150) NOT NULL,
    id_mesa INT,
    fecha_hora DATETIME NOT NULL,
    cantidad_personas INT NOT NULL,
    estado ENUM('Pendiente', 'Confirmada', 'Cancelada', 'Completada') DEFAULT 'Pendiente',
    confirmada BOOLEAN DEFAULT FALSE,
    notas TEXT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cliente) REFERENCES clientes(id) ON DELETE RESTRICT,
    FOREIGN KEY (id_mesa) REFERENCES mesas(id) ON DELETE SET NULL
);

-- 7. ATENCIONES/SERVICIOS
CREATE TABLE IF NOT EXISTS atenciones (
    id INT PRIMARY KEY AUTO_INCREMENT,
    id_cliente INT NOT NULL,
    id_reserva INT,
    id_mesa INT NOT NULL,
    id_mozo INT NOT NULL,
    estado ENUM('Abierta', 'En curso', 'Cerrada') DEFAULT 'Abierta',
    estado_pago ENUM('Pendiente', 'Pagado', 'Parcial') DEFAULT 'Pendiente',
    apertura_en TIMESTAMP NOT NULL,
    cierre_en TIMESTAMP NULL,
    total_pagado DECIMAL(10, 2) DEFAULT 0,
    propina DECIMAL(10, 2) DEFAULT 0,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cliente) REFERENCES clientes(id) ON DELETE RESTRICT,
    FOREIGN KEY (id_reserva) REFERENCES reservas(id) ON DELETE SET NULL,
    FOREIGN KEY (id_mesa) REFERENCES mesas(id) ON DELETE RESTRICT,
    FOREIGN KEY (id_mozo) REFERENCES usuarios(id) ON DELETE RESTRICT
);

-- 8. PEDIDOS
CREATE TABLE IF NOT EXISTS pedidos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    id_atencion INT NOT NULL,
    creado_por INT NOT NULL,
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    estado ENUM('Pendiente', 'Enviado', 'En preparacion', 'Listo', 'Servido') DEFAULT 'Pendiente',
    notas TEXT,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id_atencion) REFERENCES atenciones(id) ON DELETE RESTRICT,
    FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE RESTRICT
);

-- 9. DETALLE DE PEDIDOS
CREATE TABLE IF NOT EXISTS detalle_pedidos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    id_pedido INT NOT NULL,
    id_plato INT,
    id_producto INT,
    cantidad INT NOT NULL,
    precio_unit DECIMAL(10, 2) NOT NULL,
    descuento DECIMAL(10, 2) DEFAULT 0,
    tipo_item ENUM('plato', 'producto', 'otro') DEFAULT 'plato',
    estado_cocina ENUM('pendiente', 'en preparacion', 'listo', 'despachado') DEFAULT 'pendiente',
    observaciones TEXT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id_pedido) REFERENCES pedidos(id) ON DELETE CASCADE,
    FOREIGN KEY (id_plato) REFERENCES platos(id) ON DELETE RESTRICT,
    FOREIGN KEY (id_producto) REFERENCES productos(id) ON DELETE RESTRICT,
    CHECK ((tipo_item = 'plato' AND id_plato IS NOT NULL) OR (tipo_item = 'producto' AND id_producto IS NOT NULL) OR tipo_item = 'otro')
);

-- 10. PRODUCTOS (Bebidas, insumos, etc.)
CREATE TABLE IF NOT EXISTS productos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(150) NOT NULL UNIQUE,
    descripcion TEXT,
    precio DECIMAL(10, 2) NOT NULL,
    stock INT NOT NULL DEFAULT 0,
    stock_minimo INT DEFAULT 10,
    unidad ENUM('unidad', 'litro', 'kg', 'gramo') DEFAULT 'unidad',
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 11. COMPROBANTES/FACTURAS
CREATE TABLE IF NOT EXISTS comprobantes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    id_atencion INT NOT NULL,
    numero_comprobante VARCHAR(50) UNIQUE NOT NULL,
    tipo_comprobante ENUM('Boleta', 'Factura', 'Ticket') DEFAULT 'Boleta',
    monto_subtotal DECIMAL(10, 2) NOT NULL,
    monto_igv DECIMAL(10, 2) DEFAULT 0,
    monto_descuento DECIMAL(10, 2) DEFAULT 0,
    monto_total DECIMAL(10, 2) NOT NULL,
    metodo_pago ENUM('Efectivo', 'Tarjeta', 'Transferencia', 'Mixto') DEFAULT 'Efectivo',
    estado ENUM('Generado', 'Emitido', 'Anulado') DEFAULT 'Generado',
    emitido_por INT NOT NULL,
    fecha_emision TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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
-- DATOS DE PRUEBA (SEEDS)
-- =====================================================================

-- Insertar Categorías
INSERT INTO categorias (nombre, orden, activo) VALUES
('Entradas', 1, TRUE),
('Fondos', 2, TRUE),
('Bebidas', 3, TRUE),
('Postres', 4, FALSE);

-- Insertar Platos
INSERT INTO platos (id_categoria, nombre, descripcion, precio, disponible, activo) VALUES
(1, 'Causa limeña', 'Papa amarilla, pollo y palta.', 18.50, TRUE, TRUE),
(2, 'Lomo saltado', 'Clasico con papas crocantes.', 32.00, TRUE, TRUE),
(2, 'Aji de gallina', 'Guiso cremoso tradicional.', 28.00, FALSE, TRUE),
(3, 'Chicha morada', 'Bebida de maiz morado.', 9.50, TRUE, TRUE);

-- Insertar Clientes
INSERT INTO clientes (nombres, apellidos, documento, telefono, email, activo) VALUES
('Lucia', 'Fernandez', '71234567', '987111222', 'lucia@demo.com', TRUE),
('Carlos', 'Ramos', '70333444', '987333555', 'carlos@demo.com', TRUE),
('Patricia', 'Gomez', '72888999', '982000111', 'patty@demo.com', FALSE);

-- Insertar Usuarios
INSERT INTO usuarios (nombres, apellidos, username, password, rol, activo) VALUES
('Marcos', 'Salazar', 'marcos', 'admin123', 'Administrador', TRUE),
('Elena', 'Torres', 'elena', 'recep123', 'Recepcion', TRUE),
('Dario', 'Lopez', 'dario', 'mozo123', 'Mozo', TRUE),
('Sofia', 'Marin', 'sofia', 'cajero123', 'Cajero', FALSE);

-- Insertar Mesas
INSERT INTO mesas (codigo, capacidad, ubicacion, activa, estado) VALUES
('M-01', 4, 'Ventana', TRUE, 'Disponible'),
('M-02', 2, 'Salon central', TRUE, 'Disponible'),
('T-01', 6, 'Terraza', TRUE, 'Disponible'),
('M-03', 8, 'VIP', FALSE, 'En mantenimiento');

-- Insertar Reservas
INSERT INTO reservas (tipo, id_cliente, nombre_contacto, id_mesa, fecha_hora, cantidad_personas, estado, confirmada) VALUES
('Salon', 1, 'Lucia Fernandez', 1, '2026-04-09 20:00:00', 4, 'Confirmada', TRUE),
('Terraza', 2, 'Carlos Ramos', 3, '2026-04-10 13:00:00', 3, 'Pendiente', FALSE);

-- Insertar Atenciones
INSERT INTO atenciones (id_cliente, id_reserva, id_mesa, id_mozo, estado, estado_pago, apertura_en, cierre_en) VALUES
(1, 1, 1, 3, 'En curso', 'Pendiente', '2026-04-09 20:05:00', NULL),
(2, NULL, 2, 3, 'Cerrada', 'Pagado', '2026-04-09 13:10:00', '2026-04-09 14:30:00');

-- Insertar Pedidos
INSERT INTO pedidos (id_atencion, creado_por, creado_en, estado, notas) VALUES
(1, 3, '2026-04-09 20:10:00', 'Pendiente', 'Sin cebolla en uno.'),
(2, 3, '2026-04-09 13:15:00', 'Servido', '');

-- Insertar Detalle de Pedidos
INSERT INTO detalle_pedidos (id_pedido, id_plato, cantidad, precio_unit, descuento, tipo_item, estado_cocina) VALUES
(1, 2, 2, 32.00, 0, 'plato', 'pendiente'),
(1, 4, 4, 9.50, 2, 'plato', 'pendiente'),
(2, 1, 1, 18.50, 0, 'plato', 'pendiente');

-- Insertar Productos
INSERT INTO productos (nombre, descripcion, precio, stock, stock_minimo, unidad, activo) VALUES
('Inca Kola 500ml', 'Gaseosa nacional 500ml', 5.00, 50, 20, 'unidad', TRUE),
('Coca Cola 500ml', 'Gaseosa importada 500ml', 5.50, 40, 20, 'unidad', TRUE),
('Cerveza Pilsen', 'Cerveza lata 355ml', 9.00, 30, 15, 'unidad', TRUE),
('Agua San Luis', 'Agua mineral 625ml', 3.50, 60, 30, 'unidad', TRUE),
('Jugo de naranja', 'Jugo natural 300ml', 7.00, 20, 10, 'unidad', TRUE);

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

-- =====================================================================
-- PROCEDIMIENTOS ALMACENADOS
-- =====================================================================

-- Procedimiento: Crear nueva atención
DELIMITER //
CREATE PROCEDURE sp_crear_atencion(
    IN p_id_cliente INT,
    IN p_id_mesa INT,
    IN p_id_mozo INT,
    OUT p_id_atencion INT
)
BEGIN
    INSERT INTO atenciones (id_cliente, id_mesa, id_mozo, apertura_en)
    VALUES (p_id_cliente, p_id_mesa, p_id_mozo, NOW());
    
    SET p_id_atencion = LAST_INSERT_ID();
    
    UPDATE mesas SET estado = 'Ocupada' WHERE id = p_id_mesa;
END //
DELIMITER ;

-- Procedimiento: Cerrar atención
DELIMITER //
CREATE PROCEDURE sp_cerrar_atencion(
    IN p_id_atencion INT
)
BEGIN
    UPDATE atenciones 
    SET estado = 'Cerrada', 
        cierre_en = NOW(),
        estado_pago = 'Pendiente'
    WHERE id = p_id_atencion;
    
    UPDATE mesas 
    SET estado = 'Disponible' 
    WHERE id = (SELECT id_mesa FROM atenciones WHERE id = p_id_atencion);
END //
DELIMITER ;

-- Procedimiento: Calcular total de pedido
DELIMITER //
CREATE FUNCTION fn_total_pedido(p_id_pedido INT) 
RETURNS DECIMAL(10,2)
READS SQL DATA
BEGIN
    DECLARE total DECIMAL(10,2);
    SELECT COALESCE(SUM(cantidad * precio_unit - descuento), 0)
    INTO total
    FROM detalle_pedidos
    WHERE id_pedido = p_id_pedido;
    RETURN total;
END //
DELIMITER ;

-- =====================================================================
-- FIN DEL SCRIPT
-- =====================================================================
