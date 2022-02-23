const {
  parseGPUTrace, getBaseTimeFromTracing
} = require('./trace_model_util.js');
const {
  createTableHead,
  createModelTableHead,
  createTableHeadEnd,
  createRows
} = require('./trace_ui.js');
const fs = require('fs');
const fsasync = require('fs').promises;
require('dotenv').config();

async function readFileAsync(url, method = 'GET') {
  return await fsasync.readFile(url);
}

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

async function createModelFromData(
    tracingPredictTime, tracingGpuData, gpuFreq, profilePredictJsonData,
    profileJsonData) {
  if (tracingGpuData == null) {
    throw 'Tracing JSON data is NULL!';
  }
  // Model data: Tracing predict.
  const rootDir = 'timeline\\';
  // Ops data.
  const repeat = tracingGpuData.length;
  const repeatTracingDataArray = [];
  const tracingGPULastFirstArray = [];
  const tracingSumArray = [];

  // export IS_RAW_TIMESTAMP=false
  const isRawTimestamp = process.env.IS_RAW_TIMESTAMP != 'false';
  for (let i = 0; i < repeat; i++) {
    const [tracingData, tracingSum, tracingGPULastFirst] =
        await parseGPUTrace(tracingGpuData[i], true, isRawTimestamp, gpuFreq);
    repeatTracingDataArray.push(tracingData);
    tracingSumArray.push(tracingSum);
    tracingGPULastFirstArray.push(tracingGPULastFirst);
  }

  const mergedArray = [];

  const opCount = repeatTracingDataArray[0].length;
  const LENGTH_OF_DIGITALS = 3;
  for (let i = 0; i < opCount; i++) {
    var line = {};
    line['name'] = repeatTracingDataArray[0][i]['name'];
    for (let j = 0; j < repeat; j++) {
      if (repeatTracingDataArray[j][i]['name'] != line['name']) {
        throw 'Name not match! Please check the GPU JSON data!';
      }
      line[`Query${j + 1}`] = Number(repeatTracingDataArray[j][i]['query'])
                                  .toFixed(LENGTH_OF_DIGITALS);
    }
    // TODO: Add Profile support here.
    // line[`Query${repeat}`] = profileJsonData[j];
    mergedArray.push(line);
  }
  {
    var tracingPredictTimeRow = {};
    tracingPredictTimeRow['name'] = 'Tracing mode Predict time';
    var tracingGPULastFirstRow = {};
    tracingGPULastFirstRow['name'] = 'Tracing mode GPU last first';
    var tracingSumRow = {};
    tracingSumRow['name'] = 'Sum of Ops';
    for (let j = 0; j < repeat; j++) {
      tracingPredictTimeRow[`Query${j + 1}`] =
          Number(tracingPredictTime[j]).toFixed(LENGTH_OF_DIGITALS);
      tracingGPULastFirstRow[`Query${j + 1}`] =
          Number(tracingGPULastFirstArray[j]).toFixed(LENGTH_OF_DIGITALS);
      tracingSumRow[`Query${j + 1}`] =
          Number(tracingSumArray[j]).toFixed(LENGTH_OF_DIGITALS);
    }
    mergedArray.unshift(tracingSumRow);
    mergedArray.unshift(tracingGPULastFirstRow);
    mergedArray.unshift(tracingPredictTimeRow);
  }
  console.log('Repeat :' + tracingGpuData.length + ', Ops: ' + opCount);
  return mergedArray;
}

function updateUI(tableName, mergedData, modelName, linkInfo) {
  // Update UI.
  console.log(tableName);
  let modelTable = createModelTableHead(tableName);

  modelTable += createTableHeadEnd();

  let table = '';
  let headdata = Object.keys(mergedData[0]);
  table += createTableHead(headdata, modelName, linkInfo);
  table += createRows(mergedData);
  table += createTableHeadEnd();
  return modelTable + table;
}

async function singleModelSummary(
    tabelName, tracingPredictTime, tracingGpuData, modelName, linkInfo, gpuFreq,
    profilePredictJsonData = null, profileJsonData = null) {
  const mergedData = await createModelFromData(
      tracingPredictTime, tracingGpuData, gpuFreq, profilePredictJsonData,
      profileJsonData);
  return updateUI(tabelName, mergedData, modelName, linkInfo);
}

async function modelSummary(
    logfileName, results, benchmarkUrlArgs, gpuFreqTracingFile) {
  if (logfileName == null) {
    console.error('No log file!');
  }
  console.log("logfileName = "+ logfileName);
  const logStr = await fsasync.readFile(logfileName, 'binary');
  const modelNames =
      results == null ? getModelNamesFromLog(logStr) : getModelNames(results);

  const averageInfos = getAverageInfoFromLog(logStr);
  const predictJsonData =
      getJsonFromString(logStr, 'predictbegin', 'predictend');
  const gpuJsonData = getJsonFromString(logStr, 'gpudatabegin', 'gpudataend');

  const modelSummarDir = logfileName.split('.')[0];
  try {
    if (!fs.existsSync(modelSummarDir)) {
      fs.mkdirSync(modelSummarDir)
    }
  } catch (err) {
    console.error(err)
  }

  const [, , gpuFreq] = gpuFreqTracingFile ?
      await getBaseTimeFromTracing(gpuFreqTracingFile) :
      [0, 0, 19200000];
  console.log('GPU Frequency: ' + gpuFreq);

  let html = `<div>${benchmarkUrlArgs}</div>`;
  const splitLogfileName = logfileName.split('\\');
  const date = splitLogfileName[splitLogfileName.length - 1].split('.')[0];
  const linkInfo = {date: date, gpufreq: gpuFreq};

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
        gpuFreq);

    for (var j = 0; j < repeat; j++) {
      const tracingPredictTime = predictJsonData[i]['times'][j];
      const name = modelName + '-' + (j + 1);
      fs.writeFileSync(
          name + '.json', JSON.stringify(gpuJsonData[i * repeat + j]));
    }

    fs.writeFileSync(
        modelName + '-predict.json', JSON.stringify(predictJsonData[i]));
  }

  const isRawTimestamp = process.env.IS_RAW_TIMESTAMP != 'false';
  const modelSummaryFile = modelSummarDir + '\\' + date + '-raw' +
      isRawTimestamp + '-modelsummary.html';
  console.log(modelSummaryFile);
  fs.writeFileSync(modelSummaryFile, html);
}

module.exports = {
  modelSummary: modelSummary
};
