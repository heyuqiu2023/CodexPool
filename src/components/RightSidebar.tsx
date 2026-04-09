import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { PoolSettings } from '@/types';
import { RotateCw, Zap, KeyRound, RefreshCcw, Pause, ShieldCheck, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface RightSidebarProps {
  settings: PoolSettings;
  onSettingsChange: (settings: PoolSettings) => void;
  onRotateNow: () => void;
  onPauseAll: () => void;
  onHealthCheck: () => void;
  onRestartOpenClaw?: () => void;
  onRefreshAllTokens?: () => void;
  onCheckAllUsage?: () => void;
  onClearAll?: () => void;
  accountCount?: number;
}

export function RightSidebar({ settings, onSettingsChange, onRotateNow, onPauseAll, onHealthCheck, onRestartOpenClaw, onRefreshAllTokens, onCheckAllUsage, onClearAll, accountCount = 0 }: RightSidebarProps) {
  const { t } = useI18n();

  const update = (partial: Partial<PoolSettings>) => {
    onSettingsChange({ ...settings, ...partial });
  };

  return (
    <aside className="w-[280px] shrink-0 border-l border-border/50 bg-background/50 backdrop-blur-md overflow-y-auto">

      {/* 快捷操作 */}
      <div className="p-4 border-b border-border/50 space-y-2">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">{t('right.quickActions')}</h3>
        <Button onClick={onRotateNow} className="w-full h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground">
          <RotateCw className="h-3.5 w-3.5 mr-1.5" />
          {t('right.rotateNext')}
        </Button>

        {onCheckAllUsage && (
          <Button onClick={onCheckAllUsage} variant="outline" className="w-full h-8 text-xs border-primary/30 text-primary hover:bg-primary/10">
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            {t('right.checkAllUsage')}
          </Button>
        )}

        <Button onClick={onHealthCheck} variant="outline" className="w-full h-8 text-xs">
          <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
          {t('right.healthCheck')}
        </Button>

        <Button onClick={onPauseAll} variant="outline" className="w-full h-8 text-xs">
          <Pause className="h-3.5 w-3.5 mr-1.5" />
          {t('right.pauseAll')}
        </Button>

        {onClearAll && accountCount > 0 && (
          <Button onClick={onClearAll} variant="outline" className="w-full h-8 text-xs border-destructive/30 text-destructive hover:bg-destructive/10">
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {t('filter.clearAll')}
          </Button>
        )}
      </div>

      {/* 轮换策略 */}
      <div className="p-4 border-b border-border/50 space-y-4">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">{t('right.rotationSettings')}</h3>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t('right.strategy')}</Label>
          <Select value={settings.strategy} onValueChange={(v) => update({ strategy: v as PoolSettings['strategy'] })}>
            <SelectTrigger className="h-8 text-xs bg-input border-border/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="round_robin">{t('right.strategy.round_robin')}</SelectItem>
              <SelectItem value="least_used">{t('right.strategy.least_used')}</SelectItem>
              <SelectItem value="random">{t('right.strategy.random')}</SelectItem>
              <SelectItem value="priority_based">{t('right.strategy.priority_based')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">{t('right.autoRotation')}</Label>
          <Switch checked={settings.auto_rotation} onCheckedChange={(v) => update({ auto_rotation: v })} />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">{t('right.autoTokenRefresh')}</Label>
          <Switch checked={settings.auto_token_refresh} onCheckedChange={(v) => update({ auto_token_refresh: v })} />
        </div>

        {settings.auto_token_refresh && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('right.refreshInterval')}</Label>
            <Select
              value={String(settings.token_refresh_interval_hours)}
              onValueChange={(v) => update({ token_refresh_interval_hours: Number(v) })}
            >
              <SelectTrigger className="h-8 text-xs bg-input border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24">24h (1 天)</SelectItem>
                <SelectItem value="48">48h (2 天)</SelectItem>
                <SelectItem value="72">72h (3 天)</SelectItem>
                <SelectItem value="120">120h (5 天)</SelectItem>
                <SelectItem value="168">168h (7 天)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Codex 路径 */}
      <div className="p-4 border-b border-border/50 space-y-3">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">{t('right.codexConfig')}</h3>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">{t('right.codexPath')}</Label>
          <Input
            value={settings.codex_path}
            onChange={(e) => update({ codex_path: e.target.value })}
            className="h-7 text-xs bg-input border-border/50 font-mono"
            placeholder="/usr/local/bin/codex"
          />
        </div>
      </div>

      {/* Openclaw 集成 */}
      <div className="p-4 space-y-3">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">{t('right.openclawIntegration')}</h3>

        <div className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="text-muted-foreground">Connected</span>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">{t('right.endpoint')}</Label>
          <Input
            value={settings.openclaw_endpoint}
            onChange={(e) => update({ openclaw_endpoint: e.target.value })}
            className="h-7 text-xs bg-input border-border/50 font-mono"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">{t('right.apiKey')}</Label>
          <Input
            type="password"
            value={settings.openclaw_api_key}
            onChange={(e) => update({ openclaw_api_key: e.target.value })}
            className="h-7 text-xs bg-input border-border/50"
            placeholder="••••••••"
          />
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">{t('right.autoDispatch')}</Label>
          <Switch checked={settings.auto_dispatch} onCheckedChange={(v) => update({ auto_dispatch: v })} />
        </div>
        {onRestartOpenClaw && (
          <Button onClick={onRestartOpenClaw} variant="outline" className="w-full h-8 text-xs border-info/30 text-info hover:bg-info/10">
            <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
            {t('right.reloadOpenClaw')}
          </Button>
        )}
      </div>
    </aside>
  );
}
