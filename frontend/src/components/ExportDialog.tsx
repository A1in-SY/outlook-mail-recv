import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Download, Copy, Check } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: string;
  onExport: (separator: string) => void;
}

export function ExportDialog({ open, onOpenChange, data, onExport }: Props) {
  const [separator, setSeparator] = useState("----");
  const [copied, setCopied] = useState(false);
  const separatorValid = separator.trim().length > 0;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(data);
      } else {
        const ta = document.createElement("textarea");
        ta.value = data;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  const handleDownload = () => {
    const blob = new Blob([data], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "accounts_export.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRefreshPreview = () => {
    if (!separatorValid) {
      toast.error("分隔符不能为空");
      return;
    }
    onExport(separator);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>导出邮箱</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium whitespace-nowrap">分隔符</label>
            <Input
              value={separator}
              onChange={(e) => setSeparator(e.target.value)}
              className="w-32"
            />
            <Button variant="outline" size="sm" onClick={handleRefreshPreview} disabled={!separatorValid}>
              刷新预览
            </Button>
          </div>
          {data && (
            <>
              <Textarea
                value={data}
                readOnly
                rows={12}
                className="font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                  {copied ? "已复制" : "复制"}
                </Button>
                <Button onClick={handleDownload}>
                  <Download className="w-4 h-4 mr-1" />
                  下载文件
                </Button>
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
