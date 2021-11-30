'use strict';
const fs = require('fs');
const url = require('url');

/*
 trace format:
 {"args":{},"cat":"disabled-by-default-gpu.dawn","dur":42942,"name":"DeviceBase::APICreateComputePipeline","ph":"X","pid":3276,"tdur":42778,"tid":24624,"ts":1183083225222,"tts":440215},
 ts: timestamp, at microsecond.
 tdur: wall duration, at microsecond.
*/

// The API names.
const traceKey = 'name';

// Trace values.
const traceValue = 'dur';
const traceTimestamp = 'ts';
const traceLabel = 'label';

function TraceRecord(label, duration, timestamp) {
  this.label = label;
  this.duration = duration;
  this.timestamp = timestamp;
}

// Parse a single model from a json file.
function parseSingleModel(jsonFile, apiNames) {
  let rawdata = fs.readFileSync(jsonFile);
  let parsedData = JSON.parse(rawdata);
  const resultData = {};
  for (const x in parsedData) {
    if (x === 'traceEvents') {
      const traces = parsedData[x];
      for (const y in traces) {
        apiNames.forEach(function(api) {
          if (traces[y][traceKey] === api) {
            if (!resultData[api]) {
              resultData[api] = new Array();
            }
            resultData[api].push(new TraceRecord(
                traces[y].args[traceLabel],
                (traces[y][traceValue] / 1000).toFixed(3),
                (traces[y][traceTimestamp] / 1000).toFixed(3)));
          }
        });
      }
    }
  }
  return resultData;
}

// Multiple model only. Used to get model boundary.
function isModel(trace, modelUrlTag) {
  const modelNameTag = 'NavigationControllerImpl::LoadURLWithParams';
  if (trace[traceKey] == modelNameTag) {
    if ((trace['args']['url']).includes(modelUrlTag)) {
      return true;
    }
  }
  return false;
}

// Multiple model only. Used to get model info.
function getModelInfo(trace) {
  const url = new URL(trace['args']['url']);
  const modelKeys = [
    'task', 'backend', 'benchmark', 'architecture', 'inputType', 'inputSize'
  ];
  var modelInfo = '';
  modelKeys.forEach(function(key, index) {
    if (url.searchParams.has(key)) {
      const prefix = modelInfo === '' ? '' : ' ';
      modelInfo += prefix + url.searchParams.get(key);
    }
  });
  return modelInfo;
}

// Parse multiple models from a json file.
function parseMultipleModels(jsonFile, apiNames, modelUrlTag) {
  let rawdata = fs.readFileSync(jsonFile);
  let parsedData = JSON.parse(rawdata);
  const resultData = {};
  for (const x in parsedData) {
    if (x === 'traceEvents') {
      const traces = parsedData[x];
      var modelName;
      for (const y in traces) {
        apiNames.forEach(function(api) {
          if (isModel(traces[y], modelUrlTag)) {
            modelName = getModelInfo(traces[y]);
            resultData[modelName] = {};
          }
          if (traces[y][traceKey] === api) {
            if (!resultData[modelName][api]) {
              resultData[modelName][api] = new Array();
            }
            resultData[modelName][api].push(new TraceRecord(
                traces[y].args[traceLabel],
                (traces[y][traceValue] / 1000).toFixed(3),
                (traces[y][traceTimestamp] / 1000).toFixed(3)));
          }
        });
      }
    }
  }
  return resultData;
}

module.exports = {
  parseSingleModel: parseSingleModel,
  parseMultipleModels: parseMultipleModels,
};
