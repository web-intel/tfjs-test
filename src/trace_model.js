function getAdjustTime(rawTime, isRawTimestamp, gpuFreq) {
  let adjustTime = 0;
  if (isRawTimestamp) {
    // raw timestamp is ticks.
    adjustTime = rawTime * 1000 / gpuFreq;
  } else {
    // converted GPU timestamp is ns. Converted to ms.
    adjustTime = rawTime / 1000000;
  }
  return adjustTime;
}

// Data. For Profile data, lastFirst is false. For tracing data, lastFirst i
// strue.
async function parseGPUTrace(
    jsonData, lastFirst = true, isRawTimestamp = true, gpuFreq) {
  if (isRawTimestamp && gpuFreq == 0) {
    throw 'isRawTimeStamp is true but gpuFreq is 0';
  }
  const traces = [];
  let sum = 0;

  let tracingGPULastFirst = 0;
  if (lastFirst) {
    const tracingGPUStart = jsonData[0]['query'][0];
    const tracingGPUEnd = jsonData[jsonData.length - 1]['query'][1];

    tracingGPULastFirst = getAdjustTime(
        (tracingGPUEnd - tracingGPUStart), isRawTimestamp, gpuFreq);
  }

  for (let i = 0; i < jsonData.length; i++) {
    let queryData = jsonData[i]['query'];

    if (queryData.length == 2) {
      queryData =
          getAdjustTime((queryData[1] - queryData[0]), isRawTimestamp, gpuFreq);
    } else if (queryData.length == 1) {
      // For profile data, alreay in ms.
      queryData = queryData[0];
    } else {
      console.error(
          'Query data length ' + queryData.length + ' is not supported!');
    }
    sum += Number(queryData);
    traces.push({name: jsonData[i]['name'], query: queryData});
  }
  sum = Number(sum).toFixed(3);
  return [traces, sum, tracingGPULastFirst];
}

// TODO: merge this with timeline\timeline_trace.js
function getBaseTime(rawTime, cpuTracingBase) {
  const splitRawTime = rawTime.split(',');
  const cpuBase = splitRawTime[2].split(':')[1];
  const cpuFreq = splitRawTime[4].split(':')[1];
  const gpuBase = splitRawTime[3].split(':')[1];
  const gpuFreq = splitRawTime[5].split(':')[1];
  // Second(s) to microsecond(us).
  const S2US = 1000000;
  if (cpuTracingBase != 0) {
    // If this is used for CPU-GPU time: cpuTracingBase may possibly happens
    // before cpuBase. We use cpuTracingBase as real base, so the diff should be
    // applied to gpuBase.
    const diff = cpuTracingBase - cpuBase * S2US / cpuFreq;
    return [cpuTracingBase, gpuBase * S2US / gpuFreq + diff, gpuFreq];
  } else {
    // For GPU only, cpuBase is not used.
    return [cpuBase * S2US / cpuFreq, gpuBase * S2US / gpuFreq, gpuFreq];
  }
}

// TODO: merge this with timeline\timeline_trace.js
/**
 * @param traceFile The tracing file.
 * @returns [cpuBase, gpuBase, gpuFreq].
 */
const eventNames = null;
async function getBaseTimeFromTracing(traceFile = '') {
  if (traceFile == null) {
    console.warn('No tracing file!');
    return [0, 0, 0];
  }

  const fsasync = require('fs').promises;
  let jsonData = JSON.parse(await fsasync.readFile(traceFile));
  return getBaseTimeFromTracingJson(jsonData);
}

// For timeline(html): cpuTracingBase is used to get first non-0 time.
// For node: cpuTracingBase is not used. This is used to get freq.
// Edit this function under src\timeline\timeline_trace.js.
function getBaseTimeFromTracingJson(jsonData) {
  if (jsonData == null) {
    console.warn('No tracing file!');
    return [0, 0, 0];
  }

  const baseTimeName =
      'd3d12::CommandRecordingContext::ExecuteCommandList Detailed Timing';
  let baseTime = '';
  let cpuTracingBase = 0;

  for (let event of jsonData['traceEvents']) {
    let eventName = event['name'];
    if (eventNames && eventNames.indexOf(eventName) >= 0) {
      if (cpuTracingBase == 0) {
        // This is the first none 0 ts in tracing.
        cpuTracingBase = event['ts'];
      }
    }

    // This is the first Detailed Timing in tracing.
    if (eventName == baseTimeName) {
      if (baseTime == '') {
        baseTime = event.args['Timing'];
      }
    }
    if (baseTime != '') {
      return getBaseTime(baseTime, 0);
    }
  }
  if (baseTime == '') {
    console.warn('Tracing has no Detailed Timing!');
  }
  return [0, 0, 0];
}

async function createModelFromData(
    tracingPredictTime, tracingGpuData, gpuFreq, isRawTimestamp = true,
    profilePredictJsonData, profileJsonData) {
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


module.exports = {
  parseGPUTrace: parseGPUTrace,
  getBaseTimeFromTracing: getBaseTimeFromTracing,
  getBaseTimeFromTracingJson: getBaseTimeFromTracingJson,
  createModelFromData: createModelFromData,
};
