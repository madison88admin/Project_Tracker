/* Madison Centralized Development Tracker - API server (v1.2: open access, 3-stage flow)
 * Zero-config: Node + Express + JSON file DB (migratable to SQLite/Supabase later).
 * Run: npm install ; npm start  -> http://localhost:3100
 * Flow: Pipeline -> In Development -> Completed (simple, no login)
 */
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3100;
const AUTH_TOKEN = process.env.MDT_AUTH_TOKEN || '';
const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'db.json');
const eventClients = new Set();

const STATUSES = ['Pipeline', 'Development', 'UAT', 'Live', 'On Hold'];
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const TYPES = ['Feature', 'Bug', 'Hotfix', 'Improvement', 'Task', 'Incident', 'Docs'];
const ENVS = ['Dev', 'Staging', 'UAT', 'Prod'];
const PROJECT_TEMPLATE = ['Technical Analysis','Coding','System Internal Testing (SIT)','UAT','UAT Sign Off','Go Live','Go Live Sign Off','Hypercare'];
const PROJECT_PHASE_TASKS = {
  'Technical Analysis': ['Technical Design','Solution Design'],
  'Coding': ['Frontend','Backend'],
  'System Internal Testing (SIT)': ['QA','Code Review','Migration to Test Environment','Maker Checker']
};
const LEGACY_PHASE_MAP = {
  'data gathering': 'Technical Analysis',
  'frontend development': 'Coding',
  'backend development': 'Coding',
  'go-live sign off': 'Go Live Sign Off',
  'go live sign off': 'Go Live Sign Off',
  'live': 'Go Live'
};
const FTE_HOURS_PER_MONTH = 160;
const BENEFIT_DEFAULTS = {
  currentHandlingMinutes: 0,
  transactionsPerMonth: 0,
  futureHandlingMinutes: 0,
  futureManualHoursPerMonth: null,
  manualExceptionsPct: 0,
  roles: '',
  fullyLoadedHourlyCost: 450,
  annualCostPerFte: 900000,
  outcome: 'Capacity Released (Soft Savings)',
  errorReductionPct: 0,
  cycleTimeReductionPct: 0,
  riskReduction: ''
};

function normalizeBenefits(value) {
  const input = value && typeof value === 'object' ? value : {};
  const out = { ...BENEFIT_DEFAULTS, ...input };
  const nonNegative = ['currentHandlingMinutes', 'transactionsPerMonth', 'futureHandlingMinutes', 'manualExceptionsPct', 'fullyLoadedHourlyCost', 'annualCostPerFte', 'errorReductionPct', 'cycleTimeReductionPct'];
  for (const key of nonNegative) {
    const n = Number(out[key]);
    out[key] = Number.isFinite(n) ? Math.max(0, n) : BENEFIT_DEFAULTS[key];
  }
  out.manualExceptionsPct = Math.min(100, out.manualExceptionsPct);
  out.errorReductionPct = Math.min(100, out.errorReductionPct);
  out.cycleTimeReductionPct = Math.min(100, out.cycleTimeReductionPct);
  if (out.futureManualHoursPerMonth === '' || out.futureManualHoursPerMonth === null || out.futureManualHoursPerMonth === undefined) out.futureManualHoursPerMonth = null;
  else {
    const futureHours = Number(out.futureManualHoursPerMonth);
    out.futureManualHoursPerMonth = Number.isFinite(futureHours) ? Math.max(0, futureHours) : null;
  }
  out.roles = String(out.roles || '').slice(0, 160);
  out.riskReduction = String(out.riskReduction || '').slice(0, 240);
  out.outcome = String(out.outcome || BENEFIT_DEFAULTS.outcome).slice(0, 80);
  return out;
}

function calculateBenefits(value) {
  const b = normalizeBenefits(value);
  const baselineHours = b.currentHandlingMinutes * b.transactionsPerMonth / 60;
  const estimatedFutureHours = b.futureHandlingMinutes * b.transactionsPerMonth / 60;
  const futureHours = b.futureManualHoursPerMonth === null ? estimatedFutureHours : b.futureManualHoursPerMonth;
  const timeSaved = Math.max(0, baselineHours - futureHours);
  const fteWithout = baselineHours / FTE_HOURS_PER_MONTH;
  const fteWith = futureHours / FTE_HOURS_PER_MONTH;
  const fteEquivalent = timeSaved / FTE_HOURS_PER_MONTH;
  const annualCostPerFte = b.annualCostPerFte || (b.fullyLoadedHourlyCost * FTE_HOURS_PER_MONTH * 12);
  return {
    baselineHours: Math.round(baselineHours * 10) / 10,
    futureHours: Math.round(futureHours * 10) / 10,
    timeSaved: Math.round(timeSaved * 10) / 10,
    fteWithout: Math.round(fteWithout * 100) / 100,
    fteWith: Math.round(fteWith * 100) / 100,
    fteEquivalent: Math.round(fteEquivalent * 100) / 100,
    annualCostPerFte,
    costAvoidance: Math.round(fteEquivalent * annualCostPerFte),
    cycleTimeReductionPct: b.cycleTimeReductionPct || (baselineHours ? Math.round(timeSaved / baselineHours * 100) : 0),
    configured: b.currentHandlingMinutes > 0 && b.transactionsPerMonth > 0,
    fteHoursPerMonth: FTE_HOURS_PER_MONTH
  };
}

// maps old granular statuses to 5-stage flow: Pipeline -> Development -> UAT -> Live (On Hold is separate)
const STATUS_MAP = {
  'Backlog': 'Pipeline', 'Ready': 'Pipeline', 'Pipeline': 'Pipeline',
  'In Progress': 'Development', 'Code Review': 'Development',
  'QA Testing': 'Development', 'For Deployment': 'Development', 'Staging': 'Development',
  'Blocked': 'On Hold', 'In Development': 'Development', 'Development': 'Development',
  'UAT': 'UAT',
  'Live in Prod': 'Live', 'Done': 'Live', 'Completed': 'Live', 'Live': 'Live',
  'On Hold': 'On Hold', 'On hold': 'On Hold', 'Hold': 'On Hold'
};
const mapStatus = s => STATUS_MAP[s] || 'Pipeline';
// projects derive from legacy free-text grouping; progress always computed from tickets, never stored
function deriveProjects(tasks) {
  const seen = {}, out = [];
  for (const t of (tasks || [])) {
    const name = (t.project || '').trim();
    if (!name) continue;
    const key = t.systemId + '|' + name.toLowerCase();
    if (!seen[key]) { seen[key] = { id: uid('PRJ'), systemId: t.systemId, name, description: '', deadline: t.due || '', createdAt: nowISO(), updatedAt: nowISO() }; out.push(seen[key]); }
    t.projectId = seen[key].id;
  }
  return out;
}
const STATUS_PROGRESS = { Pipeline: 0, Development: 50, UAT: 80, Live: 100, 'On Hold': null };
function autoTaskProgress(t) { return STATUS_PROGRESS[t.status]===null ? Math.max(0, Math.min(100, Number(t.progress)||0)) : STATUS_PROGRESS[t.status] ?? 0; }
function subStats(list) {
  const done = list.filter(t => t.status === 'Live').length;
  const weight = list.reduce((n, t) => n + Math.max(0, Number(t.estimate) || 0), 0);
  const pct = weight ? list.reduce((n, t) => n + autoTaskProgress(t) * Math.max(0, Number(t.estimate) || 0), 0) / weight : list.reduce((n, t) => n + autoTaskProgress(t), 0) / (list.length || 1);
  return { total: list.length, done, pct: Math.round(pct) };
}
function subStage(list, fallback){
  if(!list.length) return fallback && STATUSES.includes(fallback) ? fallback : 'Pipeline';
  if(list.every(t=>t.status==='Live')) return 'Live';
  if(list.some(t=>t.status==='On Hold')) return 'On Hold';
  if(list.some(t=>t.status==='UAT')) return 'UAT';
  if(list.some(t=>t.status==='Development')) return 'Development';
  return 'Pipeline';
}
function enrichProjects() {
  return (db.projects || []).map(p => {
    const ts = db.tasks.filter(t => t.projectId === p.id);
    const byStage = { 'Pipeline': 0, 'Development': 0, 'UAT': 0, 'Live': 0, 'On Hold': 0 };
    for (const t of ts) if (byStage[t.status] !== undefined) byStage[t.status]++;
    const benefits = normalizeBenefits(p.benefits);
    return { ...p, benefits, benefitsCalc: calculateBenefits(benefits), ...subStats(ts), byStage, subprojects: ((db.subprojects || []).filter(s => s.projectId === p.id)).map(s => { const st = ts.filter(t => t.subprojectId === s.id); const stage=subStage(st, s.stage); const stats=subStats(st); return { ...s, ...stats, pct: st.length ? stats.pct : (STATUS_PROGRESS[stage] ?? 0), stage }; }) };
  });
}

