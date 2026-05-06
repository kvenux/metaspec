#!/usr/bin/env node
import { main } from "../src/cli.js";

const jsonMode = process.argv.includes("--json");

try {
  await main(process.argv.slice(2));
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const code = error?.code || "CLI_ERROR";
  if (jsonMode) {
    console.error(JSON.stringify({ ok: false, code, message }, null, 2));
  } else {
    console.error(`错误：${message}`);
  }
  process.exitCode = 1;
}
