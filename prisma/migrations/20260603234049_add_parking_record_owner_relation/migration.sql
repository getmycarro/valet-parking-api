-- AddForeignKey
ALTER TABLE "parking_records" ADD CONSTRAINT "parking_records_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
