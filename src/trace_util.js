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
    if (matchResults == null) throw new Error('Please make sure log is valid!');
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
    modelNames.push(modelNamesJson['performance'][item][0].replace(/ /g, '_'));
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

async function readFileAsync(fileName) {
  const fsasync = require('fs').promises;
  return await fsasync.readFile(fileName, 'binary');
}


function pushEvents(results, runCount, event, inModel) {
  if (!inModel) {
    return;
  }
  if (!(runCount in results)) {
    results[runCount] = [];
  }
  // Event is us. Result is ms.
  results[runCount].push(event);
}

async function splitTraceByModel(traceFile, modelSummarDir) {
  const eventNames = [
    'DeviceBase::APICreateComputePipeline',
    'CreateComputePipelineAsyncTask::Run', 'DeviceBase::APICreateShaderModule',
    'Queue::Submit'
  ];

  const eventJSTimestampNames = [
    'predict', 'timeInferenceForTracing', 'JSSubmitQueue', 'JSGetBufferData',
    'JSGetBufferDataEnd', 'JSGetKernelTimesEnd', 'JSrunWebGLProgram',
    'JSrunWebGLProgramEnd', 'JSreadSync', 'JSreadSyncEnd', 'JSread', 'JSreadEnd'
  ];

  const dawnTimestampName =
      'd3d12::CommandRecordingContext::ExecuteCommandList Detailed Timing';

  let results = [];

  let jsonData =
      JSON.parse(await readFileAsync(`${modelSummarDir}/${traceFile}`));
  const traceEndTag = 'metadata';
  const traceEnd = jsonData[traceEndTag];
  let runCount = -1;
  let inModel = false;
  for (let event of jsonData['traceEvents']) {
    let eventName = event['name'];

    let jsMessageName;
    if (event['args'] && event['args']['data'] &&
        event['args']['data']['message']) {
      jsMessageName = event['args']['data']['message'];
    }

    const modelBeginMessage = 'predict';
    const modelEndMessage = 'JSGetKernelTimesEnd';
    const eventJSTimestampNameIndex =
        eventJSTimestampNames.indexOf(jsMessageName);
    if (eventJSTimestampNameIndex >= 0 && eventName == 'TimeStamp') {
      if (jsMessageName == modelBeginMessage) {
        runCount++;
        inModel = true;
        pushEvents(results, runCount, event, inModel);
      } else if (jsMessageName == modelEndMessage) {
        pushEvents(results, runCount, event, inModel);
        inModel = false;
      } else {
        pushEvents(results, runCount, event, inModel);
      }
    } else if (eventName == dawnTimestampName) {
      pushEvents(results, runCount, event, inModel);
    } else if (eventNames.indexOf(eventName) >= 0) {
      pushEvents(results, runCount, event, inModel);
    }
  }
  return [results, traceEnd];
}

module.exports = {
  getJsonFromString: getJsonFromString,
  getModelNames: getModelNames,
  getModelNamesFromLog: getModelNamesFromLog,
  getAverageInfoFromLog: getAverageInfoFromLog,
  splitTraceByModel: splitTraceByModel,
};
