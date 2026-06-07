# Diagrama de Entidad-Relación - Base de Datos RestaControl

## Estructura Visual de Tablas

```
┌─────────────────────┐
│    CATEGORIAS       │
├─────────────────────┤
│ id (PK)             │
│ nombre              │
│ orden               │
│ activo              │
│ timestamps          │
└──────────┬──────────┘
           │ 1:N
           │
           ▼
┌─────────────────────┐
│     PLATOS          │
├─────────────────────┤
│ id (PK)             │
│ id_categoria (FK)   │
│ nombre              │
│ descripcion         │
│ precio              │
│ disponible          │
│ activo              │
│ timestamps          │
└──────────┬──────────┘
           │ 1:N
           │
           ▼
┌──────────────────────┐       ┌──────────────────┐
│ DETALLE_PEDIDOS      │       │    PRODUCTOS     │
├──────────────────────┤       ├──────────────────┤
│ id (PK)              │       │ id (PK)          │
│ id_pedido (FK)       │       │ nombre           │
│ id_plato (FK)────────┼──────→│ descripcion      │
│ id_producto (FK)─────┼──────→│ precio           │
│ cantidad             │       │ stock            │
│ precio_unit          │       │ unidad           │
│ descuento            │       │ activo           │
│ tipo_item *          │       │ timestamps       │
│ estado_cocina        │       └──────────────────┘
│ observaciones        │
│ timestamps           │
└──────┬───────────────┘
       │ * Solo debe tener una FK activa
       │   (id_plato O id_producto)
       │ N:1
       │
       ▼
┌──────────────────────┐
│     PEDIDOS          │
├──────────────────────┤
│ id (PK)              │
│ id_atencion (FK)     │
│ creado_por (FK)──────┐
│ estado               │
│ notas                │
│ timestamps           │
└──────┬───────────────┘
       │ N:1
       │
       ▼
┌────────────────────────┐
│    ATENCIONES          │
├────────────────────────┤
│ id (PK)                │
│ id_cliente (FK)────┐   │
│ id_reserva (FK)    │   │
│ id_mesa (FK)───┐   │   │
│ id_mozo (FK)   │   │   │
│ estado         │   │   │
│ estado_pago    │   │   │
│ apertura_en    │   │   │
│ cierre_en      │   │   │
│ timestamps     │   │   │
└─────┬──────────┘   │   │
      │ 1:N          │   │
      │              │   │
      ▼              │   │
┌────────────────────┘   │   ┌──────────────────────┐
│                        │   │   COMPROBANTES       │
│  ┌──────────────────┐  │   ├──────────────────────┤
│  │   CLIENTES       │  └──→│ id (PK)              │
│  ├──────────────────┤      │ id_atencion (FK)     │
│  │ id (PK)          │      │ numero_comprobante   │
│  │ nombres          │      │ tipo_comprobante     │
│  │ apellidos        │      │ montos (varios)      │
│  │ documento        │      │ metodo_pago          │
│  │ telefono         │      │ estado               │
│  │ email            │      │ emitido_por (FK)─┐   │
│  │ direccion        │      │ timestamps       │   │
│  │ activo           │      └──────────────────┘   │
│  │ timestamps       │                             │
│  └──────────────────┘     ┌──────────────────────┐│
│                           │     USUARIOS         ││
│  ┌──────────────────┐     ├──────────────────────┤│
│  │   RESERVAS       │     │ id (PK)              ││
│  ├──────────────────┤     │ nombres              ││
│  │ id (PK)          │     │ apellidos            ││
│  │ tipo             │     │ username             ││
│  │ id_cliente (FK)──┼────→│ password             ││
│  │ nombre_contacto  │     │ rol (enum)           ││
│  │ id_mesa (FK)─┐   │     │ activo               ││
│  │ fecha_hora   │   │     │ timestamps           ││
│  │ cantidad_     │   │     └──────────────────────┘│
│  │ personas     │   │                             │
│  │ estado       │   │     ┌──────────────────────┐│
│  │ confirmada   │   │     │      MESAS           ││
│  │ timestamps   │   │     ├──────────────────────┤│
│  └──────────────┘   │     │ id (PK)              ││
│                     │     │ codigo               ││
│                     └────→│ capacidad            ││
│                           │ ubicacion            ││
│                           │ estado (enum)        ││
│                           │ activa               ││
│                           │ timestamps           ││
│                           └──────────────────────┘│
│                                                   │
└───────────────────────────────────────────────────┘
```

