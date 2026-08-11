"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const deploy = fs.readFileSync(path.join(root, "scripts", "deploy-tibiago.py"), "utf8");
const watchdog = fs.readFileSync(path.join(root, "scripts", "tibiago-watchdog.sh"), "utf8");

const deployChecks = [...watchdog.matchAll(/if deploy_is_active; then/g)].map((match) => match.index);
const watchdogLock = watchdog.indexOf('if ! mkdir "$LOCK_DIR"');
const watchdogTrap = watchdog.indexOf("trap release_lock EXIT HUP INT TERM");

assert.strictEqual(deployChecks.length, 2,
  "watchdog must check the deploy marker before and after acquiring its lock");
assert.ok(deployChecks[0] < watchdogLock,
  "watchdog must stand down before competing for its normal restart lock");
assert.ok(deployChecks[1] > watchdogTrap,
  "watchdog must recheck the marker after winning the lock race");
assert.ok(watchdog.includes('[ "$age" -lt 900 ]'),
  "a crashed deploy marker must expire instead of disabling recovery forever");

const markerCreation = deploy.indexOf('deploy_lock = posixpath.join(remote_root, ".deploying")');
const listenerStop = deploy.indexOf("stop_command = (");
const markerCleanup = deploy.indexOf('f"rm -f {deploy_lock}/pid; rmdir {deploy_lock}');

assert.ok(markerCreation >= 0 && markerCreation < listenerStop,
  "deploy must create its marker before stopping the listener");
assert.ok(deploy.includes('while [ -d \\"$watchdog\\" ]'),
  "deploy must wait for an already-running watchdog");
assert.ok(deploy.includes('if ! mkdir \\"$lock\\"'),
  "concurrent deploys must compete for one atomic marker directory");
assert.ok(markerCleanup > listenerStop,
  "deploy must remove its marker from a finally block after the restart");
assert.ok(deploy.includes("time.sleep(5)"),
  "deploy must keep observing the new process after its first healthy response");
assert.ok(deploy.includes('[ \\"$owner\\" = \\"$pid\\" ]'),
  "the stable health check must verify that the expected PID owns the port");

console.log("Deploy/watchdog restart interlock tests passed.");
