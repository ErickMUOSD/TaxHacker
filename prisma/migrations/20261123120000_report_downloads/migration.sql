-- CreateTable
CREATE TABLE "report_downloads" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "report_type" TEXT NOT NULL DEFAULT 'transactions',
    "name" TEXT NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "columns" JSONB NOT NULL DEFAULT '[]',
    "include_attachments" BOOLEAN NOT NULL DEFAULT true,
    "transactions_count" INTEGER NOT NULL DEFAULT 0,
    "downloaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_downloads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_downloads_user_id_downloaded_at_idx" ON "report_downloads"("user_id", "downloaded_at");

-- AddForeignKey
ALTER TABLE "report_downloads" ADD CONSTRAINT "report_downloads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
