const {createModelFromData, getBaseTimeFromTrace} = require('./trace_model.js');
const {
  createTableStartWithLink,
  createTableStartWithInfo,
  createTableEnd,
  createTableRows
} = require('./trace_ui.js');
const {
  getJsonFromString,
  getModelNames,
  getModelNamesFromLog,
  getAverageInfoFromLog,
  splitTraceByModel,
} = require('./trace_util.js');
const fs = require('fs');
const fsasync = require('fs').promises;

function updateUI(tableName, mergedData, modelName, linkInfo, traceMode) {
  // Update UI.
  let modelTable = createTableStartWithInfo(tableName);

  modelTable += createTableEnd();

  let table = '';
  let headdata = Object.keys(mergedData[0]);
  table += createTableStartWithLink(headdata, modelName, linkInfo, traceMode);
  table += createTableRows(mergedData);
  table += createTableEnd();
  return modelTable + table;
}

async function singleModelSummary(
    tabelName, tracePredictTime, traceGpuData, modelName, linkInfo, gpuFreq,
    traceMode, profilePredictJsonData = null, profileJsonData = null) {
  const mergedData = await createModelFromData(
      tracePredictTime, traceGpuData, gpuFreq, true, profilePredictJsonData,
      profileJsonData);
  return updateUI(tabelName, mergedData, modelName, linkInfo, traceMode);
}

async function modelSummary(
    modelSummarDir, logfileName, results, benchmarkUrlArgs, gpuFreqTraceFile,
    traceMode) {
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

  const [, , gpuFreq] = gpuFreqTraceFile ?
      await getBaseTimeFromTrace(gpuFreqTraceFile) :
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

  // predictJsonData.length is number of model.
  const modelCount = predictJsonData.length;
  for (var i = 0; i < modelCount; i++) {
    // Trace may possible be repeated. predictJsonData[0]['times'].length
    // is the repeat count.
    const repeat = predictJsonData[0]['times'].length;
    const modelName = modelSummarDir + '\\' + modelNames[i];
    const tracePredictTimes = predictJsonData[i]['times'];
    const gpuJsonDataForModel = gpuJsonData.slice(i * repeat, (i + 1) * repeat);
    html += await singleModelSummary(
        modelNames[i].split('-')[0] + '-' +
            averageInfos[i].replace('[object Object]', ''),
        tracePredictTimes, gpuJsonDataForModel, modelNames[i], linkInfo,
        gpuFreq, traceMode);

    const [traceForModel, traceEnd] = await splitTraceByModel(
        `${modelNames[i]}-webgpu-trace.json`, modelSummarDir);
    if (traceForModel.length != repeat) {
      throw new Error(`${modelNames[i]} length of trace for model(${
          traceForModel.length}) doesn\'t equals GPU length(${repeat})`);
    }
    for (var j = 0; j < repeat; j++) {
      const name = modelName + '-' + (j + 1);
      const dataForGPU = gpuJsonData[i * repeat + j];

      const dataForTrace = {
        'traceEvents': traceForModel[j],
        'metadata': traceEnd
      };
      const dataForModel = {'trace': dataForTrace, 'gpu': dataForGPU};
      fs.writeFileSync(`${name}.json`, JSON.stringify(dataForModel));
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
