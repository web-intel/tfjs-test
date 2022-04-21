const {createModelFromData, getBaseTimeFromTracing} =
    require('./trace_model.js');
const {createTableHead, createModelTableHead, createTableHeadEnd, createRows} =
    require('./trace_ui.js');
const fs = require('fs');
const fsasync = require('fs').promises;

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

function getModelNames(modelNamesJson) {
  if (modelNamesJson == null) {
    console.error('No Model names!');
    return [];
  }
  const modelNames = [];
  for (const item in modelNamesJson['performance']) {
    modelNames.push(modelNamesJson['performance'][item][0]);
  }
  return modelNames;
}

// Make name simple.
function getName(item) {
  return item.replace(/[\[\]]/g, '').replace(/\//g, '_').replace(/[,\s]/g, '-');
}

function getModelNamesFromLog(logStr) {
  const matchRegex = /\[\d{1,2}\/\d{1,2}\].*webgpu/g;
  const matchResults = logStr.match(matchRegex);

  if (Array.isArray(matchResults)) {
    var results = [];
    for (const item of matchResults) {
      const name = getName(item);
      results.push(name);
    }
    return results;
  } else {
    return getName(matchResults);
  }
}

function getAverageInfoFromLog(logStr) {
  // TODO: This regex takes too long.
  const matchRegex = /.*\[object Object\]/g;
  const matchResults = logStr.match(matchRegex);
  return matchResults;
}

function updateUI(tableName, mergedData, modelName, linkInfo, tracingMode) {
  // Update UI.
  console.log(tableName);
  let modelTable = createModelTableHead(tableName);

  modelTable += createTableHeadEnd();

  let table = '';
  let headdata = Object.keys(mergedData[0]);
  table += createTableHead(headdata, modelName, linkInfo, tracingMode);
  table += createRows(mergedData);
  table += createTableHeadEnd();
  return modelTable + table;
}

async function singleModelSummary(
    tabelName, tracingPredictTime, tracingGpuData, modelName, linkInfo, gpuFreq,
    tracingMode, profilePredictJsonData = null, profileJsonData = null) {
  const mergedData = await createModelFromData(
      tracingPredictTime, tracingGpuData, gpuFreq, true, profilePredictJsonData,
      profileJsonData);
  return updateUI(tabelName, mergedData, modelName, linkInfo, tracingMode);
}

async function modelSummary(
    modelSummarDir, logfileName, results, benchmarkUrlArgs, gpuFreqTracingFile,
    tracingMode) {
  if (logfileName == null) {
    console.error('No log file!');
  }
  console.log('logfileName = ' + logfileName);
  const logStr = await fsasync.readFile(logfileName, 'binary');
  const modelNames =
      results == null ? getModelNamesFromLog(logStr) : getModelNames(results);

  const averageInfos = getAverageInfoFromLog(logStr);
  const predictJsonData =
      getJsonFromString(logStr, 'predictbegin', 'predictend');
  const gpuJsonData = getJsonFromString(logStr, 'gpudatabegin', 'gpudataend');

  const [, , gpuFreq] = gpuFreqTracingFile ?
      await getBaseTimeFromTracing(gpuFreqTracingFile) :
      [0, 0, 19200000];
  console.log('GPU Frequency: ' + gpuFreq);

  let html = `<div>${benchmarkUrlArgs}</div>`;
  const splitLogfileName = logfileName.split('\\');
  const date = splitLogfileName[splitLogfileName.length - 1].split('.')[0];
  const linkInfo = {
    date: date,
    gpufreq: gpuFreq,
    benchmarkUrlArgs: benchmarkUrlArgs
  };

  // predictJsonData.length is the model number.
  const modelCount = predictJsonData.length;
  for (var i = 0; i < modelCount; i++) {
    // Tracing may possible be repeated. predictJsonData[0]['times'].length
    // is the repeat count.
    const repeat = predictJsonData[0]['times'].length;
    const modelName = modelSummarDir + '\\' + modelNames[i];
    const tracingPredictTimes = predictJsonData[i]['times'];
    const gpuJsonDataForModel = gpuJsonData.slice(i * repeat, (i + 1) * repeat);
    html += await singleModelSummary(
        modelNames[i].split('-')[0] + '-' +
            averageInfos[i].replace('[object Object]', ''),
        tracingPredictTimes, gpuJsonDataForModel, modelNames[i], linkInfo,
        gpuFreq, tracingMode);

    for (var j = 0; j < repeat; j++) {
      const name = modelName + '-' + (j + 1);
      fs.writeFileSync(
          name + '.json', JSON.stringify(gpuJsonData[i * repeat + j]));
    }

    fs.writeFileSync(
        modelName + '-predict.json', JSON.stringify(predictJsonData[i]));
  }

  const isRawTimestamp = true;
  const modelSummaryFile = modelSummarDir + '\\' + date + '-raw' +
      isRawTimestamp + '-modelsummary.html';
  console.log(modelSummaryFile);
  fs.writeFileSync(modelSummaryFile, html);
}

module.exports = {
  modelSummary: modelSummary
};
