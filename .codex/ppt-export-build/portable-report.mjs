import fs from 'node:fs';
import path from 'node:path';
import PptxGenJS from 'pptxgenjs';

const C = {
  navy: '0B1220',
  panel: '162033',
  panel2: '1D2A40',
  border: '31415C',
  text: 'F5F7FB',
  muted: '9AA9C2',
  blue: '5B8DEF',
  cyan: '4FD1C5',
  green: '43D17A',
  amber: 'F6B84B',
  red: 'F06A7A',
  purple: 'A78BFA',
  white: 'FFFFFF'
};

const W = 13.333;
const H = 7.5;
const FONT = 'Aptos';

function text(value, fallback = '—') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—';
}

function date(value) {
  if (!value) return '—';
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? text(value) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusColor(status) {
  return ({ Live: C.green, Development: C.blue, UAT: C.purple, Pipeline: C.muted, 'On Hold': C.amber }[status] || C.muted);
}

function makeDeck(title) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Madison Development Operations';
  pptx.company = 'Madison88';
  pptx.subject = title;
  pptx.title = title;
  pptx.lang = 'en-US';
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT, lang: 'en-US' };
  pptx.defineSlideMaster({
    title: 'MADISON',
    background: { color: C.navy },
    objects: [
      { line: { x: 0.45, y: 7.08, w: 12.45, h: 0, line: { color: C.border, width: 0.7 } } },
      { text: { text: 'MADISON88  /  DEVELOPMENT OPERATIONS', options: { x: 0.45, y: 7.16, w: 6.5, h: 0.16, fontFace: FONT, fontSize: 6.5, color: C.muted, margin: 0, breakLine: false } } },
      { text: { text: 'Executive reporting', options: { x: 10.55, y: 7.16, w: 2.35, h: 0.16, align: 'right', fontFace: FONT, fontSize: 6.5, color: C.muted, margin: 0, breakLine: false } } }
    ],
    slideNumber: { x: 12.93, y: 7.14, color: C.muted, fontFace: FONT, fontSize: 6.5 }
  });
  return pptx;
}

function addTitle(slide, eyebrow, title, subtitle = '') {
  slide.addText(text(eyebrow).toUpperCase(), { x: 0.55, y: 0.36, w: 5.2, h: 0.18, fontFace: FONT, fontSize: 8, bold: true, charSpacing: 1.5, color: C.cyan, margin: 0 });
  slide.addText(title, { x: 0.55, y: 0.63, w: 8.4, h: 0.45, fontFace: FONT, fontSize: 25, bold: true, color: C.text, margin: 0, fit: 'shrink' });
  if (subtitle) slide.addText(subtitle, { x: 0.58, y: 1.13, w: 10.8, h: 0.25, fontFace: FONT, fontSize: 9.5, color: C.muted, margin: 0, fit: 'shrink' });
}

function addPanel(slide, x, y, w, h, options = {}) {
  slide.addShape('roundRect', { x, y, w, h, rectRadius: 0.08, fill: { color: options.fill || C.panel, transparency: options.transparency || 0 }, line: { color: options.line || C.border, width: options.lineWidth || 0.8 } });
}

function addKpi(slide, x, y, w, label, value, detail, color = C.blue) {
  addPanel(slide, x, y, w, 1.03);
  slide.addShape('rect', { x: x + 0.02, y: y + 0.02, w: 0.06, h: 0.99, fill: { color }, line: { color, transparency: 100 } });
  slide.addText(label.toUpperCase(), { x: x + 0.23, y: y + 0.16, w: w - 0.38, h: 0.16, fontFace: FONT, fontSize: 7.5, bold: true, charSpacing: 0.8, color: C.muted, margin: 0 });
  slide.addText(String(value), { x: x + 0.23, y: y + 0.38, w: w - 0.38, h: 0.32, fontFace: FONT, fontSize: 23, bold: true, color: C.text, margin: 0, fit: 'shrink' });
  if (detail) slide.addText(detail, { x: x + 0.23, y: y + 0.77, w: w - 0.38, h: 0.14, fontFace: FONT, fontSize: 7.5, color: C.muted, margin: 0, fit: 'shrink' });
}

function addBadge(slide, label, x, y, color = C.blue, w = 0.9) {
  slide.addShape('roundRect', { x, y, w, h: 0.25, rectRadius: 0.05, fill: { color, transparency: 82 }, line: { color, width: 0.5 } });
  slide.addText(label, { x: x + 0.05, y: y + 0.06, w: w - 0.1, h: 0.1, align: 'center', fontFace: FONT, fontSize: 6.5, bold: true, color, margin: 0, fit: 'shrink' });
}

