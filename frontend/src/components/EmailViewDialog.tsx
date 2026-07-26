import { useMemo } from "react";
import DOMPurify from "dompurify";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CopyBtn } from "@/components/CopyBtn";
import { extractVerificationCode } from "@/lib/verification-code";
import { KeyRound } from "lucide-react";
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

export function EmailViewDialog({ open, onOpenChange, email, loading = false }: Props) {
  const bodyHtml = email?.body_html;
  const safeHtml = useMemo(() => {
    if (!bodyHtml) return null;
    return DOMPurify.sanitize(bodyHtml, {
      ADD_TAGS: ["style"],
      ADD_ATTR: ["target"],
    });
  }, [bodyHtml]);

  const subject = email?.subject ?? "";
  const body = email?.body ?? "";
  const code = useMemo(() => extractVerificationCode(subject, body), [subject, body]);

  if (!email) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{email.subject || "(无主题)"}</DialogTitle>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}
