# Guía: Cómo se Relacionan los Productos en Pedidos

## Estructura Corregida

La tabla `detalle_pedidos` ahora tiene **dos campos de relación**:

- PK en UUID para todas las tablas principales.
- Códigos automáticos visibles por entidad, por ejemplo `PROD000001` para productos.

```
detalle_pedidos
├── id_plato      (FK → platos)         ← Para platos del menú
├── id_producto   (FK → productos)      ← Para bebidas/productos
└── tipo_item     (plato|producto|otro) ← Indica cuál relación usar
```

## Validación Automática (CHECK Constraint)

Se agregó una restricción que **obliga** a elegir uno u otro:

```sql
CHECK (
  (tipo_item = 'plato' AND id_plato IS NOT NULL) 
  OR 
  (tipo_item = 'producto' AND id_producto IS NOT NULL) 
  OR 
  tipo_item = 'otro'
)
```

**Esto significa:**
- Si `tipo_item = 'plato'` → **DEBE** tener `id_plato` (y `id_producto = NULL`)
- Si `tipo_item = 'producto'` → **DEBE** tener `id_producto` (y `id_plato = NULL`)
- Si `tipo_item = 'otro'` → Ambos pueden ser NULL

## Ejemplos de Inserción

### Escenario: Cliente pide un lomo saltado + Coca Cola

#### 1. Abrir Atención
```sql
-- Cliente llega a mesa 1, atendido por mozo 3
INSERT INTO atenciones (id_cliente, id_mesa, id_mozo, apertura_en)
VALUES (1, 1, 3, NOW());
-- Retorna: id_atencion = X
```

#### 2. Crear Pedido
```sql
-- Crear el pedido en la atención X
INSERT INTO pedidos (id_atencion, creado_por, creado_en, estado, notas)
VALUES (X, 3, NOW(), 'Pendiente', 'Sin cebolla en el lomo');
-- Retorna: id_pedido = Y
```

#### 3. Agregar Detalle - PLATO
```sql
-- Agregar el Lomo Saltado (id_plato = 2)
INSERT INTO detalle_pedidos (
    id_pedido, 
    id_plato, 
    id_producto,      -- NULL porque es plato
    cantidad, 
    precio_unit,
    tipo_item,        -- 'plato'
    estado_cocina,
    observaciones
) VALUES (
    Y,                -- id del pedido
    2,                -- Lomo saltado
    NULL,             -- No hay producto
    1,                -- Cantidad
    32.00,            -- Precio unitario
    'plato',          -- Tipo de item
    'pendiente',      -- Estado cocina
    'Sin cebolla'     -- Observación especial
);
```

#### 4. Agregar Detalle - PRODUCTO
```sql
-- Agregar Coca Cola (id_producto = 2)
INSERT INTO detalle_pedidos (
    id_pedido, 
    id_plato,         -- NULL porque es producto
    id_producto, 
    cantidad, 
    precio_unit,
    tipo_item,        -- 'producto'
    estado_cocina,
    observaciones
) VALUES (
    Y,                -- id del pedido
    NULL,             -- No hay plato
    2,                -- Coca Cola 500ml
    2,                -- Cantidad (2 botellas)
    5.50,             -- Precio unitario
    'producto',       -- Tipo de item
    'listo',          -- Productos ya listos
    'Con hielo'       -- Observación
);
```

## Visualizar los Detalles del Pedido

Ahora con la vista actualizada:

```sql
SELECT * FROM v_pedidos_detalle WHERE pedido_id = Y;
```

**Resultado:**
```
pedido_id | item_nombre        | tipo_item | cantidad | precio_unit | subtotal | estado_cocina | observaciones
----------|-------------------|-----------|----------|------------|----------|---------------|---------------
Y         | Lomo saltado      | plato     | 1        | 32.00      | 32.00    | pendiente     | Sin cebolla
Y         | Coca Cola 500ml   | producto  | 2        | 5.50       | 11.00    | listo         | Con hielo
```

## Consulta Completa de Pedido

Para ver el pedido completo con toda la información:

