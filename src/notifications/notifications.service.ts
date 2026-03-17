import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';
import { SseService } from './sse.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { CheckoutRequestDto } from './dto/checkout-request.dto';
import { ObjectSearchRequestDto } from './dto/object-search-request.dto';
import { ObjectSearchInProgressDto } from './dto/object-search-in-progress.dto';
import { ApproachCounterDto } from './dto/approach-counter.dto';
import { FilterNotificationsDto } from './dto/filter-notifications.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private supabase: SupabaseService,
    private sse: SseService,
  ) {}

  async create(dto: CreateNotificationDto) {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          type: dto.type,
          title: dto.title,
          message: dto.message,
          data: dto.data,
          companyId: dto.companyId,
          triggeredById: dto.triggeredById,
          recipientId: dto.recipientId,
        },
      });

      // Push via SSE al canal de la compañía (staff)
      this.sse.emit(dto.companyId, { type: 'notification', payload: notification });

      // Si hay destinatario específico, emitir también a su canal personal
      if (dto.recipientId) {
        this.sse.emitToUser(dto.recipientId, { type: 'notification', payload: notification });
      }

      // Supabase broadcast kept as secondary channel (no-op if not configured)
      await this.supabase.broadcast(`company-${dto.companyId}`, 'notification', notification);

      return notification;
    } catch (error) {
      this.logger.error(
        `Failed to create notification: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  async findAll(companyId: string, filters: FilterNotificationsDto) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { companyId };

    if (filters.type !== undefined) {
      where.type = filters.type;
    }
    if (filters.isRead !== undefined) {
      where.isRead = filters.isRead;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          triggeredBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { companyId, isRead: false } }),
    ]);

    return {
      data: notifications,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        unreadCount,
      },
    };
  }

  async markAsRead(id: string, companyId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.companyId !== companyId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(companyId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { companyId, isRead: false },
      data: { isRead: true },
    });

    return { updated: result.count };
  }

  async createCheckoutRequest(dto: CheckoutRequestDto, userId: string) {
    const parkingRecord = await this.prisma.parkingRecord.findUnique({
      where: { id: dto.parkingRecordId },
      select: { plate: true, brand: true, model: true, color: true, companyId: true },
    });

    if (!parkingRecord) {
      this.logger.warn(`createCheckoutRequest: parkingRecord ${dto.parkingRecordId} not found`);
      return null;
    }

    const { companyId, ...vehicleInfo } = parkingRecord;

    return this.create({
      type: 'CHECKOUT_REQUEST',
      title: 'Solicitud de entrega de vehículo',
      message: `Se solicitó la entrega del vehículo con placa ${vehicleInfo.plate}${dto.notes ? `: ${dto.notes}` : ''}`,
      data: { parkingRecordId: dto.parkingRecordId, notes: dto.notes, ...vehicleInfo },
      companyId,
      triggeredById: userId,
    });
  }

  async createObjectSearchRequest(dto: ObjectSearchRequestDto, userId: string) {
    const parkingRecord = await this.prisma.parkingRecord.findUnique({
      where: { id: dto.parkingRecordId },
      select: { plate: true, brand: true, model: true, color: true, companyId: true },
    });

    if (!parkingRecord) {
      this.logger.warn(`createObjectSearchRequest: parkingRecord ${dto.parkingRecordId} not found`);
      return null;
    }

    const { companyId, ...vehicleInfo } = parkingRecord;

    return this.create({
      type: 'OBJECT_SEARCH_REQUEST',
      title: 'Solicitud de búsqueda de objeto',
      message: `Se solicitó búsqueda de "${dto.objectDescription}" en vehículo con placa ${vehicleInfo.plate}${dto.notes ? `: ${dto.notes}` : ''}`,
      data: {
        parkingRecordId: dto.parkingRecordId,
        objectDescription: dto.objectDescription,
        notes: dto.notes,
        ...vehicleInfo,
      },
      companyId,
      triggeredById: userId,
    });
  }

  async notifyApproachCounter(dto: ApproachCounterDto, staffUserId: string) {
    const parkingRecord = await this.prisma.parkingRecord.findUnique({
      where: { id: dto.parkingRecordId },
      select: { plate: true, brand: true, model: true, color: true, companyId: true, ownerId: true },
    });

    if (!parkingRecord) {
      this.logger.warn(`notifyApproachCounter: parkingRecord ${dto.parkingRecordId} not found`);
      return null;
    }

    if (!parkingRecord.ownerId) {
      this.logger.warn(`notifyApproachCounter: parkingRecord ${dto.parkingRecordId} has no ownerId`);
      return null;
    }

    const { companyId, ownerId, ...vehicleInfo } = parkingRecord;

    return this.create({
      type: 'APPROACH_COUNTER',
      title: 'Por favor acércate al mostrador',
      message: `Te solicitamos que te acerques al mostrador para tu vehículo con placa ${vehicleInfo.plate}${dto.notes ? `: ${dto.notes}` : ''}`,
      data: { parkingRecordId: dto.parkingRecordId, notes: dto.notes, ...vehicleInfo },
      companyId,
      triggeredById: staffUserId,
      recipientId: ownerId,
    });
  }

  async notifySearchInProgress(dto: ObjectSearchInProgressDto, staffUserId: string) {
    const parkingRecord = await this.prisma.parkingRecord.findUnique({
      where: { id: dto.parkingRecordId },
      select: { plate: true, brand: true, model: true, color: true, companyId: true, ownerId: true },
    });

    if (!parkingRecord) {
      this.logger.warn(`notifySearchInProgress: parkingRecord ${dto.parkingRecordId} not found`);
      return null;
    }

    if (!parkingRecord.ownerId) {
      this.logger.warn(`notifySearchInProgress: parkingRecord ${dto.parkingRecordId} has no ownerId`);
      return null;
    }

    const { companyId, ownerId, ...vehicleInfo } = parkingRecord;

    return this.create({
      type: 'OBJECT_SEARCH_IN_PROGRESS',
      title: 'Búsqueda en proceso',
      message: `La búsqueda en tu vehículo placa ${vehicleInfo.plate} está en proceso${dto.notes ? `: ${dto.notes}` : ''}`,
      data: { parkingRecordId: dto.parkingRecordId, notes: dto.notes, ...vehicleInfo },
      companyId,
      triggeredById: staffUserId,
      recipientId: ownerId,
    });
  }
}
