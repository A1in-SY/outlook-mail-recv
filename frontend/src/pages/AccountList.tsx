import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, clearToken, type Account, type AccountUpdate, type MailProtocol } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportDialog } from "@/components/ImportDialog";
import { ExportDialog } from "@/components/ExportDialog";
import { CopyBtn } from "@/components/CopyBtn";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EditAccountDialog } from "@/components/EditAccountDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PlatformUsageDialog } from "@/components/PlatformUsageDialog";
import { PlatformFilterDialog } from "@/components/PlatformFilterDialog";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Search, Upload, Download, Inbox, Trash, Trash2, Eye, EyeOff, ChevronLeft, ChevronRight, Mail, LogOut, Wrench, Filter, Pencil,
} from "lucide-react";

const PLATFORM_DISPLAY_LIMIT = 5;
const SEARCH_DEBOUNCE_MS = 300;

// Nine dense columns overflow below ~1400px, so the actions stay pinned to the right
// edge. A pinned cell scrolls over its neighbours, so it cannot use the row's
// translucent tints -- content would show through. These pre-composite them onto the
// card background instead.
const PINNED = "sticky right-0 border-l transition-colors";
const PINNED_BG = "bg-card";
const PINNED_BG_SELECTED = "bg-[color-mix(in_oklch,var(--muted)_30%,var(--card))]";
const PINNED_BG_HOVER = "group-hover:bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))]";
const PINNED_BG_HEAD = "bg-[color-mix(in_oklch,var(--muted)_50%,var(--card))]";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function MaskedField({ value }: { value: string }) {
  const [show, setShow] = useState(false);
  const display = show ? value : value.slice(0, 6) + "******";
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-xs truncate max-w-[140px]" title={show ? value : undefined}>
        {display}
      </span>
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => setShow(!show)}>
        {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </Button>
      <CopyBtn text={value} />
    </div>
  );
}

function TruncatedField({ value, max = 20 }: { value: string; max?: number }) {
  const truncated = value.length > max ? value.slice(0, max) + "..." : value;
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-xs truncate max-w-[160px]" title={value}>{truncated}</span>
      <CopyBtn text={value} />
    </div>
  );
}

