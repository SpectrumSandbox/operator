import type { PipelineRun } from '../../types';
import { TONE_COLOR } from '../../data/catalog';
import { Icon, TONE_TEXT, cx } from '../../ui/kit';
import { STEP_ICON, STEP_SHORT, STEP_TONE, stepLabel, stepTiming, stepView } from './shared';

/** Compact 5-segment progress bar + current-step label for table rows. */
export function MiniStepper({ run, now }: { run: PipelineRun; now: number }) {
  const views = run.steps.map((_, i) => stepView(run, i));
  // Current step: first failed, else running, else first blocked, else first queued, else last.
  let cur = views.findIndex((v) => v === 'failed');
  if (cur < 0) cur = views.findIndex((v) => v === 'running');
  if (cur < 0) cur = views.findIndex((v) => v === 'blocked');
  if (cur < 0) cur = views.findIndex((v) => v === 'queued');
  const allDone = cur < 0;
  if (cur < 0) cur = run.steps.length - 1;
  const v = views[cur];
  const tone = allDone ? 'ok' : STEP_TONE[v];
  const tip = run.steps.map((s, i) => `${i + 1}. ${STEP_SHORT[s.key]} — ${views[i]} · ${stepTiming(run, i, now)}`).join('\n');
  return (
    <div className="flex items-center gap-2.5 min-w-[200px]" title={tip}>
      <div className="flex gap-[2px] shrink-0">
        {run.steps.map((s, i) => {
          const sv = views[i];
          const col = TONE_COLOR[STEP_TONE[sv]];
          return (
            <span key={s.key} className="relative w-[18px] h-[5px] bg-white/[0.09] overflow-hidden">
              <span
                className="absolute inset-y-0 left-0 transition-[width] duration-700"
                style={{
                  width: sv === 'done' || sv === 'failed' || sv === 'blocked' ? '100%' : sv === 'running' ? `${Math.max(6, s.progress * 100)}%` : '0%',
                  background: sv === 'blocked' ? `repeating-linear-gradient(135deg, ${col} 0 2px, transparent 2px 4px)` : sv === 'done' ? 'rgba(60,207,110,0.55)' : col,
                }}
              />
            </span>
          );
        })}
      </div>
      <span className={cx('text-[11px] whitespace-nowrap', allDone ? 'text-ok' : v === 'queued' ? 'text-dim' : TONE_TEXT[tone])}>
        {allDone ? 'Published' : STEP_SHORT[run.steps[cur].key]}
        <span className="num text-[10.5px] text-dim ml-1.5">{allDone ? '' : stepTiming(run, cur, now)}</span>
      </span>
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
          <li key={s.key} className={cx('relative px-3 py-2 border-b sm:border-b-0 sm:border-r border-line last:border-0 min-w-0', v === 'queued' && 'opacity-60')}>
            <div className="absolute left-0 right-0 top-0 h-[2px] bg-white/[0.06]">
              <div
                className="h-full transition-[width] duration-700"
                style={{ width: v === 'running' ? `${s.progress * 100}%` : v === 'queued' ? '0%' : '100%', background: TONE_COLOR[tone] }}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="idx">{String(i + 1).padStart(2, '0')}</span>
              <Icon name={STEP_ICON[s.key]} size={12} className={TONE_TEXT[tone]} />
              <span className={cx('ml-auto flex items-center gap-1 text-[10.5px]', TONE_TEXT[tone])}>
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
