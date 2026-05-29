import { useState, useEffect } from "react";
import { api, type Platform } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlatformIcon } from "@/components/PlatformIcon";
import { filterPlatforms } from "@/lib/platform-filter";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: number;
  accountEmail: string;
  onSaved?: () => void;
}

export function PlatformUsageDialog({ open, onOpenChange, accountId, accountEmail, onSaved }: Props) {
  const [allPlatforms, setAllPlatforms] = useState<Platform[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [platformSearch, setPlatformSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const filteredPlatforms = filterPlatforms(allPlatforms, platformSearch);

  useEffect(() => {
    if (!open) return;
    setPlatformSearch("");
    setLoading(true);
    Promise.all([
      api.platforms.list(),
      api.accounts.getPlatforms(accountId),
    ]).then(([platforms, used]) => {
      setAllPlatforms(platforms);
      setSelected(new Set(used.map((p) => p.id)));
    }).catch((e) => {
      toast.error("加载失败: " + e.message);
    }).finally(() => {
      setLoading(false);
    });
  }, [open, accountId]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.accounts.updatePlatforms(accountId, Array.from(selected));
      toast.success("保存成功");
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("保存失败: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>平台使用记录</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground mb-3">
          {accountEmail}
        </div>
        <Input
          value={platformSearch}
          onChange={(e) => setPlatformSearch(e.target.value)}
          placeholder="搜索平台..."
          aria-label="搜索平台"
          className="mb-3"
        />
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">加载中...</div>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
            {filteredPlatforms.length === 0 ? (
              <div className="col-span-2 py-8 text-center text-sm text-muted-foreground">
                未找到匹配平台
              </div>
            ) : (
              filteredPlatforms.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    className="accent-primary"
                  />
                  <PlatformIcon platform={p} size={16} />
                  <span className="text-sm">{p.name}</span>
                </label>
              ))
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