function reportProjectData(projectId) {
  const project = enrichProjects().find(p => p.id === projectId);
  if (!project) return null;
  const system = db.systems.find(s => s.id === project.systemId) || {};
  const tasks = db.tasks.filter(t => t.projectId === project.id);
  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = tasks.filter(t => t.status !== 'Live' && t.status !== 'On Hold' && t.due && t.due < today).length;
  const nextTask = tasks.filter(t => t.due && t.status !== 'Live' && t.status !== 'On Hold').sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];
  const currentStage = project.status === 'On Hold'
    ? ((project.subprojects || []).find(s => s.stage === 'On Hold') || {}).name || 'On Hold'
    : project.status === 'Live'
      ? 'Live'
      : ((project.subprojects || []).find(s => s.stage === project.status) || {}).name || project.status;
  const currentIndex = PROJECT_TEMPLATE.indexOf(currentStage);
  const nextPhase = currentIndex >= 0 && currentIndex < PROJECT_TEMPLATE.length - 1 ? PROJECT_TEMPLATE[currentIndex + 1] : '';
  const hypercare = (project.subprojects || []).find(s => s.name === 'Hypercare');
  return {
    project: { ...project, currentPhase: currentStage, nextPhase, overdueCount, nextTaskDeadline: nextTask?.due || '', nextTaskTitle: nextTask?.title || '', hypercareOpen: !!hypercare && hypercare.stage !== 'Live', blockedReason: project.blockedReason || '' },
    system,
    tasks: tasks.map(t => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, due: t.due, assignee: t.assignee }))
  };
}

function safeReportName(name) {
  return String(name || 'project-report').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 80) || 'project-report';
}

function createProjectReport(payload, outputPath) {
  const generator = path.join(__dirname, '.codex', 'ppt-export-build', 'project-report.mjs');
  const buildDir = path.join(__dirname, 'data', 'ppt-export-build');
  process.env.SKILL_DIR = process.env.PPT_SKILL_DIR || 'C:\\Users\\JC\\.codex\\plugins\\cache\\openai-primary-runtime\\presentations\\26.921.10847\\skills\\presentations';
  process.env.RUNTIME_PYTHON = process.env.PPT_RUNTIME_PYTHON || 'C:\\Users\\JC\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
  return import(require('url').pathToFileURL(generator).href + `?run=${Date.now()}`)
    .then(mod => mod.buildProjectReport(payload, { tmpDir: buildDir, finalPptx: outputPath, skipValidation: true }));
}

function portfolioReportData(body = {}) {
  const requestedIds = new Set(Array.isArray(body.projectIds) ? body.projectIds.map(String) : []);
  const requestedSystems = new Set(Array.isArray(body.systemIds) ? body.systemIds.map(String) : []);
  const requestedStatuses = new Set(Array.isArray(body.statuses) ? body.statuses.map(String) : []);
  const all = enrichProjects();
  const selected = all.filter(p => {
    if (requestedIds.size && !requestedIds.has(String(p.id))) return false;
    if (requestedSystems.size && !requestedSystems.has(String(p.systemId))) return false;
    if (requestedStatuses.size && !requestedStatuses.has(String(p.status || 'Pipeline'))) return false;
    return true;
  });
  const today = new Date().toISOString().slice(0, 10);
  const phases = PROJECT_TEMPLATE;
  const projects = selected.map(project => {
    const tasks = db.tasks.filter(t => t.projectId === project.id);
    const currentPhase = project.status === 'Live' ? 'Live' : project.status === 'On Hold'
      ? 'On Hold'
      : ((project.subprojects || []).find(s => s.stage === project.status) || {}).name || project.status || 'Pipeline';
    const currentIndex = phases.indexOf(currentPhase);
    const nextPhase = currentIndex >= 0 && currentIndex < phases.length - 1 ? phases[currentIndex + 1] : '';
    const overdue = tasks.filter(t => t.status !== 'Live' && t.status !== 'On Hold' && t.due && t.due < today).length;
    const nextTask = tasks.filter(t => t.due && t.status !== 'Live' && t.status !== 'On Hold').sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];
    return {
      id: project.id,
      name: project.name,
      systemId: project.systemId,
      systemName: (db.systems.find(s => s.id === project.systemId) || {}).name || project.systemId,
      systemColor: (db.systems.find(s => s.id === project.systemId) || {}).color || '#64748b',
      status: project.status || 'Pipeline',
      assignee: project.assignee || 'Unassigned',
      pct: Number(project.pct) || 0,
      done: project.done || 0,
      total: project.total || 0,
      deadline: project.deadline || '',
      startDate: project.startDate || '',
      currentPhase,
      nextPhase,
      overdueCount: overdue,
      nextTaskDeadline: nextTask?.due || '',
      nextTaskTitle: nextTask?.title || '',
      benefitsCalc: project.benefitsCalc
    };
  });
  const byStatus = Object.fromEntries(STATUSES.map(status => [status, projects.filter(p => p.status === status).length]));
  const avgCompletion = projects.length ? Math.round(projects.reduce((n, p) => n + p.pct, 0) / projects.length) : 0;
  const workload = {};
  for (const name of new Set(projects.map(p => p.assignee).filter(Boolean))) {
    const mine = projects.filter(p => p.assignee === name && p.status !== 'Live' && p.status !== 'On Hold');
    workload[name] = { active: mine.length, projects: mine.map(p => p.name), allocation: mine.length ? Math.min(100, mine.length * 25) : 0 };
  }
  const measured = projects.filter(p => p.benefitsCalc?.configured);
  const benefits = {
    measured: measured.length,
    timeSaved: Math.round(measured.reduce((n, p) => n + (p.benefitsCalc.timeSaved || 0), 0) * 10) / 10,
    fteEquivalent: Math.round(measured.reduce((n, p) => n + (p.benefitsCalc.fteEquivalent || 0), 0) * 100) / 100,
    costAvoidance: measured.reduce((n, p) => n + (p.benefitsCalc.costAvoidance || 0), 0)
  };
  return {
    generatedAt: nowISO(),
    filters: body.filters || {},
    include: { overview: true, delivery: true, team: true, benefits: true, register: true, ...(body.include || {}) },
    projects,
    summary: { total: projects.length, live: byStatus.Live || 0, inProgress: (byStatus.Development || 0) + (byStatus.UAT || 0), overdue: projects.reduce((n, p) => n + p.overdueCount, 0), avgCompletion, byStatus },
    workload,
    benefits
  };
}

