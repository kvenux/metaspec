const VALUE_OPTIONS = new Set([
  "--path",
  "--change",
  "--integration",
  "--script-dir",
  "--token",
  "--project-url",
  "--codewiki-project-url",
  "--project-id",
  "--codewiki-project-id",
  "--max-lag",
  "--commit-scan-limit"
]);

const BOOLEAN_OPTIONS = new Set([
  "--help",
  "-h",
  "--json",
  "--force",
  "--no-codewiki",
  "--no-persist-env",
  "--generate"
]);

export function parseArgs(argv) {
  const options = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (VALUE_OPTIONS.has(token)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`缺少选项值：${token}`);
      }
      const key = token.slice(2).replaceAll("-", "_");
      options[key] = value;
      index += 1;
    } else if (BOOLEAN_OPTIONS.has(token)) {
      const key = token.replace(/^-+/, "").replaceAll("-", "_");
      options[key] = true;
    } else if (token.startsWith("--")) {
      throw new Error(`未知选项：${token}`);
    } else {
      positionals.push(token);
    }
  }

  if (options.codewiki_project_url && !options.project_url) options.project_url = options.codewiki_project_url;
  if (options.codewiki_project_id && !options.project_id) options.project_id = options.codewiki_project_id;
  return { command: positionals[0] || "help", args: positionals.slice(1), options };
}
