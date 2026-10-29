type SupabaseError = { code?: string; message: string };

const MIGRATION_PATH = "supabase/migrations/20261029_account_management.sql";

export function formatAuditHistoryError(action: string, error: SupabaseError) {
  const missingTable = error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.message.includes("public.audit_history") ||
    error.message.includes("audit_history") && error.message.toLowerCase().includes("schema cache");

  if (missingTable) {
    return `${action} Run ${MIGRATION_PATH} in the SQL Editor of the Supabase project connected to this deployment, then retry.`;
  }

  return `${action} ${error.message}`;
}
