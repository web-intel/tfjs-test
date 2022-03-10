'use strict';

const runURL = require('./open_page.js');
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

function saveJson(gpuJsonData, modelSummarDir, modelName) {
  let mergedJson = [];
  for (var i = 0; i < gpuJsonData.length; i++) {
    // Tracing may possible be repeated. predictJsonData[0]['times'].length
    // is the repeat count.

    const fileName = modelSummarDir + '\\' + modelName + '_' + i + '_gpu.json';
    mergedJson = mergedJson.concat(gpuJsonData[i]);
    fs.writeFileSync(fileName, JSON.stringify(gpuJsonData[i]));
  }
  const fileName = modelSummarDir + '\\' + modelName + '_all_gpu.json';
  fs.writeFileSync(fileName, JSON.stringify(mergedJson));
}


(async function() {
  const modelSummarDir = __dirname + '\\' + getTimestamp('second');
  console.log(modelSummarDir);
  try {
    if (!fs.existsSync(modelSummarDir)) {
      fs.mkdirSync(modelSummarDir)
    }
  } catch (err) {
    console.error(err)
  }

  const modelName = 'mobilenet_v2';
  const tracingJsonFileName = modelSummarDir + '\\' + modelName + '.json'
  let url = `https://10.239.47.14:8080/tfjs/e2e/benchmarks/local-benchmark/`;
  url += `?task=performance&benchmark=${
      modelName}&backend=webgpu&WEBGL_USE_SHAPES_UNIFORMS=true&CHECK_COMPUTATION_FOR_ERRORS=false&tracing=true&warmup=1&run=1&localBuild=webgl,webgpu,core`;
  let logFile = modelSummarDir + '\\' + modelName + '.log';
  await runURL(url, tracingJsonFileName, logFile);
  const fsasync = require('fs').promises;
  const logStr = await fsasync.readFile(logFile, 'binary');
  const gpuJsonData = getJsonFromString(logStr, 'gpudatabegin', 'gpudataend');
  console.log((gpuJsonData.length));
  saveJson(gpuJsonData, modelSummarDir, modelName);
})();