function createPortfolioReport(payload, outputPath) {
  const generator = path.join(__dirname, '.codex', 'ppt-export-build', 'portfolio-report.mjs');
  const buildDir = path.join(__dirname, 'data', 'ppt-export-build');
  process.env.SKILL_DIR = process.env.PPT_SKILL_DIR || 'C:\\Users\\JC\\.codex\\plugins\\cache\\openai-primary-runtime\\presentations\\26.921.10847\\skills\\presentations';
  process.env.RUNTIME_PYTHON = process.env.PPT_RUNTIME_PYTHON || 'C:\\Users\\JC\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe';
  return import(require('url').pathToFileURL(generator).href + `?run=${Date.now()}`)
    .then(mod => mod.buildPortfolioReport(payload, { tmpDir: buildDir, finalPptx: outputPath, skipValidation: true }));
}

function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
}
function nowISO() { return new Date().toISOString(); }

function seedDB() {
  const systems = [
    { id: 'SYS-HRIS', name: 'Madison HRIS & Payroll', owner: 'John Carlo Manalo', color: '#3b82f6', tech: 'Laravel + MySQL', repo: 'madison/hris', envDev: 'http://dev-hris.local', envStaging: 'https://staging-hris.madison88.com', envProd: 'https://hris.madison88.com', health: 'On Track', updatedAt: nowISO() },
    { id: 'SYS-INV', name: 'Madison Inventory & Warehousing', owner: 'Dev Team', color: '#f59e0b', tech: 'Node.js + Postgres', repo: 'madison/inventory', envDev: 'http://dev-inv.local', envStaging: 'https://staging-inv.madison88.com', envProd: 'https://inv.madison88.com', health: 'At Risk', updatedAt: nowISO() },
    { id: 'SYS-POS', name: 'Madison POS & Sales', owner: 'Store IT', color: '#22c55e', tech: 'C# .NET + MSSQL', repo: 'madison/pos', envDev: 'http://dev-pos.local', envStaging: 'https://staging-pos.madison88.com', envProd: 'https://pos.madison88.com', health: 'On Track', updatedAt: nowISO() },
    { id: 'SYS-CRM', name: 'Madison CRM & After-Sales', owner: 'Sales Ops', color: '#a855f7', tech: 'React + Supabase', repo: 'madison/crm', envDev: 'http://dev-crm.local', envStaging: 'https://staging-crm.madison88.com', envProd: 'https://crm.madison88.com', health: 'Attention', updatedAt: nowISO() },
    { id: 'SYS-WEB', name: 'Madison E-Commerce Website', owner: 'Marketing + IT', color: '#ec4899', tech: 'Next.js + Shopify API', repo: 'madison/webstore', envDev: 'http://dev-web.local', envStaging: 'https://staging.madison88.com', envProd: 'https://madison88.com', health: 'On Track', updatedAt: nowISO() }
  ];
  const tasks = [
    { id: 'T-1001', title: 'Payroll 13th-month computation off by rounding', systemId: 'SYS-HRIS', project: 'Payroll', type: 'Bug', priority: 'Critical', status: 'In Development', assignee: 'John Carlo Manalo', reporter: 'HR', due: '2026-09-14', branch: 'fix/payroll-rounding', pr: 'https://github.com/madison/hris/pull/142', estimate: 5, progress: 60, labels: ['payroll', 'hot'], description: 'Rounding mismatch vs BIR template. Repro on staging with Sept cutoff data.', updates: [{ at: nowISO(), by: 'John Carlo Manalo', text: 'Root cause found in computeNet(): using float. Migrating to integer centavos.' }], deployments: [], createdAt: nowISO(), updatedAt: nowISO() },
    { id: 'T-1002', title: 'Inventory stock sync delay (POS -> Warehouse)', systemId: 'SYS-INV', project: 'Sync Engine', type: 'Incident', priority: 'Critical', status: 'In Development', assignee: 'Ramon', reporter: 'Warehouse', due: '2026-09-13', branch: 'feat/sync-retry-queue', pr: 'https://github.com/madison/inventory/pull/88', estimate: 8, progress: 80, labels: ['sync', 'pos-integration'], description: 'Sync lag up to 40min during peak. Add retry queue + dead-letter table.', updates: [{ at: nowISO(), by: 'Ramon', text: 'PR opened. Needs QA on staging with 10k SKU replay.' }], deployments: [{ env: 'Staging', version: 'v2.14.0-rc2', at: nowISO(), by: 'Ramon', notes: 'Retry queue enabled' }], createdAt: nowISO(), updatedAt: nowISO() },
    { id: 'T-1003', title: 'POS offline mode: queue receipts when internet drops', systemId: 'SYS-POS', project: 'Offline', type: 'Feature', priority: 'High', status: 'In Development', assignee: 'Aira', reporter: 'Store Ops', due: '2026-09-15', branch: 'feat/offline-queue', pr: '', estimate: 13, progress: 90, labels: ['offline', 'store'], description: 'Branch stores lose sales when PLDT drops. Local queue then auto-push.', updates: [], deployments: [{ env: 'Staging', version: 'v3.2.0', at: nowISO(), by: 'Aira', notes: 'For QA regression' }], createdAt: nowISO(), updatedAt: nowISO() },
    { id: 'T-1004', title: 'CRM duplicate leads on import', systemId: 'SYS-CRM', project: 'Leads', type: 'Bug', priority: 'High', status: 'Pipeline', assignee: 'Unassigned', reporter: 'Sales', due: '2026-09-20', branch: '', pr: '', estimate: 3, progress: 0, labels: ['leads', 'data-quality'], description: 'CSV import creates dupes when mobile has +63 vs 09 prefix.', updates: [], deployments: [], createdAt: nowISO(), updatedAt: nowISO() },
    { id: 'T-1005', title: 'Web checkout: GCash webhook timeout', systemId: 'SYS-WEB', project: 'Checkout', type: 'Hotfix', priority: 'Critical', status: 'In Development', assignee: 'John Carlo Manalo', reporter: 'Marketing', due: '2026-09-12', branch: 'hotfix/gcash-webhook', pr: 'https://github.com/madison/webstore/pull/210', estimate: 3, progress: 95, labels: ['payments', 'gcash'], description: 'Increase webhook timeout + idempotency key. Lost 12 orders last promo.', updates: [{ at: nowISO(), by: 'John Carlo Manalo', text: 'Deployed to staging. Waiting UAT sign-off from Marketing.' }], deployments: [{ env: 'Staging', version: 'v5.9.1', at: nowISO(), by: 'John Carlo Manalo', notes: 'Idempotency fix' }], createdAt: nowISO(), updatedAt: nowISO() },
    { id: 'T-1006', title: 'HRIS: add approval matrix for OT (2-level)', systemId: 'SYS-HRIS', project: 'Approvals', type: 'Feature', priority: 'Medium', status: 'Pipeline', assignee: 'Unassigned', reporter: 'HR', due: '2026-09-27', branch: '', pr: '', estimate: 8, progress: 0, labels: ['workflow'], description: 'Supervisor -> HR manager approval chain with email notif.', updates: [], deployments: [], createdAt: nowISO(), updatedAt: nowISO() },
    { id: 'T-1007', title: 'Inventory UAT sign-off: cycle count module', systemId: 'SYS-INV', project: 'Warehouse', type: 'Task', priority: 'High', status: 'In Development', assignee: 'Bea', reporter: 'Warehouse', due: '2026-09-14', branch: 'release/cycle-count', pr: '', estimate: 5, progress: 70, labels: ['uat'], description: 'Coordinate UAT with 2 warehouses. Blocker: barcode scanners arrive Sept 13.', updates: [{ at: nowISO(), by: 'Bea', text: '1 of 2 warehouses signed. Waiting on Cavite site.' }], deployments: [], createdAt: nowISO(), updatedAt: nowISO() },
    { id: 'T-1008', title: 'POS end-of-day report mismatch (discount column)', systemId: 'SYS-POS', project: 'Reports', type: 'Bug', priority: 'Medium', status: 'In Development', assignee: 'Aira', reporter: 'Finance', due: '2026-09-16', branch: 'fix/eod-discount', pr: '', estimate: 3, progress: 20, labels: ['finance'], description: 'Waiting on Finance sample receipts with senior discount combos.', updates: [{ at: nowISO(), by: 'Aira', text: 'Requested 5 sample receipts from Finance.' }], deployments: [], createdAt: nowISO(), updatedAt: nowISO() },
    { id: 'T-1009', title: 'CRM: service ticket SLA breaching silently', systemId: 'SYS-CRM', project: 'After-sales', type: 'Improvement', priority: 'Medium', status: 'In Development', assignee: 'Ramon', reporter: 'Service', due: '2026-09-22', branch: 'feat/sla-alerts', pr: '', estimate: 5, progress: 40, labels: ['sla'], description: 'Add SLA countdown + auto-escalate to supervisor at 80% breach.', updates: [], deployments: [], createdAt: nowISO(), updatedAt: nowISO() },
    { id: 'T-1010', title: 'Website product images slow on mobile', systemId: 'SYS-WEB', project: 'Performance', type: 'Improvement', priority: 'Low', status: 'Pipeline', assignee: 'Unassigned', reporter: 'Marketing', due: '2026-09-28', branch: '', pr: '', estimate: 2, progress: 0, labels: ['perf', 'seo'], description: 'Compress + WebP + lazy-load. LCP currently 4.8s on 4G.', updates: [], deployments: [], createdAt: nowISO(), updatedAt: nowISO() },
    { id: 'T-1011', title: 'DB migration plan: HRIS MySQL 5.7 -> 8.0', systemId: 'SYS-HRIS', project: 'Platform', type: 'Task', priority: 'High', status: 'In Development', assignee: 'John Carlo Manalo', reporter: 'IT', due: '2026-09-14', branch: 'chore/mysql8', pr: '', estimate: 8, progress: 85, labels: ['database', 'maintenance'], description: 'Dry-run done. Schedule prod window Sun 2AM with rollback snapshot.', updates: [], deployments: [{ env: 'Staging', version: 'db-mysql8-rc1', at: nowISO(), by: 'John Carlo Manalo', notes: 'Dry-run passed' }], createdAt: nowISO(), updatedAt: nowISO() },
    { id: 'T-1012', title: 'Centralize all system trackers (this project!)', systemId: 'SYS-CRM', project: 'DevOps', type: 'Feature', priority: 'High', status: 'Completed', assignee: 'John Carlo Manalo', reporter: 'Mgmt', due: '2026-09-10', branch: 'feat/dev-tracker', pr: '', estimate: 13, progress: 100, labels: ['meta'], description: 'One tracker for all Madison systems instead of per-team spreadsheets.', updates: [{ at: nowISO(), by: 'John Carlo Manalo', text: 'MVP live. Team onboarding next.' }], deployments: [{ env: 'Prod', version: 'v1.0.0', at: nowISO(), by: 'John Carlo Manalo', notes: 'Initial release' }], createdAt: nowISO(), updatedAt: nowISO() }
  ];
  return {
    meta: { name: 'Madison Centralized Development Tracker', version: '1.2.0', seededAt: nowISO() },
    systems, tasks,
    projects: deriveProjects(tasks), subprojects: [],
    activity: [{ at: nowISO(), by: 'System', text: 'Seeded with 5 Madison systems + 12 sample tickets.' }]
  };
}

