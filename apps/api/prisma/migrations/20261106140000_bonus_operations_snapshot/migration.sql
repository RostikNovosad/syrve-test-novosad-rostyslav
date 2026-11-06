-- Журнал операцій: знімок гостя (працює і для гостей без Telegram), guest_id необов'язковий
ALTER TABLE "bonus_operations" ALTER COLUMN "guest_id" DROP NOT NULL;
ALTER TABLE "bonus_operations"
  ADD COLUMN "syrve_customer_id" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "guest_phone" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "guest_name" TEXT NOT NULL DEFAULT '';

UPDATE "bonus_operations" o
SET "syrve_customer_id" = g."syrve_customer_id", "guest_phone" = g."phone", "guest_name" = g."name"
FROM "guests" g WHERE g."id" = o."guest_id";

ALTER TABLE "bonus_operations"
  ALTER COLUMN "syrve_customer_id" DROP DEFAULT,
  ALTER COLUMN "guest_phone" DROP DEFAULT,
  ALTER COLUMN "guest_name" DROP DEFAULT;

DROP INDEX "bonus_operations_guest_id_created_at_idx";
CREATE INDEX "bonus_operations_syrve_customer_id_created_at_idx" ON "bonus_operations"("syrve_customer_id", "created_at");
CREATE INDEX "bonus_operations_created_at_idx" ON "bonus_operations"("created_at");

-- Необов'язковий зв'язок: видалення гостя не блокується журналом
ALTER TABLE "bonus_operations" DROP CONSTRAINT "bonus_operations_guest_id_fkey";
ALTER TABLE "bonus_operations" ADD CONSTRAINT "bonus_operations_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
