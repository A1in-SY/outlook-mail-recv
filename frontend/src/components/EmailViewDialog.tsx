import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CopyBtn } from "@/components/CopyBtn";
import { extractVerificationCode } from "@/lib/verification-code";
import { sanitiseEmailHtml } from "@/lib/tracker-blocking";
import { KeyRound, ShieldCheck } from "lucide-react";
import type { EmailItem } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: EmailItem | null;
  loading?: boolean;
}

function formatReceivedTime(ts: number) {
  if (!ts) return "-";
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`;
}

/** Split out so a `key` remount resets the reveal state instead of an effect. */
function EmailBody({ email, loading }: { email: EmailItem; loading: boolean }) {
  // Showing images is a per-message decision and is deliberately not persisted: one
  // click must never quietly opt later messages in.
  const [showRemote, setShowRemote] = useState(false);

  const { html: safeHtml, blocked } = useMemo(() => {
    if (!email.body_html) return { html: null, blocked: 0 };
    return sanitiseEmailHtml(email.body_html, !showRemote);
  }, [email.body_html, showRemote]);

  const code = useMemo(
    () => extractVerificationCode(email.subject ?? "", email.body ?? ""),
    [email.subject, email.body],
  );

  return (
    <div className="space-y-3 text-sm">
      {code && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <KeyRound className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs text-muted-foreground shrink-0">验证码</span>
          <span className="font-mono text-xl font-semibold tracking-[0.2em] select-all">{code}</span>
          <CopyBtn text={code} />
        </div>
      )}
      <div className="flex gap-2">
        <span className="text-muted-foreground shrink-0">发件人:</span>
        <span className="break-all">{email.sender}</span>
      </div>
      <div className="flex gap-2">
        <span className="text-muted-foreground shrink-0">日期:</span>
        <span>{formatReceivedTime(email.received_ts_ms)}</span>
      </div>
      {!loading && blocked > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2.5">
          <ShieldCheck className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">
            已屏蔽 {blocked} 个远程资源，可能包含追踪像素
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 ml-auto shrink-0"
            onClick={() => setShowRemote(true)}
          >
            显示图片
          </Button>
        </div>
      )}
      <div className="border-t pt-3 mt-3">
        {loading ? (
          <div className="text-sm text-muted-foreground py-6">正文加载中...</div>
        ) : safeHtml ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
            {email.body || "(无内容)"}
          </pre>
        )}
      </div>
    </div>
  );
}

export function EmailViewDialog({ open, onOpenChange, email, loading = false }: Props) {
  if (!email) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{email.subject || "(无主题)"}</DialogTitle>
        </DialogHeader>
        <EmailBody key={`${email.id}-${open}`} email={email} loading={loading} />
      </DialogContent>
    </Dialog>
  );
}