function loadDB() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const seed = seedDB();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    const bak = DB_FILE + '.corrupt-' + Date.now();
    fs.copyFileSync(DB_FILE, bak);
    const seed = seedDB();
    fs.writeFileSync(DB_FILE, JSON.stringify(seed, null, 2));
    return seed;
  }
}
function saveDB(db) {
  db.meta.updatedAt = nowISO();
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
  broadcastChange('data');
}
function broadcastChange(type='data') { const msg=`data: ${JSON.stringify({type,at:nowISO()})}\n\n`; for (const res of eventClients) { try { res.write(msg); } catch (e) { eventClients.delete(res); } } }
function log(db, by, text) {
  db.activity.unshift({ at: nowISO(), by: by || 'System', text });
  db.activity = db.activity.slice(0, 300);
}

function ensureProjectTemplates() {
  let created = 0;
  db.subprojects = db.subprojects || [];
  for (const p of (db.projects || [])) {
    const system = (db.systems || []).find(s => s.id === p.systemId);
    if (p.systemId === 'SYS-ADMIN' || system?.category === 'Non-developing') continue;
    const projectSubs = (db.subprojects || []).filter(s => s.projectId === p.id);
    for (const s of [...projectSubs]) {
      const legacy = LEGACY_PHASE_MAP[String(s.name || '').trim().toLowerCase()];
      if (!legacy || s.name === legacy) continue;
      const duplicate = projectSubs.find(x => x.id !== s.id && String(x.name || '').trim().toLowerCase() === legacy.toLowerCase());
      if (duplicate) {
        for (const t of (db.tasks || [])) if (t.subprojectId === s.id) t.subprojectId = duplicate.id;
        db.subprojects = db.subprojects.filter(x => x.id !== s.id);
      } else {
        s.name = legacy;
        s.updatedAt = nowISO();
      }
      created++;
    }
    const existing = new Set((db.subprojects || []).filter(s => s.projectId === p.id).map(s => String(s.name || '').trim().toLowerCase()));
    for (const name of PROJECT_TEMPLATE) {
      if (existing.has(name.toLowerCase())) continue;
      db.subprojects.push({ id: uid('SUB'), projectId: p.id, name, description:'', deadline:'', startDate:'', stage:'', createdAt: nowISO(), updatedAt: nowISO() });
      existing.add(name.toLowerCase());
      created++;
    }
    for (const [phaseName, taskTitles] of Object.entries(PROJECT_PHASE_TASKS)) {
      const phase = (db.subprojects || []).find(s => s.projectId === p.id && s.name === phaseName);
      if (!phase) continue;
      for (const title of taskTitles) {
        const exists = (db.tasks || []).some(t => t.projectId === p.id && t.subprojectId === phase.id && String(t.title || '').trim().toLowerCase() === title.toLowerCase());
        if (exists) continue;
        db.tasks.push({ id: uid('T'), title, systemId: p.systemId, project: p.name, projectId: p.id, subprojectId: phase.id, type:'Task', priority:'Medium', status:'Pipeline', assignee:p.assignee || 'Unassigned', reporter:'System Template', due:'', startDate:'', branch:'', pr:'', estimate:1, progress:0, labels:['sdlc-template'], description:'', updates:[], deployments:[], createdAt:nowISO(), updatedAt:nowISO() });
        created++;
      }
    }
  }
  return created;
}

