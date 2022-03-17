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

  const benchmarkObject = {
    'modelName': 'pose-detection',
    'architecture': 'BlazePose-lite',
    'inputType': 'image',
    'inputSize': '512',
  };

  const modelName = benchmarkObject['modelName'];
  const architecture = benchmarkObject['architecture'];
  const inputType = benchmarkObject['inputType'];
  const inputSize = benchmarkObject['inputSize'];

  const tracingJsonFileName = modelSummarDir + '\\' + modelName + '.json'
  let url = `https://127.0.0.1/tfjs/e2e/benchmarks/local-benchmark/`;
  // url += `?task=performance&benchmark=${
  //     modelName}&backend=webgpu&WEBGL_USE_SHAPES_UNIFORMS=true&CHECK_COMPUTATION_FOR_ERRORS=false&tracing=true&warmup=50&run=50&localBuild=webgl,webgpu,core&WEBGPU_DEFERRED_SUBMIT_BATCH_SIZE=15`;
  // posenet-ResNet50-image-512
  // pose-detection-BlazePose-heavy-image-256
  url +=
      `?task=performance&tracing=true&backend=webgpu&WEBGL_USE_SHAPES_UNIFORMS=true&warmup=50&run=50&localBuild=webgl,webgpu,core`;

  // url +=
  //    `&benchmark=pose-detection&architecture=BlazePose-lite&inputType=image&inputSize=256&`;
  // url +=
  //    `&benchmark=posenet&architecture=ResNet50&inputType=image&inputSize=512&`;
  url += `&benchmark=${modelName}&architecture=${architecture}&inputType=${
      inputType}&inputSize=${inputSize}&`;
  let logFile = modelSummarDir + '\\' + modelName + '_' + architecture + '_' +
      inputType + '_' + inputSize + '.log';
  await openPage(url, tracingJsonFileName, logFile);
  const fsasync = require('fs').promises;
  const logStr = await fsasync.readFile(logFile, 'binary');
  const gpuJsonData = getJsonFromString(logStr, 'gpudatabegin', 'gpudataend');
  console.log((gpuJsonData.length));
  saveJson(gpuJsonData, modelSummarDir, modelName);

  // The basic model info.
  const fileName = modelSummarDir + '\\' + modelName + '_' +
      'info.json';
  fs.writeFileSync(fileName, JSON.stringify(benchmarkObject));
})();
