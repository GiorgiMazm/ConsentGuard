export type Plan = "FREE" | "PRO" | "BUSINESS";

export const PLAN_DETAILS = {
  FREE: { name: "Free", price: 0 },
  PRO: { name: "Pro", price: 9 },
  BUSINESS: { name: "Business", price: 19 },
} as const;

export function getPlanLimits(plan: Plan) {
  return {
    maxBlocks: plan === "FREE" ? 1 : Infinity,
    translations: plan !== "FREE",
    rules: plan !== "FREE",
    dateScheduling: plan !== "FREE",
    csvExport: plan !== "FREE",
    retentionDays: plan === "BUSINESS" ? 365 : plan === "PRO" ? 90 : 30,
    prioritySupport: plan === "BUSINESS",
  };
}

export function canCreateBlock(plan: Plan, currentActiveCount: number): boolean {
  const limits = getPlanLimits(plan);
  return currentActiveCount < limits.maxBlocks;
}