export function AccountList() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportData, setExportData] = useState("");
  const [platformDialogOpen, setPlatformDialogOpen] = useState(false);
  const [platformDialogAccount, setPlatformDialogAccount] = useState<Account | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<number[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const pageSize = 15;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const filter = platformFilter.length > 0 ? platformFilter : undefined;
      const [items, countRes] = await Promise.all([
        api.accounts.list(page, pageSize, debouncedSearch, filter),
        api.accounts.count(debouncedSearch, filter),
      ]);
      setAccounts(items);
      setTotal(countRes.total);
      setLoaded(true);
    } catch (e: unknown) {
      toast.error("加载失败: " + errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, platformFilter]);

  // Only the search box is debounced; paging and filters must feel immediate.
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [search]);

  // Deferred by a timeout so the loading flag is not set during the effect body.
  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const handleImport = async (lines: string[], separator: string, enabledProtocols: MailProtocol[]) => {
    const res = await api.accounts.import(lines, separator, enabledProtocols);
    const msg = `导入完成: 成功 ${res.imported} 个, 跳过 ${res.skipped} 个`;
    if (res.errors.length) {
      toast.warning(msg, { description: res.errors.join("\n") });
    } else {
      toast.success(msg);
    }
    load();
  };

  const handleProtocolTest = (line: string, separator: string, enabledProtocols: MailProtocol[]) =>
    api.accounts.testProtocol(line, separator, enabledProtocols);

  const handleExport = async (separator: string, ids?: number[]) => {
    if (!separator.trim()) {
      toast.error("分隔符不能为空");
      return;
    }
    const res = await api.accounts.export(separator, ids);
    setExportData(res.lines.join("\n"));
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    await api.accounts.delete(id);
    setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    toast.success("删除成功");
    await load();
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    const results = await Promise.allSettled(ids.map((id) => api.accounts.delete(id)));
    const deleted = ids.filter((_, i) => results[i].status === "fulfilled");
    const failed = ids.length - deleted.length;

    setSelected((prev) => {
      const next = new Set(prev);
      deleted.forEach((id) => next.delete(id));
      return next;
    });

    if (failed > 0) {
      toast.warning(`删除完成: 成功 ${deleted.length} 个, 失败 ${failed} 个`);
    } else {
      toast.success(`已删除 ${deleted.length} 个邮箱`);
    }
    await load();
  };

  const handleUpdateAccount = async (id: number, data: AccountUpdate) => {
    await api.accounts.update(id, data);
    await load();
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === accounts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(accounts.map((a) => a.id)));
    }
  };

  const openExportSelected = () => {
    if (selected.size === 0) {
      toast.warning("请先勾选要导出的邮箱");
      return;
    }
    setExportOpen(true);
    handleExport("----", Array.from(selected));
  };

  const openExportAll = () => {
    setExportOpen(true);
    handleExport("----");
  };

  const totalPages = Math.ceil(total / pageSize);
  const allChecked = accounts.length > 0 && selected.size === accounts.length;

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-[1600px] mx-auto px-4 py-8">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <Mail className="w-8 h-8 text-primary" />
                <CardTitle className="text-2xl">Outlook 邮箱管理</CardTitle>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setImportOpen(true)}>
                  <Download className="w-4 h-4 mr-1" />导入
                </Button>
                <Button variant="outline" onClick={openExportSelected} disabled={selected.size === 0}>
                  <Upload className="w-4 h-4 mr-1" />导出选中{selected.size > 0 && `(${selected.size})`}
                </Button>
                <Button variant="outline" onClick={openExportAll}>
                  <Upload className="w-4 h-4 mr-1" />导出所有
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setBulkDeleteOpen(true)}
                  disabled={selected.size === 0}
                >
                  <Trash2 className="w-4 h-4 mr-1" />删除选中{selected.size > 0 && `(${selected.size})`}
                </Button>
                <ThemeToggle />
                <Button variant="ghost" onClick={() => { clearToken(); navigate("/login"); }}>
                  <LogOut className="w-4 h-4 mr-1" />退出
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索邮箱..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-9"
                />
              </div>
              <Button
                variant={platformFilter.length > 0 ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterOpen(true)}
              >
                <Filter className="w-4 h-4 mr-1" />
                可用筛选
                {platformFilter.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                    {platformFilter.length}
                  </Badge>
                )}
              </Button>
              <span className="text-sm text-muted-foreground">共 {total} 个</span>
            </div>

            <div className="border rounded-lg overflow-x-auto relative">
              {loading && loaded && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary/20 overflow-hidden z-10">
                  <div className="h-full w-1/3 bg-primary animate-pulse" />
                </div>
              )}
              <Table className={loading && loaded ? "opacity-60 transition-opacity" : "transition-opacity"}>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={toggleSelectAll}
                        className="accent-primary"
                        aria-label="全选当前页"
                      />
                    </TableHead>
                    <TableHead className="min-w-[180px]">邮箱</TableHead>
                    <TableHead className="min-w-[140px]">密码</TableHead>
                    <TableHead className="min-w-[160px]">Client ID</TableHead>
                    <TableHead className="min-w-[160px]">Refresh Token</TableHead>
                    <TableHead className="w-[120px]">协议</TableHead>
                    <TableHead className="w-[120px] whitespace-nowrap">RT 有效期</TableHead>
                    <TableHead className="w-[140px] whitespace-nowrap">已注册平台</TableHead>
                    <TableHead className={cn("w-[240px] text-center", PINNED, PINNED_BG_HEAD)}>操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!loaded ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        加载中...
                      </TableCell>
                    </TableRow>
                  ) : accounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    accounts.map((acc) => (
                      <TableRow key={acc.id} className={cn("group", selected.has(acc.id) && "bg-muted/30")}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selected.has(acc.id)}
                            onChange={() => toggleSelect(acc.id)}
                            className="accent-primary"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-[160px]" title={acc.email}>{acc.email}</span>
                            <CopyBtn text={acc.email} />
                          </div>
                        </TableCell>
                        <TableCell><MaskedField value={acc.password} /></TableCell>
                        <TableCell><TruncatedField value={acc.client_id} /></TableCell>
                        <TableCell><TruncatedField value={acc.refresh_token} /></TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {acc.enabled_protocols.map((protocol) => (
                              <Badge key={protocol} variant={protocol === "graph" ? "default" : "secondary"}>
                                {protocol.toUpperCase()}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {acc.rt_expires_at ? (
                            (() => {
                              const expiresAt = new Date(acc.rt_expires_at);
                              const diff = expiresAt.getTime() - Date.now();
                              const days = Math.floor(diff / 86400000);
                              const expired = diff < 0;
                              const tone = expired
                                ? "text-destructive"
                                : days < 7
                                  ? "text-yellow-600 dark:text-yellow-500"
                                  : "text-green-600 dark:text-green-500";
                              const label = expired
                                ? "已过期"
                                : days === 0
                                  ? "今天到期"
                                  : `剩余${days}天`;
                              return (
                                <span className={`text-xs ${tone}`} title={expiresAt.toLocaleString()}>
                                  {label}
                                </span>
                              );
                            })()
                          ) : (
                            <span className="text-xs text-muted-foreground">未知</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            {acc.platforms.length === 0 ? (
                              <span className="text-xs text-muted-foreground">-</span>
                            ) : (
                              <>
                                {acc.platforms.slice(0, PLATFORM_DISPLAY_LIMIT).map((p) => (
                                  <PlatformIcon key={p.id} platform={p} size={18} />
                                ))}
                                {acc.platforms.length > PLATFORM_DISPLAY_LIMIT && (
                                  <span className="text-xs text-muted-foreground ml-0.5">
                                    +{acc.platforms.length - PLATFORM_DISPLAY_LIMIT}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell
                          className={cn(
                            PINNED,
                            PINNED_BG_HOVER,
                            selected.has(acc.id) ? PINNED_BG_SELECTED : PINNED_BG
                          )}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="outline" size="sm" className="h-8 w-8 p-0"
                              onClick={() => navigate(`/emails/${acc.id}/INBOX`)}
                              title="收件箱" aria-label={`${acc.email} 的收件箱`}
                            >
                              <Inbox className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline" size="sm" className="h-8 w-8 p-0"
                              onClick={() => navigate(`/emails/${acc.id}/Junk`)}
                              title="垃圾箱" aria-label={`${acc.email} 的垃圾箱`}
                            >
                              <Trash className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline" size="sm" className="h-8 w-8 p-0"
                              onClick={() => { setPlatformDialogAccount(acc); setPlatformDialogOpen(true); }}
                              title="管理已注册平台" aria-label={`管理 ${acc.email} 的已注册平台`}
                            >
                              <Wrench className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline" size="sm" className="h-8 w-8 p-0"
                              onClick={() => { setEditAccount(acc); setEditOpen(true); }}
                              title="编辑" aria-label={`编辑 ${acc.email}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="destructive" size="sm" className="h-8 px-2.5"
                              onClick={() => setDeleteTarget(acc)}
                              aria-label={`删除 ${acc.email}`}
                            >
                              <Trash2 className="w-4 h-4 mr-1" />删除
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                  第 {page} / {totalPages} 页
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline" size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 7) {
                      pageNum = i + 1;
                    } else if (page <= 4) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 3) {
                      pageNum = totalPages - 6 + i;
                    } else {
                      pageNum = page - 3 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={pageNum === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => setPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                  <Button
                    variant="outline" size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={handleImport}
        onTestProtocol={handleProtocolTest}
      />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} data={exportData} onExport={handleExport} />
      {platformDialogAccount && (
        <PlatformUsageDialog
          open={platformDialogOpen}
          onOpenChange={setPlatformDialogOpen}
          accountId={platformDialogAccount.id}
          accountEmail={platformDialogAccount.email}
          onSaved={load}
        />
      )}
      <PlatformFilterDialog
        open={filterOpen}
        onOpenChange={setFilterOpen}
        selected={platformFilter}
        onConfirm={(ids) => { setPlatformFilter(ids); setPage(1); }}
      />
      <EditAccountDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        account={editAccount}
        onSave={handleUpdateAccount}
      />
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="删除邮箱"
        description={deleteTarget ? `确认删除 ${deleteTarget.email} ？该操作不可撤销。` : undefined}
        confirmText="删除"
        confirmVariant="destructive"
        onConfirm={handleDelete}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title="批量删除邮箱"
        description={`确认删除选中的 ${selected.size} 个邮箱？该操作不可撤销。`}
        confirmText={`删除 ${selected.size} 个`}
        confirmVariant="destructive"
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}
