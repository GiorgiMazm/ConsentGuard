-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" DATETIME
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "defaultLocale" TEXT NOT NULL DEFAULT 'en',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ConsentBlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CHECKBOX',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ConsentTranslation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "blockId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    CONSTRAINT "ConsentTranslation_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ConsentBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DisplayRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "blockId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "operator" TEXT NOT NULL DEFAULT 'contains',
    "valueJson" TEXT NOT NULL,
    "group" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DisplayRule_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ConsentBlock" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsentEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "blockId" TEXT,
    "orderId" TEXT,
    "orderName" TEXT,
    "checkoutToken" TEXT,
    "locale" TEXT,
    "consented" BOOLEAN NOT NULL DEFAULT true,
    "consentTextSnapshot" TEXT NOT NULL,
    "consentPayloadJson" TEXT NOT NULL,
    "consentedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsentEvent_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "ConsentBlock" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");

-- CreateIndex
CREATE INDEX "ConsentBlock_shop_idx" ON "ConsentBlock"("shop");

-- CreateIndex
CREATE INDEX "ConsentBlock_shop_active_sortOrder_idx" ON "ConsentBlock"("shop", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentTranslation_blockId_locale_key" ON "ConsentTranslation"("blockId", "locale");

-- CreateIndex
CREATE INDEX "DisplayRule_blockId_idx" ON "DisplayRule"("blockId");

-- CreateIndex
CREATE INDEX "ConsentEvent_shop_createdAt_idx" ON "ConsentEvent"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "ConsentEvent_shop_orderName_idx" ON "ConsentEvent"("shop", "orderName");

-- CreateIndex
CREATE INDEX "ConsentEvent_blockId_idx" ON "ConsentEvent"("blockId");
