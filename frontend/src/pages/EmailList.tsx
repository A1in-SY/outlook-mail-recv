import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, type EmailItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmailViewDialog } from "@/components/EmailViewDialog";
import { CopyBtn } from "@/components/CopyBtn";
import { PlatformUsageDialog } from "@/components/PlatformUsageDialog";
import {
  ArrowLeft, RefreshCw, Eye, ChevronLeft, ChevronRight, Mail, Trash2, Wrench, ExternalLink,
} from "lucide-react";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function EmailList() {
  const { accountId, folder } = useParams<{ accountId: string; folder: string }>();
  const navigate = useNavigate();
  const [emails, setEmails] = useState<EmailItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [platformOpen, setPlatformOpen] = useState(false);
  const pageSize = 20;
  const accId = Number(accountId);
  const folderName = folder === "Junk" ? "垃圾箱" : "收件箱";

  const formatReceivedTime = (ts: number) => {
    if (!ts) return "-";
    const d = new Date(ts);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
  };

  const load = useCallback(async (pageOverride = page) => {
    if (!accountId || !folder) return;
    setLoading(true);
    try {
      const [items, acc] = await Promise.all([
        api.emails.list(accId, folder, pageOverride, pageSize),
        api.accounts.get(accId),
      ]);
      setEmails(items.items);
      setTotal(items.total);
      setAccountEmail(acc.email);
    } catch (e: unknown) {
      alert("加载失败: " + errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [accId, accountId, folder, page]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const handleRefresh = async () => {
    if (!accountId || !folder) return;
    setRefreshing(true);
    try {
      await api.emails.refresh(accId, folder);
      setPage(1);
      await load(1);
    } catch (e: unknown) {
      alert("刷新失败: " + errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  };

  const openEmail = async (email: EmailItem) => {
    setSelectedEmail(email);
    setViewOpen(true);
    if (email.body_fetched) return;
    setDetailLoading(true);
    try {
      const detail = await api.emails.get(email.id);
      setSelectedEmail(detail);
      setEmails((current) => current.map((item) => (item.id === detail.id ? detail : item)));
    } catch (e: unknown) {
      alert("加载正文失败: " + errorMessage(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-[1600px] mx-auto px-4 py-8">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="outline" onClick={() => navigate("/")}>
                    <ArrowLeft className="w-4 h-4 mr-1" />返回
                  </Button>
                  <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
                    <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
                    {refreshing ? "刷新中..." : "刷新"}
                  </Button>
                  <div className="flex items-center gap-2 ml-2">
                    {folder === "Junk" ? (
                      <Trash2 className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <Mail className="w-5 h-5 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">{folderName}</span>
                    <span className="text-muted-foreground">—</span>
                    <span className="text-sm">{accountEmail}</span>
                    {accountEmail && <CopyBtn text={accountEmail} />}
                    <Button variant="outline" size="sm" onClick={() => setPlatformOpen(true)}>
                      <Wrench className="w-4 h-4 mr-1" />使用
                    </Button>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/emails/${accountId}/${folder === "Junk" ? "INBOX" : "Junk"}`)}
                >
                  <ExternalLink className="w-4 h-4 mr-1" />
                  {folder === "Junk" ? "收件箱" : "垃圾箱"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">共 {total} 封邮件</span>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[250px]">发件人</TableHead>
                    <TableHead>主题</TableHead>
                    <TableHead className="w-[200px]">收件日期</TableHead>
                    <TableHead className="w-[100px] text-center">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        加载中...
                      </TableCell>
                    </TableRow>
                  ) : emails.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        暂无邮件
                      </TableCell>
                    </TableRow>
                  ) : (
                    emails.map((em) => (
                      <TableRow key={em.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openEmail(em)}>
                        <TableCell className="truncate max-w-[250px]" title={em.sender}>{em.sender || "(未知)"}</TableCell>
                        <TableCell className="truncate max-w-[400px]" title={em.subject}>{em.subject || "(无主题)"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatReceivedTime(em.received_ts_ms)}</TableCell>
                        <TableCell className="text-center">
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); openEmail(em); }}>
                            <Eye className="w-4 h-4 mr-1" />查看
                          </Button>
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
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 7) pageNum = i + 1;
                    else if (page <= 4) pageNum = i + 1;
                    else if (page >= totalPages - 3) pageNum = totalPages - 6 + i;
                    else pageNum = page - 3 + i;
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
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <EmailViewDialog open={viewOpen} onOpenChange={setViewOpen} email={selectedEmail} loading={detailLoading} />
      <PlatformUsageDialog
        open={platformOpen}
        onOpenChange={setPlatformOpen}
        accountId={accId}
        accountEmail={accountEmail}
      />
    </div>
  );
}
