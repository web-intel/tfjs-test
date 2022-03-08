require('dotenv').config();
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

// Data. For Profile data, lastFirst is false. For tracing data, lastFirst i strue.
async function parseGPUTrace(
    jsonData, lastFirst = true, isRawTimestamp = false, gpuFreq) {
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
    // before cpuBase. We use cpuTracingBase as real base, so the diff
    // should be applied to gpuBase.
    const diff = cpuTracingBase - cpuBase * S2US / cpuFreq;
    return [cpuTracingBase, gpuBase * S2US / gpuFreq + diff, gpuFreq];
  } else {
    // For GPU only, cpuBase is not used.
    return [cpuBase / cpuFreq * S2US, gpuBase * S2US / gpuFreq, gpuFreq];
  }
}

// TODO: merge this with timeline\timeline_trace.js
/**
 * @param traceFile The tracing file.
 * @returns [cpuBase, gpuBase, gpuFreq].
 */
 async function getBaseTimeFromTracing(traceFile = '') {
  if (traceFile == null) {
    console.warn('No tracing file!');
    return [0, 0, 0];
  }

  const eventNames = [
    'DeviceBase::APICreateComputePipeline',
    'CreateComputePipelineAsyncTask::Run', 'DeviceBase::APICreateShaderModule'
  ];
  const baseTimeName =
      'd3d12::CommandRecordingContext::ExecuteCommandList Detailed Timing';
  let baseTime = '';
  let cpuTracingBase = 0;

  const fsasync = require('fs').promises;
  let jsonData = JSON.parse(await fsasync.readFile(traceFile));
  for (let event of jsonData['traceEvents']) {
    let eventName = event['name'];
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
    console.warn('Tracing has no Detailed Timing!' + traceFile );
  }
  return [0, 0, 0];
}


module.exports = {
  parseGPUTrace: parseGPUTrace,
  getBaseTimeFromTracing: getBaseTimeFromTracing,
};
