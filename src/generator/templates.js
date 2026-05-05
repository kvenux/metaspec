import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(SRC_DIR, "../..");
const FULL_TEMPLATE_DIR = path.join(PACKAGE_ROOT, "templates", "full");

export function readFullTemplates() {
  return {
    design: readTemplate("DESIGN.md"),
    spec: readTemplate("SPEC.md"),
    specAnnotated: readTemplate("SPEC-annotated.md")
  };
}

export function requiredSpecSections() {
  return ["组件定位", "领域术语", "角色与边界", "DFX约束", "核心能力", "数据约束"];
}

export function requiredDesignSections() {
  return ["设计概述", "系统架构", "数据模型", "接口设计", "核心流程设计", "算法设计", "缓存设计", "异常处理设计", "监控与日志", "安全设计"];
}

export function commonOutputRules() {
  return `输出硬性要求：
1. 只输出最终 Markdown 正文，不要输出解释、前言、后记。
2. 不要用 \`\`\`md 或任何代码围栏包裹整篇文档。
3. 不要提到 sandbox、filesystem、read-only、不能写文件、copy into your repo 等运行环境信息。
4. 使用中文撰写；技术名词可以保留英文。
5. 不要声称已经写入文件；CodeSpec CLI 会负责保存产物。`;
}

export function specBlackBoxRules() {
  return `SPEC 写作边界：
1. SPEC 回答“做什么”，面向产品、测试、业务方和 AI。
2. 必须从已生成的 design.md 反推出外部可感知行为和业务规则。
3. 禁止写实现细节：文件路径、类名、函数名、数据库表名、字段类型、索引、框架内部机制、缓存实现、源码包名。
4. 技术事实必须抽象成用户可感知的能力、约束、规则或验收条件。
5. 无法从 design.md 推断的业务意图，标记为“待确认”，不要编造。`;
}

function readTemplate(name) {
  return fs.readFileSync(path.join(FULL_TEMPLATE_DIR, name), "utf8").trim();
}
