/**
 * Tests for scripts/free-dev-port.mjs (TL-08).
 *
 * The point of the script is the thing it REFUSES to do, so most of these tests are about a process it must leave
 * alone. The old `kill-port 5173` would have stopped every one of them.
 *
 * Run by `npm run check:scripts`, which is `node --test scripts/`. No test dependency: Node's own runner.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { DEV_PORT, isOurs, listeningPidsFromNetstat, pidsFromLsof } from "./free-dev-port.mjs";

const REPO = "C:\\dev\\book-engine";

test("the reader's own leftover is ours", () => {
  assert.equal(isOurs({ name: "book-engine-desktop.exe", commandLine: "", repoPath: REPO }), true);
});

test("a node process running this repository's vite is ours", () => {
  assert.equal(
    isOurs({
      name: "node.exe",
      commandLine: "node C:\\dev\\book-engine\\node_modules\\vite\\bin\\vite.js",
      repoPath: REPO,
    }),
    true
  );
});

test("a node process of a DIFFERENT project is not ours, even though it is vite", () => {
  assert.equal(
    isOurs({
      name: "node.exe",
      commandLine: "node C:\\dev\\some-other-app\\node_modules\\vite\\bin\\vite.js",
      repoPath: REPO,
    }),
    false,
    "another project's dev server is the exact thing this script exists to protect"
  );
});

test("a program that is not node and not the reader is never ours", () => {
  for (const name of ["python.exe", "Docker Desktop.exe", "java", "nginx", "Code.exe"]) {
    assert.equal(isOurs({ name, commandLine: `${name} --port ${DEV_PORT}`, repoPath: REPO }), false, name);
  }
});

test("naming the repository in the command line is not enough without node", () => {
  assert.equal(
    isOurs({ name: "python.exe", commandLine: `python C:\\dev\\book-engine\\serve.py`, repoPath: REPO }),
    false,
    "any program can name a folder; only node and the reader may be stopped"
  );
});

test("a command line that mixes slashes still matches this repository", () => {
  assert.equal(
    isOurs({ name: "node", commandLine: "node C:/dev/book-engine/node_modules/.bin/vite", repoPath: REPO }),
    true
  );
});

test("a missing name or command line is not ours", () => {
  assert.equal(isOurs({ repoPath: REPO }), false);
  assert.equal(isOurs({ name: "", commandLine: "", repoPath: REPO }), false);
});

test("netstat: only a LISTENING row on the port counts", () => {
  const output = [
    "  Proto  Local Address          Foreign Address        State           PID",
    "  TCP    0.0.0.0:5173           0.0.0.0:0              LISTENING       4242",
    "  TCP    127.0.0.1:5173         127.0.0.1:51515        ESTABLISHED     9999",
    "  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1111",
  ].join("\r\n");

  assert.deepEqual(
    listeningPidsFromNetstat(output, 5173),
    [4242],
    "an ESTABLISHED row is a browser tab connected to the dev server, not the server"
  );
});

test("netstat: a port that only appears as a foreign address is not a match", () => {
  const output = "  TCP    127.0.0.1:51515        127.0.0.1:5173         ESTABLISHED     9999";

  assert.deepEqual(listeningPidsFromNetstat(output, 5173), []);
});

test("netstat: a longer port number is not a match for the shorter one", () => {
  const output = "  TCP    0.0.0.0:51730          0.0.0.0:0              LISTENING       7777";

  assert.deepEqual(
    listeningPidsFromNetstat(output, 5173),
    [],
    "51730 ends with no ':5173', so a plain substring search would have been wrong"
  );
});

test("netstat: an IPv6 row on the port counts, and a PID is reported once", () => {
  const output = [
    "  TCP    [::]:5173              [::]:0                 LISTENING       4242",
    "  TCP    0.0.0.0:5173           0.0.0.0:0              LISTENING       4242",
  ].join("\n");

  assert.deepEqual(listeningPidsFromNetstat(output, 5173), [4242]);
});

test("netstat: noise, headers and UDP rows give nothing", () => {
  const output = [
    "Active Connections",
    "",
    "  Proto  Local Address          Foreign Address        State           PID",
    "  UDP    0.0.0.0:5173           *:*                                    8888",
  ].join("\n");

  assert.deepEqual(listeningPidsFromNetstat(output, 5173), [], "UDP does not serve the dev port");
});

test("lsof: pids are read, de-duplicated, and rubbish is dropped", () => {
  assert.deepEqual(pidsFromLsof("4242\n4242\n1234\n"), [4242, 1234]);
  assert.deepEqual(pidsFromLsof(""), []);
  assert.deepEqual(pidsFromLsof("\n \n"), []);
  assert.deepEqual(pidsFromLsof("not-a-pid\n0\n-5\n"), [], "0 and a negative number are not process ids");
});
