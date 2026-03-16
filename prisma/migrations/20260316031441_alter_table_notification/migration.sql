-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'OBJECT_SEARCH_IN_PROGRESS';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "recipientId" TEXT;

-- CreateIndex
CREATE INDEX "notifications_recipientId_idx" ON "notifications"("recipientId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
