-- CreateEnum
CREATE TYPE "ParkingRecordStatus" AS ENUM ('UNPAID', 'PAID', 'FREE');

-- AlterTable
ALTER TABLE "parking_records" ADD COLUMN "status" "ParkingRecordStatus" NOT NULL DEFAULT 'UNPAID';
