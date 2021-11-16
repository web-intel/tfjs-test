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
    backends = ['webgpu', 'webgl'];
  }

  for (let i = 0; i < backends.length; i++) {
    let backend = backends[i];
    let backendIndex = util.backends.indexOf(backend);
    let cmd;
    let timeout;
    if (util.dryrun) {
      cmd = 'yarn && yarn test --grep nextFrame';
      timeout = 120 * 1000;
    } else {
      cmd = 'yarn && yarn test';
      timeout = 600 * 1000;
    }

    let tfjsDir = '';
    if ('tfjs-dir' in util.args) {
      tfjsDir = util.args['tfjs-dir'];
    } else {
      tfjsDir = 'd:/workspace/project/tfjs';
    }
    process.chdir(path.join(tfjsDir, `tfjs-backend-${backend}`));
    process.env['CHROME_BIN'] = util.browserPath;

    let logFile =
      path.join(util.outDir, `${util.timestamp}-unit-${backend}.txt`)
        .replace(/\\/g, '/');
    if (['machineName'].includes(util.hostname)) {
      if (backend === 'webgpu') {
        process.chdir(path.join(tfjsDir, `link-package-core`));
        spawnSync('cmd', ['/c', `yarn build > ${logFile}`], {
          env: process.env,
          stdio: [process.stdin, process.stdout, process.stderr],
          timeout: timeout
        });
        process.chdir(path.join(tfjsDir, `tfjs-backend-${backend}`));
        spawnSync(
          'cmd',
          ['/c', `yarn && yarn build && yarn bazel build src:tests > ${logFile}`], {
          env: process.env,
          stdio: [process.stdin, process.stdout, process.stderr],
          timeout: timeout
        });
        fs.unlink(
          path.join(tfjsDir, 'tfjs-backend-webgpu', 'src', 'tests.ts'),
          () => { });
        fs.copyFile(
          path.join(
            tfjsDir, 'bazel-out', 'x64_windows-fastbuild', 'bin',
            'tfjs-backend-webgpu', 'src', 'tests.ts'),
          path.join(tfjsDir, 'tfjs-backend-webgpu', 'src', 'tests.ts'),
          () => { });
        spawnSync(
          'cmd',
          ['/c', `yarn karma start --browsers=chrome_webgpu > ${logFile}`], {
          env: process.env,
          stdio: [process.stdin, process.stdout, process.stderr],
          timeout: timeout
        });
      } else {
        spawnSync('cmd', ['/c', `${cmd} > ${logFile}`], {
          env: process.env,
          stdio: [process.stdin, process.stdout, process.stderr],
          timeout: timeout
        });
      }
    } else {
      if (backend === 'webgpu') {
        process.chdir(path.join(tfjsDir, `link-package-core`));
        spawnSync(
          'C:/Program Files/Git/git-bash.exe',
          ['-c', `yarn build > ${logFile}`], {
          env: process.env,
          stdio: [process.stdin, process.stdout, process.stderr],
          timeout: timeout
        });
        process.chdir(path.join(tfjsDir, `tfjs-backend-${backend}`));
        spawnSync(
          'C:/Program Files/Git/git-bash.exe',
          ['-c', `yarn && yarn build && yarn bazel build src:tests > ${logFile}`], {
          env: process.env,
          stdio: [process.stdin, process.stdout, process.stderr],
          timeout: timeout
        });
        fs.unlink(
          path.join(tfjsDir, 'tfjs-backend-webgpu', 'src', 'tests.ts'),
          () => { });
        fs.copyFile(
          path.join(
            tfjsDir, 'bazel-out', 'x64_windows-fastbuild', 'bin',
            'tfjs-backend-webgpu', 'src', 'tests.ts'),
          path.join(tfjsDir, 'tfjs-backend-webgpu', 'src', 'tests.ts'),
          () => { });
        spawnSync(
          'C:/Program Files/Git/git-bash.exe',
          ['-c', `yarn karma start --browsers=chrome_webgpu > ${logFile}`], {
          env: process.env,
          stdio: [process.stdin, process.stdout, process.stderr],
          timeout: timeout
        });
      } else {
        spawnSync(
          'C:/Program Files/Git/git-bash.exe', ['-c', `${cmd} > ${logFile}`],
          {
            env: process.env,
            stdio: [process.stdin, process.stdout, process.stderr],
            timeout: timeout
          });
      }
    }
    var lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean);
    for (let line of lines) {
      if (line.includes('FAILED') || line.includes('Executed')) {
        results[backendIndex] = line;
        util.log(line);
      }
    }
  }

  return results;
}
module.exports = runUnit;
