// Editable master-data parameter cell: mono number input (commit on blur / Enter) + verified toggle.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { actions, ops, useOps } from '../../store';
import { Icon, cx } from '../../ui/kit';
import type { MasterData, MasterParam } from '../../types';

export type Path = (string | number)[];

export function getParam(md: MasterData, path: Path): MasterParam | undefined {
  let o: unknown = md;
  for (const k of path) {
    if (o == null || typeof o !== 'object') return undefined;
    o = (o as Record<string, unknown>)[k as string];
  }
  return o && typeof o === 'object' && 'value' in (o as object) ? (o as MasterParam) : undefined;
}

export const ACTOR = 'Rizky A.';

export function fmtVal(v: number, digits?: number): string {
  if (digits !== undefined) return v.toFixed(digits);
  return Number.isInteger(v) ? String(v) : String(+v.toFixed(2));
}

export function setParams(paths: Path[], patch: Partial<MasterParam>, text: string) {
  const now = ops.get().now;
  actions.updateMaster((draft) => {
    for (const p of paths) {
      const mp = getParam(draft, p);
      if (mp) Object.assign(mp, patch, { updatedAt: now, updatedBy: ACTOR });
    }
  }, text);
}

/** Context for "recently changed" highlighting. */
export const RecentCtx = createContext(0);

export function ParamCell({ path, label, unit, digits, allowZero = false, max, width = 64 }: { path: Path; label: string; unit: string; digits?: number; allowZero?: boolean; max?: number; width?: number }) {
  const p = useOps((s) => getParam(s.master, path));
  const recentSince = useContext(RecentCtx);
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!bad) return;
    const t = setTimeout(() => setBad(false), 1400);
    return () => clearTimeout(t);
  }, [bad]);

  if (!p) return <span className="num text-dim">—</span>;

  const commit = () => {
    if (draft === null) return;
    const raw = draft.trim().replace(',', '.');
    setDraft(null);
    if (raw === '' || raw === fmtVal(p.value, digits)) return;
    const v = Number(raw);
    if (!isFinite(v) || v < 0 || (!allowZero && v === 0) || (max !== undefined && v > max)) {
      setBad(true);
      return;
    }
    const nv = digits !== undefined ? +v.toFixed(digits) : +v.toFixed(2);
    if (nv === p.value) return;
    setParams([path], { value: nv }, `Changed ${label} from ${fmtVal(p.value, digits)} to ${fmtVal(nv, digits)} ${unit}`.trim());
  };

  const toggleVerify = () => setParams([path], { verified: !p.verified }, `${p.verified ? 'Marked unverified' : 'Verified'}: ${label} (${fmtVal(p.value, digits)} ${unit})`.trim());
  const recent = !!p.updatedAt && p.updatedAt >= recentSince && recentSince > 0;

  return (
    <div className="inline-flex items-center gap-1 justify-end">
      <div className="relative">
        <input
          ref={ref}
          inputMode="decimal"
          aria-label={`${label} (${unit})`}
          value={draft ?? fmtVal(p.value, digits)}
          onFocus={(e) => {
            setDraft(fmtVal(p.value, digits));
            requestAnimationFrame(() => e.target.select());
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ref.current?.blur();
            else if (e.key === 'Escape') {
              setDraft(null);
              requestAnimationFrame(() => ref.current?.blur());
            }
          }}
          className={cx('field num text-right h-[24px] px-1.5 text-[12px] bg-transparent border-transparent hover:border-line-2 focus:bg-bg-deep', bad ? '!border-alert text-alert' : p.verified ? '' : 'text-warn !border-warn/30')}
          style={{ width }}
          title={bad ? `Invalid — must be ${allowZero ? '≥ 0' : '> 0'}${max !== undefined ? ` and ≤ ${max}` : ''}` : p.updatedAt ? `Last edited by ${p.updatedBy}` : undefined}
        />
        {recent && <span className="absolute -top-[3px] -right-[3px] w-[6px] h-[6px] rounded-full bg-live" title="Changed this session" />}
      </div>
      <button
        onClick={toggleVerify}
        className={cx('w-[18px] h-[22px] flex items-center justify-center transition-colors', p.verified ? 'text-ok/45 hover:text-ok' : 'text-warn hover:brightness-125')}
        title={p.verified ? 'Verified — click to mark unverified (INDICATIVE)' : 'Unverified (INDICATIVE) — click to verify'}
        aria-label={p.verified ? `Mark ${label} unverified` : `Verify ${label}`}
        aria-pressed={p.verified}
      >
        <Icon name={p.verified ? 'shield-check' : 'triangle-alert'} size={12} />
      </button>
    </div>
  );
}

/** Row-level verify: verifies every unverified param in the row (or un-verifies if all verified). */
export function RowVerify({ paths, label }: { paths: Path[]; label: string }) {
  const md = useOps((s) => s.master);
  const ps = paths.map((p) => getParam(md, p)).filter((x): x is MasterParam => !!x);
  const unv = paths.filter((p) => getParam(md, p) && !getParam(md, p)!.verified);
  const all = unv.length === 0;
  return (
    <button
      onClick={() => (all ? null : setParams(unv, { verified: true }, `Verified ${unv.length} parameter${unv.length > 1 ? 's' : ''}: ${label}`))}
      disabled={all}
      className={cx('inline-flex items-center gap-1 text-[10.5px] px-1.5 h-[22px] whitespace-nowrap', all ? 'text-ok/40' : 'text-warn hover:bg-warn-bg')}
      title={all ? `All ${ps.length} parameters verified` : `Verify ${unv.length} unverified parameter(s) in this row`}
      aria-label={all ? `All ${ps.length} parameters verified` : `Verify ${unv.length} unverified parameter(s) in this row`}
    >
      <Icon name={all ? 'circle-check' : 'shield-check'} size={12} />
      {!all && <span>Verify <span className="num">{unv.length}</span></span>}
    </button>
  );
}

export function TableVerifyAll({ paths, label }: { paths: Path[]; label: string }) {
  const md = useOps((s) => s.master);
  const unv = paths.filter((p) => getParam(md, p) && !getParam(md, p)!.verified);
  const total = paths.filter((p) => getParam(md, p)).length;
  return (
    <div className="flex items-center gap-2">
      <span className="num text-[10.5px] text-dim whitespace-nowrap hidden sm:inline">
        <span className={unv.length ? 'text-warn' : 'text-ok'}>{total - unv.length}</span>/{total} verified
      </span>
      <button className={cx('btn h-6 px-2 text-[10px]', !unv.length && 'hidden')} disabled={!unv.length} onClick={() => setParams(unv, { verified: true }, `Verified all ${unv.length} parameter${unv.length > 1 ? 's' : ''} in ${label}`)}>
        <Icon name="shield-check" size={11} /> Verify all
      </button>
    </div>
  );
}
