'use strict';

/**
 * This is used to get the time base for both CPU and GPU.
 * First we extracted a CPU-GPU time from
 * tracing(d3d12::CommandRecordingContext::ExecuteCommandList Detailed Timing).
 *
 * In tracing, we use first CPU tracing time as base.
 * However, the CPU time (and so GPU time) from Detailed Timing is far behind
 * the first CPU tracing time(cpuTracingBase). So we need to adjust the GPU time
 * so that it can be used with first CPU tracing time as CPU base and GPU base.
 * GPU base = GPU time from Detailed Timing + (first CPU tracing time - GPU time
 * from Detailed Timing).
 *
 * @param rawTime is from tracing Details Timing.
 * @param cpuTracingBase is the first none 0 ts in tracing.
 * @returns [cpuBase, gpuBase, gpuFreq]. cpuBase and gpuBase is in us.
 */

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
    return [cpuBase / cpuFreq * S2US, gpuBase * S2US / gpuFreq, gpuFreq];
  }
}

const eventNames = [
  'DeviceBase::APICreateComputePipeline', 'CreateComputePipelineAsyncTask::Run',
  'DeviceBase::APICreateShaderModule'
];
const baseTimeName =
    'd3d12::CommandRecordingContext::ExecuteCommandList Detailed Timing';

/**
 * @param traceFile The tracing file.
 * @returns [cpuBase, gpuBase, gpuFreq].
 */
async function getBaseTimeFromTracing(traceFile = '') {
  if (traceFile == null) {
    console.warn('No tracing file!');
    return [0, 0, 0];
  }

  let baseTime = '';
  let cpuTracingBase = 0;

  let jsonData = JSON.parse(await readFileAsync(traceFile));
  for (let event of jsonData['traceEvents']) {
    let eventName = event['name'];
    if (eventNames.indexOf(eventName) >= 0) {
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
    if (baseTime != '' && cpuTracingBase != 0) {
      return getBaseTime(baseTime, cpuTracingBase);
    }
  }
  if (baseTime == '') {
    console.warn('Tracing has no Detailed Timing!');
  }
  return [0, 0, 0];
}

async function parseCPUTraceWithBase(
    traceFile = '', totalTime = 0, baseCPUTime) {
  let results = {};
  let base_ts = 0;
  let baseTime = '';

  let jsonData = JSON.parse(await readFileAsync(traceFile));
  for (let event of jsonData['traceEvents']) {
    let eventName = event['name'];
    if (eventNames.indexOf(eventName) >= 0) {
      if (!(eventName in results)) {
        results[eventName] = [];
      }
      // Event is us. Result is ms.
      results[eventName].push(
          [(event['ts'] - baseCPUTime) / 1000, event['dur'] / 1000]);
    }
  }
  results['total'] = [[0, totalTime]];
  return results;
}

function getAdjustTimeWithBase(rawTime, baseGPUTime, isRawTimestamp, gpuFreq) {
  let adjustTime = 0;
  if (isRawTimestamp) {
    // raw timestamp is ticks, baseGPUTime is us.
    const S2MS = 1000;
    adjustTime = rawTime * S2MS / gpuFreq - baseGPUTime / 1000;
  } else {
    // GPU timestamp is ns, divided by 1000000 to get ms, align with CPU
    // time.
    const NS2MS = 1 / 1000000;
    adjustTime = rawTime * NS2MS - baseGPUTime / 1000;
  }
  return adjustTime;
}

async function parseGPUTraceWithBase(
    traceFile = '', totalTime = 0, baseGPUTime, gpuFreq = 19200000,
    isRawTimestamp = false) {
  let jsonData = JSON.parse(await readFileAsync(traceFile));
  for (let i = 0; i < jsonData.length; i++) {
    let eventName = jsonData[i];
    const nextEventName = jsonData[i + 1];
    if (nextEventName != null &&
        (nextEventName['query'][0] - eventName['query'][1]) <= 0) {
      console.error(
          JSON.stringify(nextEventName) + ' is overlaped with ' +
          JSON.stringify(eventName));
    }
    // When parse GPU alone, use the first as base.
    if (baseGPUTime == 0) {
      // For raw: eventName['query'][0] is raw timestamp, baseGPUTime is us.
      // For non raw: eventName['query'][0] is ns, baseGPUTime is us.
      baseGPUTime = isRawTimestamp ? eventName['query'][0] * 1000000 / gpuFreq :
                                     eventName['query'][0] / 1000;
    }
    // Raw GPU timestamp is ns, divided by 1000000 to get ms, align with CPU
    // time.
    eventName['query'][0] = getAdjustTimeWithBase(
        eventName['query'][0], baseGPUTime, isRawTimestamp, gpuFreq);
    eventName['query'][1] = getAdjustTimeWithBase(
        eventName['query'][1], baseGPUTime, isRawTimestamp, gpuFreq);
  }
  return jsonData;
}
