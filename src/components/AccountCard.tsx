import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MoreHorizontal, AlertCircle, CheckCircle2, Clock, Zap, Eye, EyeOff, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Account, LiveUsageData } from '@/types';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { formatDistanceToNow, differenceInDays, differenceInHours } from 'date-fns';
import { useI18n } from '@/lib/i18n';
import { PlatformIcon } from './PlatformIcon';

interface AccountCardProps {
  account: Account;
  onSetActive: (id: string) => void;
  onPause: (id: string) => void;
  onReset: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate?: () => void;
  refreshKey?: number;
  viewMode?: 'grid' | 'list';
  externalUsage?: LiveUsageData | null;
  onUsageUpdate?: (id: string, usage: LiveUsageData) => void;
}

type AuthInfo = Awaited<ReturnType<typeof api.getAccountAuthInfo>>;


const statusBorderClass: Record<Account['status'], string> = {
  active: 'status-border-active',
  idle: 'status-border-idle',
  error: 'status-border-error',
  rate_limited: 'status-border-warning',
  cooldown: 'status-border-cooldown',
};

const statusBadge: Record<Account['status'], { label: string; className: string }> = {
  active: { label: 'ACTIVE', className: 'bg-primary/15 text-primary border-primary/30' },
  idle: { label: 'IDLE', className: 'bg-muted/30 text-muted-foreground border-muted/50' },
  error: { label: 'ERROR', className: 'bg-destructive/15 text-destructive border-destructive/30' },
  rate_limited: { label: 'RATE LIMITED', className: 'bg-warning/15 text-warning border-warning/30' },
  cooldown: { label: 'COOLDOWN', className: 'bg-info/15 text-info border-info/30' },
};

const typeBadge: Record<Account['auth_type'], { label: string; className: string }> = {
  team: { label: 'TEAM', className: 'bg-info/15 text-info border-info/30' },
  plus: { label: 'PLUS', className: 'bg-primary/15 text-primary border-primary/30' },
  free: { label: 'FREE', className: 'bg-muted/30 text-muted-foreground border-muted/50' },
};

/** 邮箱脱敏：前两位保留，其余打码；域名同理，兼容 qq.com 等短域名 */
function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [local, rest] = email.split('@');
  if (!rest) return email;
  const dotIdx = rest.indexOf('.');
  const domain = dotIdx >= 0 ? rest.slice(0, dotIdx) : rest;
  const tld    = dotIdx >= 0 ? rest.slice(dotIdx)    : '';
  const maskedLocal  = local.length  > 2 ? local.slice(0, 2)  + '***' : local;
  const maskedDomain = domain.length > 2 ? domain.slice(0, 2) + '***' : domain;
  return `${maskedLocal}@${maskedDomain}${tld}`;
}

/** 进度条颜色 */
function barColor(pct: number) {
  if (pct >= 80) return 'bg-destructive';
  if (pct >= 50) return 'bg-warning';
  return 'bg-primary';
}

