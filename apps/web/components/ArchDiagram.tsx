import { cn } from '@/lib/utils';

type NodeState = 'serving' | 'standby' | 'down' | 'witness';

function Node({ label, state }: { label: string; state: NodeState }) {
  return (
    <div
      className={cn(
        'rounded-md border px-2 py-2 text-center font-mono text-[11px]',
        state === 'serving' && 'border-ok bg-ok/10 text-ok',
        state === 'down' && 'border-sev1/60 bg-sev1/5 text-sev1 opacity-60',
        state === 'witness' && 'border-witness/50 bg-witness/5 text-witness',
        state === 'standby' && 'border-line bg-bg text-muted',
      )}
    >
      <div>{label}</div>
      <div className="text-[10px] opacity-80">{state}</div>
    </div>
  );
}

export function ArchDiagram({
  serving,
  down,
  regions,
  witness,
}: {
  serving: string;
  down: string[];
  regions: string[];
  witness: string;
}) {
  const stateOf = (r: string): NodeState =>
    down.includes(r) ? 'down' : r === serving ? 'serving' : 'standby';
  const a = regions[0] ?? 'us-east-1';
  const b = regions[1] ?? 'us-east-2';
  return (
    <div className="mt-3 rounded-md border border-line bg-bg p-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <Node label={a} state={stateOf(a)} />
        <div className="text-center font-mono text-[10px] text-muted">&lt;= sync =&gt;</div>
        <Node label={b} state={stateOf(b)} />
      </div>
      <div className="my-1 text-center font-mono text-[10px] text-muted">| quorum |</div>
      <div className="flex justify-center">
        <div className="w-2/3">
          <Node label={`${witness} witness`} state="witness" />
        </div>
      </div>
    </div>
  );
}
