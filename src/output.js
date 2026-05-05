export function printResult(result, options = {}) {
  if (typeof result === "string") {
    process.stdout.write(`${result}\n`);
    return;
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (result.findings) return printFindings(result.findings, result);
  if (result.ok === false) return printError(result);
  if (result.message) process.stdout.write(`${status("ok")} ${style("完成", "success")} ${result.message}\n`);
  if (result.summary) printSummary(result.summary);
  if (Array.isArray(result.sections)) {
    for (const section of result.sections) printSection(section.title, section.items);
  } else if (Array.isArray(result.items)) {
    for (const item of result.items) process.stdout.write(`${item}\n`);
  }
  if (Array.isArray(result.next) && result.next.length) {
    printSection("下一步", result.next.map((item, index) => `${index + 1}. ${item}`));
  }
}

export function printProgressTitle(title) {
  if (isInteractive()) {
    const label = title.replace(/^CodeSpec\s*/i, "") || "CLI";
    const headline = ` CodeSpec ${label} `;
    const width = Math.max(46, visibleLength(headline) + 8);
    const line = "─".repeat(width - 2);
    process.stderr.write(`${style(`╭${line}╮`, "brand")}\n`);
    process.stderr.write(`${style("│", "brand")} ${style(headline.trim(), "title").padEnd(width + colorPadding(headline.trim(), "title") - 3)}${style("│", "brand")}\n`);
    process.stderr.write(`${style("│", "brand")} ${style("repo-aware specs from local coding agents", "muted").padEnd(width + colorPadding("repo-aware specs from local coding agents", "muted") - 3)}${style("│", "brand")}\n`);
    process.stderr.write(`${style(`╰${line}╯`, "brand")}\n\n`);
    return;
  }
  process.stderr.write(`${style(title, "title")}\n\n`);
}

export function printProgress(message) {
  process.stderr.write(`  ${status("step")} ${message}\n`);
}

export function style(text, kind) {
  if (!shouldColor()) return text;
  const codes = {
    brand: [36],
    title: [1, 36],
    section: [1],
    success: [32],
    warning: [33],
    error: [31],
    muted: [2]
  }[kind];
  if (!codes) return text;
  return `\u001b[${codes.join(";")}m${text}\u001b[0m`;
}

function printError(result) {
  process.stderr.write(`${status("fail")} ${style("失败", "error")} ${result.message || "命令执行失败。"}\n`);
  if (result.code) process.stderr.write(`  code: ${result.code}\n`);
  if (result.runner) process.stderr.write(`  runner: ${result.runner}\n`);
  if (Array.isArray(result.next) && result.next.length) {
    printSection("建议", result.next.map((item, index) => `${index + 1}. ${item}`), process.stderr);
  }
}

function printSummary(summary) {
  const entries = Array.isArray(summary) ? summary : Object.entries(summary);
  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === "") continue;
    process.stdout.write(`  ${style(`${key}:`, "muted")} ${value}\n`);
  }
}

function printSection(title, items = [], stream = process.stdout) {
  if (!items.length) return;
  stream.write("\n");
  stream.write(`${style(`━━ ${title}`, "section")}\n`);
  for (const item of items) stream.write(`  ${item}\n`);
}

function printFindings(findings, result = {}) {
  if (!findings.length) {
    process.stdout.write(`${status("ok")} ${style("完成", "success")} 未发现问题。\n`);
    return;
  }
  const stream = result.ok === false ? process.stderr : process.stdout;
  if (result.ok === false && result.message) stream.write(`${status("fail")} ${style("失败", "error")} ${result.message}\n`);
  stream.write(`${style("━━ 发现以下问题", "section")}\n`);
  for (const finding of findings) {
    stream.write(`[${finding.level}] ${finding.code} ${finding.path} - ${finding.message}\n`);
  }
  if (Array.isArray(result.next) && result.next.length) {
    printSection("建议", result.next.map((item, index) => `${index + 1}. ${item}`), stream);
  }
}

function shouldColor() {
  return Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
}

function isInteractive() {
  return !process.env.CI;
}

function status(kind) {
  const labels = {
    ok: style("◆", "success"),
    fail: style("◆", "error"),
    step: style("◇", "muted")
  };
  return labels[kind] || labels.step;
}

function visibleLength(text) {
  return String(text).length;
}

function colorPadding(text, kind) {
  if (!shouldColor()) return 0;
  return style(text, kind).length - String(text).length;
}
