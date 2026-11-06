-- CreateEnum
CREATE TYPE "BonusOperationType" AS ENUM ('topup', 'chargeoff');

-- CreateEnum
CREATE TYPE "BonusOperationStatus" AS ENUM ('pending', 'done', 'failed');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateTable
CREATE TABLE "guests" (
    "id" TEXT NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "syrve_customer_id" TEXT NOT NULL,
    "card_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bonus_operations" (
    "id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "type" "BonusOperationType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "BonusOperationStatus" NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "bonus_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_state" (
    "key" TEXT NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "processed_transactions" (
    "id" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guests_telegram_id_key" ON "guests"("telegram_id");

-- CreateIndex
CREATE UNIQUE INDEX "guests_phone_key" ON "guests"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "guests_syrve_customer_id_key" ON "guests"("syrve_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_login_key" ON "admin_users"("login");

-- CreateIndex
CREATE INDEX "bonus_operations_guest_id_created_at_idx" ON "bonus_operations"("guest_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_transaction_id_key" ON "notifications"("transaction_id");

-- CreateIndex
CREATE INDEX "notifications_status_created_at_idx" ON "notifications"("status", "created_at");

-- AddForeignKey
ALTER TABLE "bonus_operations" ADD CONSTRAINT "bonus_operations_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_operations" ADD CONSTRAINT "bonus_operations_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
