import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkdayStatus, PaymentStatus } from '@prisma/client';
import { FilterWorkdaysDto } from './dto/filter-workdays.dto';

@Injectable()
export class WorkdaysService {
  constructor(private prisma: PrismaService) {}

  async openWorkday(userId: string, companyId: string) {
    // Ensure there is no active workday for this company
    const existing = await this.prisma.workday.findFirst({
      where: { companyId, status: WorkdayStatus.ACTIVE },
    });

    if (existing) {
      throw new ConflictException(
        'There is already an active workday for this company',
      );
    }

    return this.prisma.workday.create({
      data: {
        companyId,
        openedById: userId,
        status: WorkdayStatus.ACTIVE,
      },
      include: {
        openedBy: { select: { id: true, name: true } },
      },
    });
  }

  async closeWorkday(
    workdayId: string,
    userId: string,
    companyIds: string[],
  ) {
    const workday = await this.prisma.workday.findFirst({
      where: { id: workdayId, companyId: { in: companyIds } },
    });

    if (!workday) {
      throw new NotFoundException('Workday not found');
    }

    if (workday.status === WorkdayStatus.CLOSED) {
      throw new ConflictException('Workday is already closed');
    }

    const stats = await this.getWorkdayStats(workdayId);
    if (stats.inside > 0) {
      throw new BadRequestException(
        `No se puede cerrar la jornada: hay ${stats.inside} vehículo(s) sin entregar.`,
      );
    }

    return this.prisma.workday.update({
      where: { id: workdayId },
      data: {
        status: WorkdayStatus.CLOSED,
        closedById: userId,
        closedAt: new Date(),
      },
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    });
  }

  async getActiveWorkday(companyId: string) {
    return this.prisma.workday.findFirst({
      where: { companyId, status: WorkdayStatus.ACTIVE },
      include: {
        openedBy: { select: { id: true, name: true } },
        _count: { select: { parkingRecords: true } },
      },
    });
  }

  async findAll(filters: FilterWorkdaysDto, companyIds: string[]) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: {
      companyId?: { in: string[] } | string;
      status?: WorkdayStatus;
    } = {
      companyId: filters.companyId
        ? filters.companyId
        : { in: companyIds },
    };

    if (filters.status) {
      where.status = filters.status;
    }

    const [workdays, total] = await Promise.all([
      this.prisma.workday.findMany({
        where,
        skip,
        take: limit,
        orderBy: { openedAt: 'desc' },
        include: {
          openedBy: { select: { id: true, name: true } },
          closedBy: { select: { id: true, name: true } },
          _count: { select: { parkingRecords: true } },
        },
      }),
      this.prisma.workday.count({ where }),
    ]);

