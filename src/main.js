'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const yargs = require('yargs');

const runBenchmark = require('./benchmark.js');
const config = require('./config.js');
const runDemo = require('./demo.js');
const report = require('./report.js');
const parseTrace = require('./trace.js');
const runUnit = require('./unit.js');
const util = require('./util.js');
const modelUtil = require('./trace_model.js');
require('dotenv').config();


util.args = yargs
  .usage('node $0 [args]')
  .strict()
  .option('architecture', {
    type: 'string',
    describe: 'architecture to run, split by comma',
  })
  .option('benchmark', {
    type: 'string',
    describe: 'benchmark to run, split by comma',
  })
  .option('benchmark-url', {
    type: 'string',
    describe: 'benchmark url to test against',
  })
  .option('benchmark-url-args', {
    type: 'string',
    describe: 'extra benchmark url args',
  })
  .option('browser', {
    type: 'string',
    describe: 'browser specific path, can be chrome_canary, chrome_dev, chrome_beta or chrome_stable',
    default: 'chrome_canary',
  })
  .option('browser-args', {
    type: 'string',
    describe: 'extra browser args',
  })
  .option('conformance-backend', {
    type: 'string',
    describe: 'backend for conformance, split by comma',
  })
  .option('demo', {
    type: 'string',
    describe: 'demo, split by comma',
  })
  .option('demo-backend', {
    type: 'string',
    describe: 'backend for demo, split by comma',
  })
  .option('demo-type', {
    type: 'string',
    describe: 'type for demo, split by comma, can be camera and video',
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
    describe: 'input size to run, split by comma',
  })
  .option('input-type', {
    type: 'string',
    describe: 'input type to run, split by comma',
  })
  .option('kill-chrome', {
    type: 'boolean',
    describe: 'kill chrome before testing',
  })
  .option('local-build', {
    type: 'string',
    describe: 'local build packages instead of npm ones',
    default: 'webgl,webgpu,core',
  })
  .option('new-context', {
    type: 'boolean',
    describe: 'start a new context for each test',
  })
  .option('quit-pageerror', {
    type: 'boolean',
    describe: 'quit right after pageerror',
  })
  .option('pause-test', {
    type: 'boolean',
    describe: 'pause after each performance test',
  })
  .option('performance-backend', {
    type: 'string',
    describe: 'backend for performance, split by comma',
  })
  .option('profile-times', {
    type: 'number',
    describe: 'profile times',
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
    describe: 'test target, split by comma, can be conformance, performance, unit, trace, demo and so on.',
    default: 'conformance,performance,unit,demo',
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
  .option('trace-category', {
    type: 'string',
    describe: 'Chrome trace categories, split by comma',
  })
  .option('trace-file', {
    type: 'string',
    describe: 'trace file',
  })
  .option('tracing', {
    type: 'boolean',
    describe: 'Enable tracing',
  })
  .option('unit-backend', {
    type: 'string',
    describe: 'backend for unit, split by comma',
  })
  .option('unit-filter', {
    type: 'string',
    describe: 'filter for unit test',
  })
  .option('unit-skip-build', {
    type: 'boolean',
    describe: 'skip build for unit test',
  })
  .option('upload', {
    type: 'boolean',
    describe: 'upload result to server',
  })
  .option('use-dxc', {
    type: 'boolean',
    describe: 'use dxc instead of fxc',
  })
  .option('warmup-times', {
    type: 'number',
    describe: 'warmup times',
  })
  .example([
    ['node $0 --email <email>', '# send report to <email>'],
    ['node $0 --target performance --benchmark-url http://127.0.0.1/workspace/project/tfjswebgpu/tfjs/e2e/benchmarks/local-benchmark'],
    ['node $0 --target performance --benchmark pose-detection --architecture BlazePose-heavy --input-size 256 --input-type tensor --performance-backend webgpu'],
    ['node $0 --browser-args="--enable-dawn-features=disable_workgroup_init --no-sandbox --enable-zero-copy"'],
    ['node $0 --target performance --benchmark mobilenet_v2 --performance-backend webgpu --warmup-times 0 --run-times 1 --server-info --new-context'],
    ['node $0 --target performance --benchmark mobilenet_v2 --performance-backend webgpu --warmup-times 0 --run-times 1 --timestamp day'],
    ['node $0 --target performance --benchmark mobilenet_v2 --performance-backend webgpu --warmup-times 0 --run-times 1 --trace-category disabled-by-default-gpu.dawn'],
    ['node $0 --target unit --unit-filter=add --unit-skip-build'],
  ])
  .help()
  .wrap(180)
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
  if ('kill-chrome' in util.args) {
    spawnSync('cmd', ['/c', 'taskkill /F /IM chrome.exe /T']);
  }

  let browserPath;
  let userDataDir;
  if (util.args['browser'] == 'chrome_canary') {
    if (util.platform === 'darwin') {
      browserPath = '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary';
      userDataDir = `/Users/${os.userInfo().username}/Library/Application Support/Google/Chrome Canary`;
    } else if (util.platform === 'linux') { // There is no Canary channel for Linux, use dev channel instead
      browserPath = '/usr/bin/google-chrome-unstable';
      userDataDir = `/home/${os.userInfo().username}/.config/google-chrome-unstable`;
    } else if (util.platform === 'win32') {
      browserPath = `${process.env.LOCALAPPDATA}/Google/Chrome SxS/Application/chrome.exe`;
      userDataDir = `${process.env.LOCALAPPDATA}/Google/Chrome SxS/User Data`;
    }
  } else if (util.args['browser'] == 'chrome_dev') {
    if (util.platform === 'darwin') {
      browserPath = '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Dev';
      userDataDir = `/Users/${os.userInfo().username}/Library/Application Support/Google/Chrome Dev`;
    } else if (util.platform === 'linux') {
      browserPath = '/usr/bin/google-chrome-unstable';
      userDataDir = `/home/${os.userInfo().username}/.config/google-chrome-unstable`;
    } else if (util.platform === 'win32') {
      browserPath = `${process.env.PROGRAMFILES}/Google/Chrome Dev/Application/chrome.exe`;
      userDataDir = `${process.env.LOCALAPPDATA}/Google/Chrome Dev/User Data`;
    }
  } else if (util.args['browser'] == 'chrome_beta') {
    if (util.platform === 'darwin') {
      browserPath = '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Beta';
      userDataDir = `/Users/${os.userInfo().username}/Library/Application Support/Google/Chrome Beta`;
    } else if (util.platform === 'linux') {
      browserPath = '/usr/bin/google-chrome-beta';
      userDataDir = `/home/${os.userInfo().username}/.config/google-chrome-beta`;
    } else if (util.platform === 'win32') {
      browserPath = `${process.env.PROGRAMFILES}/Google/Chrome Beta/Application/chrome.exe`;
      userDataDir = `${process.env.LOCALAPPDATA}/Google/Chrome Beta/User Data`;
    }
  } else if (util.args['browser'] == 'chrome_stable') {
    if (util.platform === 'darwin') {
      browserPath = '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Stable';
      userDataDir = `/Users/${os.userInfo().username}/Library/Application Support/Google/Chrome Stable`;
    } else if (util.platform === 'linux') {
      browserPath = '/usr/bin/google-chrome-stable';
      userDataDir = `/home/${os.userInfo().username}/.config/google-chrome-stable`;
    } else if (util.platform === 'win32') {
      browserPath = `${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`;
      userDataDir = `${process.env.LOCALAPPDATA}/Google/Chrome/User Data`;
    }
  } else {
    browserPath = util.args['browser'];
    userDataDir = `${util.outDir}/user-data-dir`;
  }

  util.browserPath = browserPath;
  console.log(`Use browser at ${browserPath}`);
  util.userDataDir = userDataDir;
  console.log(`Use user-data-dir at ${userDataDir}`);

  if ('browser-args' in util.args) {
    util.browserArgs = `${util.browserArgs} ${util.args['browser-args']}`;
  }
  if ('use-dxc' in util.args) {
    util.browserArgs += ' --enable-dawn-features=use_dxc';
  }

  let warmupTimes;
  if ('warmup-times' in util.args) {
    warmupTimes = parseInt(util.args['warmup-times']);
  } else {
    warmupTimes = 50;
  }
  util.warmupTimes = warmupTimes;

  let runTimes;
  if ('run-times' in util.args) {
    runTimes = parseInt(util.args['run-times']);
  } else {
    runTimes = 50;
  }
  util.runTimes = runTimes;

  let profileTimes;
  if ('profile-times' in util.args) {
    profileTimes = parseInt(util.args['profile-times']);
  } else {
    profileTimes = 50;
  }
  util.profileTimes = profileTimes;

  util.benchmarkUrlArgs += `&warmup=${warmupTimes}&run=${runTimes}&profile=${profileTimes}&localBuild=${util.args['local-build']}`;

  if ('trace-category' in util.args) {
    util.args['new-context'] = true;
  }

  if ('benchmark-url-args' in util.args) {
    util.benchmarkUrlArgs += `&${util.args['benchmark-url-args']}`;
  }

  if ('dryrun' in util.args) {
    util.dryrun = true;
  } else {
    util.dryrun = false;
  }

  if ('benchmark-url' in util.args) {
    util.benchmarkUrl = util.args['benchmark-url'];
  }

  let targets = util.args['target'].split(',');

  if (!fs.existsSync(util.outDir)) {
    fs.mkdirSync(util.outDir, { recursive: true });
  }

  if (targets.indexOf('conformance') >= 0 || targets.indexOf('performance') >= 0 || targets.indexOf('unit') >= 0) {
    await config();
  }

  let gpuFreqFile = null;
  const tracing = util.args['tracing'];
  if (tracing == true) {
    console.log("Tracing is ON");
    util.gpuFreqBenchmarkUrlArgs = `&warmup=1&run=1&`.concat(util.benchmarkUrlArgs);
    util.benchmarkUrlArgs +=`&tracing=${tracing}`;
    gpuFreqFile = await getGPUFreq();
  }

  let results = {};
  util.duration = '';
  let startTime;
  for (let i = 0; i < util.args['repeat']; i++) {
    util.timestamp = getTimestamp(util.args['timestamp']);
    util.logFile = path.join(util.outDir, `${util.timestamp}.log`);
    if (fs.existsSync(util.logFile)) {
      fs.truncateSync(util.logFile, 0);
    }

    if (util.args['repeat'] > 1) {
      util.log(`== Test round ${i + 1}/${util.args['repeat']} ==`);
    }

    for (let target of targets) {
      startTime = new Date();
      util.log(`=${target}=`);
      if (['conformance', 'performance'].indexOf(target) >= 0) {
        if (!(target == 'performance' && util.warmupTimes == 0 && util.runTimes == 0)) {
          results[target] = await runBenchmark(target);
        }
      } else if (target == 'demo') {
        results[target] = await runDemo();
      }
      else if (target == 'unit') {
        results[target] = await runUnit();
      } else if (target == 'trace') {
        await parseTrace();
      }
      util.duration += `${target}: ${(new Date() - startTime) / 1000} `;
    }

    if (tracing == true) {
      await modelUtil.modelSummary(util.logFile, results, util.benchmarkUrlArgs, gpuFreqFile);
    }
    await report(results);
  }
}

async function getGPUFreq() {
  util.timestamp = getTimestamp(util.args['timestamp']);
  util.logFile = path.join(util.outDir, `${util.timestamp}.log`);
  const gpufreqFile = path.join(util.outDir, `gpufreq-${util.timestamp}.json`);
  const target = 'performance';
  const fsasync = require('fs').promises;
  const benchmarkFileForGpufreq = 'benchmark_getinfo.json';
  let benchmarkFileForGpufreqFullPath =
      path.join(path.resolve(__dirname), benchmarkFileForGpufreq);
  const benchmarkStrForGpufreq =
      JSON.parse(await fsasync.readFile(benchmarkFileForGpufreqFullPath));

  const isRawTimestamp = process.env.IS_RAW_TIMESTAMP != 'false';
  const rawTimestampFlag =
      isRawTimestamp ? 'disable_timestamp_query_conversion' : '';

  // benchamark flags(default):
  // --enable-unsafe-webgpu --disable-dawn-features=disallow_unsafe_apis
  // --enable-features=WebAssemblySimd,WebAssemblyThreads --start-maximized gpu
  // freq flags: benchamark flags +
  // --enable-tracing=disabled-by-default-gpu.dawn
  // --trace-startup-file=${gpufreqFile} --trace-startup-format=json tracing
  // flags(GPU only. CPU tracing in webtest is not supported): benchamark flags
  // +
  // --enable-dawn-features=record_detailed_timing_in_trace_events${rawTimestampFlag}
  // To make it simple, currently benchamark flags is the same as tracing flags.
  const lastBrowserArgs = util['browserArgs'];
  util['browserArgs'] +=
      ` --enable-dawn-features=record_detailed_timing_in_trace_events --enable-tracing=disabled-by-default-gpu.dawn --trace-startup-file=${
          gpufreqFile} --trace-startup-format=json`;

  console.log(
      'util[\'browserArgs\'] for get GPU freqency: ' + util['browserArgs']);
  const lastBenchmarkUrlArgs = util.benchmarkUrlArgs;
  util.benchmarkUrlArgs = util.gpuFreqBenchmarkUrlArgs;

  const lastArgs = util.args['benchmark'];
  util.args['benchmark'] = benchmarkStrForGpufreq[0]['benchmark'];
  console.log(benchmarkStrForGpufreq[0]['benchmark']);
  console.log(benchmarkFileForGpufreqFullPath);

  const startTime = new Date();
  util.log(`=Get GPU Frequency=` + util.args['benchmark']);
  await runBenchmark(target, benchmarkFileForGpufreq);

  // Restore this for real benchmark.
  util['browserArgs'] = lastBrowserArgs +
      ` --enable-dawn-features=record_detailed_timing_in_trace_events,${
                            rawTimestampFlag}`;
  console.log('util[\'browserArgs\'] for benchmark: ' + util['browserArgs']);
  if (lastArgs == null) {
    delete util.args['benchmark'];
  } else {
    util.args['benchmark'] = lastArgs;
  }
  util['targetMetrics']['performance'].push('Tracing average');
  util.benchmarkUrlArgs = lastBenchmarkUrlArgs;
  return gpufreqFile;
}

main();
