#!/usr/bin/env node
import { exit } from "node:process";

import { runCli } from "./index.js";

await runCli(process.argv.slice(2)).then((code) => {
  if (code !== 0) exit(code);
});
