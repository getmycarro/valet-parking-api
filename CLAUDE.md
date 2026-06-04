# Valet Parking API

API backend NestJS + Prisma + PostgreSQL para sistema de valet parking.

## Stack

- NestJS 11.x, TypeScript 5.x
- Prisma 6.x + PostgreSQL 14+
- JWT con Passport (`passport-jwt`), RBAC via guards
- bcrypt para hashing de contraseñas
- SendGrid (`@sendgrid/mail`) para emails
- Supabase JS client para storage
- OneSignal para push notifications
- Puerto: 3001, prefijo global: `/api`

## Comandos

```bash
npm run start:dev          # desarrollo con watch
npm run start:prod         # produccion (requiere npm run build primero)
npm run build              # compilar a dist/

npm run prisma:generate    # regenerar Prisma Client tras cambios al schema
npm run prisma:migrate     # crear y aplicar migración nueva
npm run prisma:studio      # UI visual de la BD
npm run prisma:seed        # poblar BD con datos iniciales

npm run test               # jest
npm run test:watch         # jest en modo watch
npm run test:cov           # cobertura
npm run test:e2e           # tests end-to-end

npx tsc --noEmit           # verificar tipos sin compilar
npm run lint               # eslint con auto-fix
npm run format             # prettier
```

## Variables de entorno

Ver `.env.example` para plantilla. Variables requeridas:

```
DATABASE_URL               # PostgreSQL connection string (Prisma pooled)
DIRECT_URL                 # PostgreSQL direct URL (Prisma migrations)
JWT_SECRET                 # secreto para firmar tokens JWT
JWT_EXPIRES_IN             # duración token, ej: "7d"
PORT                       # puerto del servidor (default: 3001)
NODE_ENV                   # development | production
CORS_ORIGIN                # orígenes permitidos (comma-separated) o "*" para todos
SUPABASE_URL               # URL del proyecto Supabase
SUPABASE_SERVICE_ROLE_KEY  # service role key de Supabase
ONESIGNAL_APP_ID           # App ID de OneSignal
ONESIGNAL_REST_API_KEY     # REST API Key de OneSignal
SENDGRID_API_KEY           # API Key de SendGrid (para emails)
CLOUDINARY_CLOUD_NAME      # dmsa4uyiq (para futuras operaciones server-side sobre imágenes)
CLOUDINARY_API_KEY         # Cloudinary API key
CLOUDINARY_API_SECRET      # Cloudinary API secret
```

## Arquitectura de módulos

```
src/
├── auth/           # JWT login/register, JwtStrategy, AuthController
├── common/         # Guards globales, decoradores, filtros, interceptores
├── companies/      # Empresas, planes (CompanyPlan), facturas, métodos de pago por empresa
├── config/         # Configuración de la app (ConfigModule)
├── email/          # EmailService con SendGrid
├── employees/      # Valets y ATTENDANT staff por empresa
├── notifications/  # Push via OneSignal + registro en BD, lógica de requests
├── payments/       # Pagos, métodos de pago globales, proceso de planes vencidos
├── prisma/         # PrismaService (global, inyectable en cualquier módulo)
├── requests/       # VehicleRequest (solicitudes de búsqueda de objetos)
├── supabase/       # SupabaseService para uploads de archivos
├── users/          # Gestión de usuarios (CRUD por rol)
├── vehicles/       # Módulo crítico: registro, checkout, búsqueda, historial
├── app.module.ts   # Guards/Filters/Interceptors registrados globalmente
└── main.ts         # Bootstrap: CORS, ValidationPipe, prefijo global
```

### Responsabilidades por módulo

