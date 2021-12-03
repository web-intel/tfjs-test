'use strict';

const fs = require('fs');
const path = require('path');
const util = require('./util.js');

function parseTrace(fileName='') {
  let eventNames = ['createComputePipeline', 'createShaderModule'];
  let results = {};
  let base_ts = 0;
  for (let event of eventNames) {
    results[event] = [];
  }
  if (!fileName) {
    fileName = util.args['trace-file'];
  }
  let f = `${util.outDir}/${fileName}.json`;
  let jsonData = JSON.parse(fs.readFileSync(f));
  for (let event of jsonData['traceEvents']) {
    let eventName = util.uncapitalize(event['name'].replace('DeviceBase::API', ''));
    if (eventNames.indexOf(eventName) >= 0) {
      if (base_ts == 0) {
        base_ts = event['ts'];
      }
      results[eventName].push([(event['ts'] - base_ts)/1000, event['dur']/1000]);
    }
  }
  //results['total'] = [[0, 2157.1]];
  console.log(results);
  let timelineName = `${fileName.replace('-trace', '')}.json`;
  let file = path.join(util.outDir, timelineName);
  fs.writeFileSync(file, JSON.stringify(results));
}

module.exports = parseTrace;