'use strict';

const { execSync, spawnSync } = require('child_process');
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

    util['clientRepoDate'] = execSync(`cd ${tfjsDir} && git log -1 --format=\"%cd\"`).toString();
    util['clientRepoCommit'] = execSync(`cd ${tfjsDir} && git rev-parse HEAD`).toString();

    let logFile = path.join(util.timestampDir, `${util.timestamp}-unit-${backend}.log`).replace(/\\/g, '/');

    let shell, shellOption;
    if (['machineName'].includes(util.hostname)) {
      shell = 'cmd';
      shellOption = '/c';
    } else {
      shell = 'C:/Program Files/Git/git-bash.exe';
      shellOption = '-c';
    }

    let ret, shellCmd;
    if (backend === 'webgpu') {
      if (!(util.args['unit-skip-build'])) {
        process.chdir(path.join(tfjsDir, `link-package`));
        shellCmd = `yarn build-deps-for tfjs-backend-webgpu > ${logFile}`;
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
        shellCmd = `yarn && yarn --cwd .. bazel build tfjs-backend-${backend}/src:tests > ${logFile}`;
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
      }

      let filter = '';
      if ('unit-filter' in util.args) {
        filter = ` --grep ${util.args['unit-filter']}`;
      }
      spawnSync(
        shell,
        [shellOption, `yarn karma start --browsers=chrome_webgpu${filter} > ${logFile}`], {
        env: process.env,
        stdio: [process.stdin, process.stdout, process.stderr],
        timeout: timeout
      });
    } else {
      spawnSync(shell, [shellOption, `${cmd} > ${logFile}`], {
        env: process.env,
        stdio: [process.stdin, process.stdout, process.stderr],
        timeout: timeout
      });
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