function addLogo(slide) {
  const logo = path.resolve(process.cwd(), 'public', 'assets', 'm88logo.png');
  if (fs.existsSync(logo)) slide.addImage({ path: logo, x: 10.8, y: 0.33, w: 1.55, h: 0.42, transparency: 5 });
  else slide.addText('madison88', { x: 10.65, y: 0.43, w: 1.9, h: 0.2, align: 'right', fontFace: FONT, fontSize: 11, bold: true, color: C.text, margin: 0 });
}

function addPhaseRail(slide, project, x, y, w) {
  const phases = ['Technical Analysis', 'Coding Development', 'System Internal Testing', 'UAT', 'Go Live', 'Hypercare'];
  const current = phases.indexOf(project.currentPhase);
  const activeIndex = current >= 0 ? current : ({ Pipeline: 0, Development: 1, UAT: 3, Live: 4, 'On Hold': 0 }[project.status] ?? 0);
  const stepW = w / phases.length;
  slide.addShape('line', { x: x + stepW / 2, y: y + 0.18, w: w - stepW, h: 0, line: { color: C.border, width: 2 } });
  phases.forEach((phase, i) => {
    const cx = x + i * stepW + stepW / 2;
    const done = i < activeIndex || project.status === 'Live' && i <= 4;
    const active = i === activeIndex;
    const color = done ? C.green : active ? C.purple : C.border;
    slide.addShape('ellipse', { x: cx - 0.105, y, w: 0.21, h: 0.21, fill: { color }, line: { color, width: 1 } });
    slide.addText(String(i + 1), { x: cx - 0.06, y: y + 0.045, w: 0.12, h: 0.08, align: 'center', fontFace: FONT, fontSize: 5.5, bold: true, color: C.navy, margin: 0 });
    slide.addText(phase, { x: cx - stepW / 2 + 0.02, y: y + 0.31, w: stepW - 0.04, h: 0.22, align: 'center', fontFace: FONT, fontSize: 6.5, bold: active || done, color: done ? C.green : active ? C.purple : C.muted, margin: 0, fit: 'shrink' });
  });
}

function addPortfolioSummary(slide, payload) {
  const s = payload.summary || {};
  const total = Number(s.total || 0);
  addTitle(slide, 'Portfolio report', 'Delivery overview', `Generated ${new Date(payload.generatedAt || Date.now()).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`);
  addLogo(slide);
  addKpi(slide, 0.55, 1.65, 2.9, 'Tracked projects', total, `${s.live || 0} live · ${s.inProgress || 0} in progress`, C.blue);
  addKpi(slide, 3.62, 1.65, 2.9, 'Live delivery', s.live || 0, total ? `${Math.round((s.live / total) * 100)}% of portfolio` : 'No projects selected', C.green);
  addKpi(slide, 6.69, 1.65, 2.9, 'Average completion', `${s.avgCompletion || 0}%`, `${s.overdue || 0} overdue task(s)`, C.cyan);
  addKpi(slide, 9.76, 1.65, 2.9, 'Needs attention', s.overdue || 0, 'Open overdue tasks', s.overdue ? C.red : C.green);

  addPanel(slide, 0.55, 2.93, 6.0, 3.55);
  slide.addText('Portfolio health', { x: 0.82, y: 3.2, w: 3.2, h: 0.25, fontFace: FONT, fontSize: 14, bold: true, color: C.text, margin: 0 });
  slide.addText(`${s.avgCompletion || 0}%`, { x: 0.82, y: 3.72, w: 2, h: 0.65, fontFace: FONT, fontSize: 39, bold: true, color: C.cyan, margin: 0 });
  slide.addText('average completion', { x: 2.35, y: 4.13, w: 2.1, h: 0.2, fontFace: FONT, fontSize: 9, color: C.muted, margin: 0 });
  slide.addShape('roundRect', { x: 0.82, y: 4.75, w: 5.4, h: 0.14, rectRadius: 0.05, fill: { color: C.navy }, line: { color: C.navy, transparency: 100 } });
  slide.addShape('roundRect', { x: 0.82, y: 4.75, w: 5.4 * Math.min(1, Math.max(0, Number(s.avgCompletion || 0) / 100)), h: 0.14, rectRadius: 0.05, fill: { color: C.cyan }, line: { color: C.cyan, transparency: 100 } });
  const by = s.byStatus || {};
  [['Pipeline', C.muted], ['Development', C.blue], ['UAT', C.purple], ['Live', C.green], ['On Hold', C.amber]].forEach(([name, color], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    slide.addShape('ellipse', { x: 0.85 + col * 2.75, y: 5.28 + row * 0.42, w: 0.12, h: 0.12, fill: { color }, line: { color, transparency: 100 } });
    slide.addText(`${name}  ${by[name] || 0}`, { x: 1.05 + col * 2.75, y: 5.25 + row * 0.42, w: 2.2, h: 0.18, fontFace: FONT, fontSize: 8.5, color: C.muted, margin: 0 });
  });

  addPanel(slide, 6.8, 2.93, 5.86, 3.55);
  slide.addText('Executive signals', { x: 7.08, y: 3.2, w: 3.2, h: 0.25, fontFace: FONT, fontSize: 14, bold: true, color: C.text, margin: 0 });
  const signals = [
    ['Live delivery', `${s.live || 0} project(s)`, C.green],
    ['Work in motion', `${s.inProgress || 0} project(s)`, C.blue],
    ['Open risks', `${s.overdue || 0} overdue task(s)`, s.overdue ? C.red : C.green],
    ['Selected scope', `${total} project(s)`, C.cyan]
  ];
  signals.forEach(([label, value, color], i) => {
    const y = 3.75 + i * 0.56;
    slide.addShape('ellipse', { x: 7.1, y: y + 0.04, w: 0.14, h: 0.14, fill: { color }, line: { color, transparency: 100 } });
    slide.addText(label, { x: 7.4, y, w: 2.35, h: 0.2, fontFace: FONT, fontSize: 9, color: C.muted, margin: 0 });
    slide.addText(value, { x: 9.75, y, w: 2.45, h: 0.2, align: 'right', fontFace: FONT, fontSize: 9, bold: true, color: C.text, margin: 0 });
    slide.addShape('line', { x: 7.1, y: y + 0.32, w: 5.0, h: 0, line: { color: C.border, width: 0.5 } });
  });
}

