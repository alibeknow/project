-- DELETE FROM addrobj WHERE livestatus <> 1;

ALTER TABLE "Countries" ADD COLUMN "isFias" BOOLEAN;
ALTER TABLE "Countries" ADD COLUMN "isShownInSearch" BOOLEAN;
ALTER TABLE "Countries" ADD COLUMN "isShownInZone" BOOLEAN;

ALTER TABLE "Regions" ADD COLUMN "isShownInSearch" BOOLEAN;
ALTER TABLE "Regions" ADD COLUMN "isShownInZone" BOOLEAN;


ALTER TABLE "Regions" ADD COLUMN "fias" JSON;
ALTER TABLE "Regions" ADD COLUMN "fiasGUID" UUID;
ALTER TABLE "Regions" ADD COLUMN "fiasParentGUID" UUID;

ALTER TABLE "Countries" ADD COLUMN "description" JSON;
ALTER TABLE "Regions" ADD COLUMN "description" JSON;

ALTER TABLE "Addresses" ADD COLUMN "fiasGUID" UUID;

ALTER TABLE "Regions" ADD COLUMN "kladrCode" VARCHAR(255);
ALTER TABLE "Addresses" ADD COLUMN "kladrCode" VARCHAR(255);

UPDATE "Countries" SET "isShownInSearch" = TRUE;
UPDATE "Countries" SET "isShownInZone" = TRUE;
UPDATE "Regions" SET "isShownInSearch" = TRUE;
UPDATE "Regions" SET "isShownInZone" = TRUE;

UPDATE "Regions" SET "isShownInSearch" = FALSE WHERE "CountryId" = 1000 AND "type" IN ('country', 'province', 'county');
UPDATE "Regions" SET "isShownInZone" = FALSE WHERE "CountryId" = 1000 AND "type" IN ('city', 'other');

UPDATE "Regions" SET "isShownInSearch" = TRUE WHERE "CountryId" = 2 AND "id" >= 10000 AND "type" IN ('city', 'other');

