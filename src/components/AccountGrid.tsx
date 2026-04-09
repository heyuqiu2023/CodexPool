import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Account, LiveUsageData } from '@/types';
import { AccountCard } from './AccountCard';
import { FilterBar } from './FilterBar';
import { AddAccountDialog } from './AddAccountDialog';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface AccountGridProps {
  accounts: Account[];
  onAction: (action: 'setActive' | 'pause' | 'reset', id: string) => void;
  onRemove: (id: string) => void;
  onAccountAdded: () => void;
  onClearAll: () => void;
  refreshKey?: number;
  pushedUsageMap?: Record<string, LiveUsageData>;  // injected from parent after batch check
}

export function AccountGrid({ accounts, onAction, onRemove, onAccountAdded, onClearAll, refreshKey, pushedUsageMap }: AccountGridProps) {
  const [platformFilter, setPlatformFilter] = useState<string | 'all'>('all');
  const [usageMap, setUsageMap] = useState<Record<string, LiveUsageData>>({});
  const [platforms, setPlatforms] = useState<string[]>(['gpt', 'gemini', 'claude']);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [clearingAll, setClearingAll] = useState(false);
  const { t } = useI18n();

  // Merge usage data pushed from parent (batch check from RightSidebar)
  useEffect(() => {
    if (pushedUsageMap && Object.keys(pushedUsageMap).length > 0) {
      setUsageMap(prev => ({ ...prev, ...pushedUsageMap }));
    }
  }, [pushedUsageMap]);

  useEffect(() => {
    api.listPlatforms()
      .then(setPlatforms)
      .catch(() => {/* keep defaults */});
  }, []);

  const activeCount = accounts.filter(a => a.status === 'active').length;

  const filtered = accounts.filter(a => {
    if (platformFilter !== 'all' && (a.platform || 'gpt') !== platformFilter) return false;
    if (search && !a.account_id.toLowerCase().includes(search.toLowerCase()) && !a.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleSetActive = (id: string) => {
    onAction('setActive', id);
    toast.success(t('toast.accountActive'));
  };

  const handlePause = (id: string) => {
    onAction('pause', id);
    toast.info(t('toast.accountPaused'));
  };

  const handleReset = (id: string) => {
    onAction('reset', id);
    toast.success(t('toast.accountReset'));
  };

  const handleRemove = (id: string) => {
    onRemove(id);
    toast.success(t('toast.accountRemoved'));
  };

  const handleClearAll = async () => {
    if (accounts.length === 0) {
      toast.info(t('toast.noAccountsToClear'));
      return;
    }
    const confirmed = window.confirm(t('toast.confirmClear', { count: accounts.length }));
    if (!confirmed) return;

    setClearingAll(true);
    try {
      await onClearAll();
    } finally {
      setClearingAll(false);
    }
  };

  const handleAddPlatform = async (name: string) => {
    try {
      const updated = await api.addPlatform(name);
      setPlatforms(updated);
      toast.success(`平台 "${name}" 已添加`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleUsageUpdate = (id: string, usage: LiveUsageData) => {
    setUsageMap(prev => ({ ...prev, [id]: usage }));
  };

  const handleCheckAllUsage = async () => {
    toast.info('正在检测所有账号用量…');
    const results = await Promise.allSettled(
      accounts.map(a => api.checkAccountUsage(a.id))
    );
    const next: Record<string, LiveUsageData> = { ...usageMap };
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        const result = r.value;
        next[accounts[i].id] = {
          ok: result.ok,
          fetched_at: result.fetched_at,
          plan_type: result.plan_type,
          primary: result.primary,
          secondary: result.secondary,
          error: result.error,
        };
      }
    });
    setUsageMap(next);
    const succeeded = results.filter(r => r.status === 'fulfilled' && (r.value as { ok: boolean }).ok).length;
    toast.success(`${succeeded}/${accounts.length} 个账号检测成功`);
  };

  const handleDeletePlatform = async (name: string) => {
    try {
      const updated = await api.deletePlatform(name);
      setPlatforms(updated);
      if (platformFilter === name) setPlatformFilter('all');
      toast.success(`平台 "${name}" 已删除`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <FilterBar
        activeCount={activeCount}
        totalCount={accounts.length}
        selectedPlatform={platformFilter}
        onPlatformChange={setPlatformFilter}
        platforms={platforms}
        onAddPlatform={handleAddPlatform}
        onDeletePlatform={handleDeletePlatform}
        searchQuery={search}
        onSearchChange={setSearch}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onRefresh={() => { setLastRefresh(new Date()); toast.info(t('toast.poolRefreshed')); }}
        lastRefresh={lastRefresh}
        extraActions={null}
      />

      <div className={`flex-1 overflow-y-auto p-4 ${
        viewMode === 'grid'
          ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 auto-rows-max'
          : 'flex flex-col gap-1.5'
      }`}>
        <AnimatePresence mode="popLayout">
          {filtered.map(account => (
            <AccountCard
              key={account.id}
              account={account}
              onSetActive={handleSetActive}
              onPause={handlePause}
              onReset={handleReset}
              onRemove={handleRemove}
              refreshKey={refreshKey}
              viewMode={viewMode}
              externalUsage={usageMap[account.id] ?? null}
              onUsageUpdate={handleUsageUpdate}
            />
          ))}
        </AnimatePresence>

        {/* Add Account Card */}
        <AddAccountDialog onAccountAdded={onAccountAdded} platforms={platforms} />
      </div>
    </div>
  );
}
