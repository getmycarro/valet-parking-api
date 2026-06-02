import {
  PrismaClient,
  UserRole,
  PaymentMethodType,
  ValidationType,
  PaymentStatus,
  PlanType,
  FeeType,
  ParkingRecordStatus,
  RequestStatus,
  WorkdayStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker';
import * as dotenv from 'dotenv';
import * as admin from 'firebase-admin';

dotenv.config();

faker.seed(12345);

const HISTORICAL_EXCHANGE_RATE = 500;
const CURRENT_EXCHANGE_RATE = 557.97;

const prisma = new PrismaClient();

// ── Firebase setup ─────────────────────────────────────────

const FIREBASE_ENABLED =
  !!process.env.FIREBASE_PROJECT_ID &&
  !!process.env.FIREBASE_CLIENT_EMAIL &&
  !!process.env.FIREBASE_PRIVATE_KEY;

if (FIREBASE_ENABLED && admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    }),
  });
  console.log('Firebase Admin SDK initialized for seed.');
} else if (!FIREBASE_ENABLED) {
  console.log('Firebase env vars not set — skipping Firebase user management in seed.');
}

const firebaseAuth = FIREBASE_ENABLED ? admin.auth() : null;

// ── Firebase helpers ───────────────────────────────────────

async function deleteAllFirebaseUsers(): Promise<void> {
  if (!firebaseAuth) return;
  console.log('Eliminando usuarios de Firebase...');
  try {
    const { users } = await firebaseAuth.listUsers();
    for (const u of users) {
      await firebaseAuth.deleteUser(u.uid);
    }
    console.log(`${users.length} usuarios de Firebase eliminados.`);
  } catch (err) {
    console.warn('Error eliminando usuarios de Firebase:', err);
  }
}

async function createFirebaseUser(
  email: string,
  password: string,
  displayName?: string,
): Promise<string | undefined> {
  if (!firebaseAuth) return undefined;
  try {
    const record = await firebaseAuth.createUser({
      email,
      password,
      displayName,
      emailVerified: true,
    });
    return record.uid;
  } catch (err: any) {
    if (err.code === 'auth/email-already-exists') {
      try {
        const existing = await firebaseAuth.getUserByEmail(email);
        await firebaseAuth.updateUser(existing.uid, { password, displayName, emailVerified: true });
        return existing.uid;
      } catch (updateErr) {
        console.warn(`Error actualizando usuario Firebase para ${email}:`, updateErr);
        return undefined;
      }
    }
    console.warn(`Error creando usuario Firebase para ${email}:`, err);
    return undefined;
  }
}

// ── Helpers ────────────────────────────────────────────────