| Módulo | Responsabilidad principal |
|--------|--------------------------|
| `auth` | Login, registro, JWT strategy. Exporta `AuthService`. |
| `vehicles` | `ParkingRecord` lifecycle: entrada, salida (`checkout`), búsqueda por placa/cédula, historial CLIENT. |
| `payments` | Crear pagos, actualizar estado, métodos de pago, proceso de planes vencidos (cron externo vía endpoint público). |
| `notifications` | `NotificationsService` crea registros en BD + llama `OneSignalService`. También maneja checkout requests y object search requests con notificaciones. |
| `requests` | `VehicleRequest` CRUD (búsqueda de objetos en vehículo estacionado). |
| `companies` | Empresas, planes de facturación, facturas, métodos de pago por empresa. Solo accesible por `SUPER_ADMIN` mayoritariamente. |
| `employees` | Gestión de valets (modelo `Valet`) y empleados (`ATTENDANT`/`MANAGER`) vinculados a empresa. |
| `users` | CRUD de usuarios con separación por rol. Admin gestiona staff; SUPER_ADMIN gestiona admins. |
| `common` | `JwtAuthGuard`, `RolesGuard`, `@Roles()`, `@Public()`, `@CurrentUser()`, `TransformInterceptor`, `HttpExceptionFilter`. |

## Seguridad y autenticación

### Guards globales (registrados en `app.module.ts`)
- `JwtAuthGuard`: aplica a todos los endpoints. Salta si el endpoint tiene `@Public()`.
- `RolesGuard`: verifica `user.role` contra los roles declarados en `@Roles()`.

### Decoradores disponibles
```typescript
@Public()                          // endpoint sin autenticación
@Roles(UserRole.ADMIN, UserRole.ATTENDANT)  // roles permitidos
@CurrentUser()                     // inyecta el usuario del JWT en el parámetro
```

### JWT payload y objeto `user`
El `JwtStrategy` hydrata el usuario desde la BD en cada request. El objeto disponible vía `@CurrentUser()` incluye:
```typescript
{
  id, email, name, role, isActive,
  companyUsers: [{ company: { id, name } }],
  companyId,    // empresa primaria (primer companyUser, o última del ParkingRecord para CLIENT)
  companyIds,   // todas las empresas del staff (para queries multi-empresa)
}
```

### Roles
`SUPER_ADMIN` > `ADMIN` > `MANAGER` > `ATTENDANT` > `CLIENT`

- **SUPER_ADMIN**: gestión global de empresas y admins.
- **ADMIN**: gestión de su(s) empresa(s), empleados, pagos.
- **MANAGER**: lectura de vehículos y requests de su empresa.
- **ATTENDANT**: registra/retira vehículos, gestiona requests.
- **CLIENT**: ve sus propios vehículos, crea pagos y requests de checkout/búsqueda.

## Formato de respuesta

`TransformInterceptor` envuelve todas las respuestas en `{ data: ... }` salvo que ya traigan esa estructura.

Los clientes deben hacer unwrap de `response.data.data` para obtener el payload real.

Errores HTTP retornan:
```json
{ "statusCode": 4xx, "timestamp": "...", "message": "..." }
```

## Modelos de BD (Prisma)

### Modelos principales
- `Company`: empresa de valet, tiene valets, usuarios, planes y registros.
- `User`: usuario del sistema (`email` unique, `idNumber` unique, `role`).
- `Vehicle`: vehículo con `plate` unique. Solo guarda datos estáticos.
- `ParkingRecord`: registro de estacionamiento. **Copia los datos del vehículo** (`plate`, `brand`, `model`, `color`) — no FK al `Vehicle`.
- `VehicleRequest`: solicitud de búsqueda de objeto en vehículo. FK a `ParkingRecord`.
- `Payment`: pago asociado a un `ParkingRecord`.
- `PaymentMethod`: método de pago de una empresa.
- `CompanyPlan`: plan de facturación de una empresa.
- `CompanyInvoice`: factura generada por plan.
- `CompanyUser`: relación M-N entre `User` y `Company` (staff).
- `Notification`: notificación persistida en BD.
- `Valet`: empleado tipo valet (nombre + número de cédula), vinculado a empresa.

### Enums clave
```typescript
UserRole:            SUPER_ADMIN | ADMIN | MANAGER | ATTENDANT | CLIENT
ParkingRecordStatus: UNPAID | PAID | FREE | PAYMENT_UNDER_REVIEW
RequestStatus:       PENDING | IN_PROGRESS | COMPLETED | CANCELLED
NotificationType:    PAYMENT_REGISTERED | PAYMENT_EXPIRED | PAYMENT_STATUS_UPDATED |
                     CHECKOUT_REQUEST | OBJECT_SEARCH_REQUEST | OBJECT_SEARCH_IN_PROGRESS |
                     APPROACH_COUNTER
PaymentStatus:       PENDING | RECEIVED | CANCELLED
PaymentMethodType:   ZELLE | MOBILE_PAYMENT | BINANCE | CASH | CARD
PlanType:            FLAT_RATE | PER_VEHICLE | MIXED
FeeType:             PERCENTAGE | FIXED
ValidationType:      MANUAL | AUTOMATIC
```