## Relaciones Principales

### 1. **CATEGORIAS → PLATOS**
- Una categoría tiene muchos platos
- Relación 1:N
- Integridad: ON DELETE RESTRICT

### 2. **PLATOS → DETALLE_PEDIDOS**
- Un plato aparece en muchos detalles de pedidos
- Relación 1:N (opcional: solo si `tipo_item = 'plato'`)
- Integridad: ON DELETE RESTRICT

### 3. **PRODUCTOS → DETALLE_PEDIDOS**
- Un producto aparece en muchos detalles de pedidos
- Relación 1:N (opcional: solo si `tipo_item = 'producto'`)
- Integridad: ON DELETE RESTRICT
- **Validación**: `CHECK` constraint garantiza que solo una FK está activa

### 4. **PEDIDOS → DETALLE_PEDIDOS**
- Un pedido tiene muchos detalles
- Relación 1:N
- Integridad: ON DELETE CASCADE (elimina detalles si se elimina pedido)

### 4. **PEDIDOS → DETALLE_PEDIDOS**
- Un pedido tiene muchos detalles
- Relación 1:N
- Integridad: ON DELETE CASCADE (elimina detalles si se elimina pedido)

### 5. **ATENCIONES → PEDIDOS**
- Una atención tiene muchos pedidos
- Relación 1:N
- Integridad: ON DELETE RESTRICT

### 6. **CLIENTES → ATENCIONES**
- Un cliente tiene muchas atenciones
- Relación 1:N
- Integridad: ON DELETE RESTRICT

### 7. **CLIENTES → RESERVAS**
- Un cliente puede hacer muchas reservas
- Relación 1:N
- Integridad: ON DELETE RESTRICT

### 8. **MESAS → ATENCIONES**
- Una mesa puede tener muchas atenciones
- Relación 1:N
- Integridad: ON DELETE RESTRICT

### 9. **MESAS → RESERVAS**
- Una mesa puede tener muchas reservas
- Relación 1:N
- Integridad: ON DELETE SET NULL (permite eliminar mesa)

### 10. **USUARIOS (MOZO) → ATENCIONES**
- Un mozo atiende muchas mesas
- Relación 1:N
- Integridad: ON DELETE RESTRICT

### 11. **USUARIOS (CREADOR) → PEDIDOS**
- Un usuario crea muchos pedidos
- Relación 1:N
- Integridad: ON DELETE RESTRICT

### 12. **ATENCIONES → COMPROBANTES**
- Una atención genera muchos comprobantes
- Relación 1:N (aunque generalmente 1:1)
- Integridad: ON DELETE RESTRICT

### 13. **USUARIOS (CAJERO) → COMPROBANTES**
- Un cajero emite muchos comprobantes
- Relación 1:N
- Integridad: ON DELETE RESTRICT

## Flujo de Datos en Operaciones Típicas

### Flujo 1: Proceso de Atención Completa

```
1. CLIENTE llega sin reserva
   ↓
2. Se crea ATENCIÓN (abre mesa)
   ↓
3. Se crea PEDIDO
   ↓
4. Se agregan DETALLE_PEDIDOS (platos Y/O productos)
   ├─→ Detalle con id_plato (platos del menú)
   │   ↓ estado_cocina: pendiente → en preparacion → listo
   │
   └─→ Detalle con id_producto (bebidas/insumos)
       ↓ estado_cocina: listo (ya disponibles)
   ↓
5. Se cocinan los platos (se actualiza estado_cocina)
   ↓
6. Se SIRVEN todos los items (platos + productos)
   ↓
7. Se cierra ATENCIÓN (libera mesa)
   ↓
8. Se genera COMPROBANTE (suma platos + productos)
   ↓
9. Se registra PAGO
```