let db = loadDB();
if (!(db.systems || []).some(s => s.id === 'SYS-ADMIN')) {
  db.systems.push({ id:'SYS-ADMIN', name:'System Administrator', owner:'IT', color:'#8b5cf6', tech:'Administration', repo:'', envDev:'', envStaging:'', envProd:'', health:'On Track', category:'Non-developing', updatedAt:nowISO() });
  saveDB(db);
}
// Remove the retired BRD phase from existing projects while preserving its tasks and activity history.
const retiredBrdIds = new Set((db.subprojects || []).filter(s => String(s.name || '').trim().toLowerCase() === 'brd').map(s => s.id));
if (retiredBrdIds.size) {
  db.subprojects = (db.subprojects || []).filter(s => !retiredBrdIds.has(s.id));
  for (const t of (db.tasks || [])) if (retiredBrdIds.has(t.subprojectId)) t.subprojectId = '';
  saveDB(db);
}
// migrate older DBs: granular statuses -> 3-stage flow; drop retired v1.1 auth keys
const DEFAULT_COLORS = { 'SYS-HRIS': '#3b82f6', 'SYS-INV': '#f59e0b', 'SYS-POS': '#22c55e', 'SYS-CRM': '#a855f7', 'SYS-WEB': '#ec4899' };
let migrated = false;
if (!db.projects) { db.projects = deriveProjects(db.tasks || []); db.subprojects = db.subprojects || []; migrated = true; }
for (const s of (db.systems || [])) {
  if (!s.color) { s.color = DEFAULT_COLORS[s.id] || '#64748b'; migrated = true; }
}
for (const t of (db.tasks || [])) {
  const mapped = mapStatus(t.status);
  if (mapped !== t.status) { t.status = mapped; migrated = true; }
  if (t.assignee === 'JC') { t.assignee = 'John Carlo Manalo'; migrated = true; }
  for (const u of (t.updates || [])) if (u.by === 'JC') { u.by = 'John Carlo Manalo'; migrated = true; }
  for (const d of (t.deployments || [])) if (d.by === 'JC') { d.by = 'John Carlo Manalo'; migrated = true; }
}
for (const p of (db.projects || [])) {
  if (!p.assignee) { const tk=db.tasks.find(t=>t.projectId===p.id); p.assignee = tk?.assignee || 'Unassigned'; migrated=true; }
  if (p.assignee === 'JC') { p.assignee='John Carlo Manalo'; migrated=true; }
  if (!p.status || !STATUSES.includes(p.status)) {
    const ts=db.tasks.filter(t=>t.projectId===p.id);
    const derived = !ts.length ? 'Pipeline' : ts.every(t=>t.status==='Live') ? 'Live' : ts.some(t=>t.status==='On Hold') ? 'On Hold' : ts.some(t=>t.status==='UAT') ? 'UAT' : ts.some(t=>t.status==='Development') ? 'Development' : 'Pipeline';
    p.status = mapStatus(derived); migrated=true;
  } else {
    const mapped=mapStatus(p.status); if(mapped!==p.status){ p.status=mapped; migrated=true; }
  }
  if (p.startDate===undefined) { p.startDate=''; migrated=true; }
  if (p.benefits===undefined) { p.benefits=normalizeBenefits(); migrated=true; }
}
for (const t of (db.tasks || [])) {
  if (t.startDate===undefined) { t.startDate=''; migrated=true; }
}
if (db.sprints) { delete db.sprints; migrated = true; }
if (db.users || db.sessions) { delete db.users; delete db.sessions; migrated = true; }
const templateBackfill = ensureProjectTemplates();
if (templateBackfill) { log(db, 'System', `Backfilled SDLC template phases: ${templateBackfill} phases added`); migrated = true; }
if (migrated) { log(db, 'System', 'Migrated DB (stages, projects, assignee)'); saveDB(db); }

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: res => res.set('Cache-Control', 'no-store') }));
app.use('/api', (req,res,next)=>{ res.set('Cache-Control','no-store'); next(); });
app.get('/api/events', (req,res)=>{
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'}); res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({type:'connected'})}\n\n`); eventClients.add(res); req.on('close',()=>eventClients.delete(res));
});
const presence = new Map();
const presenceRate = new Map();
const PRESENCE_TTL = 70000;
function cleanPresence(){ const cutoff=Date.now()-PRESENCE_TTL; for(const [id,p] of presence) if(p.at < cutoff) presence.delete(id); }
app.get('/api/presence', (req,res)=>{ cleanPresence(); res.json([...presence.values()]); });
app.post('/api/presence', (req,res)=>{
  const {sessionId,name,systemId,projectId} = req.body || {};
  const key=String(sessionId||''); const now=Date.now();
  if(!/^[a-zA-Z0-9_-]{8,100}$/.test(key) || !String(name||'').trim()) return res.status(400).json({error:'valid sessionId and name required'});
  if(now-(presenceRate.get(key)||0)<5000) return res.status(429).json({error:'presence heartbeat too frequent'});
  presenceRate.set(key,now);
  presence.set(String(sessionId), {sessionId:String(sessionId), name:String(name).slice(0,80), systemId:systemId||'', projectId:projectId||'', at:Date.now()});
  cleanPresence(); res.json({ok:true, viewers:[...presence.values()]});
});
app.use('/api', (req, res, next) => {
  if (!AUTH_TOKEN || req.path === '/health' || req.path === '/auth') return next();
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (token !== AUTH_TOKEN) return res.status(401).json({ error: 'authentication required' });
  next();
});

// ---------- helpers ----------
function computeStats() {
  const byStatus = {}, bySystem = {};
  let critical = 0, done = 0, overdue = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const t of db.tasks) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    bySystem[t.systemId] = (bySystem[t.systemId] || 0) + 1;
    if (t.priority === 'Critical' && t.status !== 'Live') critical++;
    if (t.status === 'Live') done++;
    if (t.status !== 'Live' && t.status !== 'On Hold' && t.due && t.due < today) overdue++;
  }
  const total = db.tasks.length || 1;
  return { total: db.tasks.length, done, donePct: Math.round(done / total * 100), overdue, critical, byStatus, bySystem, systems: db.systems.length };
}

// ---------- API (open access, no login) ----------
app.get('/api/health', (req, res) => res.json({ ok: true, ...db.meta, time: nowISO() }));
app.get('/api/auth', (req, res) => res.json({ required: !!AUTH_TOKEN }));
app.get('/api/meta', (req, res) => res.json({ statuses: STATUSES, priorities: PRIORITIES, types: TYPES, environments: ENVS }));

app.get('/api/stats', (req, res) => res.json(computeStats()));

// systems
app.get('/api/systems', (req, res) => res.json(db.systems));
app.post('/api/systems', (req, res) => {
  const s = { id: req.body.id || uid('SYS'), updatedAt: nowISO(), health: 'On Track', ...req.body };
  if (!s.name) return res.status(400).json({ error: 'name required' });
  db.systems.push(s); log(db, req.body.by || 'User', `System added: ${s.name}`); saveDB(db);
  res.status(201).json(s);
});
app.patch('/api/systems/:id', (req, res) => {
  const s = db.systems.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  Object.assign(s, req.body, { updatedAt: nowISO() });
  log(db, req.body.by || 'User', `System updated: ${s.name}`); saveDB(db); res.json(s);
});
app.delete('/api/systems/:id', (req, res) => {
  const i = db.systems.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'not found' });
  const [gone] = db.systems.splice(i, 1);
  for (const t of db.tasks) if (t.systemId === gone.id) { t.systemId = ''; t.projectId = ''; t.subprojectId = ''; }
  for (const p of db.projects || []) if (p.systemId === gone.id) p.systemId = '';
  log(db, req.body?.by || 'User', `System removed: ${gone.name}`); saveDB(db); res.json({ ok: true });
});

