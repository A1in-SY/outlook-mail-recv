import { useState, useEffect } from "react";
import { api, type Platform } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/PlatformIcon";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: number[];
  onConfirm: (platformIds: number[]) => void;
}

export function PlatformFilterDialog({ open, onOpenChange, selected, onConfirm }: Props) {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [localSelected, setLocalSelected] = useState<Set<number>>(new Set(selected));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLocalSelected(new Set(selected));
    setLoading(true);
    api.platforms.list().then(setPlatforms).catch((e) => {
      toast.error("加载平台列表失败: " + e.message);
    }).finally(() => setLoading(false));
  }, [open, selected]);

  const toggle = (id: number) => {
    setLocalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm(Array.from(localSelected));
    onOpenChange(false);
  };

  const handleClear = () => {
    setLocalSelected(new Set());
    onConfirm([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>按平台筛选可用邮箱</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground mb-3">
          筛选出尚未被用于以下平台注册的邮箱
        </div>
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">加载中...</div>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
            {platforms.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={localSelected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  className="accent-primary"
                />
                <PlatformIcon platform={p} size={16} />
                <span className="text-sm">{p.name}</span>
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleClear}>清除筛选</Button>
          <Button onClick={handleConfirm} disabled={loading}>确认筛选</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
