import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { WorkdaysService } from "../workdays/workdays.service";
import { RegisterVehicleDto } from "./dto/register-vehicle.dto";
import { CheckoutVehicleDto } from "./dto/checkout-vehicle.dto";
import { AddMyVehicleDto } from "./dto/add-my-vehicle.dto";
import { Prisma, ParkingRecordStatus, PaymentStatus, UserRole, NotificationType, WorkdayStatus } from "@prisma/client";
import { FilterVehiclesDto } from "./dto/filter-vehicles.dto";
import { UpdateParkingRecordStatusDto } from "./dto/update-parking-record-status.dto";
import * as bcrypt from "bcrypt";

function normalizeId(id: string): string {
  return id.trim().replace(/[^0-9]/g, '');
}

@Injectable()
export class VehiclesService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private workdaysService: WorkdaysService,
  ) {}

  async registerVehicle(dto: RegisterVehicleDto, registerRecordId: string, companyId?: string) {
    // Resolve plate when only vehicleId is provided (no plate in payload)
    let resolvedPlate = dto.plate;
    if (!resolvedPlate && dto.vehicleId) {
      const v = await this.prisma.vehicle.findUnique({
        where: { id: dto.vehicleId },
        select: { plate: true },
      });
      resolvedPlate = v?.plate;
    }

    // Only check for conflict if we know the plate
    if (resolvedPlate) {
      const existingRecord = await this.prisma.parkingRecord.findFirst({
        where: {
          plate: resolvedPlate,
          status: { not: ParkingRecordStatus.FREE },
        },
      });
      if (existingRecord) {
        throw new ConflictException(
          "Vehicle with this plate is already checked in",
        );
      }
    }

    // checkInValetId apunta a Valet (no User), solo asignar si se provee
    const checkInValetId = dto.valetId || undefined;

    // Look up the active workday for the company (outside the transaction — read-only)
    const activeWorkday = companyId
      ? await this.prisma.workday.findFirst({
          where: { companyId, status: WorkdayStatus.ACTIVE },
          select: { id: true },
        })
      : null;

    if (companyId && !activeWorkday) {
      throw new BadRequestException(
        'No active workday for this company. Open a workday before registering vehicles.',
      );
    }

    // 2. Buscar usuario por userId, idNumber o email
    let user = null;

    if (dto.userId) {
      user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        include: { ownedVehicles: true },
      });
    } else if (dto.idNumber) {
      const normalized = normalizeId(dto.idNumber);
      user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { idNumber: dto.idNumber },
            { idNumber: normalized },
          ],
        },
        include: { ownedVehicles: true },
      });
    } else if (dto.email) {
      user = await this.prisma.user.findUnique({
        where: { email: dto.email },
        include: { ownedVehicles: true },
      });
    }

    // 3a. Usuario EXISTE
    if (user) {
      let vehicle = null;

      if (dto.vehicleId) {
        vehicle = user.ownedVehicles.find((v) => v.id === dto.vehicleId);
      } else {
        vehicle = user.ownedVehicles.find((v) => v.plate === dto.plate);
      }

      // Si el vehiculo no esta registrado, crearlo
      if (!vehicle && dto.plate) {
        vehicle = await this.prisma.vehicle.create({
          data: {
            plate: dto.plate,
            brand: dto.brand,
            model: dto.model,
            color: dto.color,
            ownerId: user.id,
          },
        });
      }

      const finalVehicle = vehicle;
      const ownerId = user.id;

      const parkingRecord = await this.prisma.$transaction(async (tx) => {
        const { workdayId, ticketNumber } = await this.resolveTicketNumber(
          tx,
          activeWorkday?.id,
          dto.ticketNumber,
        );

        return tx.parkingRecord.create({
          data: {
            plate: finalVehicle?.plate ?? dto.plate,
            brand: finalVehicle?.brand ?? dto.brand,
            model: finalVehicle?.model ?? dto.model,
            color: finalVehicle?.color ?? dto.color,
            ownerId,
            registerRecordId,
            checkInValetId,
            companyId: companyId || undefined,
            workdayId,
            ticketNumber,
          },
        });
      });

      return { parkingRecord, isNewUser: false };
    }

    // 3b. Usuario NO existe - crear usuario, vehiculo y parkingRecord

    // Verificar unicidad de email e idNumber antes de intentar crear
    if (dto.email) {
      const emailExists = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (emailExists) {
        throw new ConflictException('El correo electrónico ya está registrado en el sistema.');
      }
    }
    if (dto.idNumber) {
      const normalized = normalizeId(dto.idNumber);
      const idExists = await this.prisma.user.findFirst({
        where: { OR: [{ idNumber: dto.idNumber }, { idNumber: normalized }] },
      });
      if (idExists) {
        throw new ConflictException('La cédula de identidad ya está registrada en el sistema.');
      }
    }

    const password = await bcrypt.hash(dto.idNumber || dto.email, 10);

    const newUser = await this.prisma.user.create({
      data: {
        email: dto.email || `${(dto.idNumber ?? '').replace(/\W/g, '')}@noemail.getmycarro.com`,
        idNumber: dto.idNumber ? normalizeId(dto.idNumber) : undefined,
        name: dto.name,
        phone: dto.phone || undefined,
        password,
        role: UserRole.CLIENT,
        ownedVehicles: {
          create: {
            plate: dto.plate,
            brand: dto.brand,
            model: dto.model,
            color: dto.color,
          },
        },
      },
      include: {
        ownedVehicles: true,
      },
    });

    const newUserId = newUser.id;

    const parkingRecord = await this.prisma.$transaction(async (tx) => {
      const { workdayId, ticketNumber } = await this.resolveTicketNumber(
        tx,
        activeWorkday?.id,
        dto.ticketNumber,
      );

      return tx.parkingRecord.create({
        data: {
          plate: dto.plate,
          brand: dto.brand,
          model: dto.model,
          color: dto.color,
          ownerId: newUserId,
          registerRecordId,
          checkInValetId,
          companyId: companyId || undefined,
          workdayId,
          ticketNumber,
        },
      });
    });

    return { parkingRecord, isNewUser: true };
  }

  /**
   * Resuelve el ticketNumber para un nuevo ParkingRecord dentro de una transacción.
   * - Sin workday activo → sin número (comportamiento previo).
   * - Con número solicitado → valida que esté libre en el turno (status != FREE)
   *   y ajusta el contador para que los autogenerados futuros no choquen.
   * - Sin número solicitado → autoincrementa el contador del workday.
   */
  private async resolveTicketNumber(
    tx: Prisma.TransactionClient,
    activeWorkdayId: string | undefined,
    requested?: number,
  ): Promise<{ workdayId: string | undefined; ticketNumber: number | undefined }> {
    if (!activeWorkdayId) {
      return { workdayId: undefined, ticketNumber: undefined };
    }

    if (requested != null) {
      const inUse = await tx.parkingRecord.findFirst({
        where: {
          workdayId: activeWorkdayId,
          ticketNumber: requested,
          status: { not: ParkingRecordStatus.FREE },
        },
        select: { id: true },
      });
      if (inUse) {
        throw new ConflictException(
          `El número de ticket ${requested} ya está en uso`,
        );
      }

      // Mantener el contador por delante para que los autogenerados no choquen.
      const workday = await tx.workday.findUnique({
        where: { id: activeWorkdayId },
        select: { lastTicketNumber: true },
      });
      if (workday && requested > workday.lastTicketNumber) {
        await tx.workday.update({
          where: { id: activeWorkdayId },
          data: { lastTicketNumber: requested },
        });
      }

      return { workdayId: activeWorkdayId, ticketNumber: requested };
    }

    const updated = await tx.workday.update({
      where: { id: activeWorkdayId },
      data: { lastTicketNumber: { increment: 1 } },
      select: { lastTicketNumber: true },
    });
    return { workdayId: activeWorkdayId, ticketNumber: updated.lastTicketNumber };
  }

  /**
   * Números de ticket actualmente ocupados (vehículos sin entregar) en el
   * turno activo de la empresa — para sugerir números libres al registrar.
   */
  async getActiveTickets(companyId?: string) {
    const activeWorkday = companyId
      ? await this.prisma.workday.findFirst({
          where: { companyId, status: WorkdayStatus.ACTIVE },
          select: { id: true, lastTicketNumber: true },
        })
      : null;

    if (!activeWorkday) {
      return { used: [], lastTicketNumber: 0 };
    }

    const records = await this.prisma.parkingRecord.findMany({
      where: {
        workdayId: activeWorkday.id,
        status: { not: ParkingRecordStatus.FREE },
        ticketNumber: { not: null },
      },
      select: { ticketNumber: true },
      orderBy: { ticketNumber: "asc" },
    });

    return {
      used: records.map((r) => r.ticketNumber as number),
      lastTicketNumber: activeWorkday.lastTicketNumber,
    };
  }

  async getUserVehicles(idNumber: string) {
    const normalized = normalizeId(idNumber);
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { idNumber: idNumber },
          { idNumber: normalized },
        ],
      },
      include: { ownedVehicles: { where: { deletedAt: null } } },
    });

    if (!user) return null;

    const activeRecords = await this.prisma.parkingRecord.findMany({
      where: {
        ownerId: user.id,
        status: { not: ParkingRecordStatus.FREE },
      },
      select: { plate: true },
    });

    const activePlates = new Set(activeRecords.map((r) => r.plate));

    return {
      ...user,
      ownedVehicles: user.ownedVehicles.filter((v) => !activePlates.has(v.plate)),
    };
  }

  async checkoutVehicle(id: string, dto: CheckoutVehicleDto) {
    const parkingRecord = await this.prisma.parkingRecord.findUnique({
      where: { id },
    });

    if (!parkingRecord) {
      throw new NotFoundException("Parking record not found");
    }

    if (parkingRecord.status === ParkingRecordStatus.FREE) {
      throw new ConflictException("Vehicle already checked out");
    }

    if (parkingRecord.status === ParkingRecordStatus.UNPAID) {
      throw new BadRequestException(
        "Vehicle must be paid before checkout",
      );
    }

    const updatedRecord = await this.prisma.parkingRecord.update({
      where: { id },
      data: {
        status: ParkingRecordStatus.FREE,
        checkOutAt: dto.checkOutAt || new Date(),
        checkOutValetId: dto.checkOutValet || undefined,
        notes: dto.notes || undefined,
      },
      include: {
        payments: true,
        checkOutValet: {
          select: { id: true, name: true, idNumber: true },
        },
      },
    });

    return updatedRecord;
  }

  async getValets() {
    return this.prisma.valet.findMany({
      select: {
        id: true,
        name: true,
        idNumber: true,
      },
      orderBy: { name: "asc" },
    });
  }

  async searchVehicles(query: { idNumber?: string }) {
    if (query.idNumber) {
      const parkingRecords = await this.prisma.parkingRecord.findMany({
        where: {
          checkInValet: {
            idNumber: query.idNumber,
          },
          status: { not: ParkingRecordStatus.FREE },
        },
        include: {
          checkInValet: {
            select: {
              id: true,
              name: true,
              idNumber: true,
            },
          },
          payments: true,
        },
        orderBy: {
          updatedAt: "desc",
        },
      });

      return parkingRecords;
    }

    return [];
  }

  async getVehicleById(id: string) {
    const parkingRecord = await this.prisma.parkingRecord.findUnique({
      where: { id },
      include: {
        registerRecord: {
          select: {
            id: true,
            name: true,
            idNumber: true,
          },
        },
        checkInValet: {
          select: {
            id: true,
            name: true,
            idNumber: true,
          },
        },
        checkOutValet: {
          select: {
            id: true,
            name: true,
            idNumber: true,
          },
        },
        owner: {
          select: {
            id: true,
            name: true,
            idNumber: true,
          },
        },
        payments: {
          orderBy: {
            date: "desc",
          },
        },
        paymentReferences: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            imageUrl: true,
            createdAt: true,
            uploadedBy: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!parkingRecord) {
      throw new NotFoundException("Parking record not found");
    }

    return parkingRecord;
  }

  async getAllVehicles(options: FilterVehiclesDto, companyIds: string[] = []) {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    // whereBase — company + field + search filters, NO status filter (used for tab counts)
    const whereBase: Prisma.ParkingRecordWhereInput = {};
    // where — same as whereBase plus status filter (used for the main query)
    const where: Prisma.ParkingRecordWhereInput = {};

    const companyFilter: Prisma.ParkingRecordWhereInput =
      options.companyId != null
        ? { companyId: options.companyId }
        : { companyId: { in: companyIds } };

    Object.assign(whereBase, companyFilter);
    Object.assign(where, companyFilter);

    // Field filters
    if (options.plate) {
      whereBase.plate = { contains: options.plate, mode: "insensitive" };
      where.plate = whereBase.plate;
    }
    if (options.brand) {
      whereBase.brand = { contains: options.brand, mode: "insensitive" };
      where.brand = whereBase.brand;
    }
    if (options.model) {
      whereBase.model = { contains: options.model, mode: "insensitive" };
      where.model = whereBase.model;
    }
    if (options.color) {
      whereBase.color = { contains: options.color, mode: "insensitive" };
      where.color = whereBase.color;
    }

    // Date range filter on checkInAt
    if (options.dateFrom || options.dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (options.dateFrom) dateFilter.gte = new Date(options.dateFrom);
      if (options.dateTo) {
        const endDate = new Date(options.dateTo);
        endDate.setHours(23, 59, 59, 999);
        dateFilter.lte = endDate;
      }
      whereBase.checkInAt = dateFilter;
      where.checkInAt = dateFilter;
    }

    // Global search — plate, brand, model, owner name/idNumber
    if (options.search) {
      const searchOR: Prisma.ParkingRecordWhereInput[] = [
        { plate: { contains: options.search, mode: "insensitive" } },
        { brand: { contains: options.search, mode: "insensitive" } },
        { model: { contains: options.search, mode: "insensitive" } },
        { owner: { name: { contains: options.search, mode: "insensitive" } } },
        { owner: { idNumber: { contains: options.search, mode: "insensitive" } } },
      ];
      whereBase.OR = searchOR;
      where.OR = searchOR;
    }

    if (options.workdayId) {
      where.workdayId = options.workdayId;
    }

    // Status filter — applied only to `where`, not `whereBase`
    if (options.status === "active") {
      where.status = ParkingRecordStatus.UNPAID;
    } else if (options.status === "in_review") {
      where.status = ParkingRecordStatus.PAYMENT_UNDER_REVIEW;
    } else if (options.status === "pending_payment") {
      where.status = { in: [ParkingRecordStatus.UNPAID, ParkingRecordStatus.PAYMENT_UNDER_REVIEW] };
    } else if (options.status === "pending_delivery") {
      where.status = ParkingRecordStatus.PAID;
    } else if (options.status === "completed") {
      where.status = ParkingRecordStatus.FREE;
    } else if (options.status === "in_lot") {
      where.status = { not: ParkingRecordStatus.FREE };
    }

    const include = {
      registerRecord: { select: { id: true, name: true, idNumber: true } },
      checkInValet:   { select: { id: true, name: true, idNumber: true } },
      checkOutValet:  { select: { id: true, name: true, idNumber: true } },
      owner:          { select: { id: true, name: true, idNumber: true } },
      payments: true,
      vehicleRequests: { where: { status: 'PENDING' }, select: { id: true } },
    } satisfies Prisma.ParkingRecordInclude;

    const orderBy: Prisma.ParkingRecordOrderByWithRelationInput = options.sortBy
      ? options.sortBy === 'valetName'
        ? { registerRecord: { name: options.sortOrder ?? 'asc' } }
        : { [options.sortBy]: options.sortOrder ?? 'asc' }
      : { updatedAt: 'desc' };

    const [
      parkingRecords,
      activeCount,
      inReviewCount,
      pendingCount,
      completedCount,
      total,
    ] = await Promise.all([
      this.prisma.parkingRecord.findMany({
        where,
        skip,
        take: limit,
        include,
        orderBy,
      }),
      this.prisma.parkingRecord.count({ where: { ...whereBase, status: ParkingRecordStatus.UNPAID } }),
      this.prisma.parkingRecord.count({ where: { ...whereBase, status: ParkingRecordStatus.PAYMENT_UNDER_REVIEW } }),
      this.prisma.parkingRecord.count({ where: { ...whereBase, status: ParkingRecordStatus.PAID } }),
      this.prisma.parkingRecord.count({ where: { ...whereBase, status: ParkingRecordStatus.FREE } }),
      this.prisma.parkingRecord.count({ where }),
    ]);

    parkingRecords.sort((a, b) => {
      const aHas = (a as any).vehicleRequests?.length > 0 ? 0 : 1;
      const bHas = (b as any).vehicleRequests?.length > 0 ? 0 : 1;
      return aHas - bHas;
    });

    return {
      data: parkingRecords,
      meta: {
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        active: activeCount,
        in_review: inReviewCount,
        pending_payment: activeCount + inReviewCount,
        pending_delivery: pendingCount,
        completed: completedCount,
        in_lot: activeCount + inReviewCount + pendingCount,
        all: total,
      },
    };
  }

  async getMyActiveParkingRecords(userId: string, options: { page: number; limit: number }) {
    const { page, limit } = options;
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      this.prisma.parkingRecord.findMany({
        where: { ownerId: userId, status: { not: ParkingRecordStatus.FREE } },
        include: {
          payments: true,
          registerRecord: { select: { id: true, name: true, idNumber: true } },
          checkInValet: { select: { id: true, name: true, idNumber: true } },
          checkOutValet: { select: { id: true, name: true, idNumber: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.parkingRecord.count({
        where: { ownerId: userId, status: { not: ParkingRecordStatus.FREE } },
      }),
    ]);

    return {
      data: records,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateParkingRecordStatus(id: string, dto: UpdateParkingRecordStatusDto) {
    const parkingRecord = await this.prisma.parkingRecord.findUnique({
      where: { id },
      include: { payments: true },
    });

    if (!parkingRecord) {
      throw new NotFoundException("Parking record not found");
    }

    if (parkingRecord.status === ParkingRecordStatus.FREE) {
      throw new ConflictException("Vehicle has already checked out");
    }

    if (
      dto.status === ParkingRecordStatus.PAID &&
      parkingRecord.status !== ParkingRecordStatus.PAID
    ) {
      const hasReceivedPayment = parkingRecord.payments.some(
        (p) => p.status === PaymentStatus.RECEIVED,
      );
      if (!hasReceivedPayment) {
        throw new BadRequestException(
          "No se puede marcar como Pagado: no existe un pago confirmado. Aprueba o registra un pago confirmado primero.",
        );
      }
    }

    const updateData: Prisma.ParkingRecordUpdateInput = {
      status: dto.status,
    };

    if (dto.status === ParkingRecordStatus.FREE) {
      updateData.checkOutAt = parkingRecord.checkOutAt ?? new Date();
      if (dto.checkOutValetId) {
        updateData.checkOutValet = { connect: { id: dto.checkOutValetId } };
      }
    }

    if (dto.notes) {
      updateData.notes = dto.notes;
    }

    const updatedRecord = await this.prisma.parkingRecord.update({
      where: { id },
      data: updateData,
      include: {
        payments: true,
        checkInValet: { select: { id: true, name: true, idNumber: true } },
        checkOutValet: { select: { id: true, name: true, idNumber: true } },
      },
    });

    const newStatus = dto.status;
    let notifTitle: string | undefined;
    let notifMessage: string | undefined;

    if (newStatus === ParkingRecordStatus.PAID) {
      notifTitle = 'Vehículo listo';
      notifMessage = 'Tu pago fue confirmado. Tu vehículo está listo para ser retirado.';
    } else if (newStatus === ParkingRecordStatus.UNPAID) {
      notifTitle = 'Pago pendiente';
      notifMessage = 'El estado de tu ticket fue actualizado. Tienes un pago pendiente.';
    } else if (newStatus === ParkingRecordStatus.PAYMENT_UNDER_REVIEW) {
      notifTitle = 'Pago en revisión';
      notifMessage = 'Tu pago está siendo revisado. Te notificaremos pronto.';
    }

    if (notifTitle && notifMessage && updatedRecord.ownerId && updatedRecord.companyId) {
      void this.notificationsService.create({
        type: NotificationType.PAYMENT_STATUS_UPDATED,
        title: notifTitle,
        message: notifMessage,
        recipientId: updatedRecord.ownerId,
        companyId: updatedRecord.companyId,
        data: { parkingRecordId: updatedRecord.id, status: newStatus },
        parkingRecordId: updatedRecord.id,
      });
    }

    return updatedRecord;
  }

  async getVehiclesByOwnerId(ownerId: string) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { ownerId, deletedAt: null },
    });

    const activePlates = await this.prisma.parkingRecord.findMany({
      where: {
        plate: { in: vehicles.map((v) => v.plate) },
        status: { not: ParkingRecordStatus.FREE },
      },
      select: { plate: true },
    });

    const activePlateSet = new Set(activePlates.map((r) => r.plate));

    return vehicles.filter((v) => !activePlateSet.has(v.plate));
  }

  async addMyVehicle(dto: AddMyVehicleDto, userId: string) {
    const plate = dto.plate.trim().toUpperCase();

    // Check if vehicle with this plate already exists
    const existing = await this.prisma.vehicle.findUnique({
      where: { plate },
    });

    if (existing) {
      if (existing.ownerId === userId) {
        // Already belongs to this user — return it (idempotent)
        return existing;
      }
      throw new BadRequestException('Esta placa ya está registrada en el sistema.');
    }

    return this.prisma.vehicle.create({
      data: {
        plate,
        brand: dto.brand,
        model: dto.model,
        color: dto.color,
        ownerId: userId,
      },
    });
  }

  async getParkingHistory(userId: string, options: { page: number; limit: number }) {
    const { page, limit } = options;
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      this.prisma.parkingRecord.findMany({
        where: { ownerId: userId, status: ParkingRecordStatus.FREE },
        include: {
          payments: { select: { amountUSD: true, tip: true } },
          company: { select: { id: true, name: true, photoUrl: true } },
        },
        orderBy: { checkOutAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.parkingRecord.count({
        where: { ownerId: userId, status: ParkingRecordStatus.FREE },
      }),
    ]);

    return {
      data: records.map((record) => {
        const totalPaid = record.payments.reduce(
          (sum, p) => sum + p.amountUSD + p.tip,
          0,
        );

        const checkIn = new Date(record.checkInAt);
        const checkOut = new Date(record.checkOutAt!);
        const diffMs = checkOut.getTime() - checkIn.getTime();
        const totalMinutes = Math.floor(diffMs / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        const duration = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

        return {
          id: record.id,
          plate: record.plate,
          description: [record.brand, record.model, record.color]
            .filter(Boolean)
            .join(" "),
          totalPaid,
          checkInAt: record.checkInAt,
          checkOutAt: record.checkOutAt,
          duration,
          company: record.company,
        };
      }),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