function addProjectRegister(slide, payload) {
  addTitle(slide, 'Project register', 'Delivery by project', 'Current phase, schedule risk, ownership, and next milestone.');
  addLogo(slide);
  const rows = (payload.projects || []).slice().sort((a, b) => String(a.deadline || '9999').localeCompare(String(b.deadline || '9999'))).slice(0, 12).map(p => [
    text(p.name), text(p.assignee), text(p.status), `${Number(p.pct || 0)}%`, date(p.deadline), text(p.nextPhase || p.currentPhase)
  ]);
  const data = [['PROJECT', 'OWNER', 'STATUS', 'DONE', 'DEADLINE', 'NEXT MILESTONE'], ...rows];
  addPanel(slide, 0.55, 1.65, 12.15, 5.15);
  slide.addTable(data, {
    x: 0.73, y: 1.92, w: 11.79, h: 4.5,
    colW: [3.05, 2.15, 1.4, 0.7, 1.35, 3.14],
    rowH: 0.31,
    border: { type: 'solid', color: C.border, pt: 0.5 },
    fill: C.panel,
    color: C.text,
    fontFace: FONT,
    fontSize: 8,
    margin: 0.08,
    valign: 'mid',
    autoFit: false,
    bold: false,
    breakLine: false,
    color: C.text,
    cellProps: { margin: 0.08 },
    paraSpaceAfterPt: 0,
    bold: false,
    fit: 'shrink'
  });
  slide.addShape('rect', { x: 0.73, y: 1.92, w: 11.79, h: 0.31, fill: { color: C.panel2 }, line: { color: C.panel2, transparency: 100 } });
  slide.addText('Sorted by soonest deadline · selected filters applied', { x: 0.78, y: 6.47, w: 5.3, h: 0.14, fontFace: FONT, fontSize: 7.5, color: C.muted, margin: 0 });
}

