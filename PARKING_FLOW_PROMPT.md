# Flujo de Valet Parking — Integración Frontend

## Contexto

Este documento describe los cambios recientes en la API y el flujo teórico que debe implementar el frontend para gestionar el ciclo completo de un registro de estacionamiento (ParkingRecord), desde que el vehículo entra hasta que sale.

La vista ya está creada. Lo que se necesita es conectar correctamente los botones/acciones de la UI a los endpoints en el orden correcto.

---

## Cambios Recientes en la API

### Problema que se resolvió

Antes, registrar un pago **no actualizaba el estado del ParkingRecord**. El frontend tenía que hacer dos llamadas separadas (crear pago + cambiar status) y no había validación que lo exigiera. Esto generaba inconsistencias: podía existir un pago confirmado pero el registro seguía como `UNPAID`.

Además, la lógica del campo `validation` estaba invertida.

### Lo que se corrigió

1. **`POST /api/payments`**
   - `validation: "MANUAL"` → el payment se crea como `PENDING`. Un admin debe aprobarlo desde el dashboard.
   - `validation: "AUTOMATIC"` → el payment se crea como `RECEIVED` y el ParkingRecord pasa automáticamente a `PAID` (usado para gateways de pago externos).

2. **`PATCH /api/payments/:id/status`** — al cambiar el status de un payment a `RECEIVED`, el ParkingRecord pasa automáticamente a `PAID`. Si se cambia a `CANCELLED` y no existe otro pago confirmado, el ParkingRecord revierte a `UNPAID`.

3. **`PATCH /api/vehicles/:id/status`** — ahora valida las transiciones:
   - No se puede marcar como `PAID` si no existe un pago con status `RECEIVED`.
   - No se puede cambiar el status de un record que ya está `FREE`.

---

## Semántica del campo `validation`

| Valor        | Quién confirma el pago         | Status inicial del Payment | Requiere acción del admin |
|--------------|--------------------------------|----------------------------|---------------------------|
| `MANUAL`     | Un humano desde el dashboard   | `PENDING`                  | Sí                        |
| `AUTOMATIC`  | Gateway de pago (automático)   | `RECEIVED`                 | No                        |

> **Regla general:** En el contexto de valet parking venezolano (Zelle, Pago Móvil, Binance, efectivo con comprobante), **casi todos los pagos serán `MANUAL`**. El asistente o cliente registra la referencia e imagen desde la app, y un admin lo aprueba desde el dashboard.

---

## Estados de un ParkingRecord

```
UNPAID  →  PAID  →  FREE
```

| Status   | Significado                                      |
|----------|--------------------------------------------------|
| `UNPAID` | Vehículo en el estacionamiento, pago pendiente   |
| `PAID`   | Pago confirmado, vehículo listo para entrega     |
| `FREE`   | Vehículo entregado, registro cerrado             |

---

## Estados de un Payment

| Status      | Significado                                              |
|-------------|----------------------------------------------------------|
| `PENDING`   | Pago registrado, esperando aprobación del admin          |
| `RECEIVED`  | Pago confirmado — activa el cambio a PAID en el record   |
| `CANCELLED` | Pago rechazado/cancelado por el admin                    |

---

## Flujo Teórico Completo

### PASO 1 — Check-in del vehículo

**Quién lo ejecuta:** Asistente desde la app al recibir el vehículo.

```
POST /api/vehicles/register
Authorization: Bearer <token>

{
  "plate": "ABC123",
  "brand": "Toyota",
  "model": "Corolla",
  "color": "Blanco",
  "valedId": "<id_del_valet>",
  "companyId": "<id_de_la_empresa>",
  "idNumber": "V-12345678",
  "name": "Juan Pérez",
  "email": "juan@email.com"
}
```

**Respuesta:** ParkingRecord con `status: "UNPAID"`.

**En la UI:** El registro aparece en la lista de vehículos activos.

---

### PASO 2 — Registrar el pago (desde la app — asistente o cliente)

El asistente o el cliente ingresa los datos del pago desde la app: método, monto, referencia, imagen del comprobante, etc. **Siempre se usa `validation: "MANUAL"`** para los métodos locales.

```
POST /api/payments
Authorization: Bearer <token>

{
  "parkingRecordId": "<id_del_record>",
  "paymentMethodId": "<id_del_metodo>",
  "amountUSD": 5.00,
  "tip": 1.00,
  "fee": 0,
  "validation": "MANUAL",
  "reference": "ZELLE-REF-20260316",
  "image": "<base64_del_comprobante>",
  "note": "Zelle enviado a +1-555-0100"
}
```

**Respuesta:** Payment con `status: "PENDING"`. El ParkingRecord **sigue en `UNPAID`** hasta que el admin confirme.

**En la UI (app del asistente/cliente):** La tarjeta muestra "Pago en revisión — esperando confirmación" con un indicador visual distinto (ej. ícono de reloj o color amarillo).

---