export function AccountCard({ account, onSetActive, onPause, onReset, onRemove, onUpdate, refreshKey, viewMode = 'grid', externalUsage, onUsageUpdate }: AccountCardProps) {
  const sb = statusBadge[account.status];
  const tb = typeBadge[account.auth_type];
  const { t, dateLocale } = useI18n();

  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [usageResult, setUsageResult] = useState<Awaited<ReturnType<typeof api.checkAccountUsage>> | null>(null);
  const [checkingUsage, setCheckingUsage] = useState(false);
  const [liveUsage, setLiveUsage] = useState<LiveUsageData | null>(externalUsage ?? null);
  const [fetchingLive, setFetchingLive] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPath, setEditPath] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  /** 距过期时间的友好描述 + 颜色 */
  function tokenExpiryInfo(expiresAt: string | undefined) {
    if (!expiresAt) return null;
    const exp = new Date(expiresAt);
    const now = new Date();
    if (exp < now) return { label: t('card.tokenExpired'), color: 'text-destructive' };
    const days = differenceInDays(exp, now);
    const hours = differenceInHours(exp, now);
    if (days >= 1) return { label: t('card.tokenDaysLeft', { days }), color: days <= 3 ? 'text-warning' : 'text-primary' };
    return { label: t('card.tokenHoursLeft', { hours }), color: 'text-destructive' };
  }

  const fetchAuthInfo = async () => {
    setLoadingInfo(true);
    try {
      const info = await api.getAccountAuthInfo(account.id);
      setAuthInfo(info);
    } catch {
      setAuthInfo(null);
    } finally {
      setLoadingInfo(false);
    }
  };

  const openEdit = () => {
    setEditName(account.account_id);
    setEditPath(account.auth_file_path || '');
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editName.trim()) return;
    setEditSaving(true);
    try {
      await api.updateAccountInfo(account.id, { account_id: editName.trim(), auth_file_path: editPath.trim() || undefined });
      toast.success('账号信息已更新');
      setEditOpen(false);
      onUpdate?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setEditSaving(false);
    }
  };

  // 合并：检测可用性 + 刷新用量（一次 Codex API 调用搞定）
  const handleRefreshLiveUsage = async () => {
    setFetchingLive(true);
    setCheckingUsage(true);
    setUsageResult(null);
    try {
      const result = await api.checkAccountUsage(account.id);
      setUsageResult(result);

      if (result.ok) {
        const usage: LiveUsageData = {
          ok: true,
          fetched_at: result.fetched_at,
          plan_type: result.plan_type,
          primary: result.primary,
          secondary: result.secondary,
        };
        setLiveUsage(usage);
        onUsageUpdate?.(account.id, usage);
        toast.success(`${account.account_id} ${t('card.codexAvailable')} (5h=${result.primary?.used_percent ?? '?'}%)`);
      } else if (result.rate_limited) {
        if (result.primary || result.secondary) {
          const usage: LiveUsageData = {
            ok: false, error: 'rate_limited',
            fetched_at: result.fetched_at,
            primary: result.primary,
            secondary: result.secondary,
          };
          setLiveUsage(usage);
          onUsageUpdate?.(account.id, usage);
        }
        toast.warning(`${account.account_id} ${t('card.codexRateLimited')}`);
      } else if (result.status === 401) {
        toast.error(`${account.account_id} ${t('card.tokenInvalid')}`);
      } else {
        toast.error(`${account.account_id}: ${result.error ?? t('card.checkFailed')}`);
      }
    } catch {
      toast.error(t('card.checkFailed'));
    } finally {
      setFetchingLive(false);
      setCheckingUsage(false);
    }
  };

  useEffect(() => {
    fetchAuthInfo();
  }, [account.id, account.auth_file_path, refreshKey]);

  // Sync usage data pushed from parent (batch refresh)
  useEffect(() => {
    if (externalUsage != null) {
      setLiveUsage(externalUsage);
    }
  }, [externalUsage]);

  // 账号变为活跃时自动获取实时用量
  useEffect(() => {
    if (account.is_current) {
      handleRefreshLiveUsage();
    }
  }, [account.is_current]);

  const expiry = tokenExpiryInfo(authInfo?.token_expires_at);
  const hasAuthFile = authInfo && !authInfo.error;

  // ── Compact list row ──
  if (viewMode === 'list') {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -6 }}
        transition={{ duration: 0.12 }}
        className={`relative flex items-center gap-3 rounded-lg bg-card px-3 py-2 card-shadow transition-all duration-200 hover:card-shadow-hover ${statusBorderClass[account.status]} ${account.is_current ? 'active-glow' : ''}`}
        style={account.is_current ? { order: -1 } : undefined}
      >
        {/* Platform icon */}
        <div className="shrink-0">
          <PlatformIcon platform={account.platform || 'gpt'} size={18} />
        </div>

        {/* Account name + status */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {account.is_current && <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot shrink-0" />}
          <span className="text-sm font-semibold text-foreground truncate">{account.account_id}</span>
          <Badge variant="outline" className={`text-[9px] h-4 px-1.5 shrink-0 ${typeBadge[account.auth_type].className}`}>
            {typeBadge[account.auth_type].label}
          </Badge>
          <Badge variant="outline" className={`text-[9px] h-4 px-1.5 shrink-0 ${statusBadge[account.status].className}`}>
            {statusBadge[account.status].label}
          </Badge>
        </div>

        {/* Email (masked) */}
        <div className="hidden sm:flex items-center gap-1 min-w-0 w-40 shrink-0">
          {hasAuthFile ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
              <span className="text-[11px] text-muted-foreground truncate">
                {showEmail
                  ? (authInfo.email ?? account.email)
                  : maskEmail(authInfo.email ?? account.email ?? '')}
              </span>
              <button
                onClick={() => setShowEmail(v => !v)}
                className="shrink-0 h-4 w-4 flex items-center justify-center rounded hover:bg-secondary/50 text-muted-foreground"
              >
                {showEmail ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
              </button>
            </>
          ) : (
            <span className="text-[11px] text-destructive truncate">No auth</span>
          )}
        </div>

        {/* Usage bars (if available) */}
        <div className="hidden md:flex items-center gap-3 w-44 shrink-0">
          {liveUsage?.primary && (
            <div className="flex items-center gap-1.5 flex-1">
              <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor(liveUsage.primary.used_percent)}`}
                  style={{ width: `${Math.min(liveUsage.primary.used_percent, 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground w-8 text-right tabular-nums">
                {liveUsage.primary.used_percent.toFixed(0)}%
              </span>
            </div>
          )}
          {!liveUsage?.primary && (
            <span className="text-[10px] text-muted-foreground">—</span>
          )}
        </div>

        {/* Token expiry */}
        {expiry && (
          <span className={`hidden lg:block text-[10px] shrink-0 ${expiry.color}`}>{expiry.label}</span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <button
            onClick={handleRefreshLiveUsage}
            disabled={fetchingLive}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-secondary/50 text-muted-foreground disabled:opacity-40"
            title={t('card.checkAvailability')}
          >
            <Zap className={`h-3.5 w-3.5 ${fetchingLive ? 'animate-pulse text-primary' : ''}`} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className="h-6 w-6 flex items-center justify-center rounded hover:bg-secondary/50 text-muted-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              <DropdownMenuItem onClick={openEdit}>
                <Pencil className="h-3 w-3 mr-1.5" />Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onSetActive(account.id)}>Set Active</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPause(account.id)}>Pause</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onReset(account.id)}>Reset</DropdownMenuItem>
              <DropdownMenuItem onClick={async () => {
                try {
                  toast.info(`正在刷新 ${account.account_id} 的 Token...`);
                  const result = await api.refreshToken(account.id);
                  if (result.ok) { toast.success(`Token 刷新成功`); fetchAuthInfo(); }
                  else toast.error(`刷新失败: ${result.reason}`);
                } catch { toast.error('Token 刷新失败'); }
              }} className="text-green-500">Refresh Token</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRemove(account.id)} className="text-destructive">Remove</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>
    );
  }

  // ── Full grid card ──
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className={`relative overflow-hidden rounded-xl bg-card p-4 card-shadow transition-all duration-200 hover:-translate-y-0.5 hover:card-shadow-hover ${statusBorderClass[account.status]} ${account.is_current ? 'active-glow' : ''}`}
      style={account.is_current ? { order: -1 } : undefined}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {account.is_current && <span className="h-2 w-2 rounded-full bg-primary animate-pulse-dot" />}
          {/* Platform logo */}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center justify-center">
                <PlatformIcon platform={account.platform || 'gpt'} size={16} />
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-xs capitalize">{account.platform || 'gpt'}</TooltipContent>
          </Tooltip>
          <span className="text-sm font-bold text-foreground">{account.account_id}</span>
          <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${tb.className}`}>{tb.label}</Badge>
          <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${sb.className}`}>{sb.label}</Badge>
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger className="h-6 w-6 flex items-center justify-center rounded hover:bg-secondary/50 text-muted-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              <DropdownMenuItem onClick={openEdit}>
                <Pencil className="h-3 w-3 mr-1.5" />Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleRefreshLiveUsage} disabled={fetchingLive}>
                <Zap className="h-3 w-3 mr-1.5" />
                {fetchingLive ? t('card.checking') : t('card.checkAvailability')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onSetActive(account.id)}>Set Active</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPause(account.id)}>Pause</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onReset(account.id)}>Reset</DropdownMenuItem>
              <DropdownMenuItem onClick={async () => {
                try {
                  toast.info(`正在刷新 ${account.account_id} 的 Token...`);
                  const result = await api.refreshToken(account.id);
                  if (result.ok) {
                    toast.success(`${account.account_id} Token 刷新成功`);
                    fetchAuthInfo();
                  } else {
                    toast.error(`刷新失败: ${result.reason}`);
                  }
                } catch { toast.error('Token 刷新失败'); }
              }} className="text-green-500">Refresh Token</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRemove(account.id)} className="text-destructive">Remove</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 邮箱 + Auth 状态 */}
      <div className="mb-3">
        {loadingInfo ? (
          <p className="text-[11px] text-muted-foreground">{t('card.readingInfo')}</p>
        ) : hasAuthFile ? (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />
              <p className="text-[11px] text-foreground font-medium truncate max-w-[170px]">
                {showEmail
                  ? (authInfo.email ?? account.email)
                  : maskEmail(authInfo.email ?? account.email ?? '')}
              </p>
              <button
                onClick={() => setShowEmail(v => !v)}
                className="h-4 w-4 flex items-center justify-center rounded hover:bg-secondary/50 text-muted-foreground shrink-0"
                title={showEmail ? t('card.hideEmail') : t('card.showEmail')}
              >
                {showEmail ? <EyeOff className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
              </button>
            </div>
            {expiry && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                <p className={`text-[11px] ${expiry.color}`}>{expiry.label}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
            <p className="text-[11px] text-destructive">
              {authInfo?.error === 'auth_file_not_found'
                ? `${t('card.authNotFound')}: ${authInfo.path}`
                : t('card.authReadFail')}
            </p>
          </div>
        )}
      </div>

      {/* OpenAI 用量（5h / 周） */}
      {hasAuthFile && authInfo.usage && (
        <div className="space-y-1.5 mb-3 text-[11px]">
          {authInfo.usage.message_cap != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('card.5hUsageCap')}</span>
              <span className="text-foreground">{authInfo.usage.message_cap}</span>
            </div>
          )}
          {authInfo.usage.message_cap_rollover && (
            <div className="text-[10px] text-muted-foreground">
              {t('card.resetTime')}：{new Date(authInfo.usage.message_cap_rollover).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
      )}

      {/* Codex 用量（实时 API 数据） */}
      {(() => {
        const isLive = liveUsage?.ok || (liveUsage && 'primary' in liveUsage);
        const primary = liveUsage?.primary ?? null;
        const secondary = liveUsage?.secondary ?? null;
        const fetchedAt = liveUsage?.fetched_at;

        return (
          <div className="mb-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{t('card.codexUsage')}</span>
              <div className="flex items-center gap-1.5">
                {fetchedAt && (
                  <span className="text-[9px] text-muted-foreground">
                    {isLive ? `${t('card.live')} · ` : `${t('card.stale')} · `}
                    {formatDistanceToNow(new Date(fetchedAt), { addSuffix: true, locale: dateLocale })}
                  </span>
                )}
              </div>
            </div>

            {fetchingLive ? (
              <p className="text-[11px] text-muted-foreground">{t('card.refreshing')}</p>
            ) : !primary && !secondary ? (
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">{t('card.noData')}</p>
                {account.is_current && (
                  <button
                    onClick={handleRefreshLiveUsage}
                    className="text-[10px] text-primary hover:underline"
                  >
                    {t('card.clickToFetch')}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {primary && (
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">{t('card.5hWindow')}</span>
                      <span className={primary.used_percent >= 80 ? 'text-destructive font-medium' : primary.used_percent >= 50 ? 'text-warning font-medium' : 'text-foreground'}>
                        {primary.used_percent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor(primary.used_percent)}`} style={{ width: `${Math.min(primary.used_percent, 100)}%` }} />
                    </div>
                    {primary.resets_at && (
                      <p className="text-[10px] text-muted-foreground">
                        {t('card.resetTime')}：{new Date(primary.resets_at) < new Date() ? t('card.resetDone') : formatDistanceToNow(new Date(primary.resets_at), { addSuffix: true, locale: dateLocale })}
                      </p>
                    )}
                  </div>
                )}
                {secondary && (
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-muted-foreground">{t('card.weeklyUsage')}</span>
                      <span className={secondary.used_percent >= 80 ? 'text-destructive font-medium' : secondary.used_percent >= 50 ? 'text-warning font-medium' : 'text-foreground'}>
                        {secondary.used_percent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor(secondary.used_percent)}`} style={{ width: `${Math.min(secondary.used_percent, 100)}%` }} />
                    </div>
                    {secondary.resets_at && (
                      <p className="text-[10px] text-muted-foreground">
                        {t('card.resetTime')}：{new Date(secondary.resets_at) < new Date() ? t('card.resetDone') : formatDistanceToNow(new Date(secondary.resets_at), { addSuffix: true, locale: dateLocale })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* 检测结果（如有） */}
      {usageResult && (
        <div className={`mb-3 rounded-md px-3 py-2 text-[11px] ${
          usageResult.ok ? 'bg-primary/5 border border-primary/20' :
          usageResult.rate_limited ? 'bg-destructive/10 border border-destructive/20' :
          'bg-destructive/10 border border-destructive/20'
        }`}>
          <div className="flex items-center gap-1.5 font-medium">
            {usageResult.ok ? (
              <><CheckCircle2 className="h-3 w-3 text-primary" /><span className="text-primary">{t('card.codexAvailable')}</span></>
            ) : usageResult.rate_limited ? (
              <><AlertCircle className="h-3 w-3 text-destructive" /><span className="text-destructive">{t('card.codexRateLimited')}</span></>
            ) : usageResult.status === 401 ? (
              <><AlertCircle className="h-3 w-3 text-destructive" /><span className="text-destructive">{t('card.tokenInvalid')}</span></>
            ) : (
              <><AlertCircle className="h-3 w-3 text-destructive" /><span className="text-destructive">{usageResult.error ?? t('card.checkFailed')}</span></>
            )}
          </div>
        </div>
      )}

      {/* 上次请求 */}
      <div className="flex gap-3 text-[10px] text-muted-foreground mb-3">
        <Tooltip>
          <TooltipTrigger>
            {t('card.lastReq')}: {formatDistanceToNow(new Date(account.last_request_at), { addSuffix: true, locale: dateLocale })}
          </TooltipTrigger>
          <TooltipContent className="text-xs">{new Date(account.last_request_at).toLocaleString()}</TooltipContent>
        </Tooltip>
        {authInfo?.last_refresh && (
          <Tooltip>
            <TooltipTrigger>
              {t('card.tokenRefresh')}: {formatDistanceToNow(new Date(authInfo.last_refresh), { addSuffix: true, locale: dateLocale })}
            </TooltipTrigger>
            <TooltipContent className="text-xs">{new Date(authInfo.last_refresh).toLocaleString()}</TooltipContent>
          </Tooltip>
        )}
      </div>


      {/* Warning Banners */}
      {account.status === 'error' && (
        <div className="mt-3 -mx-4 -mb-4 px-4 py-2 bg-destructive/10 border-t border-destructive/20 text-[11px] text-destructive">
          {t('card.errorWarning')}
        </div>
      )}
      {account.status === 'rate_limited' && (
        <div className="mt-3 -mx-4 -mb-4 px-4 py-2 bg-warning/10 border-t border-warning/20 text-[11px] text-warning">
          {t('card.rateLimitWarning')}
        </div>
      )}
      {hasAuthFile && expiry?.color === 'text-destructive' && account.status !== 'error' && (
        <div className="mt-3 -mx-4 -mb-4 px-4 py-2 bg-destructive/10 border-t border-destructive/20 text-[11px] text-destructive">
          {expiry.label}{t('card.tokenExpireWarning')}
        </div>
      )}
    </motion.div>

    {/* Edit dialog — rendered outside the card motion div to avoid layout issues */}
    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>编辑账号</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">账号名称</Label>
            <Input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="text-sm"
              placeholder="账号显示名称"
              onKeyDown={e => e.key === 'Enter' && handleEditSave()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Auth 文件路径</Label>
            <Input
              value={editPath}
              onChange={e => setEditPath(e.target.value)}
              className="text-sm font-mono"
              placeholder="accounts/auth.json"
              onKeyDown={e => e.key === 'Enter' && handleEditSave()}
            />
            <p className="text-[10px] text-muted-foreground">修改此处可修复手动改名后路径失效的问题</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>取消</Button>
          <Button onClick={handleEditSave} disabled={editSaving || !editName.trim()}>
            {editSaving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