### Soft delete
Los modelos con `deletedAt DateTime?` implementan soft delete. Filtrar con `where: { deletedAt: null }`.

## Endpoints principales

### Auth (`/api/auth`)
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| POST | `/auth/login` | `@Public` | Login, retorna JWT |
| POST | `/auth/register` | `@Public` | Registro CLIENT (auto-registro) |
| POST | `/auth/register/admin` | `@Public` | Registro admin (protegido lógicamente) |
| GET | `/auth/me` | Autenticado | Perfil del usuario actual |

### Vehicles (`/api/vehicles`)
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| POST | `/vehicles/register` | ADMIN, ATTENDANT, CLIENT | Registra vehículo + crea ParkingRecord |
| PATCH | `/vehicles/:id/checkout` | ADMIN, ATTENDANT | Checkout del vehículo |
| PATCH | `/vehicles/:id/status` | ADMIN, ATTENDANT, MANAGER | Actualiza estado del ParkingRecord |
| GET | `/vehicles` | ADMIN, ATTENDANT, MANAGER | Lista con filtros (paginada) |
| GET | `/vehicles/:id` | ADMIN, ATTENDANT | Detalle del ParkingRecord |
| GET | `/vehicles/user-vehicles?idNumber=` | ADMIN, ATTENDANT | Busca vehículos por cédula |
| GET | `/vehicles/valets` | ADMIN, ATTENDANT | Lista valets disponibles |
| GET | `/vehicles/owner/:ownerId` | CLIENT | Vehículos por dueño |
| GET | `/vehicles/my-car` | CLIENT | ParkingRecords activos del usuario |
| GET | `/vehicles/history` | CLIENT | Historial del usuario |

### Payments (`/api/payments`)
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| POST | `/payments` | ADMIN, ATTENDANT, CLIENT | Crear pago |
| GET | `/payments` | ADMIN | Listar pagos con filtros |
| PATCH | `/payments/:id/status` | ADMIN | Actualizar estado del pago |
| POST | `/payments/methods` | ADMIN | Crear método de pago global |
| GET | `/payments/methods` | ADMIN, ATTENDANT | Listar métodos de pago |
| POST | `/payments/process-expired-plans` | `@Public` | Trigger de cron job externo |

### Companies (`/api/companies`)
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| POST | `/companies` | SUPER_ADMIN | Crear empresa |
| GET | `/companies` | SUPER_ADMIN, ADMIN | Listar empresas |
| GET | `/companies/:id` | SUPER_ADMIN | Detalle empresa |
| PATCH | `/companies/:id` | SUPER_ADMIN | Actualizar empresa |
| DELETE | `/companies/:id` | SUPER_ADMIN | Eliminar empresa |
| POST | `/companies/:id/plans` | SUPER_ADMIN | Crear plan de facturación |
| PATCH | `/companies/:companyId/plans/:planId` | SUPER_ADMIN | Actualizar plan |
| PATCH | `/companies/:companyId/plans/:planId/invoices/:invoiceId` | SUPER_ADMIN | Actualizar estado de factura |
| GET | `/companies/:companyId/payment-methods` | SUPER_ADMIN, ADMIN, CLIENT | Métodos de pago de empresa |
| POST | `/companies/:companyId/payment-methods` | SUPER_ADMIN, ADMIN | Crear método de pago |
| PATCH | `/companies/:companyId/payment-methods/:methodId` | SUPER_ADMIN, ADMIN | Actualizar método de pago |

### Users (`/api/users`)
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| POST | `/users/admin` | SUPER_ADMIN | Crear ADMIN |
| POST | `/users/staff` | SUPER_ADMIN, ADMIN | Crear MANAGER/ATTENDANT |
| GET | `/users` | SUPER_ADMIN | Listar todos los usuarios |
| GET | `/users/my-employees` | ADMIN | Listar empleados propios |
| PATCH | `/users/me` | Autenticado | Actualizar perfil propio |
| PATCH | `/users/me/account` | Autenticado | Actualizar cuenta (password, idNumber) |
| PATCH | `/users/employee/:id` | ADMIN | Editar empleado relacionado |
| PATCH | `/users/:id` | SUPER_ADMIN | Editar cualquier usuario |

