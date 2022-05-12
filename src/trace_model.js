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

// For profile data, lastFirst is false. For trace data, lastFirst is true.
async function parseGPUTrace(jsonData, lastFirst, isRawTimestamp, gpuFreq) {
  if (isRawTimestamp && gpuFreq == 0) {
    throw 'isRawTimeStamp is true but gpuFreq is 0';
  }
  const traces = [];
  let sum = 0;

  let traceGPULastFirst = 0;
  if (lastFirst) {
    const traceGPUStart = jsonData[0]['query'][0];
    const traceGPUEnd = jsonData[jsonData.length - 1]['query'][1];

    traceGPULastFirst =
        getAdjustTime((traceGPUEnd - traceGPUStart), isRawTimestamp, gpuFreq);
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
  return [traces, sum, traceGPULastFirst];
}

// TODO: merge this with timeline\timeline_trace.js
function getBaseTime(rawTime, cpuTraceBase) {
  const splitRawTime = rawTime.split(',');
  const cpuBase = splitRawTime[2].split(':')[1];
  const cpuFreq = splitRawTime[4].split(':')[1];
  const gpuBase = splitRawTime[3].split(':')[1];
  const gpuFreq = splitRawTime[5].split(':')[1];
  // Second(s) to microsecond(us).
  const S2US = 1000000;
  if (cpuTraceBase != 0) {
    // If this is used for CPU-GPU time: cpuTraceBase may possibly happens
    // before cpuBase. We use cpuTraceBase as real base, so the diff should be
    // applied to gpuBase.
    const diff = cpuTraceBase - cpuBase * S2US / cpuFreq;
    return [cpuTraceBase, gpuBase * S2US / gpuFreq + diff, gpuFreq];
  } else {
    // For GPU only, cpuBase is not used.
    return [cpuBase * S2US / cpuFreq, gpuBase * S2US / gpuFreq, gpuFreq];
  }
}

// TODO: merge this with timeline\timeline_trace.js
/**
 * @param traceFile The trace file.
 * @returns [cpuBase, gpuBase, gpuFreq].
 */
const eventNames = null;
async function getBaseTimeFromTrace(traceFile = '') {
  if (traceFile == null) {
    console.warn('No trace file!');
    return [0, 0, 0];
  }

  const fsasync = require('fs').promises;
  let jsonData = JSON.parse(await fsasync.readFile(traceFile));
  return getBaseTimeFromTraceJson(jsonData);
}

// For timeline(html): cpuTraceBase is used to get first non-0 time.
// For node: cpuTraceBase is not used. This is used to get freq.
// Edit this function under src\timeline\timeline_trace.js.
function getBaseTimeFromTraceJson(jsonData) {
  if (jsonData == null) {
    console.warn('No trace file!');
    return [0, 0, 0];
  }

  const baseTimeName =
      'd3d12::CommandRecordingContext::ExecuteCommandList Detailed Timing';
  let baseTime = '';
  let cpuTraceBase = 0;

  for (let event of jsonData['traceEvents']) {
    let eventName = event['name'];
    if (eventNames && eventNames.indexOf(eventName) >= 0) {
      if (cpuTraceBase == 0) {
        // This is the first none 0 ts in trace.
        cpuTraceBase = event['ts'];
      }
    }

    // This is the first Detailed Timing in trace.
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
    console.warn('Trace has no Detailed Timing!');
  }
  return [0, 0, 0];
}

async function createModelFromData(
    tracePredictTime, traceGpuData, gpuFreq, isRawTimestamp = true) {
  if (traceGpuData == null) {
    throw 'Trace JSON data is NULL!';
  }
  // Model data: Trace predict.
  const rootDir = 'timeline\\';
  // Op data.
  const repeat = traceGpuData.length;
  const repeatTraceDataArray = [];
  const traceGPULastFirstArray = [];
  const traceSumArray = [];

  for (let i = 0; i < repeat; i++) {
    const [traceData, traceSum, traceGPULastFirst] =
        await parseGPUTrace(traceGpuData[i], true, isRawTimestamp, gpuFreq);
    repeatTraceDataArray.push(traceData);
    traceSumArray.push(traceSum);
    traceGPULastFirstArray.push(traceGPULastFirst);
  }

  const mergedArray = [];

  const opCount = repeatTraceDataArray[0].length;
  const LENGTH_OF_DIGITALS = 3;
  for (let i = 0; i < opCount; i++) {
    var line = {};
    line['name'] = repeatTraceDataArray[0][i]['name'];
    for (let j = 0; j < repeat; j++) {
      if (repeatTraceDataArray[j][i]['name'] != line['name']) {
        throw 'Name not match! Please check the GPU JSON data!';
      }
      line[`Query${j + 1}`] = Number(repeatTraceDataArray[j][i]['query'])
                                  .toFixed(LENGTH_OF_DIGITALS);
    }
    mergedArray.push(line);
  }
  {
    var tracePredictTimeRow = {};
    tracePredictTimeRow['name'] = 'Trace mode Predict time';
    var traceGPULastFirstRow = {};
    traceGPULastFirstRow['name'] = 'Trace mode GPU last first';
    var traceSumRow = {};
    traceSumRow['name'] = 'Sum of Ops';
    for (let j = 0; j < repeat; j++) {
      tracePredictTimeRow[`Query${j + 1}`] =
          Number(tracePredictTime[j]).toFixed(LENGTH_OF_DIGITALS);
      traceGPULastFirstRow[`Query${j + 1}`] =
          Number(traceGPULastFirstArray[j]).toFixed(LENGTH_OF_DIGITALS);
      traceSumRow[`Query${j + 1}`] =
          Number(traceSumArray[j]).toFixed(LENGTH_OF_DIGITALS);
    }
    mergedArray.unshift(traceSumRow);
    mergedArray.unshift(traceGPULastFirstRow);
    mergedArray.unshift(tracePredictTimeRow);
  }
  console.log('Repeat :' + traceGpuData.length + ', Ops: ' + opCount);
  return mergedArray;
}


module.exports = {
  parseGPUTrace: parseGPUTrace,
  getBaseTimeFromTrace: getBaseTimeFromTrace,
  getBaseTimeFromTraceJson: getBaseTimeFromTraceJson,
  createModelFromData: createModelFromData,
};