// tasks
app.get('/api/tasks', (req, res) => {
  let out = [...db.tasks];
  const q = (req.query.q || '').toLowerCase();
  if (q) out = out.filter(t => ((t.title || '') + ' ' + (t.description || '') + ' ' + t.id + ' ' + (t.branch || '')).toLowerCase().includes(q));
  for (const k of ['systemId', 'status', 'assignee', 'priority', 'type'])
    if (req.query[k]) out = out.filter(t => (t[k] || '') === req.query[k]);
  out.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json(out);
});
app.post('/api/tasks', (req, res) => {
  const n = Math.max(1000, ...db.tasks.map(t => parseInt(String(t.id).replace(/\D/g, '')) || 0)) + 1;
  const t = { id: req.body.id || ('T-' + n), status: 'Pipeline', priority: 'Medium', type: 'Task', progress: 0, labels: [], updates: [], deployments: [], startDate:'', due:'', createdAt: nowISO(), updatedAt: nowISO(), ...req.body, status: mapStatus(req.body.status || 'Pipeline') };
  if (!t.title || !t.systemId) return res.status(400).json({ error: 'title + systemId required' });
  if (!db.systems.some(s => s.id === t.systemId)) return res.status(400).json({ error: 'unknown system' });
  if (t.projectId && !db.projects.some(p => p.id === t.projectId)) return res.status(400).json({ error: 'unknown project' });
  if (!PRIORITIES.includes(t.priority) || !TYPES.includes(t.type)) return res.status(400).json({ error: 'invalid task fields' });
  t.progress = Math.max(0, Math.min(100, Number(t.progress) || 0));
  db.tasks.unshift(t); log(db, t.assignee || 'User', `Ticket created: ${t.id} ${t.title}`); saveDB(db);
  res.status(201).json(t);
});
app.patch('/api/tasks/:id', (req, res) => {
  const t = db.tasks.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  const before = t.status;
  const body = { ...(req.body || {}) };
  if (body.status) body.status = mapStatus(body.status);
  if (body.systemId && !db.systems.some(s => s.id === body.systemId)) return res.status(400).json({ error: 'unknown system' });
  if (body.projectId && !db.projects.some(p => p.id === body.projectId)) return res.status(400).json({ error: 'unknown project' });
  if (body.priority && !PRIORITIES.includes(body.priority)) return res.status(400).json({ error: 'invalid priority' });
  if (body.type && !TYPES.includes(body.type)) return res.status(400).json({ error: 'invalid type' });
  if (body.progress !== undefined && (!Number.isFinite(Number(body.progress)) || Number(body.progress) < 0 || Number(body.progress) > 100)) return res.status(400).json({ error: 'progress must be 0-100' });
  Object.assign(t, body, { updatedAt: nowISO() });
  if (body.status === 'Live') t.progress = 100;
  if (body.status && body.status !== before) {
    t.updates = t.updates || [];
    t.updates.push({ at: nowISO(), by: req.body.by || 'User', text: `Status: ${before} → ${t.status}` });
    log(db, req.body.by || 'User', `${t.id} moved ${before} → ${t.status}`);
  }
  saveDB(db); res.json(t);
});
app.delete('/api/tasks/:id', (req, res) => {
  const i = db.tasks.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'not found' });
  const [gone] = db.tasks.splice(i, 1);
  log(db, req.body?.by || 'User', `Ticket deleted: ${gone.id}`); saveDB(db); res.json({ ok: true });
});
app.post('/api/tasks/:id/updates', (req, res) => {
  const t = db.tasks.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  if (req.body.env && !ENVS.includes(req.body.env)) return res.status(400).json({ error: 'invalid environment' });
  t.updates = t.updates || [];
  t.updates.unshift({ at: nowISO(), by: req.body.by || 'User', text: req.body.text || '' });
  t.updatedAt = nowISO();
  log(db, req.body.by || 'User', `Update on ${t.id}: ${(req.body.text || '').slice(0, 80)}`);
  saveDB(db); res.status(201).json(t);
});
app.post('/api/tasks/:id/deployments', (req, res) => {
  const t = db.tasks.find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  t.deployments = t.deployments || [];
  t.deployments.unshift({ at: nowISO(), by: req.body.by || 'User', env: req.body.env || 'Staging', version: req.body.version || '', notes: req.body.notes || '' });
  t.updatedAt = nowISO();
  log(db, req.body.by || 'User', `Deploy ${t.id} → ${req.body.env} (${req.body.version})`);
  saveDB(db); res.status(201).json(t);
});

// template: standard SDLC delivery lifecycle per development project.
function applyTemplateToProject(projectId){
  const p = db.projects.find(x=>x.id===projectId);
  if(!p) return null;
  const system = (db.systems || []).find(s => s.id === p.systemId);
  if (p.systemId === 'SYS-ADMIN' || system?.category === 'Non-developing') return { phases: [], tasksCreated: 0, skipped: true };
  const existing = new Set((db.subprojects||[]).filter(s=>s.projectId===projectId).map(s=>s.name.toLowerCase().trim()));
  let created=[];
  let tasksCreated=0;
  for(const name of PROJECT_TEMPLATE){
    if(existing.has(name.toLowerCase())) continue;
    const s={ id: uid('SUB'), projectId, name, description:'', deadline:'', startDate:'', stage:'', createdAt: nowISO(), updatedAt: nowISO() };
    db.subprojects.push(s); created.push(s);
    existing.add(name.toLowerCase());
  }
  for (const [phaseName, taskTitles] of Object.entries(PROJECT_PHASE_TASKS)) {
    const phase = (db.subprojects || []).find(s => s.projectId === projectId && s.name === phaseName);
    if (!phase) continue;
    for (const title of taskTitles) {
      const exists = (db.tasks || []).some(t => t.projectId === projectId && t.subprojectId === phase.id && String(t.title || '').trim().toLowerCase() === title.toLowerCase());
      if (exists) continue;
      db.tasks.push({ id: uid('T'), title, systemId: p.systemId, project: p.name, projectId, subprojectId: phase.id, type:'Task', priority:'Medium', status:'Pipeline', assignee:p.assignee || 'Unassigned', reporter:'System Template', due:'', startDate:'', branch:'', pr:'', estimate:1, progress:0, labels:['sdlc-template'], description:'', updates:[], deployments:[], createdAt:nowISO(), updatedAt:nowISO() });
      tasksCreated++;
    }
  }
  if(created.length || tasksCreated){ log(db,'User',`SDLC template applied to ${p.name}: +${created.length} phases, +${tasksCreated} starter tasks`); saveDB(db); }
  return { phases: created, tasksCreated, skipped: false };
}

