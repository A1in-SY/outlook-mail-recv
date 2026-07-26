import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Save } from "lucide-react";
import { toast } from "sonner";
import type { Account, AccountUpdate, MailProtocol } from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account | null;
  onSave: (id: number, data: AccountUpdate) => Promise<void>;
}

interface FormProps {
  account: Account;
  onOpenChange: (open: boolean) => void;
  onSave: (id: number, data: AccountUpdate) => Promise<void>;
}

const PROTOCOLS: MailProtocol[] = ["imap", "graph"];

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/** Split out so a `key` remount reseeds the fields instead of an effect. */
function EditAccountForm({ account, onOpenChange, onSave }: FormProps) {
  const [password, setPassword] = useState(account.password);
  const [clientId, setClientId] = useState(account.client_id);
  const [refreshToken, setRefreshToken] = useState(account.refresh_token);
  const [protocols, setProtocols] = useState<MailProtocol[]>(account.enabled_protocols);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggleProtocol = (protocol: MailProtocol) => {
    setProtocols((current) =>
      current.includes(protocol)
        ? current.filter((p) => p !== protocol)
        : [...current, protocol]
    );
  };

  const handleSave = async () => {
    if (!clientId.trim() || !refreshToken.trim()) {
      toast.error("Client ID 和 Refresh Token 不能为空");
      return;
    }
    if (protocols.length === 0) {
      toast.error("请至少选择一个取件协议");
      return;
    }
    setSaving(true);
    try {
      await onSave(account.id, {
        password,
        client_id: clientId.trim(),
        refresh_token: refreshToken.trim(),
        enabled_protocols: protocols,
      });
      toast.success("保存成功");
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error("保存失败: " + errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">邮箱</label>
          <Input value={account.email} readOnly disabled className="font-mono text-sm" />
          <p className="text-xs text-muted-foreground">邮箱地址不可修改，如需更换请重新导入</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="edit-password">密码</label>
          <div className="flex items-center gap-2">
            <Input
              id="edit-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="font-mono text-sm"
            />
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? "隐藏密码" : "显示密码"}
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="edit-client-id">Client ID</label>
          <Input
            id="edit-client-id"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="font-mono text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="edit-refresh-token">Refresh Token</label>
          <Input
            id="edit-refresh-token"
            value={refreshToken}
            onChange={(e) => setRefreshToken(e.target.value)}
            className="font-mono text-sm"
          />
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">取件协议</span>
          {PROTOCOLS.map((protocol) => (
            <label key={protocol} className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={protocols.includes(protocol)}
                onChange={() => toggleProtocol(protocol)}
                className="accent-primary"
              />
              {protocol.toUpperCase()}
            </label>
          ))}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-1" />
          {saving ? "保存中..." : "保存"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function EditAccountDialog({ open, onOpenChange, account, onSave }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑邮箱</DialogTitle>
        </DialogHeader>
        {account && (
          <EditAccountForm
            key={`${account.id}-${open}`}
            account={account}
            onOpenChange={onOpenChange}
            onSave={onSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
