-- Ролі адміністраторів: owner — власник (повний доступ), manager — менеджер.
CREATE TYPE "AdminRole" AS ENUM ('owner', 'manager');

ALTER TABLE "admin_users" ADD COLUMN "role" "AdminRole" NOT NULL DEFAULT 'manager';

-- Усі наявні адміни (перший — із ADMIN_LOGIN) стають власниками, щоб не втратити доступ.
UPDATE "admin_users" SET "role" = 'owner';