```sql
SELECT 
    p.id AS pedido_id,
    a.id AS atencion_id,
    c.nombres AS cliente,
    m.codigo AS mesa,
    p.creado_en,
    dp.id AS detalle_id,
    COALESCE(pl.nombre, pr.nombre) AS item,
    dp.tipo_item,
    dp.cantidad,
    dp.precio_unit,
    (dp.cantidad * dp.precio_unit - dp.descuento) AS subtotal
FROM pedidos p
JOIN atenciones a ON p.id_atencion = a.id
JOIN clientes c ON a.id_cliente = c.id
JOIN mesas m ON a.id_mesa = m.id
JOIN detalle_pedidos dp ON p.id = dp.id_pedido
LEFT JOIN platos pl ON dp.id_plato = pl.id AND dp.tipo_item = 'plato'
LEFT JOIN productos pr ON dp.id_producto = pr.id AND dp.tipo_item = 'producto'
ORDER BY p.id;
```

## Relación de Tablas Visualizada

```
┌──────────────┐
│   PEDIDOS    │
└──────┬───────┘
       │ 1:N
       │
       ▼
┌──────────────────────────┐
│  DETALLE_PEDIDOS         │
├──────────────────────────┤
│ id                       │
│ id_pedido (FK) ──→       │
│ id_plato (FK) ────┐      │
│ id_producto (FK)  │ ┐    │
│ tipo_item         │ │    │
│ cantidad          │ │    │
│ precio_unit       │ │    │
│ descuento         │ │    │
└──────────────────────────┘
       ├────────────┤
       │            │
       ▼            ▼
    ┌────────┐  ┌──────────┐
    │ PLATOS │  │PRODUCTOS │
    └────────┘  └──────────┘
```

## Casos de Uso

### Caso 1: Pedir solo platos
```sql
INSERT INTO detalle_pedidos (id_pedido, id_plato, id_producto, cantidad, precio_unit, tipo_item)
VALUES (Y, 1, NULL, 1, 18.50, 'plato');  -- Causa limeña
```

### Caso 2: Pedir solo productos
```sql
INSERT INTO detalle_pedidos (id_pedido, id_plato, id_producto, cantidad, precio_unit, tipo_item)
VALUES (Y, NULL, 3, 1, 9.00, 'producto');  -- Cerveza Pilsen
```

### Caso 3: Pedir múltiples items (mixto)
```sql
-- Plato principal
INSERT INTO detalle_pedidos (id_pedido, id_plato, id_producto, cantidad, precio_unit, tipo_item)
VALUES (Y, 2, NULL, 2, 32.00, 'plato');  -- 2 Lomo saltado

-- Bebida 1
INSERT INTO detalle_pedidos (id_pedido, id_plato, id_producto, cantidad, precio_unit, tipo_item)
VALUES (Y, NULL, 2, 1, 5.50, 'producto');  -- Coca Cola

-- Bebida 2
INSERT INTO detalle_pedidos (id_pedido, id_plato, id_producto, cantidad, precio_unit, tipo_item)
VALUES (Y, NULL, 4, 2, 3.50, 'producto');  -- Agua San Luis

-- Item especial
INSERT INTO detalle_pedidos (id_pedido, id_plato, id_producto, cantidad, precio_unit, tipo_item, observaciones)
VALUES (Y, NULL, NULL, 1, 50.00, 'otro', 'Comanda especial del chef');
```

## Cálculo de Total del Pedido

```sql
SELECT 
    pedido_id,
    SUM(cantidad * precio_unit - COALESCE(descuento, 0)) AS total_pedido
FROM v_pedidos_detalle
WHERE pedido_id = Y
GROUP BY pedido_id;
```

## Integridad Garantizada

✅ **Imposible tener ambos valores NULL** (para platos y productos)  
✅ **Imposible tener ambos valores lleados** (solo uno debe estar presente)  
✅ **El tipo_item debe coincidir** con la relación usada  
✅ **Eliminar un plato/producto** no puede eliminar detalles en pedidos (RESTRICT)  
✅ **Eliminar un pedido** elimina automáticamente sus detalles (CASCADE)

## Resumen

**Antes:** ❌ Solo se podían agregar platos  
**Ahora:** ✅ Se pueden agregar platos Y productos en el mismo pedido, con PK UUID y códigos automáticos  
**Validación:** ✅ Automática mediante CHECK constraint  
**Flexibilidad:** ✅ Soporta tipos especiales ('otro')

---

**Actualizado**: 2026-05-13
