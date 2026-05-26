import prisma from "../db.server";
import type { Plan } from "./plans";

export async function getShopSettings(shop: string) {
  return prisma.shopSettings.upsert({
    where: { shop },
    create: { shop },
    update: {},
  });
}

export async function updateShopSettings(
  shop: string,
  data: { plan?: Plan; retentionDays?: number; defaultLocale?: string },
) {
  return prisma.shopSettings.upsert({
    where: { shop },
    create: { shop, ...data },
    update: data,
  });
}
