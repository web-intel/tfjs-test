const {createModelFromData, getBaseTimeFromTracing} =
    require('./trace_model.js');
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

function updateUI(tableName, mergedData, modelName, linkInfo, tracingMode) {
  // Update UI.
  let modelTable = createTableStartWithInfo(tableName);

  modelTable += createTableEnd();

  let table = '';
  let headdata = Object.keys(mergedData[0]);
  table += createTableStartWithLink(headdata, modelName, linkInfo, tracingMode);
  table += createTableRows(mergedData);
  table += createTableEnd();
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

    const [tracingForModel, traceEnd] = await splitTraceByModel(
        `${modelNames[i]}-webgpu-trace.json`, modelSummarDir);
    if (tracingForModel.length != repeat) {
      throw new Error(`${modelNames[i]} length of tracing for model(${
          tracingForModel.length}) doesn\'t equals GPU length(${repeat})`);
    }
    for (var j = 0; j < repeat; j++) {
      const name = modelName + '-' + (j + 1);
      const dataForGPU = gpuJsonData[i * repeat + j];

      const dataForTracing = {
        'traceEvents': tracingForModel[j],
        'metadata': traceEnd
      };
      const dataForModel = {'trace': dataForTracing, 'gpu': dataForGPU};
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
