import { useOps } from '../store';
import { Icon, cx } from '../ui/kit';

export function Toasts() {
  const toasts = useOps((s) => s.toasts);
  return (
    <div className="fixed bottom-4 right-4 z-[3000] flex flex-col gap-2 w-[340px] max-w-[calc(100vw-32px)] no-print" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx('glass px-3 py-2.5 flex items-start gap-2 text-[12px] border-l-2', t.tone === 'ok' ? 'border-l-ok' : t.tone === 'warn' ? 'border-l-warn' : t.tone === 'alert' ? 'border-l-alert' : 'border-l-live')}>
          <Icon name={t.tone === 'ok' ? 'circle-check' : t.tone === 'alert' ? 'octagon-alert' : t.tone === 'warn' ? 'triangle-alert' : 'info'} size={14} className={t.tone === 'ok' ? 'text-ok' : t.tone === 'alert' ? 'text-alert' : t.tone === 'warn' ? 'text-warn' : 'text-live'} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