### Employees (`/api/employees`)
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| POST | `/employees` | ADMIN | Crear valet/empleado |
| GET | `/employees` | ADMIN | Listar empleados de la empresa |
| DELETE | `/employees/:id?type=VALET\|ATTENDANT` | ADMIN | Eliminar empleado |

### Notifications (`/api/notifications`)
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/notifications` | Todos | Lista notificaciones con filtros |
| GET | `/notifications/unread-count` | Todos | Contador de no leídas |
| GET | `/notifications/unread` | ADMIN, MANAGER, ATTENDANT | No leídas en todas las empresas |
| PATCH | `/notifications/read-all` | Todos | Marcar todas como leídas |
| PATCH | `/notifications/read-all-companies` | ADMIN, MANAGER, ATTENDANT | Marcar leídas en todas las empresas |
| PATCH | `/notifications/:id/read` | Todos | Marcar una como leída |
| PATCH | `/notifications/:id/accept` | ADMIN, MANAGER, ATTENDANT | Aceptar solicitud (checkout/búsqueda) |
| POST | `/notifications/checkout-request` | ADMIN, ATTENDANT, CLIENT | Crear solicitud de checkout |
| POST | `/notifications/object-search` | ADMIN, ATTENDANT, CLIENT | Crear solicitud de búsqueda de objeto |
| POST | `/notifications/approach-counter` | ADMIN, MANAGER, ATTENDANT | Notificar aproximación a mostrador |
| POST | `/notifications/object-search-in-progress` | ADMIN, MANAGER, ATTENDANT | Notificar búsqueda en progreso |

### Requests (`/api/requests`)
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| POST | `/requests/object-search` | CLIENT | Crear VehicleRequest de búsqueda |
| GET | `/requests` | ADMIN, MANAGER, ATTENDANT | Listar requests con filtros |
| PATCH | `/requests/:id/status` | ADMIN, MANAGER, ATTENDANT | Actualizar estado del request |

### Payment References (`/api/payment-references`)
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| POST | `/payment-references/:parkingRecordId` | ADMIN, ATTENDANT | Guardar URL de comprobante Cloudinary en BD |

Modelo `PaymentReference`: `id`, `imageUrl` (Cloudinary `secure_url`), `publicId` (opcional), `parkingRecordId`, `uploadedById`, `createdAt`, `updatedAt`. El upload a Cloudinary lo hace el cliente directamente — este endpoint solo persiste la URL resultante.

### Workdays (`/api/workdays`)
| Método | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| GET | `/workdays/active` | ADMIN, MANAGER, ATTENDANT | Turno activo actual |
| POST | `/workdays/open` | ADMIN, ATTENDANT | Abrir un nuevo turno |
| PATCH | `/workdays/:id/close` | ADMIN, ATTENDANT | Cerrar turno activo |

## Patrones de código

### Crear un nuevo módulo
```bash
# Estructura mínima de un módulo
src/
└── feature/
    ├── feature.module.ts
    ├── feature.controller.ts
    ├── feature.service.ts
    └── dto/
        ├── create-feature.dto.ts
        └── filter-feature.dto.ts
```

Registrar en `app.module.ts`:
```typescript
imports: [..., FeatureModule]
```

### Ejemplo de controller con roles
```typescript
@Controller('feature')
@UseGuards(RolesGuard)
export class FeatureController {
  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findAll(@CurrentUser() user: any, @Query() filters: FilterFeatureDto) {
    const companyIds = user.companyUsers?.map((cu: any) => cu.company?.id).filter(Boolean) || [];
    return this.featureService.findAll(filters, companyIds);
  }
}
```

### Ejemplo de DTO
```typescript
import { IsOptional, IsString, IsEnum } from 'class-validator';

