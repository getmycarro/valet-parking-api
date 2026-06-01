import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CarBrandsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.carBrand.findMany({
      include: { models: { orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }
}