// projects + sub-projects (progress derived, never stored) — project status is manual + auto-derived fallback
app.get('/api/projects', (req, res) => res.json(enrichProjects()));
app.get('/api/templates', (req, res) => res.json({ template: PROJECT_TEMPLATE, phaseTasks: PROJECT_PHASE_TASKS }));
app.get('/api/projects/:id/report.pptx', async (req, res) => {
  const payload = reportProjectData(req.params.id);
  if (!payload) return res.status(404).json({ error: 'project not found' });
  const outputDir = path.join(__dirname, 'data', 'ppt-export-output');
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = `${safeReportName(payload.project.name)}-executive-report-${Date.now()}.pptx`;
  const outputPath = path.join(outputDir, filename);
  try {
    await createProjectReport(payload, outputPath);
    res.download(outputPath, `${safeReportName(payload.project.name)}-executive-report.pptx`);
  } catch (error) {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    res.status(500).json({ error: error.message || 'PPT export failed' });
  }
});
app.post('/api/reports/portfolio.pptx', async (req, res) => {
  const payload = portfolioReportData(req.body || {});
  const outputDir = path.join(__dirname, 'data', 'ppt-export-output');
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = `portfolio-executive-report-${Date.now()}.pptx`;
  const outputPath = path.join(outputDir, filename);
  try {
    await createPortfolioReport(payload, outputPath);
    res.download(outputPath, 'madison-portfolio-executive-report.pptx');
  } catch (error) {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    res.status(500).json({ error: error.message || 'Portfolio PPT export failed' });
  }
});
app.get('/api/benefits', (req, res) => res.json(enrichProjects().map(p => ({
  projectId: p.id,
  project: p.name,
  systemId: p.systemId,
  assignee: p.assignee || 'Unassigned',
  status: p.status || 'Pipeline',
  benefits: p.benefits,
  calculation: p.benefitsCalc
}))));
app.post('/api/projects', (req, res) => {
  const wantTemplate = !!req.body.applyTemplate;
  const p = { id: uid('PRJ'), description: '', deadline: '', startDate:'', status:'Pipeline', assignee:'Unassigned', benefits: normalizeBenefits(req.body.benefits), createdAt: nowISO(), updatedAt: nowISO(), ...req.body, status: mapStatus(req.body.status||'Pipeline') };
  p.benefits = normalizeBenefits(p.benefits);
  delete p.applyTemplate;
  if (!p.name || !p.systemId) return res.status(400).json({ error: 'name + systemId required' });
  if (!db.systems.some(s => s.id === p.systemId)) return res.status(400).json({ error: 'unknown system' });
  if(!STATUSES.includes(p.status)) return res.status(400).json({ error: 'invalid status' });
  db.projects.push(p); log(db, p.assignee||'User', `Project created: ${p.name} [${p.status}]`); saveDB(db);
  let templated={ phases: [], tasksCreated: 0 };
  if(wantTemplate) templated = applyTemplateToProject(p.id) || templated;
  res.status(201).json({ ...p, templated: templated.phases.map(s=>s.name), templateTasksCreated: templated.tasksCreated || 0 });
});
app.patch('/api/projects/:id', (req, res) => {
  const p = db.projects.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  if (req.body.systemId && !db.systems.some(s => s.id === req.body.systemId)) return res.status(400).json({ error: 'unknown system' });
  if (req.body.status && !STATUSES.includes(mapStatus(req.body.status))) return res.status(400).json({ error: 'invalid status' });
  const before=p.status;
  const body = { ...(req.body || {}) };
  if(body.status) body.status=mapStatus(body.status);
  if(body.benefits !== undefined) body.benefits = normalizeBenefits(body.benefits);
  const statusChanged=body.status && body.status!==before;
  Object.assign(p, body, { updatedAt: nowISO() });
  if(statusChanged && p.status==='On Hold') p.pausedAt=nowISO();
  if(statusChanged && p.status!=='On Hold' && before==='On Hold') p.resumedAt=nowISO();
  if(statusChanged && p.status==='Live') p.liveAt=nowISO();
  if(statusChanged && p.status==='Development') p.developmentStartedAt=nowISO();
  if(body.status && body.status!==before) log(db, body.by||p.assignee||'User', `Project ${p.name} status: ${before} → ${p.status}`);
  if(body.benefits !== undefined) log(db, body.by||p.assignee||'User', `Benefits updated: ${p.name}`);
  saveDB(db); res.json(p);
});
app.delete('/api/projects/:id', (req, res) => {
  const i = db.projects.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'not found' });
  const [gone] = db.projects.splice(i, 1);
  db.subprojects = (db.subprojects || []).filter(s => s.projectId !== gone.id);
  for (const t of db.tasks) if (t.projectId === gone.id) { t.projectId = ''; t.subprojectId = ''; }
  log(db, req.body?.by || 'User', `Project deleted: ${gone.name} (tickets unlinked)`); saveDB(db); res.json({ ok: true });
});
app.post('/api/projects/:id/apply-template', (req,res)=>{
  const p=db.projects.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({error:'not found'});
  const result = applyTemplateToProject(p.id) || { phases: [], tasksCreated: 0, skipped: false };
  if(result.skipped) return res.json({ ok:true, created:0, tasksCreated:0, phases:[], message:'SDLC template is only available for development systems' });
  if(!result.phases.length && !result.tasksCreated) return res.json({ ok:true, created:0, tasksCreated:0, phases:[], message:'All SDLC phases and starter tasks already exist' });
  res.json({ ok:true, created: result.phases.length, tasksCreated: result.tasksCreated, phases: result.phases.map(s=>s.name) });
});
app.post('/api/subprojects', (req, res) => {
  const s = { id: uid('SUB'), description: '', deadline: '', createdAt: nowISO(), updatedAt: nowISO(), ...req.body };
  if (!s.name || !s.projectId) return res.status(400).json({ error: 'name + projectId required' });
  if (!db.projects.some(p => p.id === s.projectId)) return res.status(400).json({ error: 'unknown project' });
  db.subprojects.push(s); log(db, req.body.by || 'User', `Sub-project created: ${s.name}`); saveDB(db);
  res.status(201).json(s);
});
app.patch('/api/subprojects/:id', (req, res) => {
  const s = db.subprojects.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'not found' });
  Object.assign(s, req.body);
  saveDB(db); res.json(s);
});
app.delete('/api/subprojects/:id', (req, res) => {
  const i = db.subprojects.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'not found' });
  const [gone] = db.subprojects.splice(i, 1);
  for (const t of db.tasks) if (t.subprojectId === gone.id) t.subprojectId = '';
  log(db, 'User', `Sub-project deleted: ${gone.name}`); saveDB(db); res.json({ ok: true });
});

