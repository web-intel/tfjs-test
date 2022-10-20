'use strict';

const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process')
const {chromium} = require('playwright');
const readline = require('readline');

const parseTrace = require('./trace.js');
const util = require('./util.js')

let errorMsg = '';
const errorMsgMaxLength = 200;

function cartesianProduct(arr) {
  return arr.reduce(function(a, b) {
    return a
        .map(function(x) {
          return b.map(function(y) {
            return x.concat([y]);
          })
        })
        .reduce(function(a, b) {
          return a.concat(b)
        }, [])
  }, [[]])
}

function intersect(a, b) {
  if (!Array.isArray(a)) {
    a = [a];
  }
  if (!Array.isArray(b)) {
    b = [b];
  }
  return a.filter(v => b.includes(v));
}

async function startContext(traceFile = undefined) {
  let extraBrowserArgs = '';
  if ('trace' in util.args) {
    extraBrowserArgs = `--trace-startup-file=${traceFile}`;
  }

  if (!util.dryrun) {
    let context = await chromium.launchPersistentContext(util.userDataDir, {
      headless: false,
      executablePath: util['browserPath'],
      viewport: null,
      ignoreHTTPSErrors: true,
      args: util['browserArgs'].split(' ').concat(extraBrowserArgs.split(' ')),
    });
    let page = await context.newPage();
    page.on('console', async msg => {
      for (let i = 0; i < msg.args().length; ++i) {
        const consoleError =
            `[console] ${i}: ${await msg.args()[i].jsonValue()}`;
        util.log(consoleError);
        errorMsg += `${consoleError.substring(0, errorMsgMaxLength)}<br>`;
      }
    });
    page.on('pageerror', (error) => {
      util.hasError = true;
      const pageError = `[pageerror] ${error}`;
      util.log(pageError);
      errorMsg += `${pageError.substring(0, errorMsgMaxLength)}<br>`;
    });

    return [context, page];
  } else {
    return [undefined, undefined];
  }
}

async function closeContext(context) {
  if (!util.dryrun) {
    await context.close();
  }
}

