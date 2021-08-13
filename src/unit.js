'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('./util.js')

async function runUnit() {
  let backendsLength = util.backends.length;
  let defaultValue = 'NA';
  let results = Array(backendsLength).fill(defaultValue);
  let backends = [];
  if ('unit-backend' in util.args) {
    backends = util.args['unit-backend'].split(',');
  } else {
    backends = ['webgpu'];
  }

  for (let i = 0; i < backends.length; i++) {
    let backend = backends[i];
    let backendIndex = util.backends.indexOf(backend);

    if (util.dryrun) {
      let result = `Chrome 94.0.4605.0 (Windows 10.0.0): Executed 1266 of 3777[31m (${backendIndex} FAILED)[39m (skipped 2511) (1 min 9.014 secs / 1 min 3.05 secs)`;
      results[backendIndex] = result;
      util.log(result);
    } else {
      const logFile = path.join(util.outDir, `${util.timestamp}-unit-${backend}.txt`);
      let tfjsDir = '';
      if ('tfjs-dir' in util.args) {
        tfjsDir = util.args['tfjs-dir'];
      } else {
        tfjsDir = 'd:/workspace/project/tfjs';
      }
      process.chdir(path.join(tfjsDir, `tfjs-backend-${backend}`));
      process.env['CHROME_BIN'] = util.browserPath;
      spawnSync('cmd', ['/c', `yarn test > ${logFile}`], {env: process.env, stdio: [process.stdin, process.stdout, process.stderr], timeout: 600*1000});
      var lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean);
      for (let line of lines) {
        if (line.includes('FAILED') || line.includes('Executed')) {
          results[backendIndex] = line;
          util.log(line);
        }
      }
    }
  }

  return results;
}
module.exports = runUnit;