# Valet Parking API

API backend NestJS + Prisma + PostgreSQL para sistema de valet parking.

## Stack

- NestJS 11.x, TypeScript 5.x
- Prisma 7.x + PostgreSQL 14+
- JWT con Passport, class-validator
- OneSignal para push notifications
- Puerto: 3001, prefijo: `/api`

## Arquitectura

```
src/
├── auth/           # JWT auth + RBAC
├── common/         # Guards, decorators, filters, interceptors
├── companies/      # Gestion de empresas
├── config/         # Configuracion de la app
├── email/          # Envio de emails
├── employees/      # Gestion de empleados
├── notifications/  # Notificaciones push via OneSignal
├── payments/       # Pagos y metodos de pago
├── prisma/         # Servicio Prisma
├── requests/       # Solicitudes de vehiculos
├── supabase/       # Integracion Supabase
├── users/          # Gestion de usuarios
├── vehicles/       # Gestion de vehiculos (modulo critico)
├── app.module.ts
└── main.ts
```

## Modelos BD

Company, Valet, User, Vehicle, ParkingRecord, VehicleRequest, PaymentMethod, Payment, CompanyPlan, CompanyInvoice, CompanyUser, Notification

## Roles

`ADMIN` | `MANAGER` | `ATTENDANT` | `CLIENT`

## Enums clave

`ParkingRecordStatus`, `NotificationType`, `RequestStatus`, `PaymentStatus`, `PlanType`, `FeeType`

## Comandos clave

```bash
npm run start:dev
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run prisma:studio
```

## Convenciones

- DTOs con class-validator en cada modulo
- Guards: `@Roles(UserRole.ADMIN)` o `@Public()` para endpoints publicos
- Soft delete en modelos que aplique
- Notificaciones: `NotificationsService` crea registro en BD y envia push via `OneSignalService`
- Ver README.md para endpoints completos y ejemplos curl
