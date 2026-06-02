-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "parkingRecordId" TEXT;

-- CreateIndex
CREATE INDEX "notifications_parkingRecordId_idx" ON "notifications"("parkingRecordId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_parkingRecordId_fkey" FOREIGN KEY ("parkingRecordId") REFERENCES "parking_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
