import {
  PrismaClient,
  UserRole,
  PaymentMethodType,
  ValidationType,
  PaymentStatus,
  PlanType,
  FeeType,
  ParkingRecordStatus,
} from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

// ── Helpers ────────────────────────────────────────────────
const hash = (pw: string) => bcrypt.hash(pw, 10);

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime()),
  );
}

function generatePlate(): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const l = () => letters[Math.floor(Math.random() * letters.length)];
  const n = () => Math.floor(Math.random() * 10);
  return `${l()}${l()}${l()}${n()}${n()}${l()}${n()}`;
}

// ── Realistic data pools ──────────────────────────────────
const BRANDS_MODELS: { brand: string; models: string[] }[] = [
  { brand: "Toyota", models: ["Corolla", "Camry", "RAV4", "Hilux", "Yaris"] },
  {
    brand: "Chevrolet",
    models: ["Aveo", "Cruze", "Spark", "Silverado", "Tracker"],
  },
  { brand: "Ford", models: ["Fiesta", "Focus", "Explorer", "F-150", "Escape"] },
  { brand: "Hyundai", models: ["Accent", "Tucson", "Elantra", "Santa Fe"] },
  { brand: "Kia", models: ["Rio", "Sportage", "Seltos", "Forte"] },
  { brand: "Honda", models: ["Civic", "CR-V", "Accord", "HR-V"] },
  { brand: "Nissan", models: ["Sentra", "Versa", "Kicks", "Frontier"] },
  { brand: "Volkswagen", models: ["Gol", "Jetta", "Tiguan", "Polo"] },
];

const COLORS = [
  "Blanco",
  "Negro",
  "Gris",
  "Plata",
  "Rojo",
  "Azul",
  "Verde",
  "Dorado",
  "Marrón",
  "Beige",
];

const FIRST_NAMES = [
  "Carlos",
  "María",
  "José",
  "Ana",
  "Luis",
  "Carmen",
  "Pedro",
  "Rosa",
  "Miguel",
  "Laura",
  "Diego",
  "Sofía",
  "Andrés",
  "Valentina",
  "Gabriel",
  "Isabella",
  "Rafael",
  "Camila",
  "Fernando",
  "Daniela",
  "Alejandro",
  "Gabriela",
  "Ricardo",
  "Natalia",
];

const LAST_NAMES = [
  "García",
  "Rodríguez",
  "Martínez",
  "López",
  "González",
  "Hernández",
  "Pérez",
  "Sánchez",
  "Ramírez",
  "Torres",
  "Flores",
  "Rivera",
  "Gómez",
  "Díaz",
  "Morales",
  "Reyes",
  "Cruz",
  "Ortiz",
  "Gutiérrez",
  "Mendoza",
];

function randomName(): string {
  return `${randomFrom(FIRST_NAMES)} ${randomFrom(LAST_NAMES)}`;
}

function randomVehicle() {
  const brandData = randomFrom(BRANDS_MODELS);
  return {
    brand: brandData.brand,
    model: randomFrom(brandData.models),
    color: randomFrom(COLORS),
    plate: generatePlate(),
  };
}