### Flujo 2: Proceso de Reserva

```
1. CLIENTE hace RESERVA
   ↓
2. Se asigna MESA
   ↓
3. Se confirma RESERVA
   ↓
4. Llega el CLIENTE a la hora
   ↓
5. Se crea ATENCIÓN (vinculada a RESERVA)
   ↓
6. ... (igual al Flujo 1 desde paso 3)
```

## Consultas de Ejemplo Optimizadas

### Obtener pedido completo (platos + productos)
```sql
SELECT 
    p.id AS pedido_id,
    dp.tipo_item,
    COALESCE(pl.nombre, pr.nombre) AS item,
    COALESCE(pl.id, pr.id) AS item_id,
    dp.cantidad,
    dp.precio_unit,
    (dp.cantidad * dp.precio_unit - dp.descuento) AS subtotal
FROM pedidos p
JOIN detalle_pedidos dp ON p.id = dp.id_pedido
LEFT JOIN platos pl ON dp.id_plato = pl.id
LEFT JOIN productos pr ON dp.id_producto = pr.id
WHERE p.id = 1;
```

**Resultado ejemplo:**
```
pedido_id | tipo_item | item             | item_id | cantidad | precio_unit | subtotal
----------|-----------|------------------|---------|----------|-------------|----------
1         | plato     | Lomo saltado     | 2       | 1        | 32.00       | 32.00
1         | producto  | Coca Cola 500ml  | 2       | 2        | 5.50        | 11.00
```

### Obtener mesa con atención actual
```sql
SELECT m.*, a.id AS atencion_id
FROM mesas m
LEFT JOIN atenciones a ON m.id = a.id_mesa AND a.estado IN ('Abierta', 'En curso')
WHERE m.id = 1;
```

### Resumen de pedidos de una atención
```sql
SELECT p.id, p.creado_en, COUNT(dp.id) AS cantidad_items, 
       SUM(dp.cantidad * dp.precio_unit - dp.descuento) AS total
FROM pedidos p
LEFT JOIN detalle_pedidos dp ON p.id = dp.id_pedido
WHERE p.id_atencion = 1
GROUP BY p.id, p.creado_en;
```

### Mesas disponibles en horario
```sql
SELECT m.* 
FROM mesas m
WHERE m.estado = 'Disponible' 
  AND m.activa = true
  AND m.capacidad >= 4
ORDER BY m.ubicacion;
```

### Ventas por método de pago
```sql
SELECT c.metodo_pago, COUNT(*) AS cantidad, SUM(c.monto_total) AS total
FROM comprobantes c
WHERE DATE(c.fecha_emision) = CURRENT_DATE
GROUP BY c.metodo_pago;
```

## Integridad Referencial

- **ON DELETE RESTRICT**: Evita eliminar registros padre que tiene hijos
- **ON DELETE CASCADE**: Elimina automáticamente registros relacionados
- **ON DELETE SET NULL**: Permite eliminar pero deja NULL en referencias

## Integridad Referencial

- **ON DELETE RESTRICT**: Evita eliminar registros padre que tiene hijos
- **ON DELETE CASCADE**: Elimina automáticamente registros relacionados
- **ON DELETE SET NULL**: Permite eliminar pero deja NULL en referencias

## Triggers Automáticos

Cada tabla tiene un trigger que actualiza `fecha_actualizacion` automáticamente.

## Ventajas del Diseño de DETALLE_PEDIDOS

✅ **Flexible**: Soporta tanto platos como productos en el mismo pedido  
✅ **Validado**: CHECK constraint garantiza integridad de datos  
✅ **Escalable**: Fácil agregar nuevos tipos de items ('otro')  
✅ **Consistente**: `tipo_item` siempre indica cuál FK usar  
✅ **Seguro**: Imposible tener datos inconsistentes (ambas FK NULL o ambas NOT NULL)  
✅ **Eficiente**: Índices en id_plato, id_producto y id_pedido

---

**Generado**: 2026-05-13
**Tipo**: Diagrama ER (Entity-Relationship)
**Actualización**: Relación de Productos en Pedidos
