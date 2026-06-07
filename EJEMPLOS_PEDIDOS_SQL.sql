-- =====================================================================
-- EJEMPLOS DE PEDIDOS CON PRODUCTOS
-- Scripts SQL listos para ejecutar
-- =====================================================================

-- NOTA: Estos ejemplos asumen que la base de datos está poblada con
-- los datos iniciales del script db_restaurante_postgresql.sql

-- =====================================================================
-- EJEMPLO 1: Cliente pide Lomo Saltado + Coca Cola
-- =====================================================================

-- Paso 1: Abrir una atención (cliente llega a mesa 1, mozo 3)
INSERT INTO atenciones (id_cliente, id_mesa, id_mozo, apertura_en)
VALUES (1, 1, 3, NOW())
RETURNING id;
-- Guardar el resultado como: atencion_id = X

-- Paso 2: Crear un pedido
INSERT INTO pedidos (id_atencion, creado_por, creado_en, estado, notas)
VALUES (X, 3, NOW(), 'Pendiente', 'Sin cebolla en el lomo')
RETURNING id;
-- Guardar el resultado como: pedido_id = Y

-- Paso 3: Agregar plato (Lomo saltado - id=2, precio=32.00)
INSERT INTO detalle_pedidos (
    id_pedido, id_plato, id_producto, cantidad, precio_unit, 
    tipo_item, estado_cocina, observaciones
)
VALUES (Y, 2, NULL, 1, 32.00, 'plato', 'pendiente', 'Sin cebolla');

-- Paso 4: Agregar producto (Coca Cola - id=2, precio=5.50)
INSERT INTO detalle_pedidos (
    id_pedido, id_plato, id_producto, cantidad, precio_unit, 
    tipo_item, estado_cocina, observaciones
)
VALUES (Y, NULL, 2, 1, 5.50, 'producto', 'listo', 'Con hielo');

-- Paso 5: Ver el pedido completo
SELECT * FROM v_pedidos_detalle WHERE pedido_id = Y;

-- Paso 6: Calcular total
SELECT fn_total_pedido(Y);

-- =====================================================================
-- EJEMPLO 2: Cliente pide múltiples items (mixto completo)
-- =====================================================================

-- Cliente nueva atención (cliente 2, mesa 2, mozo 3)
INSERT INTO atenciones (id_cliente, id_mesa, id_mozo, apertura_en)
VALUES (2, 2, 3, NOW())
RETURNING id;
-- Guardar como: atencion_id = Z

INSERT INTO pedidos (id_atencion, creado_por, creado_en, estado)
VALUES (Z, 3, NOW(), 'Pendiente')
RETURNING id;
-- Guardar como: pedido_id = W

-- 2 Lomos saltados (plato id=2)
INSERT INTO detalle_pedidos (id_pedido, id_plato, id_producto, cantidad, precio_unit, tipo_item, estado_cocina)
VALUES (W, 2, NULL, 2, 32.00, 'plato', 'pendiente');

-- 1 Causa limeña (plato id=1)
INSERT INTO detalle_pedidos (id_pedido, id_plato, id_producto, cantidad, precio_unit, tipo_item, estado_cocina)
VALUES (W, 1, NULL, 1, 18.50, 'plato', 'pendiente');

-- 3 Coca Cola (producto id=2)
INSERT INTO detalle_pedidos (id_pedido, id_plato, id_producto, cantidad, precio_unit, tipo_item, estado_cocina)
VALUES (W, NULL, 2, 3, 5.50, 'producto', 'listo');

-- 2 Agua San Luis (producto id=4)
INSERT INTO detalle_pedidos (id_pedido, id_plato, id_producto, cantidad, precio_unit, tipo_item, estado_cocina)
VALUES (W, NULL, 4, 2, 3.50, 'producto', 'listo');

-- Ver todos los items
SELECT * FROM v_pedidos_detalle WHERE pedido_id = W;

-- Total: (2*32 + 1*18.50) + (3*5.50 + 2*3.50) = 82.50 + 23.50 = 106.00
SELECT 'Total del pedido:' AS item, fn_total_pedido(W) AS monto;

-- =====================================================================
-- EJEMPLO 3: Solo productos (cliente solo pide bebidas/snacks)
-- =====================================================================

INSERT INTO atenciones (id_cliente, id_mesa, id_mozo, apertura_en)
VALUES (1, 3, 3, NOW())
RETURNING id AS atencion_id;

INSERT INTO pedidos (id_atencion, creado_por, creado_en, estado, notas)
VALUES (3, 3, NOW(), 'Pendiente', 'Solo bebidas')
RETURNING id AS pedido_id;

-- Cerveza Pilsen (id=3)
INSERT INTO detalle_pedidos (id_pedido, id_plato, id_producto, cantidad, precio_unit, tipo_item)
VALUES (3, NULL, 3, 2, 9.00, 'producto');