async function hash(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

function generatePlate(): string {
  const L = () => faker.string.alpha({ length: 1, casing: 'upper' });
  const N = () => String(faker.number.int({ min: 0, max: 9 }));
  return `${L()}${L()}${L()}${N()}${L()}${N()}`;
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function subDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

// ── Data pools ────────────────────────────────────────────

const BRANDS_MODELS: { brand: string; models: string[] }[] = [
  { brand: 'Toyota', models: ['Corolla', 'Camry', 'RAV4', 'Hilux', 'Yaris'] },
  { brand: 'Chevrolet', models: ['Aveo', 'Cruze', 'Spark', 'Silverado', 'Tracker'] },
  { brand: 'Ford', models: ['Fiesta', 'Focus', 'Explorer', 'F-150', 'Escape'] },
  { brand: 'Hyundai', models: ['Accent', 'Tucson', 'Elantra', 'Santa Fe'] },
  { brand: 'Kia', models: ['Rio', 'Sportage', 'Seltos', 'Forte'] },
  { brand: 'Honda', models: ['Civic', 'CR-V', 'Accord', 'HR-V'] },
  { brand: 'Nissan', models: ['Sentra', 'Versa', 'Kicks', 'Frontier'] },
  { brand: 'Volkswagen', models: ['Gol', 'Jetta', 'Tiguan', 'Polo'] },
];

const COLORS = [
  'Blanco', 'Negro', 'Gris', 'Plata', 'Rojo',
  'Azul', 'Verde', 'Dorado', 'Marrón', 'Beige',
];

const NOTE_OPTIONS = [
  'Cliente VIP',
  'Vehículo con rayones previos',
  'Estacionado en zona premium',
  'Llave entregada en recepción',
  'Solicitó lavado adicional',
  'Recoger antes de las 6pm',
];

function randomVehicle() {
  const brandData = randomFrom(BRANDS_MODELS);
  return {
    brand: brandData.brand,
    model: randomFrom(brandData.models),
    color: randomFrom(COLORS),
    plate: generatePlate(),
  };
}

// ── Step functions ────────────────────────────────────────

async function clearDatabase(prisma: PrismaClient): Promise<void> {
  // Delete Firebase users first (before Prisma users)
  await deleteAllFirebaseUsers();

  console.log('Limpiando base de datos...');
  await prisma.carModel.deleteMany();
  await prisma.carBrand.deleteMany();
  await prisma.paymentReference.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.companyInvoice.deleteMany();
  await prisma.vehicleRequest.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.workday.deleteMany();
  await prisma.parkingRecord.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.companyPlan.deleteMany();
  await prisma.paymentMethod.deleteMany();
  await prisma.companyUser.deleteMany();
  await prisma.valet.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  console.log('Base de datos limpia.');
}

async function seedCarBrands(prisma: PrismaClient): Promise<void> {
  console.log('  Creando car brands y models...');
  for (const { brand, models } of BRANDS_MODELS) {
    const created = await prisma.carBrand.create({
      data: {
        name: brand,
        models: {
          create: (models as string[]).map((m) => ({ name: m })),
        },
      },
    });
    console.log(`    ✅ ${created.name}: ${(models as string[]).length} modelos`);
  }
}

async function seedSubscriptionPlans(prisma: PrismaClient) {
  console.log('Creando subscription plans...');

  const starter = await prisma.subscriptionPlan.create({
    data: {
      name: 'Starter',
      description: 'Plan ideal para pequeños estacionamientos que comienzan su operación digital.',
      priceUSD: 49,
      maxVehicles: 100,
      maxValets: 3,
      maxAttendants: 2,
      features: [
        'Registro de vehículos',
        'App B2C para clientes',
        'Métodos de pago digitales',
        'Historial 30 días',
        'Soporte por email',
      ],
      isActive: true,
      sortOrder: 1,
    },
  });

  const professional = await prisma.subscriptionPlan.create({
    data: {
      name: 'Professional',
      description: 'Para estacionamientos en crecimiento que necesitan reportes y notificaciones avanzadas.',
      priceUSD: 149,
      maxVehicles: 500,
      maxValets: 10,
      maxAttendants: 8,
      features: [
        'Todo en Starter',
        'Dashboard con métricas avanzadas',
        'Reportes de facturación',
        'Notificaciones push',
        'Historial ilimitado',
        'Solicitudes de búsqueda de objetos',
        'Múltiples métodos de pago',
      ],
      isActive: true,
      sortOrder: 2,
    },
  });

  const enterprise = await prisma.subscriptionPlan.create({
    data: {
      name: 'Enterprise',
      description: 'Solución completa para operaciones multi-empresa con soporte dedicado y SLA garantizado.',
      priceUSD: 399,
      maxVehicles: null,
      maxValets: null,
      maxAttendants: null,
      features: [
        'Todo en Professional',
        'Multi-empresa',
        'Soporte prioritario 24/7',
        'Integración personalizada',
        'SLA garantizado',
        'Onboarding dedicado',
        'API access',
      ],
      isActive: true,
      sortOrder: 3,
    },
  });

  console.log('Subscription plans creados.');
  return { starter, professional, enterprise };
}

async function seedCompanies(
  prisma: PrismaClient,
  plans: { starter: any; professional: any; enterprise: any },
) {
  console.log('Creando companies...');

  const companyA = await prisma.company.create({
    data: {
      name: 'Estacionamiento Centro Plaza',
      subscriptionPlanId: plans.professional.id,
    },
  });

  const companyB = await prisma.company.create({
    data: {
      name: 'Parking Aeropuerto Internacional',
      subscriptionPlanId: plans.enterprise.id,
    },
  });

  const companyC = await prisma.company.create({
    data: {
      name: 'Valet Mall del Este',
      subscriptionPlanId: plans.starter.id,
    },
  });

  console.log('Companies creadas.');
  return { companyA, companyB, companyC };
}

async function seedPaymentMethods(
  prisma: PrismaClient,
  companies: { companyA: any; companyB: any; companyC: any },
): Promise<Record<string, any[]>> {
  console.log('Creando payment methods...');

  const paymentMethodsMap: Record<string, any[]> = {};

  for (const company of [companies.companyA, companies.companyB, companies.companyC]) {
    const methods = await Promise.all([
      prisma.paymentMethod.create({
        data: {
          name: 'Efectivo USD',
          form: 'Pago directo en caja',
          type: PaymentMethodType.CASH,
          companyId: company.id,
        },
      }),
      prisma.paymentMethod.create({
        data: {
          name: 'Binance Pay',
          form: 'ID: 987654321',
          type: PaymentMethodType.BINANCE,
          companyId: company.id,
        },
      }),
      prisma.paymentMethod.create({
        data: {
          name: 'Pago Móvil',
          form: '0412-1234567 / CI: 12345678 / Banco Venezuela',
          type: PaymentMethodType.MOBILE_PAYMENT,
          companyId: company.id,
        },
      }),
      prisma.paymentMethod.create({
        data: {
          name: 'Zelle',
          form: 'pagos@empresa.com',
          type: PaymentMethodType.ZELLE,
          companyId: company.id,
        },
      }),
      prisma.paymentMethod.create({
        data: {
          name: 'Punto de venta',
          form: 'Banco Mercantil - Terminal #4',
          type: PaymentMethodType.CARD,
          companyId: company.id,
        },
      }),
    ]);
    paymentMethodsMap[company.id] = methods;
  }

  console.log('Payment methods creados.');
  return paymentMethodsMap;
}

async function seedBillingPlans(
  prisma: PrismaClient,
  companies: { companyA: any; companyB: any; companyC: any },
) {
  console.log('Creando billing plans...');

  // Company A: started with FLAT_RATE, migrated to MIXED
  const companyAFlat = await prisma.companyPlan.create({
    data: {
      companyId: companies.companyA.id,
      planType: PlanType.FLAT_RATE,
      flatRate: 500,
      isActive: false,
      createdAt: new Date('2025-06-01'),
    },
  });

  const companyAMixed = await prisma.companyPlan.create({
    data: {
      companyId: companies.companyA.id,
      planType: PlanType.MIXED,
      basePrice: 300,
      perVehicleRate: 3,
      feeType: FeeType.PERCENTAGE,
      feeValue: 10,
      isActive: true,
      createdAt: new Date('2025-12-01'),
    },
  });

  // Company B
  const companyBPlan = await prisma.companyPlan.create({
    data: {
      companyId: companies.companyB.id,
      planType: PlanType.PER_VEHICLE,
      perVehicleRate: 5,
      feeType: FeeType.FIXED,
      feeValue: 1,
      isActive: true,
      createdAt: new Date('2025-09-01'),
    },
  });

  // Company C
  const companyCPlan = await prisma.companyPlan.create({
    data: {
      companyId: companies.companyC.id,
      planType: PlanType.FLAT_RATE,
      flatRate: 800,
      isActive: true,
      createdAt: new Date('2025-10-01'),
    },
  });

  console.log('Billing plans creados.');
  return { companyAFlat, companyAMixed, companyBPlan, companyCPlan };
}

async function seedSuperAdmin(prisma: PrismaClient): Promise<void> {
  console.log('Creando super admin...');

  const firebaseUid = await createFirebaseUser('superadmin@valetpark.com', 'super123', 'Roberto Mendoza');

  const hashedPwd = await hash('super123');
  await prisma.user.upsert({
    where: { email: 'superadmin@valetpark.com' },
    update: { firebaseUid, password: hashedPwd },
    create: {
      email: 'superadmin@valetpark.com',
      password: hashedPwd,
      name: 'Roberto Mendoza',
      role: UserRole.SUPER_ADMIN,
      phone: '0414-9876543',
      idNumber: 'V-10000001',
      firebaseUid,
    },
  });

  console.log('Super admin creado.');
}

async function seedAdmins(
  prisma: PrismaClient,
  companies: { companyA: any; companyB: any; companyC: any },
) {
  console.log('Creando admins...');

  const adminPrincipalUid = await createFirebaseUser('admin@valetpark.com', 'admin123', 'Carlos García');
  const adminPrincipalPwd = await hash('admin123');
  const adminPrincipal = await prisma.user.upsert({
    where: { email: 'admin@valetpark.com' },
    update: { firebaseUid: adminPrincipalUid, password: adminPrincipalPwd },
    create: {
      email: 'admin@valetpark.com',
      password: adminPrincipalPwd,
      name: 'Carlos García',
      role: UserRole.ADMIN,
      phone: '0412-5551234',
      idNumber: 'V-15000001',
      firebaseUid: adminPrincipalUid,
    },
  });

  // Connect admin to all 3 companies
  for (const company of [companies.companyA, companies.companyB, companies.companyC]) {
    await prisma.companyUser.upsert({
      where: { userId_companyId: { userId: adminPrincipal.id, companyId: company.id } },
      update: {},
      create: { userId: adminPrincipal.id, companyId: company.id },
    });
  }

  const admin2Uid = await createFirebaseUser('admin2@valetpark.com', 'admin123', 'Ana Torres');
  const admin2Pwd = await hash('admin123');
  const admin2 = await prisma.user.upsert({
    where: { email: 'admin2@valetpark.com' },
    update: { firebaseUid: admin2Uid, password: admin2Pwd },
    create: {
      email: 'admin2@valetpark.com',
      password: admin2Pwd,
      name: 'Ana Torres',
      role: UserRole.ADMIN,
      phone: '0414-5559876',
      idNumber: 'V-15000002',
      firebaseUid: admin2Uid,
    },
  });

  await prisma.companyUser.upsert({
    where: { userId_companyId: { userId: admin2.id, companyId: companies.companyC.id } },
    update: {},
    create: { userId: admin2.id, companyId: companies.companyC.id },
  });

  console.log('Admins creados y conectados.');
  return { adminPrincipal, admin2 };
}

async function seedWorkdays(
  prisma: PrismaClient,
  companies: { companyA: any; companyB: any; companyC: any },
  adminsByCompany: Record<string, any>,
): Promise<{
  closedWorkdayMap: Record<string, { id: string; lastTicketNumber: number }>;
  activeWorkdayMap: Record<string, { id: string; lastTicketNumber: number }>;
}> {
  console.log('  Creando jornadas...');
  const closedWorkdayMap: Record<string, { id: string; lastTicketNumber: number }> = {};
  const activeWorkdayMap: Record<string, { id: string; lastTicketNumber: number }> = {};

  for (const company of [companies.companyA, companies.companyB, companies.companyC]) {
    const admin = adminsByCompany[company.id];

    const historicalOpenedAt = subDays(new Date(), 45);
    const historicalClosedAt = subDays(new Date(), 1);
    const closed = await prisma.workday.create({
      data: {
        companyId: company.id,
        openedById: admin.id,
        closedById: admin.id,
        status: WorkdayStatus.CLOSED,
        openedAt: historicalOpenedAt,
        closedAt: historicalClosedAt,
      },
    });
    closedWorkdayMap[company.id] = { id: closed.id, lastTicketNumber: 0 };

    const active = await prisma.workday.create({
      data: {
        companyId: company.id,
        openedById: admin.id,
        status: WorkdayStatus.ACTIVE,
      },
    });
    activeWorkdayMap[company.id] = { id: active.id, lastTicketNumber: 0 };

    console.log(`    ✅ 2 jornadas creadas para ${company.name || company.id}`);
  }

  return { closedWorkdayMap, activeWorkdayMap };
}

async function seedManagers(
  prisma: PrismaClient,
  companies: { companyA: any; companyB: any; companyC: any },
) {
  console.log('Creando managers...');

  const managersData = [
    {
      name: 'Miguel Ramírez',
      email: 'miguel.ramirez@valetpark.com',
      idNumber: 'V-16000001',
      phone: '0424-1110001',
      companyId: companies.companyA.id,
    },
    {
      name: 'Laura Sánchez',
      email: 'laura.sanchez@valetpark.com',
      idNumber: 'V-16000002',
      phone: '0424-1110002',
      companyId: companies.companyB.id,
    },
    {
      name: 'Pedro Flores',
      email: 'pedro.flores@valetpark.com',
      idNumber: 'V-16000003',
      phone: '0424-1110003',
      companyId: companies.companyC.id,
    },
  ];

  const managers: any[] = [];

  for (const m of managersData) {
    const firebaseUid = await createFirebaseUser(m.email, 'manager123', m.name);
    const hashedPwd = await hash('manager123');
    const user = await prisma.user.upsert({
      where: { email: m.email },
      update: { firebaseUid, password: hashedPwd },
      create: {
        email: m.email,
        password: hashedPwd,
        name: m.name,
        role: UserRole.MANAGER,
        phone: m.phone,
        idNumber: m.idNumber,
        firebaseUid,
      },
    });
    await prisma.companyUser.upsert({
      where: { userId_companyId: { userId: user.id, companyId: m.companyId } },
      update: {},
      create: { userId: user.id, companyId: m.companyId },
    });
    managers.push({ ...user, companyId: m.companyId });
  }

  console.log('Managers creados.');
  return managers;
}

async function seedAttendants(
  prisma: PrismaClient,
  companies: { companyA: any; companyB: any; companyC: any },
): Promise<Record<string, any[]>> {
  console.log('Creando attendants...');

  const attendantsData = [
    // Company A (3 attendants)
    {
      name: 'Diego López',
      email: 'diego.lopez@valetpark.com',
      idNumber: 'V-20000001',
      phone: '0412-2220001',
      companyId: companies.companyA.id,
    },
    {
      name: 'Sofía Morales',
      email: 'sofia.morales@valetpark.com',
      idNumber: 'V-20000002',
      phone: '0412-2220002',
      companyId: companies.companyA.id,
    },
    {
      name: 'Andrés Cruz',
      email: 'andres.cruz@valetpark.com',
      idNumber: 'V-20000003',
      phone: '0412-2220003',
      companyId: companies.companyA.id,
    },
    // Company B (2 attendants)
    {
      name: 'Valentina Reyes',
      email: 'valentina.reyes@valetpark.com',
      idNumber: 'V-20000004',
      phone: '0412-2220004',
      companyId: companies.companyB.id,
    },
    {
      name: 'Gabriel Díaz',
      email: 'gabriel.diaz@valetpark.com',
      idNumber: 'V-20000005',
      phone: '0412-2220005',
      companyId: companies.companyB.id,
    },
    // Company C (3 attendants)
    {
      name: 'Isabella Gómez',
      email: 'isabella.gomez@valetpark.com',
      idNumber: 'V-20000006',
      phone: '0412-2220006',
      companyId: companies.companyC.id,
    },
    {
      name: 'Rafael Hernández',
      email: 'rafael.hernandez@valetpark.com',
      idNumber: 'V-20000007',
      phone: '0412-2220007',
      companyId: companies.companyC.id,
    },
    {
      name: 'Camila Rivera',
      email: 'camila.rivera@valetpark.com',
      idNumber: 'V-20000008',
      phone: '0412-2220008',
      companyId: companies.companyC.id,
    },
  ];

  const attendantsByCompany: Record<string, any[]> = {
    [companies.companyA.id]: [],
    [companies.companyB.id]: [],
    [companies.companyC.id]: [],
  };

  for (const att of attendantsData) {
    const firebaseUid = await createFirebaseUser(att.email, att.idNumber, att.name);
    const hashedPwd = await hash(att.idNumber);
    const user = await prisma.user.upsert({
      where: { email: att.email },
      update: { firebaseUid, password: hashedPwd },
      create: {
        email: att.email,
        password: hashedPwd,
        name: att.name,
        role: UserRole.ATTENDANT,
        phone: att.phone,
        idNumber: att.idNumber,
        firebaseUid,
      },
    });
    await prisma.companyUser.upsert({
      where: { userId_companyId: { userId: user.id, companyId: att.companyId } },
      update: {},
      create: { userId: user.id, companyId: att.companyId },
    });
    attendantsByCompany[att.companyId].push(user);
  }

  console.log('Attendants creados.');
  return attendantsByCompany;
}

async function seedValets(
  prisma: PrismaClient,
  companies: { companyA: any; companyB: any; companyC: any },
): Promise<Record<string, any[]>> {
  console.log('Creando valets...');

  const valetsData = [
    // Company A (3 valets)
    { name: 'Juan Pérez', idNumber: 'V-25000001', companyId: companies.companyA.id },
    { name: 'Marco Gutiérrez', idNumber: 'V-25000002', companyId: companies.companyA.id },
    { name: 'Luis Ortiz', idNumber: 'V-25000003', companyId: companies.companyA.id },
    // Company B (2 valets)
    { name: 'Roberto Silva', idNumber: 'V-25000004', companyId: companies.companyB.id },
    { name: 'Tomás Mendoza', idNumber: 'V-25000005', companyId: companies.companyB.id },
    // Company C (3 valets)
    { name: 'Enrique Castillo', idNumber: 'V-25000006', companyId: companies.companyC.id },
    { name: 'Nicolás Vargas', idNumber: 'V-25000007', companyId: companies.companyC.id },
    { name: 'Sebastián Rojas', idNumber: 'V-25000008', companyId: companies.companyC.id },
  ];

  const valetsByCompany: Record<string, any[]> = {
    [companies.companyA.id]: [],
    [companies.companyB.id]: [],
    [companies.companyC.id]: [],
  };

  for (const v of valetsData) {
    const valet = await prisma.valet.create({
      data: { name: v.name, idNumber: v.idNumber, companyId: v.companyId },
    });
    valetsByCompany[v.companyId].push(valet);
  }

  console.log('Valets creados.');
  return valetsByCompany;
}

async function seedClients(prisma: PrismaClient): Promise<any[]> {
  console.log('Creando 60 clientes...');

  const clients: any[] = [];

  for (let i = 1; i <= 60; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const name = `${firstName} ${lastName}`;
    const email = faker.internet
      .email({ firstName, lastName, provider: 'mail.com' })
      .toLowerCase();
    const phone = `04${faker.number.int({ min: 12, max: 26 })}-${faker.number.int({ min: 1000000, max: 9999999 })}`;
    const idNumber = `V-${faker.number.int({ min: 10000000, max: 39999999 })}`;

    const firebaseUid = await createFirebaseUser(email, '123456', name);
    const client = await prisma.user.create({
      data: {
        email,
        password: await hash('123456'),
        name,
        role: UserRole.CLIENT,
        phone,
        idNumber,
        firebaseUid,
      },
    });

    clients.push(client);
  }

  console.log(`${clients.length} clientes creados.`);
  return clients;
}

async function seedVehicles(
  prisma: PrismaClient,
  clients: any[],
): Promise<Record<string, any[]>> {
  console.log('Creando vehículos por cliente...');

  const vehiclesByClient: Record<string, any[]> = {};

  for (const client of clients) {
    const vehicleCount = faker.number.int({ min: 1, max: 3 });
    vehiclesByClient[client.id] = [];

    for (let v = 0; v < vehicleCount; v++) {
      const vData = randomVehicle();
      const vehicle = await prisma.vehicle.create({
        data: { ...vData, ownerId: client.id },
      });
      vehiclesByClient[client.id].push(vehicle);
    }
  }

  const total = Object.values(vehiclesByClient).reduce((acc, arr) => acc + arr.length, 0);
  console.log(`${total} vehículos creados.`);
  return vehiclesByClient;
}

async function seedParkingRecords(
  prisma: PrismaClient,
  companies: { companyA: any; companyB: any; companyC: any },
  attendantsByCompany: Record<string, any[]>,
  valetsByCompany: Record<string, any[]>,
  clients: any[],
  vehiclesByClient: Record<string, any[]>,
  closedWorkdayMap: Record<string, { id: string; lastTicketNumber: number }>,
  activeWorkdayMap: Record<string, { id: string; lastTicketNumber: number }>,
) {
  console.log('Creando parking records...');

  const now = new Date();

  // ── FREE records (350 total: A=150, B=80, C=120) ──
  const freeDistribution: Array<{ company: any; count: number }> = [
    { company: companies.companyA, count: 150 },
    { company: companies.companyB, count: 80 },
    { company: companies.companyC, count: 120 },
  ];

  const freeRecords: any[] = [];

  for (const { company, count } of freeDistribution) {
    const companyValets = valetsByCompany[company.id];
    const companyAttendants = attendantsByCompany[company.id];

    for (let i = 0; i < count; i++) {
      const client = randomFrom(clients);
      const vData = randomVehicle();
      const registerAttendant = randomFrom(companyAttendants);
      const checkInValet = randomFrom(companyValets);
      const checkOutValet = randomFrom(companyValets);

      const checkInAt = faker.date.between({
        from: subDays(now, 45),
        to: subDays(now, 1),
      });
      const checkOutAt = new Date(
        checkInAt.getTime() +
          faker.number.int({ min: 1, max: 12 }) * 3600000,
      );

      const wd = closedWorkdayMap[company.id];
      const ticketNumber = wd ? ++wd.lastTicketNumber : undefined;
      const workdayId = wd ? wd.id : undefined;

      const record = await prisma.parkingRecord.create({
        data: {
          plate: vData.plate,
          brand: vData.brand,
          model: vData.model,
          color: vData.color,
          status: ParkingRecordStatus.FREE,
          checkInAt,
          checkOutAt,
          ownerId: client.id,
          companyId: company.id,
          registerRecordId: registerAttendant.id,
          checkInValetId: checkInValet.id,
          checkOutValetId: checkOutValet.id,
          notes: Math.random() < 0.15 ? randomFrom(NOTE_OPTIONS) : null,
          workdayId,
          ticketNumber,
        },
      });

      freeRecords.push(record);
    }
  }

  console.log(`  FREE: ${freeRecords.length} records creados.`);

  // ── PAID records (53 total, today, no checkOutAt) ──
  const paidDistribution: Array<{ company: any; count: number }> = [
    { company: companies.companyA, count: 22 },
    { company: companies.companyB, count: 13 },
    { company: companies.companyC, count: 18 },
  ];

  const paidRecords: any[] = [];

  for (const { company, count } of paidDistribution) {
    const companyValets = valetsByCompany[company.id];
    const companyAttendants = attendantsByCompany[company.id];

    for (let i = 0; i < count; i++) {
      const client = randomFrom(clients);
      const vData = randomVehicle();
      const registerAttendant = randomFrom(companyAttendants);
      const checkInValet = randomFrom(companyValets);

      const checkInAt = faker.date.recent({ days: 1 });

      const wd = activeWorkdayMap[company.id];
      const ticketNumber = wd ? ++wd.lastTicketNumber : undefined;
      const workdayId = wd ? wd.id : undefined;

      const record = await prisma.parkingRecord.create({
        data: {
          plate: vData.plate,
          brand: vData.brand,
          model: vData.model,
          color: vData.color,
          status: ParkingRecordStatus.PAID,
          checkInAt,
          ownerId: client.id,
          companyId: company.id,
          registerRecordId: registerAttendant.id,
          checkInValetId: checkInValet.id,
          notes: Math.random() < 0.15 ? randomFrom(NOTE_OPTIONS) : null,
          workdayId,
          ticketNumber,
        },
      });

      paidRecords.push(record);
    }
  }

  console.log(`  PAID: ${paidRecords.length} records creados.`);

  // ── UNPAID records (27 total, today, no checkOutAt) ──
  const unpaidDistribution: Array<{ company: any; count: number }> = [
    { company: companies.companyA, count: 11 },
    { company: companies.companyB, count: 7 },
    { company: companies.companyC, count: 9 },
  ];

  const unpaidRecords: any[] = [];

  for (const { company, count } of unpaidDistribution) {
    const companyValets = valetsByCompany[company.id];
    const companyAttendants = attendantsByCompany[company.id];

    for (let i = 0; i < count; i++) {
      const client = randomFrom(clients);
      const vData = randomVehicle();
      const registerAttendant = randomFrom(companyAttendants);
      const checkInValet = randomFrom(companyValets);

      const checkInAt = faker.date.recent({ days: 1 });

      const wd = activeWorkdayMap[company.id];
      const ticketNumber = wd ? ++wd.lastTicketNumber : undefined;
      const workdayId = wd ? wd.id : undefined;

      const record = await prisma.parkingRecord.create({
        data: {
          plate: vData.plate,
          brand: vData.brand,
          model: vData.model,
          color: vData.color,
          status: ParkingRecordStatus.UNPAID,
          checkInAt,
          ownerId: client.id,
          companyId: company.id,
          registerRecordId: registerAttendant.id,
          checkInValetId: checkInValet.id,
          notes: Math.random() < 0.15 ? randomFrom(NOTE_OPTIONS) : null,
          workdayId,
          ticketNumber,
        },
      });

      unpaidRecords.push(record);
    }
  }

  console.log(`  UNPAID: ${unpaidRecords.length} records creados.`);

  // ── PAYMENT_UNDER_REVIEW records (12 total, today, no checkOutAt) ──
  const reviewDistribution: Array<{ company: any; count: number }> = [
    { company: companies.companyA, count: 5 },
    { company: companies.companyB, count: 3 },
    { company: companies.companyC, count: 4 },
  ];

  const reviewRecords: any[] = [];

  for (const { company, count } of reviewDistribution) {
    const companyValets = valetsByCompany[company.id];
    const companyAttendants = attendantsByCompany[company.id];

    for (let i = 0; i < count; i++) {
      const client = randomFrom(clients);
      const vData = randomVehicle();
      const registerAttendant = randomFrom(companyAttendants);
      const checkInValet = randomFrom(companyValets);

      const checkInAt = faker.date.recent({ days: 1 });

      const wd = activeWorkdayMap[company.id];
      const ticketNumber = wd ? ++wd.lastTicketNumber : undefined;
      const workdayId = wd ? wd.id : undefined;

      const record = await prisma.parkingRecord.create({
        data: {
          plate: vData.plate,
          brand: vData.brand,
          model: vData.model,
          color: vData.color,
          status: ParkingRecordStatus.PAYMENT_UNDER_REVIEW,
          checkInAt,
          ownerId: client.id,
          companyId: company.id,
          registerRecordId: registerAttendant.id,
          checkInValetId: checkInValet.id,
          notes: Math.random() < 0.15 ? randomFrom(NOTE_OPTIONS) : null,
          workdayId,
          ticketNumber,
        },
      });

      reviewRecords.push(record);
    }
  }

  console.log(`  PAYMENT_UNDER_REVIEW: ${reviewRecords.length} records creados.`);

  const total = freeRecords.length + paidRecords.length + unpaidRecords.length + reviewRecords.length;
  console.log(`Total parking records: ${total}`);

  for (const [, wd] of Object.entries(closedWorkdayMap)) {
    await prisma.workday.update({
      where: { id: wd.id },
      data: { lastTicketNumber: wd.lastTicketNumber },
    });
  }
  for (const [, wd] of Object.entries(activeWorkdayMap)) {
    await prisma.workday.update({
      where: { id: wd.id },
      data: { lastTicketNumber: wd.lastTicketNumber },
    });
  }
  console.log('  Jornadas actualizadas con lastTicketNumber.');

  return { freeRecords, paidRecords, unpaidRecords, reviewRecords };
}

async function seedPayments(
  prisma: PrismaClient,
  records: {
    freeRecords: any[];
    paidRecords: any[];
    unpaidRecords: any[];
    reviewRecords: any[];
  },
  paymentMethodsMap: Record<string, any[]>,
  clients: any[],
): Promise<void> {
  console.log('Creando payments...');

  let count = 0;

  // FREE records — payment status mostly RECEIVED
  for (const record of records.freeRecords) {
    const methods = paymentMethodsMap[record.companyId];
    const method = randomFrom(methods);
    const amountUSD = faker.number.int({ min: 3, max: 25 });
    const tip = Math.random() < 0.3 ? faker.number.int({ min: 1, max: 8 }) : 0;
    const fee = Math.round(amountUSD * 0.1 * 100) / 100;
    const status =
      Math.random() < 0.92 ? PaymentStatus.RECEIVED : PaymentStatus.PENDING;

    await prisma.payment.create({
      data: {
        amountUSD,
        tip,
        fee,
        status,
        date: record.checkOutAt ?? record.checkInAt,
        parkingRecordId: record.id,
        validation:
          method.type === PaymentMethodType.CASH
            ? ValidationType.MANUAL
            : ValidationType.AUTOMATIC,
        reference:
          method.type === PaymentMethodType.CASH
            ? null
            : `REF-${faker.string.numeric(6)}`,
        paymentMethodId: method.id,
        exchangeRate: HISTORICAL_EXCHANGE_RATE,
        amountBs: amountUSD * HISTORICAL_EXCHANGE_RATE,
      },
    });

    count++;
  }

  // PAID records — payment RECEIVED (confirmed)
  for (const record of records.paidRecords) {
    const methods = paymentMethodsMap[record.companyId];
    const method = randomFrom(methods);
    const amountUSD = faker.number.int({ min: 3, max: 25 });
    const tip = Math.random() < 0.3 ? faker.number.int({ min: 1, max: 8 }) : 0;
    const fee = Math.round(amountUSD * 0.1 * 100) / 100;

    await prisma.payment.create({
      data: {
        amountUSD,
        tip,
        fee,
        status: PaymentStatus.RECEIVED,
        date: record.checkInAt,
        parkingRecordId: record.id,
        validation:
          method.type === PaymentMethodType.CASH
            ? ValidationType.MANUAL
            : ValidationType.AUTOMATIC,
        reference:
          method.type === PaymentMethodType.CASH
            ? null
            : `REF-${faker.string.numeric(6)}`,
        paymentMethodId: method.id,
        exchangeRate: CURRENT_EXCHANGE_RATE,
        amountBs: amountUSD * CURRENT_EXCHANGE_RATE,
      },
    });

    count++;
  }

  // PAYMENT_UNDER_REVIEW — payment status PENDING
  for (const record of records.reviewRecords) {
    const methods = paymentMethodsMap[record.companyId];
    const method = randomFrom(methods);
    const amountUSD = faker.number.int({ min: 3, max: 25 });
    const tip = Math.random() < 0.3 ? faker.number.int({ min: 1, max: 8 }) : 0;
    const fee = Math.round(amountUSD * 0.1 * 100) / 100;

    await prisma.payment.create({
      data: {
        amountUSD,
        tip,
        fee,
        status: PaymentStatus.PENDING,
        date: record.checkInAt,
        parkingRecordId: record.id,
        validation:
          method.type === PaymentMethodType.CASH
            ? ValidationType.MANUAL
            : ValidationType.AUTOMATIC,
        reference:
          method.type === PaymentMethodType.CASH
            ? null
            : `REF-${faker.string.numeric(6)}`,
        paymentMethodId: method.id,
        exchangeRate: CURRENT_EXCHANGE_RATE,
        amountBs: amountUSD * CURRENT_EXCHANGE_RATE,
      },
    });

    count++;
  }

  console.log(`${count} payments creados.`);
}

async function seedVehicleRequests(
  prisma: PrismaClient,
  allRecords: any[],
  clients: any[],
): Promise<void> {
  console.log('Creando vehicle requests...');

  // Pick 20 random records for requests
  const shuffled = [...allRecords].sort(() => Math.random() - 0.5).slice(0, 20);

  const statusDistribution: RequestStatus[] = [
    ...Array(8).fill(RequestStatus.PENDING),
    ...Array(7).fill(RequestStatus.IN_PROGRESS),
    ...Array(5).fill(RequestStatus.COMPLETED),
  ];

  const objectDescriptions = [
    'Cartera negra de cuero olvidada en el asiento trasero',
    'Teléfono Samsung Galaxy S22 en el porta-vasos',
    'Documentos importantes en la guantera',
    'Lentes de sol Ray-Ban en el tablero',
    'Cargador de laptop USB-C debajo del asiento',
    'Bolsa de compras con ropa en el maletero',
    'Libro azul en el asiento del copiloto',
    'Paraguas negro en el piso trasero',
    'Mochila gris con computadora portátil',
    'Billetera marrón con documentos en la consola central',
  ];

  for (let i = 0; i < 20; i++) {
    const record = shuffled[i];
    const client = randomFrom(clients);
    const status = statusDistribution[i];

    await prisma.vehicleRequest.create({
      data: {
        objectDescription: randomFrom(objectDescriptions),
        notes: Math.random() < 0.3 ? 'Por favor revisar con cuidado' : null,
        status,
        parkingRecordId: record.id,
        companyId: record.companyId,
        requestedById: client.id,
        resolvedAt:
          status === RequestStatus.COMPLETED
            ? new Date()
            : null,
      },
    });
  }

  console.log('20 vehicle requests creados (8 PENDING, 7 IN_PROGRESS, 5 COMPLETED).');
}


async function seedInvoices(
  prisma: PrismaClient,
  billingPlans: {
    companyAFlat: any;
    companyAMixed: any;
    companyBPlan: any;
    companyCPlan: any;
  },
  paymentMethodsMap: Record<string, any[]>,
  companies: { companyA: any; companyB: any; companyC: any },
): Promise<void> {
  console.log('Creando company invoices...');

  const invoicesData = [
    // Company A — Enero 2026 (MIXED)
    {
      companyPlanId: billingPlans.companyAMixed.id,
      amountUSD: 300 + 55 * 3 + 55 * 3 * 0.1,
      status: PaymentStatus.RECEIVED,
      date: new Date('2026-01-05'),
      reference: 'INV-2026-A-001',
      note: 'Factura Enero 2026 - Plan Mixto',
      validation: ValidationType.AUTOMATIC,
      planType: PlanType.MIXED,
      vehicleCount: 55,
      baseAmount: 300,
      vehicleAmount: 55 * 3,
      feeAmount: 55 * 3 * 0.1,
      periodStart: new Date('2025-12-01'),
      periodEnd: new Date('2025-12-31'),
      paymentMethodId: paymentMethodsMap[companies.companyA.id][1].id,
    },
    // Company A — Febrero 2026
    {
      companyPlanId: billingPlans.companyAMixed.id,
      amountUSD: 300 + 62 * 3 + 62 * 3 * 0.1,
      status: PaymentStatus.PENDING,
      date: new Date('2026-02-03'),
      reference: 'INV-2026-A-002',
      note: 'Factura Febrero 2026 - Plan Mixto',
      validation: ValidationType.AUTOMATIC,
      planType: PlanType.MIXED,
      vehicleCount: 62,
      baseAmount: 300,
      vehicleAmount: 62 * 3,
      feeAmount: 62 * 3 * 0.1,
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
      paymentMethodId: paymentMethodsMap[companies.companyA.id][1].id,
    },
    // Company B — Enero 2026
    {
      companyPlanId: billingPlans.companyBPlan.id,
      amountUSD: 38 * 5 + 38 * 1,
      status: PaymentStatus.RECEIVED,
      date: new Date('2026-01-07'),
      reference: 'INV-2026-B-001',
      note: 'Factura Enero 2026 - Por vehículo',
      validation: ValidationType.AUTOMATIC,
      planType: PlanType.PER_VEHICLE,
      vehicleCount: 38,
      baseAmount: null,
      vehicleAmount: 38 * 5,
      feeAmount: 38 * 1,
      periodStart: new Date('2025-12-01'),
      periodEnd: new Date('2025-12-31'),
      paymentMethodId: paymentMethodsMap[companies.companyB.id][0].id,
    },
    // Company B — Febrero 2026
    {
      companyPlanId: billingPlans.companyBPlan.id,
      amountUSD: 42 * 5 + 42 * 1,
      status: PaymentStatus.PENDING,
      date: new Date('2026-02-05'),
      reference: 'INV-2026-B-002',
      note: 'Factura Febrero 2026 - Por vehículo',
      validation: ValidationType.AUTOMATIC,
      planType: PlanType.PER_VEHICLE,
      vehicleCount: 42,
      baseAmount: null,
      vehicleAmount: 42 * 5,
      feeAmount: 42 * 1,
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
      paymentMethodId: paymentMethodsMap[companies.companyB.id][0].id,
    },
    // Company C — Enero 2026
    {
      companyPlanId: billingPlans.companyCPlan.id,
      amountUSD: 800,
      status: PaymentStatus.RECEIVED,
      date: new Date('2026-01-03'),
      reference: 'INV-2026-C-001',
      note: 'Factura Enero 2026 - Tasa fija',
      validation: ValidationType.MANUAL,
      planType: PlanType.FLAT_RATE,
      vehicleCount: 48,
      baseAmount: 800,
      vehicleAmount: null,
      feeAmount: null,
      periodStart: new Date('2025-12-01'),
      periodEnd: new Date('2025-12-31'),
      paymentMethodId: paymentMethodsMap[companies.companyC.id][2].id,
    },
    // Company C — Febrero 2026
    {
      companyPlanId: billingPlans.companyCPlan.id,
      amountUSD: 800,
      status: PaymentStatus.PENDING,
      date: new Date('2026-02-04'),
      reference: 'INV-2026-C-002',
      note: 'Factura Febrero 2026 - Tasa fija',
      validation: ValidationType.MANUAL,
      planType: PlanType.FLAT_RATE,
      vehicleCount: 51,
      baseAmount: 800,
      vehicleAmount: null,
      feeAmount: null,
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
      paymentMethodId: paymentMethodsMap[companies.companyC.id][2].id,
    },
  ];

  for (const inv of invoicesData) {
    await prisma.companyInvoice.create({ data: inv });
  }

  console.log(`${invoicesData.length} invoices creadas.`);
}

function printCredentialsTable(): void {
  const pad = (s: string, n: number) => s.padEnd(n, ' ');
  const ROL_W = 14;
  const EMAIL_W = 40;
  const PASS_W = 16;
  const SEP = `+${'-'.repeat(ROL_W + 2)}+${'-'.repeat(EMAIL_W + 2)}+${'-'.repeat(PASS_W + 2)}+`;

  console.log('\n' + SEP);
  console.log(
    `| ${pad('ROL', ROL_W)} | ${pad('EMAIL', EMAIL_W)} | ${pad('PASSWORD', PASS_W)} |`,
  );
  console.log(SEP);

  const rows: [string, string, string][] = [
    ['SUPER_ADMIN', 'superadmin@valetpark.com', 'super123'],
    ['ADMIN', 'admin@valetpark.com', 'admin123'],
    ['ADMIN', 'admin2@valetpark.com', 'admin123'],
    ['MANAGER', 'miguel.ramirez@valetpark.com', 'manager123'],
    ['MANAGER', 'laura.sanchez@valetpark.com', 'manager123'],
    ['MANAGER', 'pedro.flores@valetpark.com', 'manager123'],
    ['ATTENDANT', 'diego.lopez@valetpark.com', 'V-20000001'],
    ['ATTENDANT', 'sofia.morales@valetpark.com', 'V-20000002'],
    ['ATTENDANT', 'andres.cruz@valetpark.com', 'V-20000003'],
    ['ATTENDANT', 'valentina.reyes@valetpark.com', 'V-20000004'],
    ['ATTENDANT', 'gabriel.diaz@valetpark.com', 'V-20000005'],
    ['ATTENDANT', 'isabella.gomez@valetpark.com', 'V-20000006'],
    ['ATTENDANT', 'rafael.hernandez@valetpark.com', 'V-20000007'],
    ['ATTENDANT', 'camila.rivera@valetpark.com', 'V-20000008'],
    ['CLIENT x60', 'faker-generated @mail.com', '123456'],
  ];

  for (const [rol, email, pass] of rows) {
    console.log(
      `| ${pad(rol, ROL_W)} | ${pad(email, EMAIL_W)} | ${pad(pass, PASS_W)} |`,
    );
  }

  console.log(SEP + '\n');
}

// ── Main ──────────────────────────────────────────────────

async function main(): Promise<void> {
  await clearDatabase(prisma);
  await seedCarBrands(prisma);

  // 1. Subscription plans
  const plans = await seedSubscriptionPlans(prisma);

  // 2. Companies
  const companies = await seedCompanies(prisma, plans);

  // 3. Payment methods
  const paymentMethodsMap = await seedPaymentMethods(prisma, companies);

  // 4. Billing plans
  const billingPlans = await seedBillingPlans(prisma, companies);

  // 5. Super admin
  await seedSuperAdmin(prisma);

  // 6. Admins
  const admins = await seedAdmins(prisma, companies);

  // adminPrincipal is connected to all 3 companies; use it as the opener for every workday
  const adminsByCompany: Record<string, any> = {
    [companies.companyA.id]: admins.adminPrincipal,
    [companies.companyB.id]: admins.adminPrincipal,
    [companies.companyC.id]: admins.adminPrincipal,
  };

  // 6b. Workdays (one closed historical + one active workday per company)
  const { closedWorkdayMap, activeWorkdayMap } = await seedWorkdays(prisma, companies, adminsByCompany);

  // 7. Managers
  await seedManagers(prisma, companies);

  // 8. Attendants
  const attendantsByCompany = await seedAttendants(prisma, companies);

  // 9. Valets
  const valetsByCompany = await seedValets(prisma, companies);

  // 10. Clients
  const clients = await seedClients(prisma);

  // 11. Vehicles
  const vehiclesByClient = await seedVehicles(prisma, clients);

  // 12-15. Parking records
  const records = await seedParkingRecords(
    prisma,
    companies,
    attendantsByCompany,
    valetsByCompany,
    clients,
    vehiclesByClient,
    closedWorkdayMap,
    activeWorkdayMap,
  );

  const allRecords = [
    ...records.freeRecords,
    ...records.paidRecords,
    ...records.unpaidRecords,
    ...records.reviewRecords,
  ];

  // 16. Payments
  await seedPayments(prisma, records, paymentMethodsMap, clients);

  // 17. Vehicle requests
  await seedVehicleRequests(prisma, allRecords, clients);

  // 18. Company invoices
  await seedInvoices(prisma, billingPlans, paymentMethodsMap, companies);

  console.log('\n========== SEED COMPLETADO ==========');
  printCredentialsTable();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
