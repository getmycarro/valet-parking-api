# Valet Parking API

API backend NestJS + Prisma + PostgreSQL para sistema de valet parking.

## Stack

- NestJS 10.x, TypeScript 5.x
- Prisma 7.x + PostgreSQL 14+
- JWT con Passport, class-validator
- Puerto: 3001, prefijo: `/api`

## Arquitectura

```
src/
├── auth/        # JWT auth + RBAC (roles: ADMIN, ATTENDANT)
├── common/      # Guards, decorators, filters, interceptors
├── config/      # Configuracion de la app
├── employees/   # Gestion de empleados
├── payments/    # Pagos y metodos de pago
├── prisma/      # Servicio Prisma
├── reports/     # Reportes y analytics
├── settings/    # Configuracion del sistema
├── vehicles/    # Gestion de vehiculos (modulo critico)
├── app.module.ts
└── main.ts
```

## Modelos BD

User, Employee, Vehicle, PaymentMethod, Payment, Settings

## Comandos clave

```bash
npm run start:dev
npm run prisma:migrate
npm run prisma:seed
npm run prisma:studio
```

## Convenciones

- DTOs con class-validator en cada modulo
- Guards: `@Roles(Role.ADMIN)` o `@Public()` para endpoints publicos
- Soft delete en Employee
- Ver README.md para endpoints completos y ejemplos curl
