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
const C = {
  bg: "#0b1220",
  surface: "#141f31",
  surface2: "#1b2940",
  line: "#304361",
  text: "#f4f7fb",
  muted: "#9fb0c9",
  blue: "#66a3ff",
  green: "#48d597",
  orange: "#f7b955",
  red: "#ff7777",
  purple: "#c38cff",
};

function shape(slide, geometry, left, top, width, height, fill = "none", line = "none", radius = "rounded-xl") {
  return slide.shapes.add({
    geometry,
    position: { left, top, width, height },
    fill,
    line: line === "none" ? { style: "solid", fill: "none", width: 0 } : { style: "solid", fill: line, width: 1 },
    ...(geometry === "roundRect" ? { borderRadius: radius } : {}),
  });
}

function text(slide, value, left, top, width, height, opts = {}) {
  const box = shape(slide, "textbox", left, top, width, height, "none", "none");
  box.text = String(value ?? "");
  box.text.style = {
    typeface: family,
    fontSize: opts.size ?? 18,
    bold: !!opts.bold,
    color: opts.color ?? C.text,
    alignment: opts.align ?? "left",
    autoFit: "shrinkTextOnOverflow",
  };
  return box;
}

function pill(slide, value, left, top, width, color) {
  shape(slide, "roundRect", left, top, width, 28, color, "none", "rounded-full");
  text(slide, value, left + 10, top + 4, width - 20, 20, { size: 13, bold: true, align: "center" });
}

function money(value) {
  if (!Number.isFinite(Number(value)) || !Number(value)) return "Not set";
  return "PHP " + Number(value).toLocaleString("en-PH");
}

