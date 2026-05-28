import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Upload, FileText } from "lucide-react";
import type { MailProtocol } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (lines: string[], separator: string, enabledProtocols: MailProtocol[]) => Promise<void>;
}

export function ImportDialog({ open, onOpenChange, onImport }: Props) {
  const [separator, setSeparator] = useState("----");
  const [text, setText] = useState("");
  const [enabledProtocols, setEnabledProtocols] = useState<MailProtocol[]>(["imap"]);
  const [loading, setLoading] = useState(false);

  const toggleProtocol = (protocol: MailProtocol) => {
    setEnabledProtocols((current) => {
      if (current.includes(protocol)) {
        return current.filter((p) => p !== protocol);
      }
      return [...current, protocol];
    });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(reader.result as string);
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    const lines = text.split("\n").filter((l) => l.trim());
    if (!lines.length || enabledProtocols.length === 0) return;
    setLoading(true);
    try {
      await onImport(lines, separator, enabledProtocols);
      setText("");
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>导入邮箱</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium whitespace-nowrap">分隔符</label>
            <Input
              value={separator}
              onChange={(e) => setSeparator(e.target.value)}
              className="w-32"
            />
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="file" accept=".txt" className="hidden" onChange={handleFile} />
              <Button variant="outline" size="sm" asChild>
                <span><FileText className="w-4 h-4 mr-1" />选择文件</span>
              </Button>
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            每行一个，格式：邮箱{separator}密码{separator}client_id{separator}refresh_token
          </p>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">取件协议</span>
            {(["imap", "graph"] as MailProtocol[]).map((protocol) => (
              <label key={protocol} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabledProtocols.includes(protocol)}
                  onChange={() => toggleProtocol(protocol)}
                  className="accent-primary"
                />
                {protocol.toUpperCase()}
              </label>
            ))}
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`example@outlook.com${separator}password${separator}client_id${separator}refresh_token`}
            rows={10}
            className="font-mono text-sm"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSubmit} disabled={loading || !text.trim() || enabledProtocols.length === 0}>
            <Upload className="w-4 h-4 mr-1" />
            {loading ? "导入中..." : "导入"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
