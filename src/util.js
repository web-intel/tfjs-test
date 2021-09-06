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
  'url': 'http://wp-27.sh.intel.com/workspace/project/tfjswebgpu/tfjs/e2e/benchmarks/local-benchmark/',
  'urlArgs': 'localBuild=webgl,webgpu&WEBGL_USE_SHAPES_UNIFORMS=true&WEBGPU_USE_GLSL=false',
  'timeout': 180 * 1000,
  log: log,
};
