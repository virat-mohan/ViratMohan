import { checkAdminAuth } from './admin-auth';

/** Agents and scheduled tasks: Bearer CRON_SECRET. Virat: the admin Basic Auth. */
export function orgWriteAllowed(authorization: string | null, cronSecret: string, adminPassword: string | undefined): boolean {
  if (!authorization) return false;
  if (cronSecret && authorization === `Bearer ${cronSecret}`) return true;
  return checkAdminAuth(authorization, adminPassword).ok;
}
