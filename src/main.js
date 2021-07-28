'use strict';

const fs = require('fs');
const runBenchmark = require('./benchmark.js');
const { spawnSync } = require('child_process');
const config = require('./config.js');
const path = require('path');
const report = require('./report.js')
const runUnit = require('./unit.js');
const util = require('./util.js');
const yargs = require('yargs');

util.args = yargs
  .usage('node $0 [args]')
  .option('architecture', {
    type: 'string',
    describe: 'architecture to run, splitted by comma',
  })
  .option('benchmark', {
    type: 'string',
    describe: 'benchmark to run, splitted by comma',
  })
  .option('browser', {
    type: 'string',
    describe: 'browser path',
  })
  .option('browser-args', {
    type: 'string',
    describe: 'extra browser args splitted by comma',
  })
  .option('conformance-backend', {
    type: 'string',
    describe: 'backend for conformance, splitted by comma',
  })
  .option('disable-breakdown', {
    type: 'boolean',
    describe: 'disable breakdown',
  })
  .option('dryrun', {
    type: 'boolean',
    describe: 'dryrun the test',
  })
  .option('email', {
    alias: 'e',
    type: 'string',
    describe: 'email to',
  })
  .option('input-size', {
    type: 'string',
    describe: 'input size to run, splitted by comma',
  })
  .option('input-type', {
    type: 'string',
    describe: 'input type to run, splitted by comma',
  })
  .option('kill-chrome', {
    type: 'boolean',
    describe: 'kill chrome before testing',
  })
  .option('new-context', {
    type: 'boolean',
    describe: 'start a new context for each test',
  })
  .option('performance-backend', {
    type: 'string',
    describe: 'backend for performance, splitted by comma',
  })
  .option('repeat', {
    type: 'number',
    describe: 'repeat times',
    default: 1,
  })
  .option('run-times', {
    type: 'number',
    describe: 'run times',
  })
  .option('server-info', {
    type: 'boolean',
    describe: 'get server info and display it in report',
  })
  .option('target', {
    type: 'string',
    describe: 'test target, splitted by comma',
  })
  .option('tfjs-dir', {
    type: 'string',
    describe: 'tfjs dir',
  })
  .option('timestamp', {
    type: 'string',
    describe: 'timestamp format, day or second',
    default: 'second',
  })
  .option('upload', {
    type: 'boolean',
    describe: 'upload result to server',
  })
  .option('url', {
    type: 'string',
    describe: 'url to test against',
  })
  .option('url-args', {
    type: 'string',
    describe: 'extra url args',
  })
  .option('warmup-times', {
    type: 'number',
    describe: 'warmup times',
  })
  .example([
    ['node $0 --email <email>', '# send report to <email>'],
    ['node $0 --target performance --benchmark pose-detection --architecture BlazePose-heavy --input-size 256 --input-type tensor --performance-backend webgpu'],
    ['node $0 --browser-args=--no-sandbox,--enable-zero-copy'],
    ['node $0 --target performance --benchmark mobilenet_v2 --performance-backend webgpu --warmup-times 0 --run-times 1 --server-info --new-context'],
    ['node $0 --target performance --benchmark mobilenet_v2 --performance-backend webgpu --warmup-times 0 --run-times 1 --timestamp day'],
  ])
  .help()
  .wrap(120)
  .argv;

function padZero(str) {
  return ('0' + str).slice(-2);
}

function getTimestamp(format) {
  const date = new Date();
  let timestamp = date.getFullYear() + padZero(date.getMonth() + 1) + padZero(date.getDate());
  if (format == 'second') {
    timestamp += padZero(date.getHours()) + padZero(date.getMinutes()) + padZero(date.getSeconds());
  }
  return timestamp;
}

async function main() {
  util.timestamp = getTimestamp(util.args['timestamp']);
  util.logFile = path.join(util.outDir, `${util.timestamp}.log`);
  if (fs.existsSync(util.logFile)) {
    fs.truncateSync(util.logFile, 0);
  }

  if ('kill-chrome' in util.args) {
      spawnSync('cmd', ['/c', 'taskkill /F /IM chrome.exe /T']);
  }

  let browserPath;
  if ('browser' in util.args) {
    browserPath = util.args['browser'];
  } else if (util.platform === 'darwin') {
    browserPath = '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary';
  } else if (util.platform === 'linux') {
    browserPath = '/usr/bin/google-chrome-unstable';
  } else if (util.platform === 'win32') {
    browserPath = `${process.env.LOCALAPPDATA}/Google/Chrome SxS/Application/chrome.exe`;
  }
  util.browserPath = browserPath;

  if ('browser-args' in util.args) {
    util.browserArgs = util.browserArgs.concat(util.args['browser-args'].split(','));
  }

  if ('url-args' in util.args) {
    util.urlArgs = util.args['url-args'];
  }

  if ('dryrun' in util.args) {
    util.dryrun = true;
  } else {
    util.dryrun = false;
  }

  if ('url' in util.args) {
    util.url = util.args['url'];
  }

  await config();

  let targets = [];
  if ('target' in util.args) {
    targets = util.args['target'].split(',');
  } else {
    targets = ['conformance', 'performance', 'unit'];
  }

  if (!fs.existsSync(util.outDir)) {
    fs.mkdirSync(util.outDir, { recursive: true });
  }

  let results = {};
  for (let i = 0; i < util.args['repeat']; i++) {
    if (util.args['repeat'] > 1) {
      util.log(`== Test round ${i + 1}/${util.args['repeat']} ==`);
    }

    for (let target of targets) {
      util.log(`${target} test`);
      if (['conformance', 'performance'].indexOf(target) >= 0) {
        results[target] = await runBenchmark(target);
      } else if (target == 'unit') {
        results[target] = await runUnit();
      }
    }
    await report(results);
  }
}

main();