function dateLabel(value) {
  if (!value) return "Not set";
  const d = new Date(value + (String(value).length === 10 ? "T00:00:00" : ""));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function phaseColor(status) {
  return status === "Live" ? C.green : status === "On Hold" ? C.orange : status === "UAT" ? C.purple : C.blue;
}

function nextAction(report) {
  if (report.status === "On Hold") return report.blockedReason ? `Resolve blocker: ${report.blockedReason}` : "Resolve blocker and resume the SDLC flow";
  if (report.status === "Live") return report.hypercareOpen ? "Complete hypercare checks and confirm handover" : "Monitor production and confirm operational ownership";
  if (report.overdueCount) return `Recover ${report.overdueCount} overdue task${report.overdueCount === 1 ? "" : "s"} before the next gate`;
  return report.nextPhase ? `Advance to ${report.nextPhase}` : "Confirm the next delivery gate";
}

export async function buildProjectReport(input, options = {}) {
  const tmpDir = options.tmpDir || process.env.TMP_DIR;
  const finalPptx = options.finalPptx || process.env.FINAL_PPTX;
  if (!path.isAbsolute(tmpDir ?? "") || !path.isAbsolute(finalPptx ?? "")) {
    throw new Error("tmpDir and finalPptx must be absolute paths");
  }
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.mkdir(path.dirname(finalPptx), { recursive: true });
  const presentation = Presentation.create({ slideSize: { width: W, height: H } });
  const slide = presentation.slides.add();
  slide.background.fill = C.bg;
  try {
    const logo = await fs.readFile(path.join(process.cwd(), "public", "assets", "m88logo.png"));
    slide.images.add({ blob: logo, contentType: "image/png", alt: "Madison88 logo", fit: "contain", position: { left: 836, top: 28, width: 156, height: 28 } });
  } catch (error) {
    // The report remains usable if a deployment does not include the optional brand asset.
  }

  const p = input.project || {};
  const s = input.system || {};
  const calc = p.benefitsCalc || {};
  const status = p.status || "Pipeline";
  const statusColor = phaseColor(status);
  const completion = Math.max(0, Math.min(100, Number(p.pct) || 0));
  const reportTitle = String(p.name || "Project executive report");

  // A compact executive layout: identity first, then one clear delivery story.
  shape(slide, "rect", 0, 0, W, 6, statusColor, "none");
  text(slide, "MADISON DEVELOPMENT OPERATIONS", 56, 28, 460, 18, { size: 12, bold: true, color: C.blue });
  text(slide, reportTitle, 56, 50, 760, 44, { size: 32, bold: true });
  text(slide, `${s.name || "System not set"}  ·  ${p.assignee || "Unassigned"}`, 58, 96, 680, 22, { size: 15, color: C.muted });
  pill(slide, status, 1038, 45, 164, statusColor);
  text(slide, "Executive project report", 996, 82, 206, 18, { size: 12, color: C.muted, align: "right" });

  // Hero metrics keep the most important answers visible at a glance.
  shape(slide, "roundRect", 56, 136, 1168, 148, C.surface, C.line, "rounded-2xl");
  text(slide, "DELIVERY OVERVIEW", 84, 157, 230, 18, { size: 12, bold: true, color: C.muted });
  text(slide, `${completion}%`, 84, 181, 165, 49, { size: 42, bold: true, color: statusColor });
  text(slide, "overall completion", 86, 236, 190, 18, { size: 13, color: C.muted });
  shape(slide, "rect", 292, 174, 1, 78, C.line, "none");
  text(slide, `${p.done || 0}/${p.total || 0}`, 326, 181, 160, 42, { size: 32, bold: true });
  text(slide, "tasks completed", 328, 236, 170, 18, { size: 13, color: C.muted });
  shape(slide, "rect", 526, 174, 1, 78, C.line, "none");
  text(slide, "CURRENT PHASE", 560, 157, 180, 18, { size: 12, bold: true, color: C.muted });
  text(slide, p.currentPhase || status, 560, 181, 270, 34, { size: 23, bold: true, color: statusColor });
  text(slide, p.nextPhase ? `Next gate: ${p.nextPhase}` : "Final delivery gate", 562, 236, 300, 18, { size: 13, color: C.muted });
  shape(slide, "rect", 884, 174, 1, 78, C.line, "none");
  text(slide, "DELIVERY STATUS", 916, 157, 180, 18, { size: 12, bold: true, color: C.muted });
  text(slide, status === "Development" ? "In development" : status, 916, 181, 250, 34, { size: 23, bold: true });
  shape(slide, "roundRect", 84, 263, 1090, 9, C.surface2, "none", "rounded-full");
  if (completion > 0) shape(slide, "roundRect", 84, 263, Math.max(10, 1090 * completion / 100), 9, statusColor, "none", "rounded-full");

  // Seven-gate SDLC path. The current gate is accented, completed gates are green.
  const phases = ["Data Gathering", "Frontend", "Backend", "UAT", "Go-Live", "Live", "Hypercare"];
  const phaseIndex = Math.max(0, phases.findIndex((phase) => String(p.currentPhase || "").toLowerCase().startsWith(phase.toLowerCase())));
  shape(slide, "roundRect", 56, 302, 1168, 142, C.surface, C.line, "rounded-2xl");
  text(slide, "SDLC DELIVERY PATH", 84, 323, 220, 18, { size: 12, bold: true, color: C.muted });
  text(slide, `${phaseIndex + 1} of ${phases.length} gates`, 1010, 323, 164, 18, { size: 12, color: C.muted, align: "right" });
  const lineY = 374;
  const startX = 112;
  const step = 166;
  shape(slide, "rect", startX, lineY - 2, step * (phases.length - 1), 4, C.surface2, "none");
  if (phaseIndex > 0) shape(slide, "rect", startX, lineY - 2, step * phaseIndex, 4, C.green, "none");
  phases.forEach((phase, i) => {
    const x = startX + step * i;
    const color = i < phaseIndex ? C.green : i === phaseIndex ? statusColor : C.surface2;
    shape(slide, "roundRect", x - 14, lineY - 14, 28, 28, color, i > phaseIndex ? C.line : color, "rounded-full");
    if (i < phaseIndex) text(slide, "✓", x - 9, lineY - 9, 18, 18, { size: 13, bold: true, align: "center", color: C.bg });
    else text(slide, String(i + 1), x - 9, lineY - 9, 18, 18, { size: 11, bold: true, align: "center", color: i === phaseIndex ? C.bg : C.muted });
    text(slide, phase, x - 55, 399, 110, 26, { size: 11, bold: i === phaseIndex, align: "center", color: i <= phaseIndex ? C.text : C.muted });
  });

  const boxes = [
    { x: 56, title: "DATES & GATES", rows: [
      ["Started", dateLabel(p.startDate)],
      [status === "Live" ? "Live since" : "Development end", dateLabel(status === "Live" ? p.liveAt : p.deadline)],
      ["Next phase", p.nextPhase || "No next gate"],
    ] },
    { x: 456, title: "TASK OUTLOOK", rows: [
      ["Pipeline / Dev / UAT", `${p.byStage?.Pipeline || 0} / ${p.byStage?.Development || 0} / ${p.byStage?.UAT || 0}`],
      ["Live / On hold", `${p.byStage?.Live || 0} / ${p.byStage?.["On Hold"] || 0}`],
      ["Overdue tasks", String(p.overdueCount || 0)],
      ["Next task due", dateLabel(p.nextTaskDeadline)],
    ] },
    { x: 856, title: "BUSINESS IMPACT", rows: [
      ["Time saved / month", calc.configured ? `${calc.timeSaved} hrs` : "Baseline not set"],
      ["FTE equivalent", calc.configured ? String(calc.fteEquivalent) : "Not set"],
      ["Annual cost impact", calc.configured ? money(calc.costAvoidance) : "Not set"],
    ] },
  ];
  for (const box of boxes) {
    shape(slide, "roundRect", box.x, 462, 368, 150, C.surface, C.line, "rounded-2xl");
    text(slide, box.title, box.x + 24, 482, 280, 18, { size: 12, bold: true, color: C.muted });
    box.rows.forEach((row, i) => {
      const y = 514 + i * 24;
      text(slide, row[0], box.x + 24, y, 170, 18, { size: 12, color: C.muted });
      text(slide, row[1], box.x + 188, y, 154, 18, { size: 13, bold: true, align: "right", color: i === 2 && box.title === "TASK OUTLOOK" && Number(row[1]) > 0 ? C.red : C.text });
    });
  }

  shape(slide, "roundRect", 56, 630, 1168, 52, C.surface, C.line, "rounded-2xl");
  text(slide, "NEXT ACTION", 84, 646, 130, 18, { size: 12, bold: true, color: C.muted });
  text(slide, nextAction(p), 224, 645, 900, 20, { size: 15, bold: true, color: status === "On Hold" || (p.overdueCount || 0) > 0 ? C.orange : C.text });
  text(slide, `Prepared ${dateLabel(new Date().toISOString().slice(0, 10))}  ·  Madison Dev Tracker`, 56, 695, 1168, 16, { size: 10, color: C.muted, align: "right" });
  slide.speakerNotes.textFrame.setText("Project data is sourced from the Madison Dev Tracker API. Status, task counts, dates, and FTE figures are generated from the selected project record at export time.");

  const candidatePath = path.join(tmpDir, "candidate.pptx");
  await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
  const preview = await presentation.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(tmpDir, "slide-1.png"), new Uint8Array(await preview.arrayBuffer()));

  if (options.skipValidation) {
    await fs.copyFile(candidatePath, finalPptx);
    return null;
  }
  const stagingDir = options.stagingDir || path.join(path.dirname(finalPptx), "../.ppt-finalizer");
  await fs.mkdir(stagingDir, { recursive: true });
  const result = await finalizePresentation({
    explicitTotalSlideCount: 1,
    requiredNativeTableOwnerSlides: [],
    requiredNativeChartOwnerSlides: [],
    workspaceDir: path.resolve(process.cwd()),
    candidatePath,
    finalPath: finalPptx,
    pythonExecutable: process.env.RUNTIME_PYTHON,
    integrityValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_package_integrity.py"),
    layoutValidatorPath: path.join(SKILL_DIR, "container_tools/inspect_presentation_layout_geometry.py"),
    layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-heading-fit"],
    requiredNativeTableOwnerSlides: [],
    fontPolicy: { basis: "design", families: [family] },
    verifyArtifactToolImport: true,
    receiptPath: path.join(stagingDir, `${path.basename(finalPptx)}.validation.json`),
  });
  await fs.writeFile(path.join(tmpDir, "validation-result.json"), JSON.stringify(result, null, 2));
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  let body = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) body += chunk;
  await buildProjectReport(JSON.parse(body || "{}"));
}