// ── Main seed ─────────────────────────────────────────────
async function main() {
  console.log("Limpiando base de datos...");
  await prisma.payment.deleteMany();
  await prisma.companyInvoice.deleteMany();
  await prisma.vehicleRequest.deleteMany();
  await prisma.parkingRecord.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.companyPlan.deleteMany();
  await prisma.paymentMethod.deleteMany();
  await prisma.companyUser.deleteMany();
  await prisma.valet.deleteMany();
  await prisma.user.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.company.deleteMany();
  console.log("Base de datos limpia.");

  // ────────────────────────────────────────────────────────
  // 1. COMPANIES
  // ────────────────────────────────────────────────────────
  const companyA = await prisma.company.create({
    data: { name: "Estacionamiento Centro Plaza" },
  });
  const companyB = await prisma.company.create({
    data: { name: "Parking Aeropuerto Internacional" },
  });
  const companyC = await prisma.company.create({
    data: { name: "Valet Mall del Este" },
  });

  console.log("Companies creadas.");

  // ────────────────────────────────────────────────────────
  // 2. PAYMENT METHODS (por company)
  // ────────────────────────────────────────────────────────
  const paymentMethodsMap: Record<string, any[]> = {};

  for (const company of [companyA, companyB, companyC]) {
    const methods = await Promise.all([
      prisma.paymentMethod.create({
        data: {
          name: "Pago Movil",
          form: "0412-1234567 / CI: 12345678 / Banco Venezuela",
          type: PaymentMethodType.MOBILE_PAYMENT,
          companyId: company.id,
        },
      }),
      prisma.paymentMethod.create({
        data: {
          name: "Zelle",
          form: "pagos@empresa.com",
          type: PaymentMethodType.ZELLE,
          companyId: company.id,
        },
      }),
      prisma.paymentMethod.create({
        data: {
          name: "Efectivo USD",
          form: "Pago directo en caja",
          type: PaymentMethodType.CASH,
          companyId: company.id,
        },
      }),
      prisma.paymentMethod.create({
        data: {
          name: "Binance Pay",
          form: "ID: 987654321",
          type: PaymentMethodType.BINANCE,
          companyId: company.id,
        },
      }),
      prisma.paymentMethod.create({
        data: {
          name: "Punto de venta",
          form: "Banco Mercantil - Terminal #4",
          type: PaymentMethodType.CARD,
          companyId: company.id,
        },
      }),
    ]);
    paymentMethodsMap[company.id] = methods;
  }

  console.log("Payment methods creados.");

  // ────────────────────────────────────────────────────────
  // 3. COMPANY PLANS (con historial)
  // ────────────────────────────────────────────────────────

  // Company A: empezo con FLAT_RATE, migro a MIXED
  const companyAFlat = await prisma.companyPlan.create({
    data: {
      companyId: companyA.id,
      planType: PlanType.FLAT_RATE,
      flatRate: 500,
      isActive: false,
      createdAt: new Date("2025-06-01"),
    },
  });

  const companyAMixed = await prisma.companyPlan.create({
    data: {
      companyId: companyA.id,
      planType: PlanType.MIXED,
      basePrice: 300,
      perVehicleRate: 3,
      feeType: FeeType.PERCENTAGE,
      feeValue: 10,
      isActive: true,
      createdAt: new Date("2025-12-01"),
    },
  });

  // Company B
  const companyBPlan = await prisma.companyPlan.create({
    data: {
      companyId: companyB.id,
      planType: PlanType.PER_VEHICLE,
      perVehicleRate: 5,
      feeType: FeeType.FIXED,
      feeValue: 1,
      isActive: true,
      createdAt: new Date("2025-09-01"),
    },
  });

  // Company C
  const companyCPlan = await prisma.companyPlan.create({
    data: {
      companyId: companyC.id,
      planType: PlanType.FLAT_RATE,
      flatRate: 800,
      isActive: true,
      createdAt: new Date("2025-10-01"),
    },
  });

  console.log("Company plans creados.");

  // ────────────────────────────────────────────────────────
  // 4. SUPER ADMIN
  // ────────────────────────────────────────────────────────
  await prisma.user.create({
    data: {
      email: "superadmin@valetpark.com",
      password: await hash("super123"),
      name: "Roberto Mendoza",
      role: UserRole.SUPER_ADMIN,
      phone: "0414-9876543",
      idNumber: "V-10000001",
    },
  });

  console.log("Super Admin creado.");

  // ────────────────────────────────────────────────────────
  // 5. ADMIN con 3 COMPANIES (el principal)
  // ────────────────────────────────────────────────────────
  const adminPrincipal = await prisma.user.create({
    data: {
      email: "admin@valetpark.com",
      password: await hash("admin123"),
      name: "Carlos García",
      role: UserRole.ADMIN,
      phone: "0412-5551234",
      idNumber: "V-15000001",
    },
  });

  // Conectar admin a las 3 companies via CompanyUser
  for (const company of [companyA, companyB, companyC]) {
    await prisma.companyUser.create({
      data: { userId: adminPrincipal.id, companyId: company.id },
    });
  }

  // Segundo admin (solo company C)
  const admin2 = await prisma.user.create({
    data: {
      email: "admin2@valetpark.com",
      password: await hash("admin123"),
      name: "Ana Torres",
      role: UserRole.ADMIN,
      phone: "0414-5559876",
      idNumber: "V-15000002",
    },
  });
  await prisma.companyUser.create({
    data: { userId: admin2.id, companyId: companyC.id },
  });

  console.log("Admins creados y conectados.");

  // ────────────────────────────────────────────────────────
  // 6. MANAGERS (1 por company)
  // ────────────────────────────────────────────────────────
  const managersData = [
    {
      name: "Miguel Ramírez",
      email: "miguel.ramirez@valetpark.com",
      idNumber: "V-16000001",
      phone: "0424-1110001",
      companyId: companyA.id,
    },
    {
      name: "Laura Sánchez",
      email: "laura.sanchez@valetpark.com",
      idNumber: "V-16000002",
      phone: "0424-1110002",
      companyId: companyB.id,
    },
    {
      name: "Pedro Flores",
      email: "pedro.flores@valetpark.com",
      idNumber: "V-16000003",
      phone: "0424-1110003",
      companyId: companyC.id,
    },
  ];

  for (const m of managersData) {
    const user = await prisma.user.create({
      data: {
        email: m.email,
        password: await hash("manager123"),
        name: m.name,
        role: UserRole.MANAGER,
        phone: m.phone,
        idNumber: m.idNumber,
      },
    });
    await prisma.companyUser.create({
      data: { userId: user.id, companyId: m.companyId },
    });
  }

  console.log("Managers creados.");

  // ────────────────────────────────────────────────────────
  // 7. ATTENDANTS (2-3 por company)
  // ────────────────────────────────────────────────────────
  const attendantsData = [
    // Company A
    {
      name: "Diego López",
      email: "diego.lopez@valetpark.com",
      idNumber: "V-20000001",
      phone: "0412-2220001",
      companyId: companyA.id,
    },
    {
      name: "Sofía Morales",
      email: "sofia.morales@valetpark.com",
      idNumber: "V-20000002",
      phone: "0412-2220002",
      companyId: companyA.id,
    },
    {
      name: "Andrés Cruz",
      email: "andres.cruz@valetpark.com",
      idNumber: "V-20000003",
      phone: "0412-2220003",
      companyId: companyA.id,
    },
    // Company B
    {
      name: "Valentina Reyes",
      email: "valentina.reyes@valetpark.com",
      idNumber: "V-20000004",
      phone: "0412-2220004",
      companyId: companyB.id,
    },
    {
      name: "Gabriel Díaz",
      email: "gabriel.diaz@valetpark.com",
      idNumber: "V-20000005",
      phone: "0412-2220005",
      companyId: companyB.id,
    },
    // Company C
    {
      name: "Isabella Gómez",
      email: "isabella.gomez@valetpark.com",
      idNumber: "V-20000006",
      phone: "0412-2220006",
      companyId: companyC.id,
    },
    {
      name: "Rafael Hernández",
      email: "rafael.hernandez@valetpark.com",
      idNumber: "V-20000007",
      phone: "0412-2220007",
      companyId: companyC.id,
    },
    {
      name: "Camila Rivera",
      email: "camila.rivera@valetpark.com",
      idNumber: "V-20000008",
      phone: "0412-2220008",
      companyId: companyC.id,
    },
  ];

  const attendantsByCompany: Record<string, any[]> = {
    [companyA.id]: [],
    [companyB.id]: [],
    [companyC.id]: [],
  };

  for (const att of attendantsData) {
    const user = await prisma.user.create({
      data: {
        email: att.email,
        password: await hash(att.idNumber),
        name: att.name,
        role: UserRole.ATTENDANT,
        phone: att.phone,
        idNumber: att.idNumber,
      },
    });
    await prisma.companyUser.create({
      data: { userId: user.id, companyId: att.companyId },
    });
    attendantsByCompany[att.companyId].push(user);
  }

  console.log("Attendants creados.");

  // ────────────────────────────────────────────────────────
  // 8. VALETS (2-3 por company)
  // ────────────────────────────────────────────────────────
  const valetsData = [
    // Company A
    { name: "Juan Pérez", idNumber: "V-25000001", companyId: companyA.id },
    { name: "Marco Gutiérrez", idNumber: "V-25000002", companyId: companyA.id },
    { name: "Luis Ortiz", idNumber: "V-25000003", companyId: companyA.id },
    // Company B
    { name: "Roberto Silva", idNumber: "V-25000004", companyId: companyB.id },
    { name: "Tomás Mendoza", idNumber: "V-25000005", companyId: companyB.id },
    // Company C
    {
      name: "Enrique Castillo",
      idNumber: "V-25000006",
      companyId: companyC.id,
    },
    { name: "Nicolás Vargas", idNumber: "V-25000007", companyId: companyC.id },
    { name: "Sebastián Rojas", idNumber: "V-25000008", companyId: companyC.id },
  ];

  const valetsByCompany: Record<string, any[]> = {
    [companyA.id]: [],
    [companyB.id]: [],
    [companyC.id]: [],
  };

  for (const v of valetsData) {
    const valet = await prisma.valet.create({
      data: { name: v.name, idNumber: v.idNumber, companyId: v.companyId },
    });
    valetsByCompany[v.companyId].push(valet);
  }

  console.log("Valets creados.");

  // ────────────────────────────────────────────────────────
  // 9. CLIENTS + VEHICLES
  // ────────────────────────────────────────────────────────
  const clients: any[] = [];

  for (let i = 1; i <= 40; i++) {
    const name = randomName();
    const idNum = `V-${30000000 + i}`;
    const client = await prisma.user.create({
      data: {
        email: `cliente${i}@mail.com`,
        password: await hash("123456"),
        name,
        role: UserRole.CLIENT,
        phone: `04${randomBetween(12, 26)}-${randomBetween(1000000, 9999999)}`,
        idNumber: idNum,
      },
    });

    // 1-3 vehiculos por cliente
    const vehicleCount = randomBetween(1, 3);
    const vehicleIds: string[] = [];
    for (let v = 0; v < vehicleCount; v++) {
      const vData = randomVehicle();
      const vehicle = await prisma.vehicle.create({
        data: { ...vData, ownerId: client.id },
      });
      vehicleIds.push(vehicle.id);
    }

    clients.push({ ...client, vehicleIds });
  }

  console.log(`${clients.length} clientes con vehiculos creados.`);

  // ────────────────────────────────────────────────────────
  // 10. PARKING RECORDS + PAYMENTS (45 dias de datos)
  // ────────────────────────────────────────────────────────
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);

  const companiesArr = [companyA, companyB, companyC];

  // Distribucion por status: A=alta, B=media, C=alta
  const recordsPerCompany: Record<
    string,
    { free: number; paid: number; unpaid: number }
  > = {
    [companyA.id]: { free: 150, paid: 18, unpaid: 12 },
    [companyB.id]: { free: 80, paid: 13, unpaid: 7 },
    [companyC.id]: { free: 120, paid: 22, unpaid: 8 },
  };

  const parkingFees = [3, 5, 8, 10, 12, 15, 20];
  const noteOptions = [
    "Cliente VIP",
    "Vehiculo con rayones previos",
    "Estacionado en zona premium",
    "Llave entregada en recepcion",
    "Solicito lavado adicional",
    "Recoger antes de las 6pm",
  ];
  let totalRecords = 0;

  for (const company of companiesArr) {
    const companyValets = valetsByCompany[company.id];
    const companyAttendants = attendantsByCompany[company.id];
    const companyMethods = paymentMethodsMap[company.id];
    const counts = recordsPerCompany[company.id];

    const recordTypes: Array<{ status: ParkingRecordStatus; count: number }> = [
      { status: ParkingRecordStatus.FREE, count: counts.free },
      { status: ParkingRecordStatus.PAID, count: counts.paid },
      { status: ParkingRecordStatus.UNPAID, count: counts.unpaid },
    ];

    for (const { status, count } of recordTypes) {
      for (let i = 0; i < count; i++) {
        const client = randomFrom(clients);
        const vData = randomVehicle();
        const registerAttendant = randomFrom(companyAttendants);
        const checkInValet = randomFrom(companyValets);

        let checkInAt: Date;
        let checkOutAt: Date | null = null;
        let checkOutValetId: string | null = null;

        if (status === ParkingRecordStatus.FREE) {
          // Siempre fechas pasadas
          checkInAt = randomDate(fortyFiveDaysAgo, yesterday);
          const durationHours = randomBetween(1, 12);
          const tentativeCheckOut = new Date(
            checkInAt.getTime() + durationHours * 60 * 60 * 1000,
          );
          checkOutAt = tentativeCheckOut < now ? tentativeCheckOut : yesterday;
          checkOutValetId = randomFrom(companyValets).id;
        } else {
          // PAID y UNPAID: siempre hoy
          checkInAt = new Date();
        }

        const parkingRecord = await prisma.parkingRecord.create({
          data: {
            plate: vData.plate,
            brand: vData.brand,
            model: vData.model,
            color: vData.color,
            status,
            checkInAt,
            checkOutAt,
            ownerId: client.id,
            companyId: company.id,
            registerRecordId: registerAttendant.id,
            checkInValetId: checkInValet.id,
            checkOutValetId,
            notes: Math.random() < 0.15 ? randomFrom(noteOptions) : null,
          },
        });

        // FREE: pago en su mayoría RECEIVED | PAID: pago RECEIVED (ya confirmado)
        // UNPAID: sin pago
        if (
          status === ParkingRecordStatus.FREE ||
          status === ParkingRecordStatus.PAID
        ) {
          const baseFee = randomFrom(parkingFees);
          const tip = Math.random() < 0.35 ? randomBetween(1, 5) : 0;
          const method = randomFrom(companyMethods);

          const paymentStatus =
            status === ParkingRecordStatus.FREE
              ? Math.random() < 0.92
                ? PaymentStatus.RECEIVED
                : PaymentStatus.PENDING
              : PaymentStatus.RECEIVED; // PAID siempre tiene pago confirmado

          const paymentDate = checkOutAt ?? new Date();

          await prisma.payment.create({
            data: {
              amountUSD: baseFee,
              tip,
              status: paymentStatus,
              date: paymentDate,
              parkingRecordId: parkingRecord.id,
              fee: baseFee * 0.1,
              validation:
                method.type === PaymentMethodType.CASH
                  ? ValidationType.MANUAL
                  : ValidationType.AUTOMATIC,
              reference:
                method.type === PaymentMethodType.CASH
                  ? null
                  : `REF-${randomBetween(100000, 999999)}`,
              processedById: registerAttendant.id,
              paymentMethodId: method.id,
            },
          });
        }

        totalRecords++;
      }
    }

    const total = counts.free + counts.paid + counts.unpaid;
    console.log(
      `  ${company.name}: ${total} records (${counts.free} FREE, ${counts.paid} PAID, ${counts.unpaid} UNPAID).`,
    );
  }

  console.log(`Total: ${totalRecords} parking records.`);

  // ────────────────────────────────────────────────────────
  // 11. COMPANY INVOICES (ultimo mes + mes anterior)
  // ────────────────────────────────────────────────────────
  const invoicesData = [
    // Company A - Enero 2026 (MIXED)
    {
      companyPlanId: companyAMixed.id,
      amountUSD: 300 + 55 * 3 + 55 * 3 * 0.1,
      status: PaymentStatus.RECEIVED,
      date: new Date("2026-01-05"),
      reference: "INV-2026-A-001",
      note: "Factura Enero 2026 - Plan Mixto",
      validation: ValidationType.AUTOMATIC,
      planType: PlanType.MIXED,
      vehicleCount: 55,
      baseAmount: 300,
      vehicleAmount: 55 * 3,
      feeAmount: 55 * 3 * 0.1,
      periodStart: new Date("2025-12-01"),
      periodEnd: new Date("2025-12-31"),
      paymentMethodId: paymentMethodsMap[companyA.id][1].id,
    },

    // Company A - Febrero 2026
    {
      companyPlanId: companyAMixed.id,
      amountUSD: 300 + 62 * 3 + 62 * 3 * 0.1,
      status: PaymentStatus.PENDING,
      date: new Date("2026-02-03"),
      reference: "INV-2026-A-002",
      note: "Factura Febrero 2026 - Plan Mixto",
      validation: ValidationType.AUTOMATIC,
      planType: PlanType.MIXED,
      vehicleCount: 62,
      baseAmount: 300,
      vehicleAmount: 62 * 3,
      feeAmount: 62 * 3 * 0.1,
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-01-31"),
      paymentMethodId: paymentMethodsMap[companyA.id][1].id,
    },

    // Company B - Enero 2026
    {
      companyPlanId: companyBPlan.id,
      amountUSD: 38 * 5 + 38 * 1,
      status: PaymentStatus.RECEIVED,
      date: new Date("2026-01-07"),
      reference: "INV-2026-B-001",
      note: "Factura Enero 2026 - Por vehículo",
      validation: ValidationType.AUTOMATIC,
      planType: PlanType.PER_VEHICLE,
      vehicleCount: 38,
      baseAmount: null,
      vehicleAmount: 38 * 5,
      feeAmount: 38 * 1,
      periodStart: new Date("2025-12-01"),
      periodEnd: new Date("2025-12-31"),
      paymentMethodId: paymentMethodsMap[companyB.id][0].id,
    },

    // Company B - Febrero 2026
    {
      companyPlanId: companyBPlan.id,
      amountUSD: 42 * 5 + 42 * 1,
      status: PaymentStatus.PENDING,
      date: new Date("2026-02-05"),
      reference: "INV-2026-B-002",
      note: "Factura Febrero 2026 - Por vehículo",
      validation: ValidationType.AUTOMATIC,
      planType: PlanType.PER_VEHICLE,
      vehicleCount: 42,
      baseAmount: null,
      vehicleAmount: 42 * 5,
      feeAmount: 42 * 1,
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-01-31"),
      paymentMethodId: paymentMethodsMap[companyB.id][0].id,
    },

    // Company C - Enero 2026
    {
      companyPlanId: companyCPlan.id,
      amountUSD: 800,
      status: PaymentStatus.RECEIVED,
      date: new Date("2026-01-03"),
      reference: "INV-2026-C-001",
      note: "Factura Enero 2026 - Tasa fija",
      validation: ValidationType.MANUAL,
      planType: PlanType.FLAT_RATE,
      vehicleCount: 48,
      baseAmount: 800,
      vehicleAmount: null,
      feeAmount: null,
      periodStart: new Date("2025-12-01"),
      periodEnd: new Date("2025-12-31"),
      paymentMethodId: paymentMethodsMap[companyC.id][2].id,
    },

    // Company C - Febrero 2026
    {
      companyPlanId: companyCPlan.id,
      amountUSD: 800,
      status: PaymentStatus.PENDING,
      date: new Date("2026-02-04"),
      reference: "INV-2026-C-002",
      note: "Factura Febrero 2026 - Tasa fija",
      validation: ValidationType.MANUAL,
      planType: PlanType.FLAT_RATE,
      vehicleCount: 51,
      baseAmount: 800,
      vehicleAmount: null,
      feeAmount: null,
      periodStart: new Date("2026-01-01"),
      periodEnd: new Date("2026-01-31"),
      paymentMethodId: paymentMethodsMap[companyC.id][2].id,
    },
  ];

  for (const inv of invoicesData) {
    await prisma.companyInvoice.create({ data: inv });
  }

  console.log(`${invoicesData.length} invoices creadas.`);

  // ────────────────────────────────────────────────────────
  // RESUMEN
  // ────────────────────────────────────────────────────────
  console.log("\n========== SEED COMPLETADO ==========");
  console.log("Credenciales de acceso:");
  console.log("  Super Admin: superadmin@valetpark.com / super123");
  console.log("  Admin (3 companies): admin@valetpark.com / admin123");
  console.log("  Admin (1 company):   admin2@valetpark.com / admin123");
  console.log(
    "  Managers: miguel.ramirez@ / laura.sanchez@ / pedro.flores@ (manager123)",
  );
  console.log("  Attendants: password = su numero de cedula");
  console.log("======================================\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
