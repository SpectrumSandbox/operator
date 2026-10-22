// 05 · Operations Analytics — performance, SORA pre-flight risk, battery ledger, contingency drills.
import { useCallback, useEffect, useState } from 'react';
import { useOps } from '../store';
import { Icon, Modal, SectionTitle, Tabs } from '../ui/kit';
import { PerformanceTab } from './analytics/Performance';
import { SoraTab } from './analytics/Sora';
import { BatteryTab } from './analytics/Battery';
import { ContingencyTab } from './analytics/Contingency';
import { SpecReport } from './analytics/SpecReport';
import { DEFAULT_FILTERS, type Filters } from './analytics/metrics';

type Sub = 'performance' | 'sora' | 'battery' | 'contingency';
const SUBS: Sub[] = ['performance', 'sora', 'battery', 'contingency'];

function subFromHash(): Sub {
  const s = location.hash.replace(/^#\/?/, '').split(/[/?]/)[1] as Sub;
  return SUBS.includes(s) ? s : 'performance';
}

export function AnalyticsView() {
  const [tab, setTab] = useState<Sub>(subFromHash);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [preview, setPreview] = useState(false);
  const retire = useOps((s) => s.batteries.filter((b) => b.status === 'retire').length);
  const contingencies = useOps((s) => s.units.filter((u) => u.contingency).length);

  useEffect(() => {
    const target = `#/analytics/${tab}`;
    if (location.hash !== target) history.replaceState(null, '', target);
  }, [tab]);

  useEffect(() => {
    const h = () => {
      if (location.hash.startsWith('#/analytics')) setTab(subFromHash());
    };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  const print = useCallback(() => {
    setPreview(false);
    // let the modal unmount before the print snapshot
    setTimeout(() => window.print(), 60);
  }, []);
  const closePreview = useCallback(() => setPreview(false), []);

  return (
    <>
      <div className="h-full overflow-auto p-4 md:p-5 no-print">
        <SectionTitle
          index="05"
          title="Operations Analytics"
          subtitle="Service levels, unit economics, SORA, battery lifecycle and contingency drills"
        />
        <Tabs<Sub>
          value={tab}
          onChange={setTab}
          className="mb-3"
          tabs={[
            { id: 'performance', label: 'Performance', icon: 'chart-line' },
            { id: 'sora', label: 'SORA Risk', icon: 'shield-check' },
            { id: 'battery', label: 'Batteries & Hours', icon: 'battery-charging', count: retire || undefined },
            { id: 'contingency', label: 'Contingency', icon: 'siren', count: contingencies || undefined },
          ]}
        />
        {tab === 'performance' && <PerformanceTab f={filters} setF={setFilters} onPreview={() => setPreview(true)} onPrint={print} />}
        {tab === 'sora' && <SoraTab />}
        {tab === 'battery' && <BatteryTab />}
        {tab === 'contingency' && <ContingencyTab />}
      </div>

      {/* Print-only spec sheet (hidden on screen; everything else is .no-print) */}
      {tab === 'performance' && (
        <div className="print-only">
          <SpecReport f={filters} mode="print" />
        </div>
      )}

      <Modal open={preview} onClose={closePreview} title="Operations Performance Report — preview" index="05" width={900}>
        <div className="-m-4 p-5 bg-[#5b5f66]">
          <SpecReport f={filters} mode="preview" />
        </div>
        <div className="flex items-center justify-between gap-2 mt-4">
          <span className="text-[11px] text-dim">A4 portrait · print or “Save as PDF” from the browser dialog</span>
          <button className="btn btn-solid" onClick={print}>
            <Icon name="printer" size={13} /> Print / Save PDF
          </button>
        </div>
      </Modal>
    </>
  );
}
