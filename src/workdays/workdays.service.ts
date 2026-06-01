import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkdayStatus } from '@prisma/client';
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
}
