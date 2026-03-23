import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateObjectSearchRequestDto } from './dto/create-object-search-request.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';
import { FilterRequestsDto } from './dto/filter-requests.dto';

@Injectable()
export class RequestsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async createObjectSearchRequest(
    dto: CreateObjectSearchRequestDto,
    userId: string,
  ) {
    const parkingRecord = await this.prisma.parkingRecord.findUnique({
      where: { id: dto.parkingRecordId },
      select: {
        id: true,
        plate: true,
        brand: true,
        model: true,
        color: true,
        companyId: true,
        ownerId: true,
      },
    });

    if (!parkingRecord) {
      throw new NotFoundException('Parking record not found');
    }

    const isOwner = parkingRecord.ownerId === userId;

    if (!isOwner) {
      throw new ForbiddenException(
        'You do not have access to this parking record',
      );
    }

    const companyId = parkingRecord.companyId;

    const request = await this.prisma.vehicleRequest.create({
      data: {
        parkingRecordId: dto.parkingRecordId,
        objectDescription: dto.objectDescription,
        notes: dto.notes,
        companyId,
        requestedById: userId,
      },
      include: {
        parkingRecord: {
          select: { plate: true, brand: true, model: true, color: true },
        },
        requestedBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.notifications.create({
      type: 'OBJECT_SEARCH_REQUEST',
      title: 'Solicitud de búsqueda de objeto',
      message: `Se solicitó búsqueda de "${dto.objectDescription}" en vehículo con placa ${parkingRecord.plate}${dto.notes ? `: ${dto.notes}` : ''}`,
      data: {
        requestId: request.id,
        parkingRecordId: dto.parkingRecordId,
        objectDescription: dto.objectDescription,
        notes: dto.notes,
        plate: parkingRecord.plate,
        brand: parkingRecord.brand,
        model: parkingRecord.model,
        color: parkingRecord.color,
      },
      companyId,
      triggeredById: userId,
    });

    return request;
  }

  async findAll(companyId: string, filters: FilterRequestsDto) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { companyId };

    if (filters.status) {
      where.status = filters.status;
    }

    const [requests, total] = await Promise.all([
      this.prisma.vehicleRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          parkingRecord: {
            select: { plate: true, brand: true, model: true, color: true },
          },
          requestedBy: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.vehicleRequest.count({ where }),
    ]);

    return {
      data: requests,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateStatus(
    id: string,
    dto: UpdateRequestStatusDto,
    companyId: string,
    staffUserId: string,
  ) {
    const request = await this.prisma.vehicleRequest.findUnique({
      where: { id },
      include: {
        parkingRecord: { select: { plate: true, ownerId: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (request.companyId !== companyId) {
      throw new ForbiddenException('Access denied');
    }

    const isResolved = ['COMPLETED', 'CANCELLED'].includes(dto.status);

    const updated = await this.prisma.vehicleRequest.update({
      where: { id },
      data: {
        status: dto.status,
        resolvedAt: isResolved ? new Date() : undefined,
      },
    });

    // Notify client when request is cancelled or completed
    if (isResolved && request.requestedById && request.parkingRecord?.ownerId) {
      const isCancelled = dto.status === 'CANCELLED';
      const plate = request.parkingRecord.plate;
      const notesText = dto.notes ? `: ${dto.notes}` : '';

      await this.notifications.create({
        type: 'OBJECT_SEARCH_IN_PROGRESS',
        title: isCancelled
          ? 'Solicitud cancelada'
          : 'Solicitud completada',
        message: isCancelled
          ? `Tu solicitud de búsqueda para el vehículo placa ${plate} fue cancelada${notesText}`
          : `Tu solicitud de búsqueda para el vehículo placa ${plate} fue completada${notesText}`,
        data: { requestId: id, status: dto.status, notes: dto.notes },
        companyId,
        triggeredById: staffUserId,
        recipientId: request.parkingRecord.ownerId,
        isRead: true,
      });
    }

    return updated;
  }
}
