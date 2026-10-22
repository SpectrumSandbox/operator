// Telemetry & QA helpers — run status derivation, step semantics, QA colour scale.
import { scaleLinear } from 'd3-scale';
import type { Mission, PipelineRun, PipelineStepKey, StepStatus } from '../../types';
import type { Tone } from '../../data/catalog';
import type { IconName } from '../../ui/kit';
import { fmtDur } from '../../lib/time';

export type RunState = 'running' | 'quarantined' | 'signoff' | 'published' | 'queued';
export const RUN_STATE: Record<RunState, { label: string; tone: Tone }> = {
  running: { label: 'Processing', tone: 'live' },
  queued: { label: 'Queued', tone: 'idle' },
  quarantined: { label: 'Quarantined', tone: 'alert' },
  signoff: { label: 'Awaiting Sign-off', tone: 'warn' },
  published: { label: 'Published', tone: 'ok' },
};

export const signoffComplete = (r: PipelineRun) => !r.signoff.required || (!!r.signoff.first && !!r.signoff.second);
export const qaDone = (r: PipelineRun) => r.steps[3]?.status === 'done';

export function runState(r: PipelineRun): RunState {
  if (r.quarantine) return 'quarantined';
  const pub = r.steps[4];
  if (pub.status === 'done') return 'published';
  if (qaDone(r) && !signoffComplete(r)) return 'signoff';
  if (r.steps.some((s) => s.status === 'running')) return 'running';
  return 'queued';
}

/** Effective step status for display (publish gated by dual sign-off shows as blocked). */
export function stepView(r: PipelineRun, i: number): StepStatus {
  const s = r.steps[i];
  if (i === 4 && s.status === 'queued' && qaDone(r) && !signoffComplete(r)) return 'blocked';
  // After a re-process the downstream steps are still flagged blocked until the store advances them.
  if (s.status === 'blocked' && !r.quarantine && !(i === 4 && !signoffComplete(r))) return 'queued';
  return s.status;
}

export const STEP_LABEL: Record<PipelineStepKey, string> = {
  ingest: 'Data Ingest / Edge Upload',
  validate: 'Telemetry & Flight Log Validation',
  process: 'Mission Processing',
  qa: 'Automated QA Scoring',
  publish: 'Client Deliverable Publish',
};
export const STEP_SHORT: Record<PipelineStepKey, string> = { ingest: 'Ingest', validate: 'Validate', process: 'Process', qa: 'QA', publish: 'Publish' };
export const STEP_ICON: Record<PipelineStepKey, IconName> = { ingest: 'cloud-upload', validate: 'file-check', process: 'cpu', qa: 'clipboard-check', publish: 'external-link' };
export const STEP_TONE: Record<StepStatus, Tone> = { done: 'ok', running: 'live', queued: 'idle', failed: 'alert', blocked: 'warn' };

export function stepLabel(r: PipelineRun, k: PipelineStepKey) {
  return k === 'process' ? `${STEP_LABEL.process} · ${r.processingLabel}` : STEP_LABEL[k];
}

/** Human-readable duration / state text for a step. */
export function stepTiming(r: PipelineRun, i: number, now: number): string {
  const s = r.steps[i];
  const v = stepView(r, i);
  if (v === 'done' && s.startedAt && s.endedAt) return fmtDur(s.endedAt - s.startedAt);
  if (v === 'running') return `${Math.round(s.progress * 100)}% · ${s.startedAt ? fmtDur(now - s.startedAt) : '—'}`;
  if (v === 'failed') return 'failed';
  if (v === 'blocked') return r.quarantine ? 'held' : i === 4 && !signoffComplete(r) ? 'sign-off' : 'blocked';
  return 'queued';
}

// ── QA colour scale: red < 60 · amber 60–80 · green ≥ 80, continuous ─────────
const qaScale = scaleLinear<string>()
  .domain([0, 45, 58, 66, 76, 84, 100])
  .range(['#8f1d23', '#d9343c', '#ff4d55', '#e8803a', '#e8b23a', '#3ccf6e', '#2fbf6a'])
  .clamp(true);
export const qaColor = (v: number) => qaScale(v);
export const qaTone = (v: number): Tone => (v < 60 ? 'alert' : v < 80 ? 'warn' : 'ok');
export const FLAG_THRESHOLD = 70;

export function suggestedAction(score: number): { text: string; tone: Tone } {
  if (score < 60) return { text: 'Re-flight cell — insufficient data quality', tone: 'alert' };
  if (score < FLAG_THRESHOLD) return { text: 'Manual review by GIS analyst', tone: 'warn' };
  if (score < 80) return { text: 'Accept · monitor in next cadence', tone: 'warn' };
  return { text: 'Pass — no action', tone: 'ok' };
}

export const missionShort = (m?: Mission) => m?.code ?? '—';
