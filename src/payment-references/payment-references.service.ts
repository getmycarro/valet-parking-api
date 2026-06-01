import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentReferenceDto } from './dto/create-payment-reference.dto';

@Injectable()
export class PaymentReferencesService {
  constructor(private prisma: PrismaService) {}

  async create(
    parkingRecordId: string,
    dto: CreatePaymentReferenceDto,
    userId: string,
  ) {
    const parkingRecord = await this.prisma.parkingRecord.findUnique({
      where: { id: parkingRecordId },
    });

    if (!parkingRecord) {
      throw new NotFoundException('Parking record not found');
    }

    return this.prisma.paymentReference.create({
      data: {
        imageUrl: dto.imageUrl,
        publicId: dto.publicId,
        parkingRecordId,
        uploadedById: userId,
      },
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
    });
  }

  async findAll(parkingRecordId: string) {
    return this.prisma.paymentReference.findMany({
      where: { parkingRecordId },
      orderBy: { createdAt: 'asc' },
      include: {
        uploadedBy: { select: { id: true, name: true } },
      },
    });
  }
}
