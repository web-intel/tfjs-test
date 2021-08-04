'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('./util.js')

async function runUnit() {
  let results = [];
  if (util.dryrun) {
    results.push('Chrome 91.0.4472 (Windows 10.0.0): Executed 1266 of 3777[31m (6 FAILED)[39m (skipped 2511) (1 min 9.014 secs / 1 min 3.05 secs)');
  } else {
    const logFile = path.join(util.outDir, `${util.timestamp}.txt`);
    let tfjsDir = '';
    if ('tfjs-dir' in util.args) {
      tfjsDir = util.args['tfjs-dir'];
    } else {
      tfjsDir = 'd:/workspace/project/tfjs';
    }
    process.chdir(path.join(tfjsDir, 'tfjs-backend-webgpu'));
    process.env['CHROME_BIN'] = util.browserPath;
    spawnSync('cmd', ['/c', `yarn test > ${logFile}`], {env: process.env, stdio: [process.stdin, process.stdout, process.stderr]});
    var lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean);
    for (let line of lines) {
      if (line.includes('FAILED') || line.includes('Executed')) {
        results.push(line);
      }
    }
  }

  if (results.length == 0) {
    results.push('FAILED to run unit test!');
  }
  util.log(results[results.length - 1]);
  return results;
}
module.exports = runUnit;