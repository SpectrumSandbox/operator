// Ctrl+K / "/" command palette — jump to any view, mission, unit, crew member or base.
import { useEffect, useMemo, useRef, useState } from 'react';
import { actions, ops, useOps } from '../store';
import { AIRFRAME, MISSION_PROFILES, MISSION_STATUS, UNIT_STATUS } from '../data/catalog';
import { Icon, cx, type IconName } from '../ui/kit';
import { VIEWS } from './Header';

interface Item {
  id: string;
  group: 'Views' | 'Missions' | 'Units' | 'Crew' | 'Bases' | 'Actions';
  icon: IconName;
  title: string;
  sub: string;
  hay: string;
  run: () => void;
}

const go = (hash: string) => {
  location.hash = hash;
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const missions = useOps((s) => s.missions);
  const units = useOps((s) => s.units);
  const crews = useOps((s) => s.crews);
  const bases = useOps((s) => s.bases);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    VIEWS.forEach((v) => out.push({ id: 'v-' + v.id, group: 'Views', icon: v.icon, title: `${v.n} · ${v.label}`, sub: `Press ${Number(v.n)}`, hay: `${v.label} ${v.short} ${v.n}`, run: () => go('#/' + v.id) }));
    out.push({ id: 'a-propose', group: 'Actions', icon: 'sparkles', title: 'Auto-propose schedule', sub: 'Scheduler', hay: 'auto propose schedule optimizer ai plan', run: () => (go('#/scheduler'), setTimeout(() => actions.runAutoPropose(), 50)) });
    out.push({ id: 'a-pause', group: 'Actions', icon: ops.get().simRunning ? 'pause' : 'play', title: ops.get().simRunning ? 'Pause simulation' : 'Resume simulation', sub: 'Space', hay: 'pause resume simulation sim play', run: actions.toggleSim });
    out.push({ id: 'a-tz', group: 'Actions', icon: 'clock', title: 'Toggle WIB / UTC', sub: 'Clock', hay: 'timezone wib utc clock', run: () => actions.setTz(ops.get().tz === 'WIB' ? 'UTC' : 'WIB') });
    for (const m of missions) {
      const p = MISSION_PROFILES[m.type];
      out.push({
        id: 'm-' + m.id,
        group: 'Missions',
        icon: p.icon,
        title: m.name,
        sub: `${m.code} · ${p.short} · ${MISSION_STATUS[m.status].label}`,
        hay: `${m.code} ${m.name} ${m.subtype} ${p.label} ${m.regionId} ${m.status}`,
        run: () => (actions.selectMission(m.id), go('#/mission-control')),
      });
    }
    for (const u of units) {
      const af = AIRFRAME[u.modelId];
      out.push({ id: 'u-' + u.id, group: 'Units', icon: 'drone', title: u.callsign, sub: `${u.tail} · ${af.name} · ${UNIT_STATUS[u.status].label}`, hay: `${u.callsign} ${u.tail} ${af.name} ${af.maker} ${u.status}`, run: () => (actions.selectUnit(u.id), go('#/fleet')) });
    }
    for (const c of crews) out.push({ id: 'c-' + c.id, group: 'Crew', icon: 'user', title: c.name, sub: `${c.role} · ${c.certs.join(', ') || 'no special ratings'}`, hay: `${c.name} ${c.role} ${c.certs.join(' ')}`, run: () => go('#/fleet') });
    for (const b of bases) out.push({ id: 'b-' + b.id, group: 'Bases', icon: 'building', title: b.name, sub: b.city, hay: `${b.name} ${b.city} ${b.island}`, run: () => go('#/mission-control') });
    return out;
  }, [missions, units, crews, bases]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) {
      // Empty query: views, quick actions, then open requests and active missions.
      const open = items.filter((i) => i.group === 'Missions' && /· (Request|Active)$/.test(i.sub)).slice(0, 6);
      return [...items.filter((i) => i.group === 'Views' || i.group === 'Actions'), ...open];
    }
    const words = t.split(/\s+/);
    return items
      .map((i) => {
        const h = (i.title + ' ' + i.hay).toLowerCase();
        if (!words.every((w) => h.includes(w))) return null;
        const score = (i.title.toLowerCase().startsWith(t) ? 0 : 10) + (h.indexOf(words[0]) / 100);
        return { i, score };
      })
      .filter((x): x is { i: Item; score: number } => !!x)
      .sort((a, b) => a.score - b.score)
      .slice(0, 40)
      .map((x) => x.i);
  }, [q, items]);

  useEffect(() => setIdx(0), [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${idx}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  if (!open) return null;
  const run = (it?: Item) => {
    if (!it) return;
    onClose();
    it.run();
  };
  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[2500] flex items-start justify-center pt-[12vh] px-4 bg-black/55 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div className="panel w-full max-w-[600px] shadow-2xl" style={{ background: '#242424' }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
        <div className="flex items-center gap-2.5 px-3.5 h-12 border-b border-line-2">
          <Icon name="search" size={16} className="text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setIdx((i) => Math.min(results.length - 1, i + 1)));
              else if (e.key === 'ArrowUp') (e.preventDefault(), setIdx((i) => Math.max(0, i - 1)));
              else if (e.key === 'Enter') run(results[idx]);
              else if (e.key === 'Escape') onClose();
            }}
            placeholder="Search missions, units, crew, bases, views…"
            className="flex-1 bg-transparent outline-none text-[14px] text-white placeholder:text-dim"
          />
          <kbd className="num text-[10px] px-1.5 border border-line-2 text-dim">Esc</kbd>
        </div>
        <ul ref={list} className="max-h-[55vh] overflow-y-auto py-1">
          {results.length === 0 && <li className="px-4 py-8 text-center text-[12px] text-dim">No matches for “{q}”</li>}
          {results.map((it, i) => {
            const header = it.group !== lastGroup;
            lastGroup = it.group;
            return (
              <li key={it.id}>
                {header && <div className="label px-3.5 pt-2.5 pb-1">{it.group}</div>}
                <button data-i={i} onMouseMove={() => setIdx(i)} onClick={() => run(it)} className={cx('w-full flex items-center gap-3 px-3.5 py-2 text-left', i === idx ? 'bg-white/[0.07]' : '')}>
                  <Icon name={it.icon} size={14} className={i === idx ? 'text-white' : 'text-dim'} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] text-text truncate">{it.title}</span>
                    <span className="block num text-[10.5px] text-dim truncate">{it.sub}</span>
                  </span>
                  {i === idx && <span className="num text-[10px] text-dim">↵</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-4 px-3.5 h-8 border-t border-line text-[10px] text-dim">
          <span>
            <kbd className="num">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="num">↵</kbd> open
          </span>
          <span className="ml-auto">
            Shortcuts: <kbd className="num">1–6</kbd> views · <kbd className="num">Space</kbd> pause sim
          </span>
        </div>
      </div>
    </div>
  );
}
