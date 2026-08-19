import type { UserRole } from "@sncf-alerts/shared";

export function canAccessDashboard(opts: {
  hasSession: boolean;
  visitorEnabled: boolean;
}): boolean {
  return opts.hasSession || opts.visitorEnabled;
}

export function roleIsAllowed(
  role: UserRole,
  allowed: readonly UserRole[],
): boolean {
  return allowed.includes(role);
}

/** Refus si on désactive ou rétrograde le dernier admin actif. */
export function wouldRemoveLastAdmin(opts: {
  targetIsActiveAdmin: boolean;
  activeAdminCount: number;
  disable?: boolean;
  nextRole?: UserRole;
}): boolean {
  if (!opts.targetIsActiveAdmin) return false;
  if (opts.activeAdminCount > 1) return false;
  if (opts.disable === true) return true;
  if (opts.nextRole !== undefined && opts.nextRole !== "admin") return true;
  return false;
}
