import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '@/lib/api';

interface UsagePoint {
  recorded_at: string;
  primary_used: number;
  secondary_used: number;
  account_id: string;
}

interface Props {
  refreshKey?: number;
  accountId?: string;
}

export function UsageTrendChart({ refreshKey = 0, accountId }: Props) {
  const [data, setData] = useState<UsagePoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getUsageHistory(accountId)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey, accountId]);

  if (loading) return <div className="text-center text-sm text-muted-foreground py-8">加载中...</div>;
  if (data.length === 0) return <div className="text-center text-sm text-muted-foreground py-8">暂无用量历史数据</div>;

  // Format data for recharts
  const chartData = data.map(d => ({
    time: new Date(d.recorded_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    '5h用量%': d.primary_used,
    '周用量%': d.secondary_used,
  }));

  return (
    <div className="w-full h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="5h用量%" stroke="#f97316" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="周用量%" stroke="#3b82f6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
