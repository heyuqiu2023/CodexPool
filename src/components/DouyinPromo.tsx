import { useState } from 'react';
import { X, Github } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export function DouyinPromo() {
  const [dismissed, setDismissed] = useState(false);
  const { t } = useI18n();

  if (dismissed) return null;

  return (
    <div className="relative flex items-center justify-center gap-3 px-4 py-1.5 bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-blue-500/10 border-b border-border/30 text-xs text-foreground/80">
      <span>{t('promo.text')}</span>
      <span className="font-mono font-semibold text-primary">{t('promo.douyinId')}</span>
      <span className="text-border/60">|</span>
      <span className="flex items-center gap-1.5">
        <Github className="h-3 w-3" />
        <span>{t('promo.contribute')}</span>
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded hover:bg-secondary/50 text-muted-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
