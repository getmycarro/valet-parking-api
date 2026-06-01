-- CreateTable
CREATE TABLE "payment_references" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "publicId" TEXT,
    "parkingRecordId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_references_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_references_parkingRecordId_idx" ON "payment_references"("parkingRecordId");

-- AddForeignKey
ALTER TABLE "payment_references" ADD CONSTRAINT "payment_references_parkingRecordId_fkey" FOREIGN KEY ("parkingRecordId") REFERENCES "parking_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_references" ADD CONSTRAINT "payment_references_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
