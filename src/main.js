'use strict';

const { exit } = require('yargs');
const benchmark = require('./benchmark.js');
const config = require('./config.js');
const util = require('./util.js');

util.args = require('yargs')
  .usage('node $0 [args]')
  .option('backend', {
    type: 'string',
    describe: 'backend to run, splitted by comma',
  })
  .option('benchmark', {
    type: 'string',
    describe: 'benchmark to run, splitted by comma',
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
  .option('list', {
    type: 'boolean',
    describe: 'list benchmarks',
  })
  .option('repeat', {
    type: 'number',
    describe: 'repeat times',
    default: 1,
  })
  .option('target', {
    type: 'string',
    describe: 'index of benchmarks to run, e.g., 1-2,5,6',
  })
  .option('run-times', {
    type: 'integer',
    describe: 'run times',
  })
  .option('url', {
    type: 'string',
    describe: 'url to test against',
  })
  .option('warmup-times', {
    type: 'integer',
    describe: 'warmup times',
  })
  .example([
    ['node $0 --email <email>', 'send report to <email>'],
  ])
  .help()
  .argv;

function cartesianProduct(arr) {
  return arr.reduce(function (a, b) {
    return a.map(function (x) {
      return b.map(function (y) {
        return x.concat([y]);
      })
    }).reduce(function (a, b) { return a.concat(b) }, [])
  }, [[]])
}

function intersect(a, b) {
  return a.filter(v => b.includes(v));
}

function parseArgs() {
  let validBenchmarkNames = [];
  if ('benchmark' in util.args) {
    validBenchmarkNames = util.args['benchmark'].split(',');
  } else {
    for (let benchmarkJson of util.benchmarksJson) {
      validBenchmarkNames.push(benchmarkJson['benchmark']);
    }
  }

  let benchmarks = [];
  for (let benchmarkJson of util.benchmarksJson) {
    let benchmarkName = benchmarkJson['benchmark'];
    if (!validBenchmarkNames.includes(benchmarkName)) {
      continue;
    }
    if ('backend' in util.args) {
      benchmarkJson['backend'] = intersect(benchmarkJson['backend'], util.args['backend'].split(','));
    }
    let seqArray = [];
    for (let p of util.parameters) {
      seqArray.push(p in benchmarkJson ? (Array.isArray(benchmarkJson[p]) ? benchmarkJson[p] : [benchmarkJson[p]]) : ['']);
    }
    benchmarks = benchmarks.concat(cartesianProduct(seqArray));
  }
  util.benchmarks = benchmarks;

  if ('list' in util.args) {
    for (let index in util.benchmarks) {
      console.log(`${index}: ${util.benchmarks[index]}`);
    }
    exit(0);
  }

  if ('dryrun' in util.args) {
    util.dryrun = true;
  } else {
    util.dryrun = false;
  }

  if ('run-times' in util.args) {
    util.runTimes = parseInt(util.args['run-times']);
  } else {
    util.runTimes = 50;
  }

  if ('warmup-times' in util.args) {
    util.warmupTimes = parseInt(util.args['warmup-times']);
  } else {
    util.warmupTimes = 50;
  }

  if ('url' in util.args) {
    util.url = util.args['url'];
  } else {
    util.url = 'http://wp-27.sh.intel.com/workspace/project/tfjswebgpu/tfjs/e2e/benchmarks/local-benchmark/';
  }
}

async function main() {
  parseArgs();
  await config();

  for (let i = 0; i < util.args['repeat']; i++) {
    if (util.args['repeat'] > 1) {
      console.log(`== Test round ${i + 1}/${util.args['repeat']} ==`);
    }
    await benchmark.runBenchmarks();
  }
}

main();