async function runBenchmark(target) {
  // get benchmarks
  let benchmarks = [];
  let benchmarkJson =
      path.join(path.resolve(__dirname), util.args['benchmark-json']);
  let targetConfigs = JSON.parse(fs.readFileSync(benchmarkJson));

  for (let config of targetConfigs) {
    if ('benchmark' in util.args) {
      config['benchmark'] =
          intersect(config['benchmark'], util.args['benchmark'].split(','));
    }
    if (!config['benchmark']) {
      continue;
    }

    if (target === 'conformance') {
      if ('conformance-backend' in util.args) {
        config['backend'] = util.args['conformance-backend'].split(',');
      } else {
        config['backend'] = ['webgpu', 'webgl', 'wasm'];
      }
    } else if (target === 'performance') {
      if ('performance-backend' in util.args) {
        config['backend'] = util.args['performance-backend'].split(',');
      } else if (!('backend' in config)) {
        config['backend'] = util.backends;
      }
    }

    if ('architecture' in config && 'architecture' in util.args) {
      config['architecture'] = intersect(
          config['architecture'], util.args['architecture'].split(','));
      if (!config['architecture']) {
        continue;
      }
    }

    if ('inputSize' in config && 'input-size' in util.args) {
      config['inputSize'] = intersect(
          config['inputSize'], util.args['input-size'].split(',').map(Number));
      if (!config['inputSize']) {
        continue;
      }
    }

    if ('inputType' in config && 'input-type' in util.args) {
      config['inputType'] =
          intersect(config['inputType'], util.args['input-type'].split(','));
      if (!config['inputType']) {
        continue;
      }
    }

    let seqArray = [];
    for (let p of util.parameters) {
      seqArray.push(
          p in config ? (Array.isArray(config[p]) ? config[p] : [config[p]]) :
                        ['']);
    }
    benchmarks = benchmarks.concat(cartesianProduct(seqArray));
  }

  // run benchmarks
  let benchmarksLength = benchmarks.length;
  let previousBenchmarkName = '';
  let results =
      [];  // format: testName, warmup_webgpu, average_webgpu, best_webgpu,
           // warmup_webgl, average_webgl, best_webgl, warmup_wasm,
           // average_wasm, best_wasm, {op: {webgpu, webgl, wasm}}
  let defaultValue = 'NA';
  let backendsLength = util.backends.length;
  let metrics = util.targetMetrics[target];
  if (target === 'performance' && util.runTimes === 0) {
    metrics.length = 1;
  }
  let metricsLength = metrics.length;
  // for errorMsg
  let resultMetricsLength = metricsLength;
  if (target === 'conformance') {
    resultMetricsLength += 1;
  }
  let context;
  let page;

  if (!('new-context' in util.args)) {
    [context, page] = await startContext();
  }

  let task = '';
  if (target === 'conformance') {
    task = 'correctness';
  } else if (target === 'performance') {
    task = 'performance';
  }

  let needWasmStatus = true;
  for (let i = 0; i < benchmarksLength; i++) {
    let benchmark = benchmarks[i];
    let benchmarkName = benchmark.slice(0, -1).join('-');
    let backend = benchmark[benchmark.length - 1];
    let backendIndex = util.backends.indexOf(backend);

    util.log(`[${i + 1}/${benchmarksLength}] ${benchmark}`);

    if ('new-context' in util.args) {
      let traceFile = undefined;
      if ('trace' in util.args) {
        traceFile = `${util.timestampDir}/${
            benchmark.join('-').replace(/ /g, '_')}-trace.json`;
      }
      [context, page] = await startContext(traceFile);
    }

    // prepare result placeholder
    if (benchmarkName != previousBenchmarkName) {
      let placeholder = [benchmarkName].concat(
          Array(backendsLength * resultMetricsLength).fill(defaultValue));
      if (target === 'performance') {
        placeholder = placeholder.concat({});
      }
      results.push(placeholder);
      previousBenchmarkName = benchmarkName;
    }
    let result = results[results.length - 1];

    if (util.dryrun) {
      let metricIndex = 0;
      while (metricIndex < metricsLength) {
        if (target === 'conformance') {
          result[backendIndex * resultMetricsLength + metricIndex + 1] = 'true';
        } else if (target === 'performance') {
          let tmpIndex = backendIndex * resultMetricsLength + metricIndex;
          result[tmpIndex + 1] = tmpIndex + 1;
          let op_time = result[backendsLength * resultMetricsLength + 1];
          for (let i = 0; i < 3; i++) {
            let op = `op${i}`;
            if (!(op in op_time)) {
              op_time[op] = Array(backendsLength).fill(defaultValue);
            }
            op_time[op][backendIndex] = i * backendsLength + backendIndex + 1;
          }
        }
        metricIndex += 1;
      }
    } else {
      // get url
      let url =
          `${util.benchmarkUrl}/e2e/benchmarks/local-benchmark?task=${task}`;
      for (let index = 0; index < util.parameters.length; index++) {
        if (benchmarks[i][index]) {
          url += `&${util.parameters[index]}=${benchmarks[i][index]}`;
        }
      }
      url += `&${util.benchmarkUrlArgs}`;

      await page.goto(url);

      let childIndex;
      if (target === 'performance') {
        // 5th line is Subsequent average
        childIndex = 5;
      } else if (target === 'conformance') {
        // 4th line is conformance result
        childIndex = 4;
      }
      await Promise.any([
        page.waitForSelector(
            `#timings > tbody > tr:nth-child(${childIndex})`,
            {timeout: util.timeout}),
        page.waitForEvent('pageerror', {timeout: util.timeout})
      ]);

      // handle errorMsg
      if (target === 'conformance') {
        results[results.length - 1][(backendIndex + 1) * resultMetricsLength] =
            errorMsg;
      }
      errorMsg = '';

      // pause if needed
      if ('pause-test' in util.args) {
        const readlineInterface = readline.createInterface(
            {input: process.stdin, output: process.stdout});
        await new Promise(resolve => {
          readlineInterface.question('Press Enter to continue...\n', resolve);
        });
      }

      // quit with error
      if (util.hasError) {
        if (target === 'conformance') {
          results[results.length - 1][backendIndex * resultMetricsLength + 1] =
              'false';
        }
        util.hasError = false;
        continue;
      }

      // handle result
      let metricIndex = 0;
      let typeIndex = 1;
      while (metricIndex < metricsLength) {
        let selector = `#timings > tbody > tr:nth-child(${typeIndex})`;
        try {
          await page.waitForSelector(selector, {timeout: util.timeout});
        } catch (error) {
          break;
        }
        const type = await page.$eval(
            selector + ' > td:nth-child(1)', el => el.textContent);
        if (type.includes(metrics[metricIndex])) {
          let value = await page.$eval(
              selector + ' > td:nth-child(2)', el => el.textContent);
          if (target === 'performance') {
            value = parseFloat(value.replace(' ms', ''));
          }
          results[results.length - 1][backendIndex * resultMetricsLength + metricIndex + 1] =
              value;
          metricIndex += 1;
        }
        typeIndex += 1;
      }

      // get breakdown data
      if (target === 'performance' && !('disable-breakdown' in util.args)) {
        try {
          await page.waitForSelector(
              '#kernels > tbody > tr:nth-child(1)', {timeout: util.timeout});
          let row = 1;
          while (true) {
            let op = await page.$eval(
                '#kernels > tbody > tr:nth-child(' + row +
                    ') > td:nth-child(1) > span',
                el => el.title);
            if (op.substr(-4, 4) === '__op') {
              row += 1;
              continue;
            }
            let time = await page.$eval(
                '#kernels > tbody > tr:nth-child(' + row +
                    ') > td:nth-child(2)',
                el => el.textContent);
            let op_time =
                results[results.length - 1][backendsLength * resultMetricsLength + 1];
            if (!(op in op_time)) {
              op_time[op] = Array(backendsLength).fill(defaultValue);
            }
            op_time[op][backendIndex] = parseFloat(time);
            row += 1;
          }
        } catch (error) {
        }
      }

      if (needWasmStatus && target === 'performance' && backend === 'wasm') {
        let status = await page.$eval('#env', el => el.textContent);
        let match = status.match(
            'WASM_HAS_MULTITHREAD_SUPPORT: (.*)  WASM_HAS_SIMD_SUPPORT: (.*)  WEBGL_CPU_FORWARD');
        util.wasmMultithread = match[1];
        util.wasmSIMD = match[2];
        needWasmStatus = false;
      }
    }

    util.log(result);

    if ('new-context' in util.args) {
      await closeContext(context);
    }
  }

  if (!('new-context' in util.args)) {
    await closeContext(context);
  }

  if (target === 'performance') {
    let fileName = `${util.timestamp.substring(0, 8)}.json`;
    let file = path.join(util.timestampDir, fileName);
    fs.writeFileSync(file, JSON.stringify(results));
    if ('upload' in util.args) {
      let result = spawnSync('scp', [
        file,
        `wp@wp-27.sh.intel.com:/workspace/project/work/tfjs/perf/${
            util.platform}/${util['gpuDeviceId']}`
      ]);
      if (result.status !== 0) {
        util.log('[ERROR] Failed to upload report');
      } else {
        util.log('[INFO] Report was successfully uploaded');
      }
    }
  }

  if ('trace' in util.args) {
    await parseTrace();
  }

  return Promise.resolve(results);
}

module.exports = runBenchmark;
