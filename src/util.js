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
  'performance': ['Warmup time', 'Subsequent average', 'Best time']
};

const outDir = path.join(path.resolve(__dirname), '../out');
ensureDir(outDir);

function capitalize(s) {
  return s[0].toUpperCase() + s.slice(1);
}

function uncapitalize(s) {
  return s[0].toLowerCase() + s.slice(1);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
}

function getDuration(start, end) {
  let diff = Math.abs(start - end);
  const hours = Math.floor(diff / 3600000);
  diff -= hours * 3600000;
  const minutes = Math.floor(diff / 60000);
  diff -= minutes * 60000;
  const seconds = Math.floor(diff / 1000);
  return `${hours}:${('0' + minutes).slice(-2)}:${('0' + seconds).slice(-2)}`;
}

function log(info) {
  console.log(info);
  fs.appendFileSync(this.logFile, String(info) + '\n');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  'browserArgs': '--enable-unsafe-webgpu --disable-dawn-features=disallow_unsafe_apis --enable-features=WebAssemblySimd,WebAssemblyThreads --start-maximized',
  'hostname': os.hostname(),
  'parameters': parameters,
  'platform': platform,
  'backends': backends,
  'targetMetrics': targetMetrics,
  'outDir': outDir,
  'benchmarkUrl': 'https://wp-27.sh.intel.com/workspace/project/tfjswebgpu/tfjs/e2e/benchmarks/local-benchmark',
  'benchmarkUrlArgs': 'WEBGL_USE_SHAPES_UNIFORMS=true&CHECK_COMPUTATION_FOR_ERRORS=false',
  'demoUrl': 'https://wp-27.sh.intel.com/workspace/project/tfjswebgpu/tfjs-models/pose-detection/demos/live_video/dist/?backend=tfjs-webgpu&model=',
  'timeout': 180 * 1000,
  capitalize: capitalize,
  getDuration: getDuration,
  log: log,
  sleep: sleep,
  uncapitalize: uncapitalize,
};