### PASO 3 — Admin revisa y confirma o rechaza el pago (desde el dashboard)

El admin ve una lista de pagos `PENDING` con la referencia e imagen del comprobante adjunta.

**Confirmar pago:**
```
PATCH /api/payments/:paymentId/status
Authorization: Bearer <token>  (rol: ADMIN)

{ "status": "RECEIVED" }
```
→ El ParkingRecord pasa automáticamente de `UNPAID` a `PAID`. No hay que llamar a ningún endpoint extra.

**Rechazar pago:**
```
PATCH /api/payments/:paymentId/status
Authorization: Bearer <token>  (rol: ADMIN)

{ "status": "CANCELLED" }
```
→ Si no hay otro pago confirmado, el ParkingRecord revierte a `UNPAID`.

**En la UI (dashboard del admin):** El admin tiene una vista de pagos pendientes con botones "Aprobar" y "Rechazar" junto al comprobante. Al confirmar, la tarjeta del vehículo cambia a "Pagado — listo para entrega" en tiempo real.

---

### PASO 4 — Checkout / Entrega del vehículo

**Quién lo ejecuta:** Asistente desde la app al entregar el vehículo.
**Requisito:** El ParkingRecord debe estar en `PAID`. Si está `UNPAID` (pago no confirmado aún), la API retorna error `400`.

```
PATCH /api/vehicles/:recordId/checkout
Authorization: Bearer <token>

{
  "checkOutValet": "<id_del_valet>",
  "checkOutAt": "2026-03-16T15:30:00Z",
  "notes": "Entregado sin novedad"
}
```

**Respuesta:** ParkingRecord con `status: "FREE"` y `checkOutAt` registrado.

**En la UI:** El vehículo desaparece de la lista activa y aparece en el historial.

---

## Resumen Visual del Flujo

```
[Asistente — App]           [Admin — Dashboard]         [Asistente — App]
       ↓
POST /vehicles/register
       ↓
ParkingRecord: UNPAID
       ↓
POST /payments
  validation: "MANUAL"
  (referencia + imagen)
       ↓
Payment: PENDING ──────────→ Admin ve el comprobante
ParkingRecord: UNPAID          PATCH /payments/:id/status
                               { status: "RECEIVED" }
                                        ↓
                               ParkingRecord: PAID  ──────────→ PATCH /vehicles/:id/checkout
                                                                        ↓
                                                               ParkingRecord: FREE ✓
```

---

## Endpoints de Consulta (para poblar la UI)

| Acción                                | Endpoint                                    | Roles                     |
|---------------------------------------|---------------------------------------------|---------------------------|
| Listar vehículos activos (sin pagar)  | `GET /api/vehicles?status=active`           | ADMIN, ATTENDANT, MANAGER |
| Listar vehículos pagados (en espera)  | `GET /api/vehicles?status=pending_delivery` | ADMIN, ATTENDANT, MANAGER |
| Ver detalle de un registro            | `GET /api/vehicles/:id`                     | ADMIN, ATTENDANT          |
| **Listar pagos pendientes de revisar**| `GET /api/payments?status=PENDING`          | ADMIN                     |
| Listar métodos de pago disponibles    | `GET /api/payments/methods`                 | ADMIN, ATTENDANT          |
| Ver mis vehículos activos (cliente)   | `GET /api/vehicles/my-car`                  | CLIENT                    |
| Ver historial (cliente)               | `GET /api/vehicles/history`                 | CLIENT                    |

---

## Errores esperados y cómo manejarlos en la UI

| HTTP | Mensaje de la API                              | Cuándo ocurre                                  | Acción en UI                              |
|------|------------------------------------------------|------------------------------------------------|-------------------------------------------|
| 409  | Vehicle already checked in                     | Check-in de una placa ya activa                | Mostrar error, redirigir al registro      |
| 404  | Parking record not found                       | ID inválido                                    | Mostrar error genérico                    |
| 400  | Vehicle must be paid before checkout           | Checkout sin pago confirmado                   | Mostrar "Pago pendiente de aprobación"    |
| 400  | Cannot mark as PAID: no confirmed payment      | Status manual a PAID sin pago RECEIVED         | Deshabilitar botón si no hay pago         |
| 409  | Vehicle has already checked out                | Intentar modificar un record FREE              | Ocultar opciones de edición               |

---

## Notas de Implementación

- **El endpoint `PATCH /api/vehicles/:id/status`** existe para sobrescrituras manuales del admin, pero en el flujo normal **nunca debería ser necesario**. El status del ParkingRecord es manejado automáticamente por la API al confirmar/cancelar pagos.
- **El campo `image`** acepta base64. El frontend puede capturar la foto del comprobante directamente con la cámara y enviarlo en el mismo request de creación del pago.
- **El campo `reference`** es el número de referencia de la transferencia tal como lo muestra el banco/app del cliente.
- Para notificaciones en tiempo real (ej. el asistente sabe al instante cuando el admin aprueba un pago), consultar el módulo de `Notifications` de la API.
