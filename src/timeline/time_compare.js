'use strict';

/*
This tool is used to compare GPUQueue::submit(from chrome tracing) and GPU Timestamp(copied from console).
When GPU Timestamp is behind the first (or second) GPUQueue::submit, it means something is wrong with the time.
1. Change code:
backend_webgpu.ts:
  // const timeElapsedNanos = Number((arrayBuf[1] - arrayBuf[0]));
  // console.log(Number(arrayBuf[0]) + ", " + Number(arrayBuf[1]));

unit test:

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describeWebGPU('matmul', () => {
  beforeAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 100000000;
  });
  it('tfprofile squaring without disposing', async () => {
    for (var i = 0; i < 100; i++) {
      await tf.profile(() => {
        const x = tf.tensor1d([1, 2, 3]);
        const x2 = x.square();
        return x2;
      });
      await sleep(100);
    }
  });
});
3. yarn karma start --browsers=chrome_webgpu --no-single-run --grep=tfprofile
4. Run test page:
"C:\Users\abc\AppData\Local\Google\Chrome SxS\Application\chrome.exe"
  --disable-dawn-features=disallow_unsafe_apis  --enable-dawn-features=record_detailed_timing_in_trace_events,disable_timestamp_query_conversion
  --enable-unsafe-webgpu --enable-tracing=disabled-by-default-gpu.dawn,blink.console
  --trace-startup-format=json
  --trace-startup-file=c:\workspace\tfprofile.json --trace-startup-format=json  "http://localhost:9876/debug.html"
5. Save console log as tfprofile.log. Make sure it is in below format:
​ 46106831050, 46106831238
6. Copy tfprofile.log and tfprofile.json, run node timeCompare.js.
*/

const fs = require('fs');
const path = require('path');

function getBaseTime(rawTime) {
  const splitRawTime = rawTime.split(',');
  const cpuBase = splitRawTime[2].split(':')[1];
  const cpuFreq = splitRawTime[4].split(':')[1];
  const gpuBase = splitRawTime[3].split(':')[1];
  const gpuFreq = splitRawTime[5].split(':')[1];
  return gpuBase;
}

function parseTrace(gpuTimeFile = '') {
  let eventNames = [
    'DeviceBase::APICreateComputePipeline',
    'CreateComputePipelineAsyncTask::Run', 'DeviceBase::APICreateShaderModule'
  ];
  let baseTimeName =
      'd3d12::CommandRecordingContext::ExecuteCommandList Detailed Timing';
  let gpuTimeResults = [];
  let base_ts = 0;
  let baseTime = '';
  let cpuTracingBase = 0;


  let tracingJsonData = JSON.parse(fs.readFileSync(gpuTimeFile));

  for (let i = 0; i < tracingJsonData['traceEvents'].length; i++) {
    if (tracingJsonData['traceEvents'][i]['args']['Timing'] != null) {
      gpuTimeResults.push(
          getBaseTime(tracingJsonData['traceEvents'][i]['args']['Timing']));
    }
  }
  console.log(gpuTimeResults.length);

  return gpuTimeResults;
}

// timestampFile is copied from console.
function parseTimestamp(timestampFile) {
  let rawFile = fs.readFileSync(timestampFile, 'utf-8');
  const gpuTimeResults = [];
  rawFile.split(/\r?\n/).forEach(line => {
    if (line != '') {
      gpuTimeResults.push(line.split(',')[0]);
    }
  });
  console.log(gpuTimeResults.length);
  return gpuTimeResults;
}
const repeat = 1000;
const delay = 0;
const tracingTimes = parseTrace(`tfprofile.json`);

// tfprofile.log is copied from console.
const gpuTimes = parseTimestamp(`tfprofile.log`);
const html = getHtml(tracingTimes, gpuTimes);

fs.writeFileSync(`result_delay${delay}_${repeat}.html`, html);
function getHtml(tracingTimes, gpuTimes) {
  let html = `<table>`;
  for (let i = 0; i < gpuTimes.length; i++) {
    const trace1 = Number(tracingTimes[3 * i]);
    const trace2 = Number(tracingTimes[3 * i + 1]);
    const trace3 = Number(tracingTimes[3 * i + 2]);
    const gpuStart = Number(gpuTimes[i].replace(/[\s\u200B]/g, ''));
    const timeUnit = 1000;
    const gpuFreq = 19200000;
    html += `<tr><td>${trace1}</td><td>${trace2}</td><td>${trace3}</td><td>${
        gpuStart}</td>
       <td>${(gpuStart - trace1)*timeUnit/gpuFreq}</td><td>${(gpuStart - trace2)*timeUnit/gpuFreq}</td>
       <td>${(gpuStart - trace3)*timeUnit/gpuFreq}</td></tr>`;
  }
  html += `</table>`;
  return html;
}
