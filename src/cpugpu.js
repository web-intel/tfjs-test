'use strict';

const openPage = require('./open_page.js');
const fs = require('fs');

function getJsonFromString(str, start, end) {
  const regStr = String.raw`${start}.*?${end}`;
  var matchRegex = new RegExp(regStr, 'g');
  const matchResults = str.match(matchRegex);
  if (Array.isArray(matchResults)) {
    var results = [];
    for (const item of matchResults) {
      results.push(JSON.parse(item.replace(start, '').replace(end, '')));
    }
    return results;
  } else {
    return new Array(
        JSON.parse(matchResults.replace(start, '').replace(end, '')));
  }
}

// TODO: this is copied from main.js. Should move to utils.
function padZero(str) {
  return ('0' + str).slice(-2);
}

function getTimestamp(format) {
  const date = new Date();
  let timestamp = date.getFullYear() + padZero(date.getMonth() + 1) +
      padZero(date.getDate());
  if (format == 'second') {
    timestamp += padZero(date.getHours()) + padZero(date.getMinutes()) +
        padZero(date.getSeconds());
  }
  return timestamp;
}

function saveJson(gpuJsonData, modelSummaryDir, modelName) {
  let mergedJson = [];
  for (var i = 0; i < gpuJsonData.length; i++) {
    // Tracing may possible be repeated. predictJsonData[0]['times'].length
    // is the repeat count.

    const fileName =
        modelSummaryDir + '\\' + modelName + '_' + (i + 1) + '_gpu.json';
    mergedJson = mergedJson.concat(gpuJsonData[i]);
    fs.writeFileSync(fileName, JSON.stringify(gpuJsonData[i]));
  }
  const fileName = modelSummaryDir + '\\' + modelName + '_all_gpu.json';
  fs.writeFileSync(fileName, JSON.stringify(mergedJson));
}

async function runSingleBenchmark(benchmarkObject, batch = 15) {
  const timestamp = getTimestamp('second');
  const modelSummaryDir = __dirname + '\\' + timestamp;
  console.log(modelSummaryDir);
  try {
    if (!fs.existsSync(modelSummaryDir)) {
      fs.mkdirSync(modelSummaryDir)
    }
  } catch (err) {
    console.error(err)
  }
  const modelName = benchmarkObject['modelName'];
  const architecture = benchmarkObject['architecture'];
  const inputType = benchmarkObject['inputType'];
  const inputSize = benchmarkObject['inputSize'];
  const backend = benchmarkObject['backend'];

  const tracingJsonFileName = modelSummaryDir + '\\' + modelName + '.json';
  const URL = process.argv[2];
  let url = `https://${URL}/tfjs/e2e/benchmarks/local-benchmark/`;
  url += `?task=performance&tracing=true&backend=${
      backend}&WEBGL_USE_SHAPES_UNIFORMS=true&warmup=50&run=50&localBuild=webgl,webgpu,core&WEBGPU_DEFERRED_SUBMIT_BATCH_SIZE=${
      batch}`;

  let logFile = modelSummaryDir + '\\' + modelName;
  url += `&benchmark=${modelName}&`;
  if (architecture) {
    url += `&architecture=${architecture}&`;
    logFile += '_' + architecture;
  }
  if (inputType) {
    url += `&inputType=${inputType}&`;
    logFile += '_' + inputType;
  }
  if (inputSize) {
    url += `&inputSize=${inputSize}&`;
    logFile += '_' + inputSize;
  }
  logFile += '.log';

  console.log(url + ',' + logFile);
  await openPage(url, tracingJsonFileName, logFile);
  const fsasync = require('fs').promises;
  const logStr = await fsasync.readFile(logFile, 'binary');
  const gpuJsonData = getJsonFromString(logStr, 'gpudatabegin', 'gpudataend');
  console.log((gpuJsonData.length));
  saveJson(gpuJsonData, modelSummaryDir, modelName);

  // The basic model info.
  const fileName = modelSummaryDir + '\\' + modelName + '_' +
      'info.json';
  fs.writeFileSync(fileName, JSON.stringify(benchmarkObject));

  // Below is used to generate the link.
  // timeline.html?&date=20220318095538&gpufreq=%2012000048&&cpufile=blazeface&gpufile=blazeface_all_gpu&&tooltip=1&xoffset=3300
  const {getBaseTimeFromTracing} = require('./trace_model_util.js');
  const [, , gpuFreq] = tracingJsonFileName ?
      await getBaseTimeFromTracing(tracingJsonFileName) :
      [0, 0, 19200000];
  let link = `<a href="../timeline.html?&date=${timestamp}&gpufreq=${
      gpuFreq}&cpufile=${modelName}&infofile=${modelName}&gpufile=${
      modelName}_all_gpu&&tooltip=1&xoffset=0">${modelName}</a><br>`;
  return link;
}

(async function() {
  let benchmarkObjects = [
    {
      'modelName': 'blazeface',
      'backend': 'webgpu',
    },
    {
      'modelName': 'posenet',
      'architecture': 'ResNet50',
      'inputType': 'image',
      'inputSize': '512',
      'backend': 'webgpu',
    },
    {
      'modelName': 'pose-detection',
      'architecture': 'BlazePose-lite',
      'inputType': 'image',
      'inputSize': '256',
      'backend': 'webgpu',
    }
  ];

  let html = `<div>`;
  for (let i = 0; i < benchmarkObjects.length; i++) {
    const link = await runSingleBenchmark(benchmarkObjects[i]);
    html += link;
  }
  html += `</div>`;
  const timestamp = getTimestamp('second');
  const modelSummaryHtmlFile =
      __dirname + '\\' + timestamp + '_cpugpusummary.html';
  fs.writeFileSync(modelSummaryHtmlFile, html);
})();
