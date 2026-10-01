import { buildDoc, type NodeSpec } from './model/build';
import type { MapDoc } from './model/types';

/** 1. The problem tree from the plan (non-task breakdown, uneven depth, one mid-node attribute). */
export function problemTree(): MapDoc {
  return buildDoc(
    {
      t: 'Why is course completion low?',
      c: [
        {
          t: 'Content issues',
          a: { Owner: 'Riya' },
          c: [
            { t: 'Too long', a: { Owner: 'Riya', Notes: 'avg 42m' } },
            {
              t: 'Outdated',
              c: [
                { t: 'Old tools used', a: { Owner: 'Aman' } },
                { t: 'No real projects', a: { Owner: 'Aman' } },
              ],
            },
          ],
        },
        { t: 'Learner issues', a: { Owner: 'Neha' } },
      ],
    },
    { attributes: [{ name: 'Owner' }, { name: 'Notes' }] },
  );
}

/** 2. HBR-style work breakdown: 7 L1 items, depth 3–5, attributes scoped to L1, L2, end nodes and the centre. */
export function wbs(): MapDoc {
  const leaf = (t: string, POC: string, Status = 'To do', Remark = ''): NodeSpec => ({ t, a: { Status, POC, Remark } });
  return buildDoc(
    {
      t: 'Launch the evening data-science cohort',
      a: { Sponsor: 'Academics head', Deadline: '15 Dec' },
      c: [
        {
          t: 'Curriculum',
          a: { Owner: 'Riya' },
          c: [
            {
              t: 'Syllabus',
              a: { 'Budget (₹k)': 40 },
              c: [
                leaf('Map job-role skills', 'Riya', 'Done'),
                leaf('Draft 24-week outline', 'Riya', 'WIP', 'v2 in review'),
                {
                  t: 'Capstone projects',
                  c: [leaf('Pick 3 industry datasets', 'Aman'), leaf('Write rubric', 'Aman')],
                },
              ],
            },
            {
              t: 'Content production',
              a: { 'Budget (₹k)': 180 },
              c: [
                { t: 'Recorded lectures', c: [leaf('Record weeks 1–8', 'Karan'), leaf('Edit + captions', 'Studio')] },
                leaf('Assignments bank', 'TA team'),
              ],
            },
          ],
        },
        {
          t: 'Faculty',
          a: { Owner: 'Meera' },
          c: [
            { t: 'Hiring', c: [leaf('Shortlist 10 instructors', 'Meera', 'WIP'), leaf('Demo lectures', 'Meera')] },
            leaf('Onboarding kit', 'Meera'),
          ],
        },
        {
          t: 'Marketing',
          a: { Owner: 'Kabir' },
          c: [
            {
              t: 'Campaigns',
              a: { 'Budget (₹k)': 300 },
              c: [
                { t: 'Paid social', c: [leaf('Creatives', 'Design'), leaf('Audience setup', 'Kabir')] },
                leaf('Webinars (x3)', 'Kabir'),
              ],
            },
            leaf('Landing page', 'Web team', 'WIP'),
          ],
        },
        {
          t: 'Admissions',
          a: { Owner: 'Sana' },
          c: [leaf('Entrance test', 'Sana'), leaf('Counselling scripts', 'Sana'), leaf('Scholarship rules', 'Finance')],
        },
        {
          t: 'Platform',
          a: { Owner: 'Dev' },
          c: [
            { t: 'LMS setup', c: [leaf('Course shell', 'Dev', 'Done'), leaf('Live-class integration', 'Dev', 'Blocked', 'Waiting on Zoom API')] },
            leaf('Payments', 'Dev'),
          ],
        },
        { t: 'Operations', a: { Owner: 'Ops' }, c: [leaf('Batch calendar', 'Ops'), leaf('Support SLAs', 'Ops')] },
        leaf('Legal & compliance review', 'Legal'),
      ],
    },
    {
      attributes: [
        { name: 'Owner', scope: { nodes: 'levels', levels: [1] } },
        { name: 'Budget (₹k)', type: 'number', scope: { nodes: 'levels', levels: [2] } },
        { name: 'Status', scope: { nodes: 'end' } },
        { name: 'POC', scope: { nodes: 'end' } },
        { name: 'Remark', scope: { nodes: 'end' } },
        { name: 'Sponsor', scope: { nodes: 'levels', levels: [0] } },
        { name: 'Deadline', scope: { nodes: 'levels', levels: [0] } },
      ],
    },
  );
}

/** 3. Random uneven tree (~1,000 nodes, depth ≤ 10), seeded so it's reproducible. */
export function randomTree(targetNodes = 1000, maxDepth = 10, seed = 7): MapDoc {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  let count = 1;
  const make = (depth: number, label: string): NodeSpec => {
    const spec: NodeSpec = { t: `Item ${label}` };
    const branch = depth < maxDepth && count < targetNodes && (depth < 2 || rand() < 0.62);
    if (branch) {
      const n = 1 + Math.floor(rand() * (depth < 2 ? 6 : 4));
      spec.c = [];
      for (let i = 0; i < n && count < targetNodes; i++) {
        count++;
        spec.c.push(make(depth + 1, `${label}.${i + 1}`));
      }
      if (rand() < 0.3) spec.a = { Owner: `P${Math.floor(rand() * 20)}` };
    } else {
      spec.a = { Notes: rand() < 0.5 ? 'check' : '', Score: Math.floor(rand() * 100) };
    }
    return spec;
  };
  const root: NodeSpec = { t: 'Random uneven tree', c: [] };
  while (count < targetNodes) {
    count++;
    root.c!.push(make(1, `${root.c!.length + 1}`));
  }
  return buildDoc(root, { attributes: [{ name: 'Owner' }, { name: 'Notes' }, { name: 'Score', type: 'number' }] });
}

/** 4. Text that spreadsheets tend to mangle, plus odd shapes. */
export function edgeCases(): MapDoc {
  return buildDoc(
    {
      t: 'Edge cases: text Sheets might mangle',
      c: [
        {
          t: 'Formula-looking text',
          a: { Note: 'must stay text' },
          c: [
            { t: '=SUM(A1:A3)', a: { Value: '=1+1' } },
            { t: '+91 98765 43210', a: { Value: '-5 is a number here', Count: 3 } },
            { t: '-not a formula', a: { Count: '42' } },
            { t: "'leading apostrophe" },
          ],
        },
        {
          t: 'Long & multi-line',
          c: [
            { t: 'Line one\nLine two\nLine three', a: { Value: 'multi\nline' } },
            {
              t: 'A very long node text that should wrap inside its merged cell instead of spilling across the neighbouring columns of the sheet',
            },
          ],
        },
        { t: 'Single-child chain', c: [{ t: 'only child', c: [{ t: 'grandchild', a: { Count: 1 } }] }] },
        { t: '' },
        { t: 'Dates & codes', c: [{ t: '2026-10-01' }, { t: '007' }, { t: '1/2' }] },
      ],
    },
    { attributes: [{ name: 'Note' }, { name: 'Value' }, { name: 'Count', type: 'number' }] },
  );
}

export const samples = [
  { key: 'problem-tree', label: '1 · Problem tree', make: problemTree },
  { key: 'wbs', label: '2 · Work breakdown (HBR-style)', make: wbs },
  { key: 'random-1000', label: '3 · Random uneven, ~1,000 nodes', make: () => randomTree() },
  { key: 'edge-cases', label: '4 · Edge cases', make: edgeCases },
];
