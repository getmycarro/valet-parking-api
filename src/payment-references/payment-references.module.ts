import { Module } from '@nestjs/common';
import { PaymentReferencesController } from './payment-references.controller';
import { PaymentReferencesService } from './payment-references.service';

@Module({
  controllers: [PaymentReferencesController],
  providers: [PaymentReferencesService],
})
export class PaymentReferencesModule {}
