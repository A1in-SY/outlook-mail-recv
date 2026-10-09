export const ACCOUNT_LIST_PAGE_PARAM = "page";
export const ACCOUNT_LIST_RETURN_PAGE_PARAM = "accountPage";

type EmailFolder = "INBOX" | "Junk";

export function parseAccountListPage(value: string | null | undefined): number {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;

  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

export function accountListPath(page: number): string {
  const safePage = parseAccountListPage(String(page));
  return safePage === 1 ? "/" : `/?${ACCOUNT_LIST_PAGE_PARAM}=${safePage}`;
}

export function emailFolderPath(
  accountId: number,
  folder: EmailFolder,
  accountListPage: number,
): string {
  const path = `/emails/${accountId}/${folder}`;
  const safePage = parseAccountListPage(String(accountListPage));
  return safePage === 1
    ? path
    : `${path}?${ACCOUNT_LIST_RETURN_PAGE_PARAM}=${safePage}`;
}
