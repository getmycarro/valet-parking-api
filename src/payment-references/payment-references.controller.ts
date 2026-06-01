import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PaymentReferencesService } from './payment-references.service';
import { CreatePaymentReferenceDto } from './dto/create-payment-reference.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('payment-references')
@UseGuards(RolesGuard)
export class PaymentReferencesController {
  constructor(private paymentReferencesService: PaymentReferencesService) {}

  @Post(':parkingRecordId')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT)
  create(
    @Param('parkingRecordId') parkingRecordId: string,
    @Body() dto: CreatePaymentReferenceDto,
    @CurrentUser() user: any,
  ) {
    return this.paymentReferencesService.create(parkingRecordId, dto, user.id);
  }

  @Get(':parkingRecordId')
  @Roles(UserRole.ADMIN, UserRole.ATTENDANT, UserRole.MANAGER)
  findAll(@Param('parkingRecordId') parkingRecordId: string) {
    return this.paymentReferencesService.findAll(parkingRecordId);
  }
}