-- Inca Kola (id=1)
INSERT INTO detalle_pedidos (id_pedido, id_plato, id_producto, cantidad, precio_unit, tipo_item)
VALUES (3, NULL, 1, 1, 5.00, 'producto');

-- Jugo de naranja (id=5)
INSERT INTO detalle_pedidos (id_pedido, id_plato, id_producto, cantidad, precio_unit, tipo_item)
VALUES (3, NULL, 5, 3, 7.00, 'producto');

-- Ver pedido
SELECT * FROM v_pedidos_detalle WHERE pedido_id = 3;

-- Total: (2*9) + (1*5) + (3*7) = 18 + 5 + 21 = 44.00
SELECT fn_total_pedido(3);

-- =====================================================================
-- CONSULTAS ÚTILES DE AUDITORÍA
-- =====================================================================

-- Ver todos los pedidos con sus detalles
SELECT * FROM v_pedidos_detalle ORDER BY pedido_id;

-- Ver qué están pediendo ahora (atenciones abiertas)
SELECT 
    a.id AS atencion_id,
    m.codigo AS mesa,
    c.nombres AS cliente,
    COUNT(dp.id) AS cantidad_items,
    SUM(dp.cantidad * dp.precio_unit - dp.descuento) AS total
FROM atenciones a
JOIN mesas m ON a.id_mesa = m.id
JOIN clientes c ON a.id_cliente = c.id
LEFT JOIN pedidos p ON a.id = p.id_atencion
LEFT JOIN detalle_pedidos dp ON p.id = dp.id_pedido
WHERE a.estado IN ('Abierta', 'En curso')
GROUP BY a.id, m.codigo, c.nombres
ORDER BY a.apertura_en DESC;

-- Ver productos más vendidos
SELECT 
    pr.nombre,
    SUM(dp.cantidad) AS cantidad_vendida,
    SUM(dp.cantidad * dp.precio_unit) AS monto_total
FROM detalle_pedidos dp
JOIN productos pr ON dp.id_producto = pr.id
WHERE dp.tipo_item = 'producto'
GROUP BY pr.nombre
ORDER BY cantidad_vendida DESC;

-- Ver platos más ordenados
SELECT 
    pl.nombre,
    SUM(dp.cantidad) AS cantidad_vendida,
    SUM(dp.cantidad * dp.precio_unit) AS monto_total
FROM detalle_pedidos dp
JOIN platos pl ON dp.id_plato = pl.id
WHERE dp.tipo_item = 'plato'
GROUP BY pl.nombre
ORDER BY cantidad_vendida DESC;

-- Ver total de ventas (platos + productos) por día
SELECT 
    DATE(p.creado_en) AS fecha,
    COUNT(DISTINCT p.id) AS total_pedidos,
    COUNT(DISTINCT a.id) AS total_atenciones,
    SUM(dp.cantidad * dp.precio_unit - dp.descuento) AS monto_total
FROM detalle_pedidos dp
JOIN pedidos p ON dp.id_pedido = p.id
JOIN atenciones a ON p.id_atencion = a.id
WHERE a.estado = 'Cerrada'
GROUP BY DATE(p.creado_en)
ORDER BY fecha DESC;

-- Ver estado de items en cocina
SELECT 
    COALESCE(pl.nombre, pr.nombre) AS item,
    dp.tipo_item,
    dp.estado_cocina,
    COUNT(*) AS cantidad
FROM detalle_pedidos dp
LEFT JOIN platos pl ON dp.id_plato = pl.id
LEFT JOIN productos pr ON dp.id_producto = pr.id
WHERE dp.estado_cocina != 'despachado'
GROUP BY item, dp.tipo_item, dp.estado_cocina
ORDER BY dp.estado_cocina;

-- =====================================================================
-- ACTUALIZACIONES (cambiar estado de items)
-- =====================================================================

-- Cambiar estado de plato a "en preparación"
UPDATE detalle_pedidos
SET estado_cocina = 'en preparacion'
WHERE id_pedido = Y AND tipo_item = 'plato';

-- Cambiar estado de producto a "listo"
UPDATE detalle_pedidos
SET estado_cocina = 'listo'
WHERE id_pedido = Y AND tipo_item = 'producto';

-- Cambiar todos a "despachado" (servidos)
UPDATE detalle_pedidos
SET estado_cocina = 'despachado'
WHERE id_pedido = Y;

-- =====================================================================
-- ELIMINACIONES (si es necesario)
-- =====================================================================

-- Eliminar un detalle específico (solo si es necesario)
DELETE FROM detalle_pedidos
WHERE id_pedido = Y AND id = (SELECT MAX(id) FROM detalle_pedidos WHERE id_pedido = Y);

-- Eliminar todo un pedido (elimina automáticamente los detalles)
DELETE FROM pedidos WHERE id = Y;

-- =====================================================================
-- FIN DE EJEMPLOS
-- =====================================================================
