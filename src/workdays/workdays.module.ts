import { Module } from '@nestjs/common';
import { WorkdaysController } from './workdays.controller';
import { WorkdaysService } from './workdays.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WorkdaysController],
  providers: [WorkdaysService],
  exports: [WorkdaysService],
})
export class WorkdaysModule {}