export class CreateFeatureDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsEnum(SomeEnum)
  status?: SomeEnum;
}
```

### Usar PrismaService
```typescript
@Injectable()
export class FeatureService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.modelName.findMany({
      where: { deletedAt: null },
    });
  }
}
```

### Endpoint público (sin JWT)
```typescript
@Public()
@Post('webhook')
handleWebhook(@Body() body: any) { ... }
```

### Enviar notificación push + guardar en BD
```typescript
// En el constructor del servicio:
constructor(private notifications: NotificationsService) {}

// Uso:
await this.notifications.createAndSend({
  type: NotificationType.PAYMENT_REGISTERED,
  title: 'Pago registrado',
  message: 'Tu pago fue recibido.',
  receiverIds: [userId],
  companyId,
  parkingRecordId,
});
```

## Integración con clientes

### Front_getmycarro/app (React/Vite — admin web)
- Base URL: `import.meta.env.VITE_API_URL || 'http://localhost:3001/api'`
- HTTP: `axios` con interceptor que agrega `Authorization: Bearer <token>` desde `localStorage` (key: `gmc_token`)
- Redirige a `/admin` en 401
- Auth: Firebase email/password → ID token almacenado como `gmc_token` → `GET /auth/me` para obtener el usuario backend
- SSE: `GET /notifications/stream?token=<gmc_token>` para actualizaciones en tiempo real (token como query param porque `EventSource` no soporta headers)

### expo/ (React Native — app móvil)
- Base URL: `process.env.EXPO_PUBLIC_API_URL` (default: `https://valet-parking-api.onrender.com/api`)
- HTTP: `axios` vía `lib/api.ts`
- Token almacenado en `expo-secure-store` bajo key `gmc_token`
- Los screens acceden al payload via `response.data.data` (el envelope no se unwrapea en el interceptor)
- En 401: token eliminado de secure store, usuario redirigido a login

### Convención de autenticación
Todos los clientes envían el JWT como:
```
Authorization: Bearer <token>
```
El token también puede enviarse como query param `?token=` (para conexiones SSE/EventSource que no soportan headers).

## Convenciones de naming

- Archivos: `kebab-case` (`create-vehicle.dto.ts`, `parking-record.service.ts`)
- Clases: `PascalCase` (`RegisterVehicleDto`, `VehiclesService`)
- Endpoints: `camelCase` en métodos del controller, rutas en `kebab-case`
- Variables de entorno: `SCREAMING_SNAKE_CASE`
- Modelos Prisma: `PascalCase` singular, tabla `snake_case` plural (via `@@map`)
- IDs en BD: `cuid()` string (no UUID ni autoincrement)
- Timestamps: siempre `createdAt` / `updatedAt` en todos los modelos

## Errores comunes y cómo evitarlos

1. **Olvidar regenerar el Prisma Client** tras cambiar `schema.prisma`: siempre correr `npm run prisma:generate`.

2. **No filtrar soft-deleted**: queries sin `where: { deletedAt: null }` retornan registros eliminados.

3. **Rutas que colisionan con params**: declarar rutas estáticas antes de `/:id` en el controller (ej: `/unread-count` antes de `/:id/read`).

4. **companyId vs companyIds**: `user.companyId` es la empresa primaria; `user.companyIds` es el array para queries multi-empresa (staff puede pertenecer a varias).

5. **CLIENT no tiene companyUsers**: su `companyId` se resuelve desde el último `ParkingRecord`. No asumir que `user.companyUsers` existe para clientes.

6. **ParkingRecord copia datos del vehículo**: no almacena FK a `Vehicle`. Al consultar el historial, los datos de placa/marca/modelo vienen del propio registro, no del modelo Vehicle.

7. **ValidationPipe con `whitelist: true`**: propiedades no declaradas en el DTO son ignoradas silenciosamente; con `forbidNonWhitelisted: true` lanzan error 400. Declarar todas las propiedades en el DTO.

8. **`@Public()` y roles simultáneos**: `@Public()` bypasea solo el `JwtAuthGuard`; si el controller también tiene `@UseGuards(RolesGuard)` a nivel de clase, el `RolesGuard` aún correrá pero sin usuario activo puede fallar. En endpoints verdaderamente públicos, no agregar `@Roles()`.

9. **Migraciones en producción**: usar `prisma migrate deploy` (no `migrate dev`) en producción para aplicar migraciones sin interactividad.
