import { toast } from "sonner";
import { isAccountAuthError } from "@/lib/api";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Shows a failure without implying it is worth retrying when it is not.
 *
 * A dead mailbox credential and a momentary network blip used to produce the same
 * "刷新失败: ..." toast, so the only way to tell them apart was to keep clicking. The
 * account-auth case already carries a self-explanatory reason from the backend, so it is
 * shown on its own -- prefixing it with "刷新失败" would bury the actionable part -- and
 * it stays up longer because it calls for re-authorising the account, not a retry.
 */
export function showFailure(prefix: string, error: unknown): void {
  if (isAccountAuthError(error)) {
    toast.error(errorMessage(error), { duration: 8000 });
    return;
  }
  toast.error(prefix + errorMessage(error));
}
