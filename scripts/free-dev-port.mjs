/**
 * Frees the Vite dev port for `npm run dev`, but only from this project's own leftovers (TL-08).
 *
 * `predev` used to run `kill-port 5173`, which stops whatever holds that port. 5173 is Vite's default, so any other
 * Vite project of yours is on it too, and starting Book Engine stopped that project's dev server with no message.
 *
 * Vite is set to `strictPort: true` in apps/desktop/vite.config.ts, and tauri.conf.json points `devUrl` at
 * http://localhost:5173, so the port cannot simply move. Something has to give way. This decides WHICH something:
 * a leftover `node` running this repository's Vite, or the reader itself, is stopped; anything else is named and
 * left alone, and the start stops so you can decide.
 *
 * No dependencies: it shells out to what each platform already has.
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** The one place the port is written. vite.config.ts and tauri.conf.json must agree with it. */
export const DEV_PORT = 5173;

/** The compiled reader. A leftover of it holds the port when a run ended badly. */
const OUR_APP = "book-engine-desktop";

/**
 * Is this process one of ours, so that stopping it loses nothing but a leftover?
 *
 * Ours means: the reader itself, or a Node process whose command line names this repository. A bare `node` from
 * somewhere else on the machine is NOT ours, however much it looks like a dev server: another project's Vite is
 * exactly that, and it is the thing this whole function exists to protect.
 *
 * @param {{name?: string, commandLine?: string, repoPath: string}} process
 * @returns {boolean}
 */
export function isOurs({ name = "", commandLine = "", repoPath }) {
  const lowerName = name.toLowerCase();
  const lowerLine = commandLine.toLowerCase();
  const lowerRepo = repoPath.toLowerCase().replace(/\\/g, "/");

  if (lowerName.startsWith(OUR_APP)) {
    return true;
  }

  const isNode = lowerName === "node" || lowerName === "node.exe";
  if (!isNode) {
    return false;
  }

  // A command line can hold either slash on Windows, so compare with one.
  return lowerLine.replace(/\\/g, "/").includes(lowerRepo);
}

/**
 * The listening PIDs in `netstat -ano` output, for one port.
 *
 * Only LISTENING rows count. An ESTABLISHED row on the same port is a browser tab connected to the dev server, and
 * stopping the browser is not what anybody asked for.
 *
 * @param {string} output
 * @param {number} port
 * @returns {number[]}
 */
export function listeningPidsFromNetstat(output, port) {
  const found = new Set();
  for (const line of output.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5 || !/^tcp$/i.test(parts[0])) {
      continue;
    }
    const [, local, , state, pid] = parts;
    if (state.toUpperCase() !== "LISTENING") {
      continue;
    }
    // The local address ends with `:<port>`, and an IPv6 address holds colons of its own.
    if (local.endsWith(`:${port}`) && Number.isInteger(Number(pid)) && Number(pid) > 0) {
      found.add(Number(pid));
    }
  }
  return [...found];
}

/**
 * The PIDs in `lsof -t` output.
 *
 * @param {string} output
 * @returns {number[]}
 */
export function pidsFromLsof(output) {
  return [
    ...new Set(
      output
        .split(/\r?\n/)
        .map((line) => Number(line.trim()))
        .filter((pid) => Number.isInteger(pid) && pid > 0)
    ),
  ];
}

function quietly(file, args) {
  try {
    return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    // A tool that is missing, or that finds nothing, both mean "nothing to report".
    return "";
  }
}

function pidsOnPort(port) {
  if (process.platform === "win32") {
    return listeningPidsFromNetstat(quietly("netstat", ["-ano"]), port);
  }
  return pidsFromLsof(quietly("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]));
}

function describe(pid) {
  if (process.platform === "win32") {
    // Name on the first line, command line on the second. A command line holds no newline, and PowerShell's own
    // escape for a tab is a backtick, which would end this template string.
    const out = quietly("powershell", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; if ($p) { $p.Name; $p.CommandLine }`,
    ]);
    const [name = "", commandLine = ""] = out.split(/\r?\n/).map((line) => line.trim());
    return { name, commandLine };
  }
  const out = quietly("ps", ["-p", String(pid), "-o", "comm=,args="]);
  const trimmed = out.trim();
  return { name: path.basename(trimmed.split(/\s+/)[0] ?? ""), commandLine: trimmed };
}

function stop(pid) {
  if (process.platform === "win32") {
    quietly("taskkill", ["/PID", String(pid), "/F", "/T"]);
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
}

function main() {
  const repoPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const pids = pidsOnPort(DEV_PORT);

  if (pids.length === 0) {
    console.log(`Port ${DEV_PORT} is free.`);
    return 0;
  }

  const strangers = [];
  for (const pid of pids) {
    const { name, commandLine } = describe(pid);
    if (isOurs({ name, commandLine, repoPath })) {
      console.log(`Stopping this project's leftover on port ${DEV_PORT}: ${name || "unknown"} (pid ${pid}).`);
      stop(pid);
    } else {
      strangers.push({ pid, name });
    }
  }

  if (strangers.length === 0) {
    return 0;
  }

  const list = strangers.map(({ pid, name }) => `  ${name || "unknown program"} (pid ${pid})`).join("\n");
  console.error(
    `Port ${DEV_PORT} is held by a program that is not part of this project:\n${list}\n\n` +
      `It was NOT stopped. Book Engine needs this exact port, because vite.config.ts sets strictPort and\n` +
      `tauri.conf.json points devUrl at http://localhost:${DEV_PORT}.\n\n` +
      `Close that program yourself and run this again, or change the port in BOTH files.`
  );
  return 1;
}

// Only act when run as a command. An import, as the tests do, gets the functions and no side effect.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
