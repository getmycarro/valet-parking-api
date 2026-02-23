import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RegisterVehicleDto } from "./dto/register-vehicle.dto";
import { CheckoutVehicleDto } from "./dto/checkout-vehicle.dto";
import { Prisma, UserRole } from "@prisma/client";
import { FilterVehiclesDto } from "./dto/filter-vehicles.dto";
import * as bcrypt from "bcrypt";

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

  async registerVehicle(dto: RegisterVehicleDto, registerRecordId: string) {
    // 1. Verificar si el auto ya tiene un check-in activo
    const existingRecord = await this.prisma.parkingRecord.findFirst({
      where: {
        plate: dto.plate,
        checkOutAt: null,
      },
    });

    if (existingRecord) {
      throw new ConflictException(
        "Vehicle with this plate is already checked in",
      );
    }

    // checkInValetId apunta a Valet (no User), solo asignar si se provee
    const checkInValetId = dto.valedId || undefined;

    // 2. Buscar usuario por userId, idNumber o email
    let user = null;

    if (dto.userId) {
      user = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        include: { ownedVehicles: true },
      });
    } else if (dto.idNumber) {
      user = await this.prisma.user.findUnique({
        where: { idNumber: dto.idNumber },
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

      const parkingRecord = await this.prisma.parkingRecord.create({
        data: {
          plate: vehicle?.plate ?? dto.plate,
          brand: vehicle?.brand ?? dto.brand,
          model: vehicle?.model ?? dto.model,
          color: vehicle?.color ?? dto.color,
          ownerId: user.id,
          registerRecordId,
          checkInValetId,
        },
      });

      return { parkingRecord, isNewUser: false };
    }

    // 3b. Usuario NO existe - crear usuario, vehiculo y parkingRecord
    const password = await bcrypt.hash(dto.idNumber || dto.email, 10);

    const newUser = await this.prisma.user.create({
      data: {
        email: dto.email,
        idNumber: dto.idNumber,
        name: dto.name,
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

    const parkingRecord = await this.prisma.parkingRecord.create({
      data: {
        plate: dto.plate,
        brand: dto.brand,
        model: dto.model,
        color: dto.color,
        ownerId: newUser.id,
        registerRecordId,
        checkInValetId,
      },
    });

    return { parkingRecord, isNewUser: true };
  }

  async getUserVehicles(idNumber: string) {
    const user = await this.prisma.user.findUnique({
      where: { idNumber: idNumber },
      include: { ownedVehicles: true },
    });
    return user;
  }

  async checkoutVehicle(id: string, dto: CheckoutVehicleDto) {
    const parkingRecord = await this.prisma.parkingRecord.findUnique({
      where: { id },
      include: { payments: true },
    });

    if (!parkingRecord) {
      throw new NotFoundException("Parking record not found");
    }

    if (parkingRecord.checkOutAt) {
      throw new ConflictException("Vehicle already checked out");
    }

    // Validar que tenga al menos un pago asociado antes de entregar
    const hasPayment = parkingRecord.payments.length > 0;
    if (!hasPayment) {
      throw new BadRequestException(
        "Vehicle must have an associated payment before checkout",
      );
    }

    const updatedRecord = await this.prisma.parkingRecord.update({
      where: { id },
      data: {
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
          checkOutAt: null, // Solo activos
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
          checkInAt: "desc",
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
        payments: {
          orderBy: {
            date: "desc",
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

    const where: Prisma.ParkingRecordWhereInput = {};

    if (options.companyId != null) {
      where.companyId = options.companyId;
    } else {
      where.companyId = { in: companyIds };
    }
    if (options.status === "active") {
      where.checkOutAt = null;
      where.payments = { none: {} };
    } else if (options.status === "completed") {
      where.checkOutAt = { not: null };
    } else if (options.status === "pending_delivery") {
      where.checkOutAt = null;
      where.checkOutValetId = null;
      where.payments = { some: {} };
    }

    // Field filters (case-insensitive partial match)
    if (options.plate) {
      where.plate = { contains: options.plate, mode: "insensitive" };
    }
    if (options.brand) {
      where.brand = { contains: options.brand, mode: "insensitive" };
    }
    if (options.model) {
      where.model = { contains: options.model, mode: "insensitive" };
    }
    if (options.color) {
      where.color = { contains: options.color, mode: "insensitive" };
    }

    // Date range filter on checkInAt
    if (options.dateFrom || options.dateTo) {
      where.checkInAt = {};
      if (options.dateFrom) {
        (where.checkInAt as Prisma.DateTimeFilter).gte = new Date(
          options.dateFrom,
        );
      }
      if (options.dateTo) {
        const endDate = new Date(options.dateTo);
        endDate.setHours(23, 59, 59, 999);
        (where.checkInAt as Prisma.DateTimeFilter).lte = endDate;
      }
    }

    // Global search across plate, brand, model
    if (options.search) {
      where.OR = [
        { plate: { contains: options.search, mode: "insensitive" } },
        { brand: { contains: options.search, mode: "insensitive" } },
        { model: { contains: options.search, mode: "insensitive" } },
      ];
    }

    const [parkingRecords, activeCount, pendingCount, completedCount, total] =
      await Promise.all([
        this.prisma.parkingRecord.findMany({
          where,
          skip,
          take: limit,
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
            payments: true,
          },
          orderBy: {
            createdAt: "desc",
          },
        }),
        this.prisma.parkingRecord.count({
          where: {
            ...where,
            checkOutAt: null,
            payments: { none: {} },
          },
        }),
        this.prisma.parkingRecord.count({
          where: {
            ...where,
            checkOutAt: null,
            payments: { some: {} },
          },
        }),
        this.prisma.parkingRecord.count({
          where: {
            ...where,
            checkOutValetId: undefined,
            payments: undefined,
            checkOutAt: { not: null },
          },
        }),
        this.prisma.parkingRecord.count({ where }),
      ]);

    return {
      data: parkingRecords,
      meta: {
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        active: activeCount,
        pending_delivery: pendingCount,
        completed: completedCount,
        all: total,
      },
    };
  }

  async getMyActiveParkingRecords(userId: string) {
    return this.prisma.parkingRecord.findMany({
      where: { ownerId: userId, checkOutAt: null },
      include: {
        payments: true,
        checkInValet: { select: { id: true, name: true, idNumber: true } },
        checkOutValet: { select: { id: true, name: true, idNumber: true } },
      },
      orderBy: { checkInAt: "desc" },
    });
  }
}
