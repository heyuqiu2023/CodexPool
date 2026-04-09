import { useState, useEffect } from 'react';
import { api, setAuthToken, getAuthToken } from '@/lib/api';

export function LoginDialog({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await api.login(password);
      if (result.ok) {
        setAuthToken(result.token);
        onAuthenticated();
      }
    } catch (err) {
      setError((err as Error).message || '密码错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center z-50">
      <div className="w-full max-w-sm mx-auto p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">🦞 小龙虾</h1>
          <p className="text-sm text-muted-foreground mt-2">Codex 账号池管理器</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入访问密码"
              className="w-full px-4 py-2 border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {loading ? '验证中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
