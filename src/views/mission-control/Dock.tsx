// Mission Control — collapsible side docks. A dock is either a full panel next to
// the map (docked), a slim 40 px icon rail, or — on narrow screens — a rail plus
// a drawer that overlays the map instead of squeezing it.
import { useEffect, type ReactNode } from 'react';
import { TONE_COLOR } from '../../data/catalog';
import { Icon, cx, type IconName, type Tone } from '../../ui/kit';

export type DockMode = 'docked' | 'overlay';

export interface RailItem {
  id: string;
  icon: IconName;
  label: string;
  /** Numeric badge (hidden when 0/undefined). */
  count?: number;
  tone?: Tone;
  /** Small status dot instead of a count. */
  dot?: Tone;
  active?: boolean;
  onClick: () => void;
}

export function Rail({ side, items, open, onToggle, title }: { side: 'left' | 'right'; items: RailItem[]; open: boolean; onToggle: () => void; title: string }) {
  const chevron: IconName = side === 'left' ? (open ? 'chevron-left' : 'chevron-right') : open ? 'chevron-right' : 'chevron-left';
  return (
    <nav className={cx('w-10 shrink-0 flex flex-col items-stretch bg-card border-line min-h-0', side === 'left' ? 'border-r' : 'border-l')} aria-label={title}>
      <button
        onClick={onToggle}
        className="h-10 flex items-center justify-center text-dim hover:text-white hover:bg-white/[0.04] border-b border-line transition-colors"
        title={`${open ? 'Close' : 'Open'} ${title.toLowerCase()}`}
        aria-label={`${open ? 'Close' : 'Open'} ${title.toLowerCase()}`}
        aria-expanded={open}
      >
        <Icon name={chevron} size={15} />
      </button>
      {items.map((it) => (
        <button
          key={it.id}
          onClick={it.onClick}
          title={`${it.label}${it.count ? ` · ${it.count}` : ''}`}
          aria-label={`${it.label}${it.count ? `, ${it.count}` : ''}`}
          className={cx('relative h-12 flex flex-col items-center justify-center gap-[3px] transition-colors', it.active ? 'text-white bg-white/[0.06]' : 'text-dim hover:text-white hover:bg-white/[0.04]')}
        >
          {it.active && <span className={cx('absolute top-2 bottom-2 w-[2px]', side === 'left' ? 'left-0' : 'right-0')} style={{ background: 'var(--view-accent, #5cc3ba)' }} />}
          <span className="relative">
            <Icon name={it.icon} size={15} />
            {it.dot && <span className="absolute -top-[2px] -right-[3px] w-[6px] h-[6px] rounded-full ring-2 ring-card" style={{ background: TONE_COLOR[it.dot] }} />}
          </span>
          {it.count !== undefined && (
            <span className="num text-[9.5px] font-semibold leading-none" style={{ color: it.count && it.tone ? TONE_COLOR[it.tone] : undefined }}>
              {it.count > 99 ? '99+' : it.count}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

/** Drawer over the map (overlay mode). Closes on Escape unless a modal is open. */
export function Drawer({ side, width, onClose, children, label }: { side: 'left' | 'right'; width: number; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"][aria-modal]')) return;
      onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div
      role="complementary"
      aria-label={label}
      className={cx('mc-drawer absolute top-0 bottom-0 z-[900] flex flex-col min-h-0 bg-card border-line-2', side === 'left' ? 'left-10 border-r' : 'right-10 border-l')}
      style={{ width, maxWidth: 'calc(100% - 96px)' }}
    >
      {children}
    </div>
  );
}

/** Square icon button used in panel headers (collapse, close, clear). */
export function HeadButton({ icon, label, onClick, className }: { icon: IconName; label: string; onClick: () => void; className?: string }) {
  return (
    <button onClick={onClick} className={cx('w-7 h-7 shrink-0 flex items-center justify-center text-dim hover:text-white hover:bg-white/[0.05] transition-colors', className)} title={label} aria-label={label}>
      <Icon name={icon} size={14} />
    </button>
  );
}