    return {
      data: workdays,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(workdayId: string) {
    const workday = await this.prisma.workday.findUnique({
      where: { id: workdayId },
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    });

    if (!workday) {
      throw new NotFoundException('Workday not found');
    }

    const stats = await this.getWorkdayStats(workdayId);

    return { ...workday, stats };
  }

  async getWorkdayStats(workdayId: string) {
    const groups = await this.prisma.parkingRecord.groupBy({
      by: ['status'],
      where: { workdayId },
      _count: { id: true },
    });

    const total = groups.reduce((sum, g) => sum + g._count.id, 0);
    const exitedGroup = groups.find((g) => g.status === 'FREE');
    const exited = exitedGroup ? exitedGroup._count.id : 0;
    const inside = total - exited;

    return { total, inside, exited };
  }

  async getPaymentReport(
    companyId: string,
    options: { workdayId?: string; dateFrom?: string; dateTo?: string },
  ) {
    const workdayWhere: any = { companyId };

    if (options.workdayId) {
      workdayWhere.id = options.workdayId;
    } else if (options.dateFrom || options.dateTo) {
      workdayWhere.openedAt = {};
      if (options.dateFrom)
        workdayWhere.openedAt.gte = new Date(options.dateFrom);
      if (options.dateTo) {
        const to = new Date(options.dateTo);
        to.setHours(23, 59, 59, 999);
        workdayWhere.openedAt.lte = to;
      }
    }

    const workdays = await this.prisma.workday.findMany({
      where: workdayWhere,
      orderBy: { openedAt: 'desc' },
      include: {
        openedBy: { select: { name: true } },
        closedBy: { select: { name: true } },
        parkingRecords: {
          include: {
            payments: {
              where: { status: PaymentStatus.RECEIVED },
              select: {
                amountUSD: true,
                amountBs: true,
                exchangeRate: true,
                tip: true,
                fee: true,
              },
            },
          },
        },
      },
    });

    return workdays.map((w) => {
      const allPayments = w.parkingRecords.flatMap((r) => r.payments);
      const totalUSD = allPayments.reduce((s, p) => s + p.amountUSD, 0);
      const totalBs = allPayments.reduce((s, p) => s + (p.amountBs ?? 0), 0);
      const totalTip = allPayments.reduce((s, p) => s + (p.tip ?? 0), 0);
      const rates = allPayments
        .map((p) => p.exchangeRate)
        .filter((r): r is number => r !== null && r !== undefined);
      const avgRate =
        rates.length > 0
          ? rates.reduce((s, r) => s + r, 0) / rates.length
          : null;

      return {
        id: w.id,
        openedAt: w.openedAt,
        closedAt: w.closedAt,
        status: w.status,
        openedBy: w.openedBy?.name ?? null,
        closedBy: w.closedBy?.name ?? null,
        ticketsTotal: w.parkingRecords.length,
        paymentsCount: allPayments.length,
        totalUSD: Math.round(totalUSD * 100) / 100,
        totalBs: Math.round(totalBs * 100) / 100,
        totalTip: Math.round(totalTip * 100) / 100,
        avgExchangeRate:
          avgRate !== null ? Math.round(avgRate * 100) / 100 : null,
      };
    });
  }

  async exportWorkdayReport(
    companyId: string,
    options: { workdayId?: string; dateFrom?: string; dateTo?: string },
  ): Promise<Buffer> {
    const report = await this.getPaymentReport(companyId, options);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GetMyCarro';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Reporte por Jornada', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = [
      { header: 'Apertura', key: 'openedAt', width: 22 },
      { header: 'Cierre', key: 'closedAt', width: 22 },
      { header: 'Estado', key: 'status', width: 12 },
      { header: 'Abierto por', key: 'openedBy', width: 20 },
      { header: 'Cerrado por', key: 'closedBy', width: 20 },
      { header: 'Tickets', key: 'ticketsTotal', width: 10 },
      { header: 'Pagos Recibidos', key: 'paymentsCount', width: 16 },
      { header: 'Total USD', key: 'totalUSD', width: 14 },
      { header: 'Total Bs', key: 'totalBs', width: 16 },
      { header: 'Propinas USD', key: 'totalTip', width: 14 },
      { header: 'Tasa Prom. BCV', key: 'avgExchangeRate', width: 16 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell: any) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' },
      };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    headerRow.height = 22;

    const fmt = (d: Date | null) =>
      d
        ? new Date(d).toLocaleString('es-VE', {
            dateStyle: 'short',
            timeStyle: 'short',
          })
        : '—';

    for (const row of report) {
      sheet.addRow({
        openedAt: fmt(row.openedAt),
        closedAt: fmt(row.closedAt),
        status: row.status === 'ACTIVE' ? 'Activa' : 'Cerrada',
        openedBy: row.openedBy ?? '—',
        closedBy: row.closedBy ?? '—',
        ticketsTotal: row.ticketsTotal,
        paymentsCount: row.paymentsCount,
        totalUSD: row.totalUSD,
        totalBs: row.totalBs,
        totalTip: row.totalTip,
        avgExchangeRate: row.avgExchangeRate ?? '—',
      });
    }

    if (report.length > 0) {
      const totalsRow = sheet.addRow({
        openedAt: 'TOTALES',
        closedAt: '',
        status: '',
        openedBy: '',
        closedBy: '',
        ticketsTotal: report.reduce((s, r) => s + r.ticketsTotal, 0),
        paymentsCount: report.reduce((s, r) => s + r.paymentsCount, 0),
        totalUSD:
          Math.round(report.reduce((s, r) => s + r.totalUSD, 0) * 100) / 100,
        totalBs:
          Math.round(report.reduce((s, r) => s + r.totalBs, 0) * 100) / 100,
        totalTip:
          Math.round(report.reduce((s, r) => s + r.totalTip, 0) * 100) / 100,
        avgExchangeRate: '',
      });
      totalsRow.eachCell((cell: any) => {
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0F172A' },
        };
      });
    }

    ['totalUSD', 'totalBs', 'totalTip', 'avgExchangeRate'].forEach((col) => {
      sheet.getColumn(col).numFmt = '#,##0.00';
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
