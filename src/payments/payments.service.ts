import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { CreatePaymentMethodDto } from "./dto/create-payment-method.dto";
import { UpdatePaymentStatusDto } from "./dto/update-payment-status.dto";
import { FilterPaymentDto } from "./dto/filter-payment.dto";
import { PaymentStatus, Prisma, PlanType, FeeType } from "@prisma/client";

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async createPayment(dto: CreatePaymentDto, userId: string) {
    const payment = await this.prisma.payment.create({
      data: {
        parkingRecordId: dto.parkingRecordId,
        paymentMethodId: dto.paymentMethodId,
        amountUSD: dto.amountUSD,
        tip: dto.tip || 0,
        fee: dto.fee,
        validation: dto.validation,
        status: dto.validation === "MANUAL" ? "RECEIVED" : "PENDING",
        reference: dto.reference,
        note: dto.note,
        image: dto.image,
        processedById: userId,
      },
      include: {
        parkingRecord: true,
        paymentMethod: true,
        processedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Fire notification (non-blocking, non-throwing)
    if (payment.parkingRecord?.companyId) {
      void this.notifications.create({
        type: 'PAYMENT_REGISTERED',
        title: 'Pago registrado',
        message: `Se registró un pago de $${payment.amountUSD} para la placa ${payment.parkingRecord.plate}`,
        data: { paymentId: payment.id, parkingRecordId: payment.parkingRecordId, amountUSD: payment.amountUSD, plate: payment.parkingRecord.plate },
        companyId: payment.parkingRecord.companyId,
        triggeredById: userId,
      });
    }

    return payment;
  }

  async getAllPayments(options: FilterPaymentDto, companyIds: string[] = []) {
    const page = options.page || 1;
    const limit = options.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.PaymentWhereInput = {};

    if (options.companyId != null) {
      where.parkingRecord = {
        companyId: options.companyId,
      };
    } else {
      where.parkingRecord = {
        companyId: { in: companyIds },
      };
    }

    if (options.status != null) {
      where.status = options.status;
    }
    if (options.paymentMethodId != null) {
      where.paymentMethodId = options.paymentMethodId;
    }
    if (options.reference) {
      where.reference = { contains: options.reference, mode: "insensitive" };
    }
    // Date range filter on checkInAt
    if (options.dateFrom || options.dateTo) {
      where.createdAt = {};
      if (options.dateFrom) {
        (where.createdAt as Prisma.DateTimeFilter).gte = new Date(
          options.dateFrom,
        );
      }
      if (options.dateTo) {
        const endDate = new Date(options.dateTo);
        endDate.setHours(23, 59, 59, 999);
        (where.createdAt as Prisma.DateTimeFilter).lte = endDate;
      }
    }

    // Global search across plate, brand, model
    if (options.search) {
      where.OR = [
        { reference: { contains: options.search, mode: "insensitive" } },
      ];
    }

    // Build dynamic orderBy
    const sortOrder = options.sortOrder || "desc";
    let orderBy: Prisma.PaymentOrderByWithRelationInput;
    if (options.sortBy === "amountUSD") {
      orderBy = { amountUSD: sortOrder };
    } else if (options.sortBy === "paymentMethod") {
      orderBy = { paymentMethod: { name: sortOrder } };
    } else {
      orderBy = { createdAt: sortOrder };
    }

    const [
      paymentRecords,
      cancelledCount,
      pendingCount,
      completedCount,
      total,
    ] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        include: {
          parkingRecord: true,
          paymentMethod: true,
        },
        orderBy,
      }),
      this.prisma.payment.aggregate({
        where: {
          ...where,
          status: PaymentStatus.CANCELLED,
        },
        _count: { id: true },
        _sum: { amountUSD: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          ...where,
          status: PaymentStatus.PENDING,
        },
        _count: { id: true },
        _sum: { amountUSD: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          ...where,
          status: PaymentStatus.RECEIVED,
        },
        _count: { id: true },
        _sum: { amountUSD: true },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: paymentRecords,
      meta: {
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        cancelled: cancelledCount._count.id,
        cancelledAmountUSD: cancelledCount._sum.amountUSD ?? 0,
        pending: pendingCount._count.id,
        pendingAmountUSD: pendingCount._sum.amountUSD ?? 0,
        completed: completedCount._count.id,
        completedAmountUSD: completedCount._sum.amountUSD ?? 0,
        all: total,
      },
    };
  }

  async updatePaymentStatus(id: string, dto: UpdatePaymentStatusDto) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
    });

    if (!payment) {
      throw new NotFoundException("Payment not found");
    }

    return this.prisma.payment.update({
      where: { id },
      data: { status: dto.status },
      include: {
        parkingRecord: true,
        paymentMethod: true,
      },
    });
  }

  async createPaymentMethod(dto: CreatePaymentMethodDto) {
    return this.prisma.paymentMethod.create({
      data: {
        name: dto.name,
        form: dto.form,
        type: dto.type,
      },
    });
  }

  async getPaymentMethods() {
    return this.prisma.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      include: {
        company: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async processExpiredPlans() {
    const now = new Date();
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // Obtener todos los planes activos
    const activePlans = await this.prisma.companyPlan.findMany({
      where: {
        isActive: true,
        deletedAt: null,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        companyInvoices: {
          orderBy: {
            periodEnd: "desc",
          },
          take: 1,
        },
      },
    });

    const result = {
      processedPlans: 0,
      createdInvoices: 0,
      skippedPlans: 0,
      errors: [] as Array<{ companyPlanId: string; error: string }>,
      invoices: [] as Array<{
        id: string;
        companyPlanId: string;
        companyName: string;
        amountUSD: number;
        periodStart: Date;
        periodEnd: Date;
      }>,
    };

    for (const plan of activePlans) {
      result.processedPlans++;

      try {
        // Determinar el período a facturar
        let periodStart: Date;
        let periodEnd: Date;

        if (plan.companyInvoices.length > 0) {
          const lastInvoice = plan.companyInvoices[0];
          // Si el último invoice no ha vencido (su periodEnd es futuro), saltar
          if (lastInvoice.periodEnd && lastInvoice.periodEnd > now) {
            result.skippedPlans++;
            continue;
          }
          // Nuevo período inicia donde terminó el anterior
          periodStart = lastInvoice.periodEnd || lastInvoice.createdAt;
        } else {
          // Primer invoice, usar fecha de creación del plan
          periodStart = plan.createdAt;
        }

        // El período termina un mes después del inicio
        periodEnd = new Date(periodStart);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        // Si el período aún no ha vencido, saltar
        if (periodEnd > now) {
          result.skippedPlans++;
          continue;
        }

        // Calcular el monto según el tipo de plan
        let baseAmount = 0;
        let vehicleAmount = 0;
        let feeAmount = 0;
        let vehicleCount = 0;

        // Contar vehículos activos en el período
        vehicleCount = await this.prisma.parkingRecord.count({
          where: {
            companyId: plan.company.id,
            checkInAt: {
              gte: periodStart,
              lte: periodEnd,
            },
          },
        });

        switch (plan.planType) {
          case PlanType.FLAT_RATE:
            baseAmount = plan.flatRate || 0;
            break;

          case PlanType.PER_VEHICLE:
            vehicleAmount = (plan.perVehicleRate || 0) * vehicleCount;
            break;

          case PlanType.MIXED:
            baseAmount = plan.basePrice || 0;
            vehicleAmount = (plan.perVehicleRate || 0) * vehicleCount;
            break;
        }

        // Calcular fee si existe
        const subtotal = baseAmount + vehicleAmount;
        if (plan.feeType && plan.feeValue) {
          if (plan.feeType === FeeType.PERCENTAGE) {
            feeAmount = subtotal * (plan.feeValue / 100);
          } else if (plan.feeType === FeeType.FIXED) {
            feeAmount = plan.feeValue * vehicleCount;
          }
        }

        const totalAmount = subtotal + feeAmount;

        // Crear el invoice
        const invoice = await this.prisma.companyInvoice.create({
          data: {
            companyPlanId: plan.id,
            amountUSD: totalAmount,
            status: PaymentStatus.PENDING,
            validation: "MANUAL",
            planType: plan.planType,
            vehicleCount,
            baseAmount,
            vehicleAmount,
            feeAmount,
            periodStart,
            periodEnd,
            note: `Invoice automático generado para período ${periodStart.toISOString()} - ${periodEnd.toISOString()}`,
          },
        });

        result.createdInvoices++;
        result.invoices.push({
          id: invoice.id,
          companyPlanId: plan.id,
          companyName: plan.company.name,
          amountUSD: totalAmount,
          periodStart,
          periodEnd,
        });

        // Fire notification (non-blocking, non-throwing)
        void this.notifications.create({
          type: 'PAYMENT_EXPIRED',
          title: 'Plan vencido — factura generada',
          message: `Se generó una factura de $${totalAmount.toFixed(2)} para ${plan.company.name}`,
          data: { invoiceId: invoice.id, companyPlanId: plan.id, amountUSD: totalAmount, periodStart, periodEnd },
          companyId: plan.company.id,
        });
      } catch (error) {
        result.errors.push({
          companyPlanId: plan.id,
          error: error.message || "Error desconocido",
        });
      }
    }

    return result;
  }
}
