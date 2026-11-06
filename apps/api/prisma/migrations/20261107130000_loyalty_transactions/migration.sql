-- Копія транзакцій гаманця Syrve для статистики (нарахування/списання за період).
-- Джерело істини лишається в Syrve; worker дописує сюди все, що бачить у by_revision.
CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "guest_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "sum" DECIMAL(12,2) NOT NULL,
    "balance_after" DECIMAL(12,2),
    "comment" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "revision" BIGINT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "loyalty_transactions_occurred_at_idx" ON "loyalty_transactions"("occurred_at");
CREATE INDEX "loyalty_transactions_guest_id_occurred_at_idx" ON "loyalty_transactions"("guest_id", "occurred_at");

ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: скидаємо курсор усіх гостей, щоб worker один раз підтягнув їхню наявну історію.
-- Повторних сповіщень не буде: уже оброблені транзакції відсікаються за processed_transactions.
UPDATE "guests" SET "last_revision" = NULL;
