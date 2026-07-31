"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(
  path.join(__dirname, "..", "client", "index.html"),
  "utf8"
);
const launcher = fs.readFileSync(
  path.join(__dirname, "..", "client", "src", "launcher.js"),
  "utf8"
);
const worker = fs.readFileSync(
  path.join(__dirname, "..", "client", "service-worker.js"),
  "utf8"
);
const buildScript = fs.readFileSync(
  path.join(__dirname, "..", "scripts", "build-client.js"),
  "utf8"
);

const bootstrapMatch = html.match(
  /<!-- Finish a Service Worker update[\s\S]*?<script>([\s\S]*?)<\/script>\s*<!-- Protocol/
);
assert(bootstrapMatch, "The Service Worker bootstrap script must be extractable.");
new vm.Script(bootstrapMatch[1], { filename: "client/index.html:update-barrier" });

const barrierIndex = html.indexOf("window.__tibiaGoServiceWorkerReady");
const launcherIndex = html.indexOf('src="src/launcher.js');

assert(barrierIndex >= 0, "The client update barrier must be present.");
assert(
  barrierIndex < launcherIndex,
  "The update barrier must be created before launcher.js executes."
);
assert.match(html, /registration\.installing/);
assert.match(html, /registration\.waiting/);
assert.match(html, /window\.location\.replace\(target\.href\)/);
assert.doesNotMatch(html, /window\.location\.reload\(\)/);

assert.match(launcher, /window\.__tibiaGoServiceWorkerReady/);
assert.match(
  launcher,
  /Promise\.resolve\(updateBarrier\)[\s\S]*?\.then\(function \(\) \{[\s\S]*?loadNextScript\(0\)/,
  "The source graph must wait for the update barrier."
);

assert.match(worker, /self\.clients\.claim\(\)/);
assert.doesNotMatch(worker, /client\.navigate\(/);

const htmlBuild = html.match(/target\.searchParams\.set\("build", "([^"]+)"\)/)[1];
const launcherBuild = launcher.match(/CLIENT_BUILD\s*=\s*"([^"]+)"/)[1];
const workerBuild = worker.match(/CLIENT_BUILD\s*=\s*"([^"]+)"/)[1];
assert.strictEqual(htmlBuild, launcherBuild);
assert.strictEqual(workerBuild, launcherBuild);
assert.match(buildScript, /window\.__tibiaGoServiceWorkerReady/);
assert.match(buildScript, /Promise\.resolve\(updateBarrier\)/);

console.log("PASS: client updates finish before scripts and Tibia assets begin loading.");
