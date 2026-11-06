-- Деактивація замість видалення: адмін з історією операцій не може бути видалений (FK), але може втратити доступ.
ALTER TABLE "admin_users" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