function addWorkload(slide, payload) {
  addTitle(slide, 'Team capacity', 'Developer allocation', 'Allocation is calculated from selected projects and manual overrides.');
  addLogo(slide);
  const entries = Object.entries(payload.workload || {}).sort((a, b) => (b[1].allocation || 0) - (a[1].allocation || 0));
  if (!entries.length) {
    addPanel(slide, 0.55, 1.65, 12.15, 4.8);
    slide.addText('No active developer allocations in the selected scope.', { x: 0.9, y: 3.6, w: 11.4, h: 0.3, align: 'center', fontFace: FONT, fontSize: 16, color: C.muted, margin: 0 });
    return;
  }
  entries.slice(0, 8).forEach(([name, item], i) => {
    const y = 1.67 + i * 0.62;
    addPanel(slide, 0.55, y, 12.15, 0.5, { fill: i % 2 ? C.panel : C.panel2, line: C.border });
    slide.addText(name, { x: 0.82, y: y + 0.16, w: 2.25, h: 0.14, fontFace: FONT, fontSize: 8.5, bold: true, color: C.text, margin: 0, fit: 'shrink' });
    const allocation = Number(item.allocation || 0);
    const color = allocation > 100 ? C.red : allocation >= 50 ? C.amber : C.green;
    slide.addShape('roundRect', { x: 3.2, y: y + 0.19, w: 5.65, h: 0.1, rectRadius: 0.04, fill: { color: C.navy }, line: { color: C.navy, transparency: 100 } });
    slide.addShape('roundRect', { x: 3.2, y: y + 0.19, w: 5.65 * Math.min(1, allocation / 100), h: 0.1, rectRadius: 0.04, fill: { color }, line: { color, transparency: 100 } });
    slide.addText(`${allocation}%`, { x: 9.15, y: y + 0.13, w: 0.8, h: 0.18, align: 'right', fontFace: FONT, fontSize: 9, bold: true, color, margin: 0 });
    slide.addText(`${item.active || 0} active · ${item.manualOverrides || 0} override(s)`, { x: 10.15, y: y + 0.16, w: 2.05, h: 0.14, align: 'right', fontFace: FONT, fontSize: 7, color: C.muted, margin: 0 });
  });
}

function addProjectSlide(slide, payload) {
  const project = payload.project || {};
  const system = payload.system || {};
  addTitle(slide, 'Project report', text(project.name), `${text(system.name)} · ${text(project.assignee, 'Unassigned')}`);
  addLogo(slide);
  addBadge(slide, text(project.status), 10.8, 1.05, statusColor(project.status), 1.45);
  addKpi(slide, 0.55, 1.65, 2.85, 'Completion', `${Number(project.pct || 0)}%`, `${project.done || 0}/${project.total || 0} tasks done`, C.cyan);
  addKpi(slide, 3.57, 1.65, 2.85, 'Deadline', date(project.deadline), project.overdueCount ? `${project.overdueCount} overdue task(s)` : 'No overdue tasks', project.overdueCount ? C.red : C.green);
  addKpi(slide, 6.59, 1.65, 2.85, 'Current phase', text(project.currentPhase), `Next: ${text(project.nextPhase)}`, C.purple);
  addKpi(slide, 9.61, 1.65, 3.09, 'System', text(system.name), text(system.owner, 'IT'), C.blue);

  addPanel(slide, 0.55, 2.95, 12.15, 1.35);
  slide.addText('SDLC delivery timeline', { x: 0.82, y: 3.22, w: 3.2, h: 0.2, fontFace: FONT, fontSize: 12, bold: true, color: C.text, margin: 0 });
  addPhaseRail(slide, project, 1.0, 3.66, 11.2);

  addPanel(slide, 0.55, 4.58, 7.6, 1.95);
  slide.addText('Task register', { x: 0.82, y: 4.86, w: 2.4, h: 0.2, fontFace: FONT, fontSize: 12, bold: true, color: C.text, margin: 0 });
  const tasks = (payload.tasks || []).slice(0, 5);
  if (tasks.length) {
    tasks.forEach((task, i) => {
      const y = 5.22 + i * 0.24;
      slide.addText(text(task.title), { x: 0.82, y, w: 3.9, h: 0.12, fontFace: FONT, fontSize: 7.5, color: C.text, margin: 0, fit: 'shrink' });
      slide.addText(text(task.assignee, 'Unassigned'), { x: 4.85, y, w: 1.2, h: 0.12, fontFace: FONT, fontSize: 7, color: C.muted, margin: 0, fit: 'shrink' });
      slide.addText(date(task.due), { x: 6.08, y, w: 0.9, h: 0.12, align: 'right', fontFace: FONT, fontSize: 7, color: C.muted, margin: 0 });
      addBadge(slide, text(task.status), 7.18, y - 0.05, statusColor(task.status), 0.72);
    });
  } else slide.addText('No tasks recorded.', { x: 0.82, y: 5.4, w: 5, h: 0.2, fontFace: FONT, fontSize: 9, color: C.muted, margin: 0 });

  addPanel(slide, 8.42, 4.58, 4.28, 1.95);
  slide.addText('Next action', { x: 8.7, y: 4.86, w: 2.4, h: 0.2, fontFace: FONT, fontSize: 12, bold: true, color: C.text, margin: 0 });
  slide.addText(text(project.nextTaskTitle, 'No open task'), { x: 8.7, y: 5.3, w: 3.45, h: 0.38, fontFace: FONT, fontSize: 13, bold: true, color: C.text, margin: 0, fit: 'shrink' });
  slide.addText(project.nextTaskDeadline ? `Target ${date(project.nextTaskDeadline)}` : 'No upcoming deadline', { x: 8.7, y: 5.85, w: 3.45, h: 0.16, fontFace: FONT, fontSize: 8, color: C.muted, margin: 0 });
}

