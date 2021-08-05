'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

let parameters = [
  'benchmark',
  'architecture',
  'inputType',
  'inputSize',
  'backend',
];

let platform = os.platform();

let backends = ['webgpu', 'webgl', 'wasm'];

// please make sure these metrics are shown up in order
let targetMetrics = {
  'conformance': ['Prediction'],
  'performance': ['Warmup time','Subsequent average','Best time']
};

const outDir = path.join(path.resolve(__dirname), '../out');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir);
}

let userDataDir;
if (platform === 'darwin') {
  userDataDir = `/Users/${os.userInfo().username}/Library/Application Support/Google/Chrome Canary`;
} else if (platform === 'linux') {
  userDataDir = `/home/${os.userInfo().username}/.config/google-chrome-unstable`;
} else if (platform === 'win32') {
  userDataDir = `${process.env.LOCALAPPDATA}/Google/Chrome SxS/User Data`;
}

function log(info) {
  console.log(info);
  fs.appendFileSync(this.logFile, String(info) + '\n');
}

module.exports = {
  'browserArgs': '--enable-unsafe-webgpu --disable-dawn-features=disallow_unsafe_apis --enable-features=WebAssemblySimd,WebAssemblyThreads --start-maximized',
  'hostname': os.hostname(),
  'parameters': parameters,
  'platform': platform,
  'backends': backends,
  'targetMetrics': targetMetrics,
  'outDir': outDir,
  'userDataDir': userDataDir,
  'url': 'http://wp-27.sh.intel.com/workspace/project/tfjswebgpu/tfjs/e2e/benchmarks/local-benchmark/',
  'timeout': 180 * 1000,
  log: log,
};
