'use strict';

const {execSync, spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('./util.js')

async function runUnit() {
  let backendsLength = util.allBackends.length;
  let defaultValue = 'NA';
  let results = Array(backendsLength).fill(defaultValue);
  let backends = [];
  if ('unit-backend' in util.args) {
    backends = util.args['unit-backend'].split(',');
  } else {
    backends = ['webgpu', 'webgl'];
  }
  util.unitBackends = backends;

  let tfjsDir = '';
  if ('tfjs-dir' in util.args) {
    tfjsDir = util.args['tfjs-dir'];
  } else {
    if (util.platform === 'linux') {
      tfjsDir = '/workspace/project/tfjs';
    } else if (util.platform === 'win32') {
      tfjsDir = 'd:/workspace/project/tfjs';
    }
  }
  util['clientRepoDate'] =
      execSync(`cd ${tfjsDir} && git log -1 --format=%ci`).toString();
  util['clientRepoCommit'] =
      execSync(`cd ${tfjsDir} && git rev-parse HEAD`).toString();

  for (let i = 0; i < backends.length; i++) {
    let backend = backends[i];
    let backendIndex = util.allBackends.indexOf(backend);
    let cmd;
    let timeout = 600 * 1000;
    if (util.dryrun) {
      cmd = 'yarn && yarn test --grep nextFrame';
      timeout = 120 * 1000;
    } else {
      cmd = 'yarn && yarn test';
      timeout = 600 * 1000;
    }

    process.chdir(path.join(tfjsDir, `tfjs-backend-${backend}`));
    process.env['CHROME_BIN'] = util.browserPath;
    let logFile =
        path.join(util.timestampDir, `${util.timestamp}-unit-${backend}.log`)
            .replace(/\\/g, '/');
    util.ensureNoFile(logFile);

    if (util.platform === 'linux' || util.platform === 'darwin') {
      try {
        execSync(`${cmd} >> ${logFile}`, {
          env: process.env,
          stdio: [process.stdin, process.stdout, process.stderr],
          timeout: timeout
        });
      } catch (error) {
      }
    } else if (util.platform === 'win32') {
      let shell = 'C:/Program Files/Git/git-bash.exe';
      let shellOption = '-c';
      let ret, shellCmd;
      if (backend === 'webgpu') {
        if (!(util.args['unit-skip-build'])) {
          process.chdir(tfjsDir);
          shellCmd = 'yarn';
          util.log(`[cmd] ${shellCmd}`);
          ret = spawnSync(shell, [shellOption, shellCmd], {
            env: process.env,
            stdio: [process.stdin, process.stdout, process.stderr],
            timeout: timeout
          });
          if (ret.status) {
            util.log(ret);
            continue;
          }

          process.chdir(path.join(tfjsDir, `link-package`));
          // TODO: Remove core and cpu after
          // https://github.com/tensorflow/tfjs/pull/6763 check in
          shellCmd =
              `yarn build-deps-for tfjs-backend-webgpu tfjs-core tfjs-backend-cpu >> ${
                  logFile}`;
          util.log(`[cmd] ${shellCmd}`);
          ret = spawnSync(shell, [shellOption, shellCmd], {
            env: process.env,
            stdio: [process.stdin, process.stdout, process.stderr],
            timeout: timeout
          });
          if (ret.status) {
            util.log(ret);
            continue;
          }

          process.chdir(path.join(tfjsDir, `tfjs-backend-${backend}`));
          shellCmd = `yarn && yarn --cwd .. bazel build tfjs-backend-${
              backend}/src:tests >> ${logFile}`;
          util.log(`[cmd] ${shellCmd}`);
          ret = spawnSync(shell, [shellOption, shellCmd], {
            env: process.env,
            stdio: [process.stdin, process.stdout, process.stderr],
            timeout: timeout
          });
          if (ret.status) {
            util.log(ret);
            continue;
          }

          fs.unlink(
              path.join(tfjsDir, 'tfjs-backend-webgpu', 'src', 'tests.ts'),
              () => {});
          fs.copyFile(
              path.join(
                  tfjsDir, 'dist', 'bin', 'tfjs-backend-webgpu', 'src',
                  'tests.ts'),
              path.join(tfjsDir, 'tfjs-backend-webgpu', 'src', 'tests.ts'),
              () => {});
        }

        let filter = '';
        if ('unit-filter' in util.args) {
          filter = ` --grep ${util.args['unit-filter']}`;
        }
        spawnSync(
            shell,
            [
              shellOption,
              `yarn karma start --browsers=chrome_webgpu${filter} >> ${logFile}`
            ],
            {
              env: process.env,
              stdio: [process.stdin, process.stdout, process.stderr],
              timeout: timeout
            });
      } else {
        spawnSync(shell, [shellOption, `${cmd} >> ${logFile}`], {
          env: process.env,
          stdio: [process.stdin, process.stdout, process.stderr],
          timeout: timeout
        });
      }
    }

    let lines = fs.readFileSync(logFile, 'utf-8').split('\n').filter(Boolean);
    for (let line of lines) {
      if (line.includes('Executed') && line.includes('skipped')) {
        results[backendIndex] = line;
      }
    }
    util.log(results[backendIndex]);
  }

  return results;
}
module.exports = runUnit;
