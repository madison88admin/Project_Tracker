import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const SKILL_DIR = process.env.SKILL_DIR || "C:\\Users\\JC\\.codex\\plugins\\cache\\openai-primary-runtime\\presentations\\26.921.10847\\skills\\presentations";
const { resolvePresentationFont, finalizePresentation } = await import(
  pathToFileURL(path.join(SKILL_DIR, "container_tools/artifact_tool_utils.mjs")).href,
);
const family = resolvePresentationFont({ fontFamily: "Aptos" });
const W = 1280;
const H = 720;
const C = { bg: "#0b1220", surface: "#141f31", surface2: "#1b2940", line: "#304361", text: "#f4f7fb", muted: "#9fb0c9", blue: "#66a3ff", green: "#48d597", orange: "#f7b955", red: "#ff7777", purple: "#c38cff" };
const statusColors = { Pipeline: "#64748b", Development: "#3b82f6", UAT: "#a855f7", Live: "#22c55e", "On Hold": "#f59e0b" };

function shape(slide, geometry, left, top, width, height, fill = "none", line = "none", radius = "rounded-xl") {
  return slide.shapes.add({ geometry, position: { left, top, width, height }, fill, line: line === "none" ? { style: "solid", fill: "none", width: 0 } : { style: "solid", fill: line, width: 1 }, ...(geometry === "roundRect" ? { borderRadius: radius } : {}) });
}
function text(slide, value, left, top, width, height, opts = {}) {
  const box = shape(slide, "textbox", left, top, width, height);
  box.text = String(value ?? "");
  box.text.style = { typeface: family, fontSize: opts.size ?? 16, bold: !!opts.bold, color: opts.color ?? C.text, alignment: opts.align ?? "left", autoFit: "shrinkTextOnOverflow" };
  return box;
}
function pill(slide, value, left, top, width, color) {
  shape(slide, "roundRect", left, top, width, 24, color, "none", "rounded-full");
  text(slide, value, left + 7, top + 3, width - 14, 18, { size: 11, bold: true, align: "center" });
}
function dateLabel(value) {
  if (!value) return "Not set";
  const d = new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}
