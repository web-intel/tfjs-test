'use strict';

const fs = require('fs');
const path = require('path');
const util = require('./util.js');

function parseTrace(traceFile='', totalTime=0) {
  let eventNames = ['DeviceBase::APICreateComputePipeline', 'CreateComputePipelineAsyncTask::Run', 'DeviceBase::APICreateShaderModule'];
  let results = {};
  let base_ts = 0;

  if (!traceFile) {
    traceFile = `${util.outDir}/${util.args['trace-file']}.json`;
  }
  let jsonData = JSON.parse(fs.readFileSync(traceFile));
  for (let event of jsonData['traceEvents']) {
    let eventName = event['name']
    if (eventNames.indexOf(eventName) >= 0) {
      if (base_ts == 0) {
        base_ts = event['ts'];
      }
      if (!(eventName in results)) {
        results[eventName] = [];
      }
      results[eventName].push([(event['ts'] - base_ts)/1000, event['dur']/1000]);
    }
  }
  results['total'] = [[0, totalTime]];
  console.log(results);
  let timelineFile = traceFile.replace('-trace', '');
  fs.writeFileSync(timelineFile, JSON.stringify(results));
}

module.exports = parseTrace;
