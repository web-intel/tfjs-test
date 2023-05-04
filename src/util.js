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

let allBackends = ['webgpu', 'webgl', 'wasm', 'cpu'];

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

function ensureNoDir(dir) {
  fs.rmSync(dir, {recursive: true, force: true});
}

function ensureNoFile(file) {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
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
  'browserArgs':
      '--enable-features=WebAssemblyThreads,SharedArrayBuffer,WebAssemblySimd,MediaFoundationD3D11VideoCapture --start-maximized --disable-dawn-features=disallow_unsafe_apis',
  'hostname': os.hostname(),
  'parameters': parameters,
  'platform': platform,
  'allBackends': allBackends,
  'targetMetrics': targetMetrics,
  'outDir': outDir,
  'benchmarkUrl':
      'https://wp-27.sh.intel.com/workspace/project/tfjswebgpu/tfjs',
  'benchmarkUrlArgs': 'CHECK_COMPUTATION_FOR_ERRORS=false',
  'demoUrl':
      'https://wp-27.sh.intel.com/workspace/project/tfjswebgpu/tfjs-models/pose-detection/demos',
  'timeout': 180 * 1000,
  'breakdown': true,
  capitalize: capitalize,
  ensureDir: ensureDir,
  ensureNoDir: ensureNoDir,
  ensureNoFile: ensureNoFile,
  getDuration: getDuration,
  log: log,
  sleep: sleep,
  uncapitalize: uncapitalize,
  conformanceBackends: [],
  demoBackends: [],
  performanceBackends: [],
  unitBackends: [],
};
