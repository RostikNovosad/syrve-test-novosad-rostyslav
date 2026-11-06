-- Журнал системних дій адміністраторів (входи, гості, керування адмінами).
-- Ручні нарахування/списання лишаються у bonus_operations.
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT,
    "admin_login" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "target_label" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- Видалення адміна не стирає історію його дій: лишається знімок логіну
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