// HQ sync: pulls live project list + progress from the M88 IT Headquarters Supabase
// (same public anon key the HQ site itself ships in its JS bundle; override via env)
const HQ = {
  url: process.env.HQ_SUPABASE_URL || 'https://bmlmxeakyivzwjwemrov.supabase.co',
  key: process.env.HQ_SUPABASE_KEY || 'sb_publishable_QrZIapvR0-7Cl0joIg4kbA_Xwzon0m0',
  table: 'dashboard_content'
};
async function fetchHQProjects() {
  let r, last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { r = await fetch(`${HQ.url}/rest/v1/${HQ.table}?key=eq.projects&select=value`, { headers: { apikey: HQ.key, Authorization: 'Bearer ' + HQ.key }, signal: AbortSignal.timeout(8000) }); break; }
    catch (e) { last = e; if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1))); }
  }
  if (!r) throw last;
  if (!r.ok) throw new Error('HQ sync failed: HTTP ' + r.status);
  const j = await r.json();
  const val = Array.isArray(j) && j.length ? j[0].value : null;
  if (!Array.isArray(val)) throw new Error('HQ sync: no projects row found');
  return val;
}
function hqInitials(name) {
  const map = { 'john carlo manalo': 'JC', 'mhark anthony pentinio': 'MP', 'stephanie joyce guce': 'SG', 'lester mendoza': 'LM', 'lester jay mendoza': 'LM', 'maritoni joy sapinoso': 'MS' };
  return map[String(name || '').toLowerCase()] || '';
}
function hqStage(h) { const progress = Math.max(0, Math.min(100, Number(h?.progress) || 0)); return progress >= 100 ? 'Live' : progress > 0 ? 'Development' : 'Pipeline'; }
function hqWho(s) {
  s = String(s || '').toLowerCase();
  if (s.includes('john carlo') || /\bjc\b/.test(s)) return 'John Carlo Manalo';
  if (s.includes('mhark') || /\bmp\b/.test(s)) return 'Mhark Anthony Pentinio';
  if (s.includes('stephanie') || s.includes('guce') || /\bsg\b/.test(s)) return 'Stephanie Joyce Guce';
  if (s.includes('lester') || s.includes('mendoza') || s.includes('medonza') || /\blm\b/.test(s)) return 'Lester Mendoza';
  if (s.includes('maritoni') || s.includes('sapinoso')) return 'Maritoni Joy Sapinoso';
  return '';
}
function hqAssignee(h) {
  const team = (((h || {}).team) || []).map(x => String(x || ''));
  return hqWho(h.ownerName) || hqWho(h.owner) || hqWho(team[0]) || hqWho(team.join(' ')) || 'Unassigned';
}
function applyHQLifecycleProgress(project, progress) {
  const pct = Math.max(0, Math.min(100, Number(progress) || 0));
  const phases = (db.subprojects || []).filter(s => s.projectId === project.id).sort((a, b) => PROJECT_TEMPLATE.indexOf(a.name) - PROJECT_TEMPLATE.indexOf(b.name));
  const starterTasks = (db.tasks || []).filter(t => t.projectId === project.id && (t.labels || []).includes('sdlc-template'));
  if (starterTasks.length) {
    const completeCount = pct >= 100 ? starterTasks.length : Math.floor((pct / 100) * starterTasks.length);
    starterTasks.forEach((task, index) => {
      task.status = pct >= 100 || index < completeCount ? 'Live' : (pct > 0 && index === completeCount ? 'Development' : 'Pipeline');
      task.progress = task.status === 'Live' ? 100 : 0;
      task.updatedAt = nowISO();
    });
  }
  const phaseUnits = (pct / 100) * PROJECT_TEMPLATE.length;
  phases.forEach((phase, index) => {
    if (pct >= 100 || index < Math.floor(phaseUnits)) phase.stage = 'Live';
    else if (index === Math.floor(phaseUnits) && pct > 0) phase.stage = index < 3 ? 'Development' : index < 5 ? 'UAT' : 'Live';
    else phase.stage = 'Pipeline';
    phase.updatedAt = nowISO();
  });
}
app.post('/api/sync/hq', async (req, res) => {
  try {
    const list = await fetchHQProjects();
    let sys = db.systems.find(s => s.id === 'SYS-HQ');
    if (!sys) {
      sys = { id: 'SYS-HQ', name: 'M88 HQ Systems', owner: 'IT', color: '#14b8a6', tech: 'Various', repo: '', envDev: '', envStaging: '', envProd: 'https://m88-it-headquarters.netlify.app', health: 'On Track', updatedAt: nowISO() };
      db.systems.push(sys);
    }
    let created = 0, updated = 0;
    for (const h of list) {
      if (!h || !h.name) continue;
      let p = db.projects.find(x => x.hqId === h.id) || db.projects.find(x => x.systemId === sys.id && (x.name || '').toLowerCase() === String(h.name).toLowerCase());
      const snap = { hqId: h.id || '', hqProgress: +h.progress || 0, hqStatus: h.status || '', hqUpdated: h.updated || '', url: h.systemUrl || '', updatedAt: nowISO() };
      if (p) { Object.assign(p, snap, { status: hqStage(h), assignee: hqAssignee(h) }); if (!p.description && h.description) p.description = h.description; updated++; const tk = db.tasks.find(t => t.projectId === p.id && (t.labels || []).includes('hq-sync')); if (tk) { tk.status = hqStage(h); tk.progress = Math.min(100, +h.progress || 0); tk.assignee = hqAssignee(h); tk.title = h.name; tk.updatedAt = nowISO(); } }
      else {
        const np = { id: uid('PRJ'), systemId: sys.id, name: h.name, description: h.description || '', deadline: '', startDate: '', status: hqStage(h), assignee: hqAssignee(h), benefits: normalizeBenefits(), createdAt: nowISO(), updatedAt: nowISO(), ...snap };
        db.projects.push(np); created++;
        const tn = Math.max(1000, ...db.tasks.map(t => parseInt(String(t.id).replace(/\D/g, '')) || 0)) + 1;
        db.tasks.unshift({ id: 'T-' + tn, title: h.name, systemId: sys.id, project: h.name, projectId: np.id, subprojectId: '', type: 'Task', priority: 'Medium', status: hqStage(h), assignee: hqAssignee(h), reporter: 'HQ Sync', due: '', branch: '', pr: '', estimate: 0, progress: Math.min(100, +h.progress || 0), labels: ['hq-sync'], description: (h.description || '') + (h.systemUrl ? '\n\nLive URL: ' + h.systemUrl : ''), updates: [], deployments: [], createdAt: nowISO(), updatedAt: nowISO() });
      }
    }
    ensureProjectTemplates();
    for (const project of db.projects.filter(p => p.systemId === sys.id)) {
      project.status = hqStage({ progress: project.hqProgress });
      if (!project.assignee) project.assignee = 'Unassigned';
      applyHQLifecycleProgress(project, project.hqProgress);
    }
    log(db, 'User', `HQ sync: ${created} new, ${updated} updated (${list.length} from HQ)`);
    saveDB(db);
    res.json({ ok: true, created, updated, total: list.length });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// push: new local projects (no hqId yet) are sent UP to the HQ site's Supabase.
// HQ-owned projects are never overwritten (pull direction owns them). ?dry=1 previews only.
app.post('/api/sync/push', async (req, res) => {
  try {
    const dry = String(((req.query || {}).dry) || '') === '1';
    const live = await fetchHQProjects();
    const ids = new Set(live.map(h => h.id));
    const slug = n => { let s = String(n || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project'; let c = s, i = 2; while (ids.has(c)) c = s + '-' + (i++); ids.add(c); return c; };
    const stage = st => st === 'Live' ? ['Live', 'completed'] : st === 'UAT' ? ['UAT', 'in-progress'] : st === 'Development' ? ['In Progress', 'in-progress'] : st === 'On Hold' ? ['On Hold', 'active'] : ['Queued', 'active'];
    const pairs = db.projects.filter(p => !p.hqId).map(p => {
      const tk = db.tasks.find(t => t.projectId === p.id);
      const [st, fl] = stage(tk ? tk.status : 'Pipeline');
      const init = hqInitials(tk ? tk.assignee : '');
      return { p, entry: { id: slug(p.name), name: p.name, status: st, filter: fl, description: p.description || '', progress: tk ? (tk.progress || 0) : 0, owner: init, ownerName: (tk && tk.assignee) || '', updated: 'From Dev Tracker', team: init ? [init] : [], systemUrl: p.url || '', restricted: false } };
    });
    if (!dry && pairs.length) {
      const merged = [...live, ...pairs.map(x => x.entry)];
      const r = await fetch(`${HQ.url}/rest/v1/${HQ.table}`, { method: 'POST', headers: { apikey: HQ.key, Authorization: 'Bearer ' + HQ.key, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ key: 'projects', value: merged, updated_at: new Date().toISOString() }) });
      if (!r.ok) throw new Error('HQ push failed: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
      for (const { p, entry } of pairs) { p.hqId = entry.id; p.hqProgress = entry.progress; p.hqStatus = entry.status; p.hqUpdated = entry.updated; }
      log(db, 'User', `HQ push: ${pairs.length} new project(s) sent to HQ site`);
      saveDB(db);
    }
    res.json({ ok: true, dry, added: pairs.map(x => x.entry.name), total: live.length + pairs.length });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get('/api/sync/status', (req, res) => {
  const pick = w => { const a = (db.activity || []).find(x => (x.text || '').startsWith(w)); return a ? { at: a.at, by: a.by, text: a.text } : null; };
  res.json({ pull: pick('HQ sync:'), push: pick('HQ push:') });
});

app.get('/api/activity', (req, res) => res.json(db.activity.slice(0, 100)));

// export / import / reset
app.get('/api/export', (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename=madison-tracker-export.json');
  res.json(db);
});
app.post('/api/import', (req, res) => {
  if (!req.body.tasks || !req.body.systems) return res.status(400).json({ error: 'invalid file' });
  if (!Array.isArray(req.body.projects) || !Array.isArray(req.body.subprojects)) return res.status(400).json({ error: 'projects and subprojects required' });
  db = { meta: req.body.meta || db.meta, systems: req.body.systems, tasks: (req.body.tasks || []).map(t => ({ ...t, status: mapStatus(t.status) })), projects: req.body.projects, subprojects: req.body.subprojects, activity: req.body.activity || [] };
  log(db, 'User', 'Imported data file'); saveDB(db); res.json({ ok: true, tasks: db.tasks.length });
});
app.post('/api/reset', (req, res) => {
  db = seedDB();
  saveDB(db); res.json({ ok: true });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Madison Dev Tracker live at http://localhost:${PORT}`);
  console.log(`  LAN access: http://<your-pc-ip>:${PORT}\n`);
});
