// 分析 useExhaustiveDependencies 错误,按类别分组输出
// 用法: bun scripts/lint-exhaustive-deps.mjs [category]
//   category: extra | unstable | missing | all (默认 all)
import { spawnSync } from 'node:child_process';

const r = spawnSync(
  'bunx',
  ['biome', 'lint', '--max-diagnostics=99999', '--reporter=json'],
  { encoding: 'utf8', maxBuffer: 1024 * 1024 * 512 },
);
const d = JSON.parse(r.stdout);
const errs = d.diagnostics.filter(
  (x) => x.severity === 'error' && x.category === 'lint/correctness/useExhaustiveDependencies',
);

function classify(msg) {
  if (msg.includes('changes on every re-render')) return 'unstable';
  if (msg.includes('more dependencies than necessary')) return 'extra';
  if (msg.includes('more specific than its captures')) return 'extra';
  if (msg.includes('does not specify its dependency')) return 'missing';
  return 'unknown';
}

const groups = { extra: [], unstable: [], missing: [], unknown: [] };
for (const e of errs) {
  groups[classify(e.message)].push(e);
}

const cat = process.argv[2] || 'all';

function print(list) {
  for (const e of list) {
    console.log(`${e.location.path}:${e.location.start.line}\t${e.message}`);
  }
}

if (cat === 'all') {
  console.log('TOTAL', errs.length);
  for (const k of ['extra', 'unstable', 'missing', 'unknown']) {
    console.log(`\n=== ${k} (${groups[k].length}) ===`);
    print(groups[k]);
  }
} else {
  console.log(`=== ${cat} (${groups[cat].length}) ===`);
  print(groups[cat]);
}