function money(value) { return Number(value) ? `PHP ${Number(value).toLocaleString("en-PH")}` : "Not set"; }
function filterText(filters = {}) {
  return [filters.systemLabel, filters.developerLabel, filters.statusLabel].filter(Boolean).join("  ·  ") || "All selected projects";
}
function addBrand(slide, title, subtitle, logoBytes) {
  slide.background.fill = C.bg;
  shape(slide, "rect", 0, 0, W, 6, C.blue, "none");
  text(slide, "MADISON DEVELOPMENT OPERATIONS", 56, 28, 500, 18, { size: 12, bold: true, color: C.blue });
  text(slide, title, 56, 50, 820, 42, { size: 31, bold: true });
  text(slide, subtitle, 58, 96, 900, 20, { size: 14, color: C.muted });
  if (logoBytes) slide.images.add({ blob: logoBytes, contentType: "image/png", alt: "Madison88 logo", fit: "contain", position: { left: 1030, top: 28, width: 170, height: 40 } });
}
function footer(slide, index, total) { text(slide, `Madison Dev Tracker  ·  Executive reporting  ·  ${index}/${total}`, 56, 695, 1168, 16, { size: 10, color: C.muted, align: "right" }); }
function card(slide, left, top, width, height) { return shape(slide, "roundRect", left, top, width, height, C.surface, C.line, "rounded-2xl"); }
function metricCard(slide, left, label, value, note, color = C.text) {
  card(slide, left, 136, 274, 120);
  text(slide, label.toUpperCase(), left + 20, 156, 230, 16, { size: 11, bold: true, color: C.muted });
  text(slide, value, left + 20, 180, 230, 38, { size: 30, bold: true, color });
  text(slide, note, left + 20, 224, 230, 18, { size: 11, color: C.muted });
}
function addOverview(slide, data, logoBytes, index, total) {
  const s = data.summary;
  addBrand(slide, "Portfolio executive report", filterText(data.filters), logoBytes);
  metricCard(slide, 56, "Tracked projects", String(s.total), `${s.live} live  ·  ${s.inProgress} in progress`, C.text);
  metricCard(slide, 344, "Live delivery", String(s.live), `${s.total ? Math.round(s.live / s.total * 100) : 0}% of selection`, C.green);
  metricCard(slide, 632, "Average completion", `${s.avgCompletion}%`, "weighted across selected projects", C.blue);
  metricCard(slide, 920, "Needs attention", String(s.overdue), s.overdue ? "overdue project signals" : "no overdue project signals", s.overdue ? C.orange : C.green);
  card(slide, 56, 280, 560, 350);
  text(slide, "STATUS DISTRIBUTION", 84, 303, 250, 18, { size: 12, bold: true, color: C.muted });
  const statuses = ["Pipeline", "Development", "UAT", "Live", "On Hold"];
  statuses.forEach((status, i) => {
    const y = 344 + i * 48;
    const count = s.byStatus[status] || 0;
    const width = s.total ? Math.max(count ? 8 : 0, 410 * count / s.total) : 0;
    text(slide, status, 84, y, 120, 18, { size: 13, bold: true });
    text(slide, String(count), 500, y, 64, 18, { size: 13, bold: true, align: "right", color: statusColors[status] });
    shape(slide, "roundRect", 84, y + 24, 410, 8, C.surface2, "none", "rounded-full");
    if (width) shape(slide, "roundRect", 84, y + 24, width, 8, statusColors[status], "none", "rounded-full");
  });
  card(slide, 640, 280, 584, 350);
  text(slide, "EXECUTIVE READOUT", 668, 303, 250, 18, { size: 12, bold: true, color: C.muted });
  const live = s.live || 0;
  const active = s.inProgress || 0;
  const rows = [
    ["Delivery position", live ? `${live} project${live === 1 ? "" : "s"} live` : "No projects live"],
    ["Work in progress", active ? `${active} project${active === 1 ? "" : "s"} in Development or UAT` : "No active delivery work"],
    ["Attention", s.overdue ? `${s.overdue} overdue project signal${s.overdue === 1 ? "" : "s"}` : "No overdue project signals"],
    ["Selection", `${s.total} project${s.total === 1 ? "" : "s"} included in this report`],
  ];
  rows.forEach((row, i) => {
    const y = 348 + i * 58;
    shape(slide, "roundRect", 668, y, 14, 14, i === 2 && s.overdue ? C.orange : C.blue, "none", "rounded-full");
    text(slide, row[0], 700, y - 1, 180, 18, { size: 12, color: C.muted });
    text(slide, row[1], 700, y + 19, 450, 20, { size: 15, bold: true, color: i === 2 && s.overdue ? C.orange : C.text });
  });
  footer(slide, index, total);
}
function addDelivery(slide, data, logoBytes, index, total) {
  addBrand(slide, "Delivery portfolio", "Current phase, progress, and next gate for the selected projects", logoBytes);
  card(slide, 56, 136, 730, 530);
  text(slide, "PROJECT DELIVERY", 84, 159, 240, 18, { size: 12, bold: true, color: C.muted });
  const list = data.projects.slice().sort((a, b) => (b.pct - a.pct) || a.name.localeCompare(b.name)).slice(0, 8);
  if (!list.length) text(slide, "No projects match the selected filters.", 84, 230, 620, 22, { size: 16, color: C.muted });
  list.forEach((p, i) => {
    const y = 197 + i * 54;
    text(slide, p.name, 84, y, 250, 18, { size: 13, bold: true });
    text(slide, `${p.systemName}  ·  ${p.assignee}`, 84, y + 20, 290, 16, { size: 10, color: C.muted });
    pill(slide, p.status, 394, y - 2, 100, statusColors[p.status] || C.blue);
    text(slide, `${p.pct}%`, 704, y, 50, 18, { size: 12, bold: true, align: "right", color: statusColors[p.status] || C.text });
    shape(slide, "roundRect", 510, y + 24, 244, 7, C.surface2, "none", "rounded-full");
    if (p.pct > 0) shape(slide, "roundRect", 510, y + 24, Math.max(7, 244 * p.pct / 100), 7, statusColors[p.status] || C.blue, "none", "rounded-full");
  });
  card(slide, 812, 136, 412, 530);
  text(slide, "NEXT GATES & RISKS", 840, 159, 260, 18, { size: 12, bold: true, color: C.muted });
  const risks = data.projects.filter(p => p.overdueCount || p.nextPhase || p.status === "On Hold").sort((a, b) => (b.overdueCount - a.overdueCount) || a.name.localeCompare(b.name)).slice(0, 6);
  if (!risks.length) text(slide, "No current gate or deadline signals.", 840, 230, 320, 22, { size: 15, color: C.muted });
  risks.forEach((p, i) => {
    const y = 200 + i * 70;
    text(slide, p.name, 840, y, 320, 18, { size: 13, bold: true });
    const detail = p.overdueCount ? `${p.overdueCount} overdue task${p.overdueCount === 1 ? "" : "s"}` : p.status === "On Hold" ? "On Hold · blocker review" : `Next gate: ${p.nextPhase || "Confirm handover"}`;
    text(slide, detail, 840, y + 22, 320, 17, { size: 11, color: p.overdueCount ? C.red : C.muted });
    text(slide, p.nextTaskDeadline ? `Next due ${dateLabel(p.nextTaskDeadline)}` : dateLabel(p.deadline), 840, y + 42, 320, 16, { size: 10, color: C.muted });
  });
  footer(slide, index, total);
}
function addTeam(slide, data, logoBytes, index, total) {
  addBrand(slide, "Team capacity", "Active project allocation across the selected projects", logoBytes);
  card(slide, 56, 136, 1168, 530);
  text(slide, "DEVELOPER WORKLOAD", 84, 159, 250, 18, { size: 12, bold: true, color: C.muted });
  const team = Object.entries(data.workload).sort((a, b) => b[1].active - a[1].active).slice(0, 8);
  if (!team.length) text(slide, "No active assignments in the selected projects.", 84, 230, 900, 22, { size: 16, color: C.muted });
  team.forEach(([name, info], i) => {
    const y = 200 + i * 52;
    text(slide, name, 84, y, 260, 18, { size: 13, bold: true });
    text(slide, `${info.active} active project${info.active === 1 ? "" : "s"}`, 84, y + 21, 260, 16, { size: 10, color: C.muted });
    shape(slide, "roundRect", 380, y + 5, 650, 10, C.surface2, "none", "rounded-full");
    if (info.allocation) shape(slide, "roundRect", 380, y + 5, Math.min(650, 650 * info.allocation / 100), 10, info.allocation >= 100 ? C.orange : C.blue, "none", "rounded-full");
    text(slide, `${info.allocation}% allocated`, 1045, y, 130, 18, { size: 11, bold: true, align: "right", color: info.allocation >= 100 ? C.orange : C.text });
  });
  footer(slide, index, total);
}
function addBenefits(slide, data, logoBytes, index, total) {
  addBrand(slide, "FTE benefits", "Policy-based capacity and cost impact for the selected projects", logoBytes);
  card(slide, 56, 136, 1168, 160);
  text(slide, "CAPACITY RELEASED", 84, 159, 250, 18, { size: 12, bold: true, color: C.muted });
  text(slide, String(data.benefits.measured), 84, 192, 120, 42, { size: 36, bold: true, color: C.green });
  text(slide, "projects with a policy baseline", 220, 204, 260, 18, { size: 12, color: C.muted });
  const metrics = [["Time saved / month", `${data.benefits.timeSaved} hrs`], ["FTE equivalent", String(data.benefits.fteEquivalent)], ["Annual cost avoidance", money(data.benefits.costAvoidance)]];
  metrics.forEach((row, i) => { const x = 500 + i * 230; shape(slide, "roundRect", x, 172, 210, 78, C.surface2, "none", "rounded-xl"); text(slide, row[0], x + 16, 187, 178, 16, { size: 11, color: C.muted }); text(slide, row[1], x + 16, 211, 178, 20, { size: 16, bold: true, color: C.text }); });
  card(slide, 56, 318, 1168, 348);
  text(slide, "PROJECT BENEFIT BREAKDOWN", 84, 341, 300, 18, { size: 12, bold: true, color: C.muted });
  const rows = data.projects.filter(p => p.benefitsCalc?.configured).slice(0, 7);
  if (!rows.length) text(slide, "No selected project has a completed Benefits Calculation Policy baseline.", 84, 405, 800, 22, { size: 16, color: C.muted });
  rows.forEach((p, i) => { const y = 379 + i * 35; text(slide, p.name, 84, y, 330, 17, { size: 12, bold: true }); text(slide, p.assignee, 430, y, 190, 17, { size: 11, color: C.muted }); text(slide, `${p.benefitsCalc.timeSaved} hrs/mo`, 650, y, 140, 17, { size: 12, bold: true, align: "right", color: C.green }); text(slide, `${p.benefitsCalc.fteEquivalent} FTE`, 810, y, 110, 17, { size: 12, bold: true, align: "right" }); text(slide, money(p.benefitsCalc.costAvoidance), 950, y, 220, 17, { size: 12, bold: true, align: "right" }); });
  footer(slide, index, total);
}
function addRegister(slide, data, logoBytes, index, total) {
  addBrand(slide, "Project register", "A concise delivery view for executive review", logoBytes);
  card(slide, 56, 136, 1168, 530);
  const cols = [{ label: "PROJECT", x: 84, w: 280 }, { label: "SYSTEM", x: 370, w: 210 }, { label: "OWNER", x: 590, w: 170 }, { label: "STATUS", x: 770, w: 110 }, { label: "PROGRESS", x: 892, w: 120 }, { label: "NEXT GATE / DATE", x: 1022, w: 160 }];
  cols.forEach(c => text(slide, c.label, c.x, 160, c.w, 16, { size: 10, bold: true, color: C.muted }));
  shape(slide, "rect", 84, 185, 1090, 1, C.line, "none");
  const list = data.projects.slice(0, 10);
  if (!list.length) text(slide, "No projects match the selected filters.", 84, 240, 700, 22, { size: 16, color: C.muted });
  list.forEach((p, i) => {
    const y = 204 + i * 42;
    if (i % 2 === 0) shape(slide, "roundRect", 76, y - 5, 1110, 34, C.surface2, "none", "rounded-lg");
    text(slide, p.name, 84, y, 270, 17, { size: 12, bold: true });
    text(slide, p.systemName, 370, y, 205, 17, { size: 11, color: C.muted });
    text(slide, p.assignee, 590, y, 165, 17, { size: 11, color: C.muted });
    pill(slide, p.status, 770, y - 1, 100, statusColors[p.status] || C.blue);
    text(slide, `${p.pct}%`, 892, y, 120, 17, { size: 12, bold: true, color: statusColors[p.status] || C.text });
    text(slide, p.nextPhase || p.currentPhase || "No next gate", 1022, y, 150, 17, { size: 11, bold: true });
    text(slide, dateLabel(p.deadline), 1022, y + 16, 150, 13, { size: 9, color: C.muted });
  });
  if (data.projects.length > list.length) text(slide, `Showing ${list.length} of ${data.projects.length} selected projects`, 84, 620, 500, 18, { size: 10, color: C.muted });
  footer(slide, index, total);
}

