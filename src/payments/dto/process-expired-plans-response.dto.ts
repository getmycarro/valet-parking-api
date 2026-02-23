export class ProcessExpiredPlansResponseDto {
  processedPlans: number;
  createdInvoices: number;
  skippedPlans: number;
  errors: Array<{
    companyPlanId: string;
    error: string;
  }>;
  invoices: Array<{
    id: string;
    companyPlanId: string;
    companyName: string;
    amountUSD: number;
    periodStart: Date;
    periodEnd: Date;
  }>;
}
