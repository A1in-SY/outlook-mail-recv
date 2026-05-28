import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, Mail } from "lucide-react";
import { setToken, verifyToken } from "@/lib/api";
import { toast } from "sonner";

export function Login() {
  const navigate = useNavigate();
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!key.trim()) return;
    setLoading(true);
    try {
      setToken(key.trim());
      await verifyToken();
      toast.success("验证成功");
      navigate("/");
    } catch {
      setToken("");
      toast.error("密钥无效");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Mail className="w-7 h-7 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Outlook 邮箱管理</CardTitle>
          <CardDescription>请输入密钥以访问系统</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="输入访问密钥"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="pl-9"
              />
            </div>
            <Button className="w-full" onClick={handleLogin} disabled={loading || !key.trim()}>
              {loading ? "验证中..." : "进入系统"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