async function writeDeck(pptx, finalPptx) {
  fs.mkdirSync(path.dirname(finalPptx), { recursive: true });
  await pptx.writeFile({ fileName: finalPptx });
  if (!fs.existsSync(finalPptx) || fs.statSync(finalPptx).size < 1000) throw new Error('PPTX file was not created correctly');
  return finalPptx;
}

export async function buildPortfolioReport(payload, { finalPptx }) {
  const pptx = makeDeck('Madison portfolio executive report');
  let slide = pptx.addSlide('MADISON');
  addPortfolioSummary(slide, payload);
  slide = pptx.addSlide('MADISON');
  addProjectRegister(slide, payload);
  if (payload.include?.team !== false) {
    slide = pptx.addSlide('MADISON');
    addWorkload(slide, payload);
  }
  if (payload.include?.delivery !== false) {
    slide = pptx.addSlide('MADISON');
    addTitle(slide, 'Delivery timeline', 'Projects in motion', 'Current stage and next milestone for active delivery.');
    addLogo(slide);
    const active = (payload.projects || []).filter(p => !['Live', 'On Hold'].includes(p.status)).slice(0, 8);
    active.forEach((project, i) => {
      const y = 1.68 + i * 0.6;
      slide.addText(text(project.name), { x: 0.62, y: y + 0.02, w: 2.75, h: 0.16, fontFace: FONT, fontSize: 8.5, bold: true, color: C.text, margin: 0, fit: 'shrink' });
      slide.addText(text(project.assignee, 'Unassigned'), { x: 0.62, y: y + 0.25, w: 2.75, h: 0.12, fontFace: FONT, fontSize: 7, color: C.muted, margin: 0, fit: 'shrink' });
      addPhaseRail(slide, project, 3.55, y + 0.02, 6.9);
      slide.addText(date(project.deadline), { x: 10.8, y: y + 0.02, w: 1.8, h: 0.16, align: 'right', fontFace: FONT, fontSize: 8, color: project.overdueCount ? C.red : C.muted, margin: 0 });
    });
    if (!active.length) slide.addText('No active projects in the selected scope.', { x: 0.8, y: 3.7, w: 11.5, h: 0.25, align: 'center', fontFace: FONT, fontSize: 14, color: C.muted, margin: 0 });
  }
  if (payload.include?.benefits !== false) {
    slide = pptx.addSlide('MADISON');
    addTitle(slide, 'Benefits snapshot', 'Value delivered', 'Benefits are sourced from project-level configuration and included in the selected report scope.');
    addLogo(slide);
    const b = payload.benefits || {};
    addKpi(slide, 0.55, 1.65, 2.9, 'Measured projects', b.measured || 0, 'Configured benefit records', C.blue);
    addKpi(slide, 3.62, 1.65, 2.9, 'Time saved', `${b.timeSaved || 0} hrs`, 'Reported project savings', C.cyan);
    addKpi(slide, 6.69, 1.65, 2.9, 'FTE equivalent', `${b.fteEquivalent || 0}`, 'Calculated capacity returned', C.green);
    addKpi(slide, 9.76, 1.65, 2.9, 'Cost avoidance', money(b.costAvoidance || 0), 'Configured rate basis', C.amber);
    addPanel(slide, 0.55, 3.05, 12.15, 2.9);
    slide.addText('Reporting note', { x: 0.88, y: 3.42, w: 2.3, h: 0.2, fontFace: FONT, fontSize: 14, bold: true, color: C.text, margin: 0 });
    slide.addText('Only projects with a configured benefits profile are included in the totals. Update the project benefits inputs to keep executive reporting accurate.', { x: 0.88, y: 3.95, w: 10.95, h: 0.42, fontFace: FONT, fontSize: 14, color: C.muted, margin: 0, breakLine: false, fit: 'shrink' });
  }
  return writeDeck(pptx, finalPptx);
}

export async function buildProjectReport(payload, { finalPptx }) {
  const pptx = makeDeck(`${text(payload.project?.name)} executive report`);
  const slide = pptx.addSlide('MADISON');
  addProjectSlide(slide, payload);
  return writeDeck(pptx, finalPptx);
}
