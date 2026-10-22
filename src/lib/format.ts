export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic hash noise in [0,1). */
export function noise(...n: number[]): number {
  let h = 2166136261;
  for (const x of n) {
    h ^= Math.floor(x * 1000) | 0;
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtIdr(n: number, compact = true): string {
  if (!compact) return 'Rp ' + Math.round(n).toLocaleString('id-ID');
  const a = Math.abs(n);
  if (a >= 1e9) return `Rp ${(n / 1e9).toFixed(2)} M`; // miliar
  if (a >= 1e6) return `Rp ${(n / 1e6).toFixed(1)} jt`; // juta
  if (a >= 1e3) return `Rp ${(n / 1e3).toFixed(0)} rb`;
  return `Rp ${Math.round(n)}`;
}

export function fmtPct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function sum(arr: number[]): number {
  let s = 0;
  for (const v of arr) s += v;
  return s;
}

export function groupBy<T, K extends string>(arr: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const t of arr) (out[key(t)] ||= []).push(t);
  return out;
}

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\n');
}
