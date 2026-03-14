/*
  Warnings:

  - You are about to drop the column `userId` on the `parking_records` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "parking_records" DROP CONSTRAINT "parking_records_userId_fkey";

-- AlterTable
ALTER TABLE "parking_records" DROP COLUMN "userId";
