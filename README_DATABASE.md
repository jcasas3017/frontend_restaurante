# Base de Datos PostgreSQL - RestaControl

## Descripción General

Se ha generado una base de datos completa para PostgreSQL llamada **`restaurante`** con todos los módulos (tablas) implementados en el proyecto RestaControl.

## Archivos Generados

1. **db_restaurante_postgresql.sql** - Script SQL completo para PostgreSQL (recomendado)
2. **db_restaurante.sql** - Script SQL para MySQL (alternativo)

## Instrucciones de Instalación

### Opción 1: Usando psql desde línea de comandos

```bash
# Conectarse a PostgreSQL como administrador
psql -U postgres

# Ejecutar el script
\i 'ruta/al/archivo/db_restaurante_postgresql.sql'
```

### Opción 2: Usando pgAdmin

1. Abre pgAdmin
2. Haz clic derecho en "Databases" → "Create" → "Database"
3. Ingresa el nombre: `restaurante`
4. Vuelve a hacer clic derecho en la BD → "Query Tool"
5. Abre el archivo SQL y ejecuta

### Opción 3: Copiar y pegar el contenido

1. Abre una terminal SQL en tu cliente PostgreSQL
2. Copia todo el contenido del archivo SQL
3. Pégalo en la terminal y ejecuta

## Estructura de Tablas

### 1. **categorias**
Categorías de platos disponibles
- Campos: id, nombre, orden, activo, timestamps
- Datos iniciales: Entradas, Fondos, Bebidas, Postres

### 2. **platos**
Menú del restaurante
- Campos: id, id_categoria, nombre, descripcion, precio, disponible, activo
- Datos iniciales: 4 platos (Causa, Lomo saltado, Ají de gallina, Chicha morada)

### 3. **clientes**
Registro de clientes
- Campos: id, nombres, apellidos, documento, telefono, email, direccion, activo
- Datos iniciales: 3 clientes

### 4. **usuarios**
Personal del restaurante
- Campos: id, nombres, apellidos, username, password, rol, activo
- Roles disponibles: Administrador, Recepcion, Mozo, Cajero, Cocinero
- Datos iniciales: 4 usuarios (Marcos, Elena, Dario, Sofia)

### 5. **mesas**
Mesas del restaurante
- Campos: id, codigo, capacidad, ubicacion, activa, estado
- Estados: Disponible, Ocupada, Reservada, En mantenimiento
- Datos iniciales: 4 mesas (M-01, M-02, T-01, M-03)

### 6. **reservas**
Reservas de mesas
- Campos: id, tipo, id_cliente, nombre_contacto, id_mesa, fecha_hora, cantidad_personas, estado, confirmada
- Tipos: Salon, Terraza, Privado
- Estados: Pendiente, Confirmada, Cancelada, Completada
- Datos iniciales: 2 reservas

### 7. **atenciones**
Servicios/Atenciones a clientes
- Campos: id, id_cliente, id_reserva, id_mesa, id_mozo, estado, estado_pago, apertura_en, cierre_en, total_pagado, propina
- Estados: Abierta, En curso, Cerrada
- Estados de pago: Pendiente, Pagado, Parcial
- Datos iniciales: 2 atenciones

### 8. **pedidos**
Pedidos durante una atención
- Campos: id, id_atencion, creado_por, creado_en, estado, notas
- Estados: Pendiente, Enviado, En preparacion, Listo, Servido
- Datos iniciales: 2 pedidos

### 9. **detalle_pedidos**
Detalles/Items de cada pedido (platos y/o productos)
- Campos: id UUID, id_pedido UUID, id_plato UUID, id_producto UUID, cantidad, precio_unit, descuento, tipo_item, estado_cocina, observaciones
- **Validación automática**: Si `tipo_item='plato'` requiere `id_plato` | Si `tipo_item='producto'` requiere `id_producto`
- Soporta tanto platos del menú como productos (bebidas, insumos) en el mismo pedido
- Estados de cocina: pendiente, en preparacion, listo, despachado
- Datos iniciales: 3 items

### 10. **productos**
Productos adicionales (bebidas, insumos)
- Campos: id UUID, codigo, nombre, descripcion, precio, stock, stock_minimo, unidad, activo
- Códigos automáticos: `PROD000001`, `PROD000002`, ...
- Unidades: unidad, litro, kg, gramo
- Datos iniciales: 5 productos (Inca Kola, Coca Cola, Cerveza, Agua, Jugo)

### 11. **comprobantes**
Comprobantes de venta (facturas, boletas)
- Campos: id UUID, id_atencion UUID, numero_comprobante, tipo_comprobante, montos, metodo_pago, estado, emitido_por UUID
- Código automático: `COM000001`, `COM000002`, ...
- Tipos: Boleta, Factura, Ticket
- Estados: Generado, Emitido, Anulado
- Métodos de pago: Efectivo, Tarjeta, Transferencia, Mixto

