import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { FileText, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import type { MailProtocol, ProtocolTestResult } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (lines: string[], separator: string, enabledProtocols: MailProtocol[]) => Promise<void>;
  onTestProtocol: (line: string, separator: string, enabledProtocols: MailProtocol[]) => Promise<ProtocolTestResult>;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function ImportDialog({ open, onOpenChange, onImport, onTestProtocol }: Props) {
  const [separator, setSeparator] = useState("----");
  const [text, setText] = useState("");
  const [enabledProtocols, setEnabledProtocols] = useState<MailProtocol[]>(["imap"]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const separatorValid = separator.trim().length > 0;

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

  const importLines = () => text.split("\n").filter((l) => l.trim());

  const validateInputs = (lines: string[]) => {
    if (!separatorValid) {
      toast.error("分隔符不能为空");
      return false;
    }
    if (!lines.length) {
      toast.error("请填写至少一行邮箱数据");
      return false;
    }
    if (enabledProtocols.length === 0) {
      toast.error("请至少选择一个取件协议");
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    const lines = importLines();
    if (!validateInputs(lines)) return;
    setLoading(true);
    try {
      await onImport(lines, separator, enabledProtocols);
      setText("");
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error("导入失败: " + errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleTestProtocol = async () => {
    const lines = importLines();
    if (!validateInputs(lines)) return;
    setTesting(true);
    try {
      const result = await onTestProtocol(lines[0].trim(), separator, enabledProtocols);
      toast.success(`协议测试成功: ${result.protocol.toUpperCase()}`);
    } catch (e: unknown) {
      toast.error("协议测试失败: " + errorMessage(e));
    } finally {
      setTesting(false);
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
          <Button
            variant="outline"
            onClick={handleTestProtocol}
            disabled={testing || loading || !text.trim() || !separatorValid || enabledProtocols.length === 0}
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${testing ? "animate-spin" : ""}`} />
            {testing ? "测试中..." : "协议测试"}
          </Button>
          <Button onClick={handleSubmit} disabled={loading || testing || !text.trim() || !separatorValid || enabledProtocols.length === 0}>
            <Upload className="w-4 h-4 mr-1" />
            {loading ? "导入中..." : "导入"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
