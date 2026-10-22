// Mission Control — view-local UI preferences that live outside the global store
// (store edits are out of scope for this view): region summary tags on the map
// and the screen-space insets of overlay drawers, used when framing selections.
import { useSyncExternalStore } from 'react';

const LS_REGION_TAGS = 'so.mc.regionTags';

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writeBool(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

let regionTags = readBool(LS_REGION_TAGS, false);
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

export const uiPrefs = {
  get regionTags() {
    return regionTags;
  },
  setRegionTags(v: boolean) {
    regionTags = v;
    writeBool(LS_REGION_TAGS, v);
    emit();
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useRegionTags(): boolean {
  useSyncExternalStore(uiPrefs.subscribe, () => version, () => version);
  return regionTags;
}

/**
 * Overlay-drawer geometry, written by the Mission Control shell and read by the
 * map when it frames a selection. In overlay mode, selecting a mission opens the
 * right drawer over the map, so the fly-to padding reserves that width.
 */
export const mapInsets = { overlay: false, right: 0 };