## Funcionalidades Especiales

### Vistas SQL

1. **v_atenciones_detalle** - Atenciones con datos del cliente, mesa y mozo
2. **v_pedidos_detalle** - Pedidos con detalles de platos y precios
3. **v_reservas_pendientes** - Reservas pendientes de confirmación
4. **v_atenciones_abiertas** - Atenciones activas con resumen de items

### Funciones Almacenadas

1. **fn_total_pedido(id_pedido)** - Calcula el total de un pedido
2. **fn_estado_mesa(id_mesa)** - Obtiene el estado de una mesa
3. **fn_total_ventas_rango(fecha_inicio, fecha_fin)** - Total de ventas en un rango de fechas

### Procedimientos Almacenados

1. **sp_crear_atencion(id_cliente, id_mesa, id_mozo)** - Abre una nueva atención
2. **sp_cerrar_atencion(id_atencion)** - Cierra una atención y libera la mesa
3. **sp_registrar_pago(id_atencion, monto, metodo)** - Registra un pago

### Triggers Automáticos

Todos las tablas actualizan automáticamente el campo `fecha_actualizacion` con cada modificación.

## Relaciones Entre Tablas

```
categorias
    ↓
    └─→ platos
            ↓
            └─→ detalle_pedidos ←─ pedidos ←─ atenciones ←─ clientes
                                       ↑         ↑         ↑
                                       └─ usuarios         └─ reservas
                                                                ↑
                                                                └─ mesas
```

## Consultas Útiles

### Ver todas las mesas disponibles
```sql
SELECT * FROM mesas WHERE estado = 'Disponible';
```

### Obtener atenciones abiertas
```sql
SELECT * FROM v_atenciones_abiertas;
```

### Consultar reservas pendientes
```sql
SELECT * FROM v_reservas_pendientes;
```

### Total de ventas del día
```sql
SELECT fn_total_ventas_rango(CURRENT_DATE::timestamp, (CURRENT_DATE + 1)::timestamp);
```

### Crear nueva atención
```sql
SELECT sp_crear_atencion(1, 1, 3);
```

### Listar pedidos con detalles
```sql
SELECT * FROM v_pedidos_detalle;
```

## Tipos de Datos Personalizados (ENUM)

PostgreSQL utiliza tipos ENUM para restricciones:

- **rol_enum**: Administrador, Recepcion, Mozo, Cajero, Cocinero
- **tipo_reserva_enum**: Salon, Terraza, Privado
- **estado_reserva_enum**: Pendiente, Confirmada, Cancelada, Completada
- **estado_atencion_enum**: Abierta, En curso, Cerrada
- **estado_pago_enum**: Pendiente, Pagado, Parcial
- **estado_mesa_enum**: Disponible, Ocupada, Reservada, En mantenimiento
- **estado_pedido_enum**: Pendiente, Enviado, En preparacion, Listo, Servido
- **estado_cocina_enum**: pendiente, en preparacion, listo, despachado
- **tipo_item_enum**: plato, producto, otro
- **tipo_comprobante_enum**: Boleta, Factura, Ticket
- **estado_comprobante_enum**: Generado, Emitido, Anulado
- **metodo_pago_enum**: Efectivo, Tarjeta, Transferencia, Mixto
- **unidad_enum**: unidad, litro, kg, gramo

## Datos de Prueba Incluidos

La base de datos viene con datos iniciales para pruebas:

- **3 clientes** de ejemplo
- **4 usuarios** con diferentes roles
- **4 mesas** con diferentes capacidades
- **4 categorías de platos**
- **4 platos** en el menú
- **5 productos** (bebidas)
- **2 reservas** de ejemplo
- **2 atenciones** con pedidos

## Índices para Optimización

Se han creado índices en campos frecuentemente consultados para optimizar las búsquedas.

## Próximos Pasos

1. Instala PostgreSQL si aún no lo tienes
2. Ejecuta el script SQL
3. Verifica que todas las tablas se hayan creado correctamente
4. Conecta tu aplicación web al puerto 5432 (PostgreSQL por defecto)

## Conexión desde Node.js/Express

```javascript
const { Client } = require('pg');

const client = new Client({
    user: 'postgres',
    password: 'tu_password',
    host: 'localhost',
    port: 5432,
    database: 'restaurante'
});

client.connect();
```

## Soporte y Mantenimiento

- Los datos se guardan permanentemente en la base de datos
- Los triggers automáticamente registran cuándo se actualizó cada registro
- Las vistas facilitan consultas complejas sin código adicional
- Los procedimientos almacenados manejan lógica de negocio

---

**Generado**: 2026-05-13
**Versión**: 1.0
**Base de Datos**: PostgreSQL
