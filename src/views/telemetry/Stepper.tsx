import type { PipelineRun } from '../../types';
import { TONE_COLOR } from '../../data/catalog';
import { Icon, TONE_TEXT, cx } from '../../ui/kit';
import { STEP_ICON, STEP_SHORT, STEP_TONE, stepLabel, stepTiming, stepView } from './shared';

/** Compact 5-segment stepper for table rows. */
export function MiniStepper({ run, now }: { run: PipelineRun; now: number }) {
  return (
    <div className="grid grid-cols-5 gap-[3px] min-w-[300px]">
      {run.steps.map((s, i) => {
        const v = stepView(run, i);
        const tone = STEP_TONE[v];
        const col = TONE_COLOR[tone];
        return (
          <div key={s.key} title={`${stepLabel(run, s.key)} — ${v}${v === 'running' ? ` ${Math.round(s.progress * 100)}%` : ''}`} className="min-w-0">
            <div className="h-[4px] bg-white/[0.08] relative overflow-hidden">
              <div
                className={cx('absolute inset-y-0 left-0 transition-[width] duration-700', v === 'blocked' && 'opacity-70')}
                style={{
                  width: v === 'done' || v === 'failed' || v === 'blocked' ? '100%' : v === 'running' ? `${Math.max(4, s.progress * 100)}%` : '0%',
                  background: v === 'blocked' ? `repeating-linear-gradient(135deg, ${col} 0 3px, transparent 3px 6px)` : col,
                }}
              />
            </div>
            <div className={cx('flex items-center gap-1 mt-1 text-[10px] leading-none', v === 'queued' ? 'text-dim' : TONE_TEXT[tone])}>
              <StepGlyph status={v} />
              <span className="font-semibold truncate">{STEP_SHORT[s.key]}</span>
            </div>
            <div className={cx('num text-[9.5px] mt-0.5 leading-none truncate', v === 'queued' ? 'text-dim/70' : 'text-dim')}>{stepTiming(run, i, now)}</div>
          </div>
        );
      })}
    </div>
  );
}

export function StepGlyph({ status, size = 10 }: { status: ReturnType<typeof stepView>; size?: number }) {
  if (status === 'done') return <Icon name="check" size={size} strokeWidth={2.5} />;
  if (status === 'failed') return <Icon name="x" size={size} strokeWidth={2.5} />;
  if (status === 'blocked') return <Icon name="lock" size={size} />;
  if (status === 'running') return <span className="inline-block rounded-full blink" style={{ width: size - 4, height: size - 4, background: 'currentColor' }} />;
  return <span className="inline-block rounded-full border border-current" style={{ width: size - 4, height: size - 4 }} />;
}

/** Full stepper with labels, used in the run detail header. */
export function FullStepper({ run, now }: { run: PipelineRun; now: number }) {
  return (
    <ol className="grid grid-cols-1 sm:grid-cols-5 border border-line">
      {run.steps.map((s, i) => {
        const v = stepView(run, i);
        const tone = STEP_TONE[v];
        return (
          <li key={s.key} className={cx('relative px-3 py-2.5 border-b sm:border-b-0 sm:border-r border-line last:border-0 min-w-0', v === 'queued' && 'opacity-60')}>
            <div className="absolute left-0 right-0 top-0 h-[2px] bg-white/[0.06]">
              <div
                className="h-full transition-[width] duration-700"
                style={{ width: v === 'running' ? `${s.progress * 100}%` : v === 'queued' ? '0%' : '100%', background: TONE_COLOR[tone] }}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="idx">{String(i + 1).padStart(2, '0')}</span>
              <Icon name={STEP_ICON[s.key]} size={12} className={TONE_TEXT[tone]} />
              <span className={cx('ml-auto flex items-center gap-1 text-[9.5px] uppercase tracking-wider font-semibold', TONE_TEXT[tone])}>
                <StepGlyph status={v} size={9} /> {v === 'blocked' ? 'blocked' : v}
              </span>
            </div>
            <div className="text-[11px] font-semibold text-text mt-1 leading-snug">{s.key === 'process' ? 'Mission Processing' : stepLabel(run, s.key)}</div>
            {s.key === 'process' && <div className="text-[10.5px] text-muted leading-snug">{run.processingLabel}</div>}
            <div className="num text-[10.5px] text-dim mt-0.5">{stepTiming(run, i, now)}</div>
          </li>
        );
      })}
    </ol>
  );
}
