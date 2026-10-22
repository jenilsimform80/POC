-- AlterEnum
ALTER TYPE "audit_action" ADD VALUE 'PASSWORD_RESET';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;
