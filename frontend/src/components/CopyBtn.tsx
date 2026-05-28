import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

export function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        // fallback for HTTP (non-secure) contexts
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setOk(true);
      toast.success("已复制");
      setTimeout(() => setOk(false), 1500);
    } catch {
      toast.error("复制失败");
    }
  };
  return (
    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={copy}>
      {ok ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </Button>
  );
}