export async function buildPortfolioReport(input, options = {}) {
  const tmpDir = options.tmpDir || process.env.TMP_DIR;
  const finalPptx = options.finalPptx || process.env.FINAL_PPTX;
  if (!path.isAbsolute(tmpDir ?? "") || !path.isAbsolute(finalPptx ?? "")) throw new Error("tmpDir and finalPptx must be absolute paths");
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(path.dirname(finalPptx), { recursive: true });
  let logoBytes = null;
  try { logoBytes = await fs.readFile(path.join(process.cwd(), "public", "assets", "m88logo.png")); } catch (error) {}
  const data = input || {};
  const include = { overview: true, delivery: true, team: true, benefits: true, register: true, ...(data.include || {}) };
  const presentation = Presentation.create({ slideSize: { width: W, height: H } });
  const slidePlans = [];
  if (include.overview) slidePlans.push(addOverview);
  if (include.delivery) slidePlans.push(addDelivery);
  if (include.team) slidePlans.push(addTeam);
  if (include.benefits) slidePlans.push(addBenefits);
  if (include.register) slidePlans.push(addRegister);
  if (!slidePlans.length) slidePlans.push(addOverview);
  slidePlans.forEach((builder, i) => { const slide = presentation.slides.add(); builder(slide, data, logoBytes, i + 1, slidePlans.length); slide.speakerNotes.textFrame.setText("Portfolio data is sourced from the Madison Dev Tracker API. Filters and included sections are captured at export time."); });
  const candidatePath = path.join(tmpDir, "portfolio-candidate.pptx");
  await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
  const montage = await presentation.export({ format: "webp", montage: true, scale: 1 });
  await fs.writeFile(path.join(tmpDir, "portfolio-montage.webp"), new Uint8Array(await montage.arrayBuffer()));
  if (options.skipValidation) { await fs.copyFile(candidatePath, finalPptx); return null; }
  const stagingDir = options.stagingDir || path.join(path.dirname(finalPptx), "../.ppt-finalizer");
  await fs.mkdir(stagingDir, { recursive: true });
  const result = await finalizePresentation({ explicitTotalSlideCount: slidePlans.length, requiredNativeTableOwnerSlides: [], requiredNativeChartOwnerSlides: [], workspaceDir: path.resolve(process.cwd()), candidatePath, finalPath: finalPptx, pythonExecutable: process.env.RUNTIME_PYTHON, integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"), layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"), layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-heading-fit"], fontPolicy: { basis: "design", families: [family] }, verifyArtifactToolImport: true, receiptPath: path.join(stagingDir, `${path.basename(finalPptx)}.validation.json`) });
  await fs.writeFile(path.join(tmpDir, "validation-result.json"), JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  let body = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) body += chunk;
  await buildPortfolioReport(JSON.parse(body || "{}"));
}
