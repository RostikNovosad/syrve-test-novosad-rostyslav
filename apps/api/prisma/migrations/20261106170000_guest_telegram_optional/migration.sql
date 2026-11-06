-- Гість може існувати без Telegram (створений адміністратором з панелі)
ALTER TABLE "guests" ALTER COLUMN "telegram_id" DROP NOT NULL;
