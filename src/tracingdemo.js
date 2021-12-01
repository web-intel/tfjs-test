'use strict';
const yargs = require('yargs');
// https://github.com/waylonflinn/xlsx-workbook.
var Workbook = require('./xlsx-workbook').Workbook;
const fs = require('fs');
const tracingJsonParser = require('./tracingJsonParser');

/* Steps:
1. generate tracing json file
Generate by webtest:
node webtest\src\main.js  --warmup-times 1
 --run-times 0 --trace disabled-by-default-gpu.dawn,navigation --target
performance
 --performance-backend webgpu --url http://www.abc.com --disable-breakdown

Or by chromium:
chrome.exe --enable-tracing=disabled-by-default-gpu.dawn,navigation
--trace-startup-file=abc.json

2. node tracingdemo.js
*/

const args =
    yargs.usage('node $0 [args]')
        .strict()
        .option('files', {
          type: 'string',
          describe: 'JSON files to be parsed',
        })
        .option('o', {
          type: 'string',
          describe: 'Result excel file',
        })
        .option('url', {
          type: 'string',
          describe: 'Url is used to get model name',
        })
        .option('apis', {
          type: 'string',
          describe: 'List all used APIs, split by comma',
          default:
              'DeviceBase::APICreateShaderModule,DeviceBase::APICreateComputePipeline',
        })
        .example([
          [
            'node $0 --apis=DeviceBase::APICreateShaderModule,DeviceBase::APICreateComputePipeline',
            '# Test Dawn APIs'
          ],
        ])
        .help()
        .wrap(120)
        .argv;

function getApiNames() {
  let apiNames = [];
  if ('apis' in args) {
    apiNames = args['apis'].split(',');
  } else {
    apiNames = [
      'DeviceBase::APICreateShaderModule',
      'DeviceBase::APICreateComputePipeline'
    ];
  }
  return apiNames;
}

function getFiles() {
  let files = [];
  if ('files' in args) {
    files = args['files'].split(',');
  } else {
    files = getAllJsonFiles();
  }
  return files;
}

function getOutputFile() {
  var file = '';
  if ('o' in args) {
    file = args['o'];
  } else {
    file = 'Tracing-API-Summary.xlsx';
  }
  return file;
}

function getUrl() {
  var modelUrlTag = '';
  if ('url' in args) {
    modelUrlTag = args['url'];
  } else {
    modelUrlTag = 'tfjs/e2e/benchmarks/local-benchmark';
  }
  return modelUrlTag;
}

main();

function main() {
  const modelUrlTag = getUrl();
  const apiNames = getApiNames();
  const allFiles = getFiles();

  // Case 1: parse single model.
  for (const file in allFiles) {
    const jsonData =
        tracingJsonParser.parseSingleModel(allFiles[file], apiNames);
    console.log(JSON.stringify(jsonData));
  }

  // Case 2: parse multiple models.
  for (const file in allFiles) {
    const jsonData = tracingJsonParser.parseMultipleModels(
        allFiles[file], apiNames, modelUrlTag);
    // console.log(JSON.stringify(jsonData));
  }

  // Case 3: parse and save to xlsx.
  parseAndWriteToXlsx(allFiles, apiNames, modelUrlTag);
}

function writeJsonDataToXLSX(table, jsonData, fileName, columnIndex) {
  var rowIndex = 0;
  var traceValueCount = 0;
  // Loop through each model.
  Object.keys(jsonData).forEach(function(key) {
    // Append model name.
    table[rowIndex][columnIndex] = key;
    const jsonDataApi = jsonData[key];
    // Append API name.
    table[rowIndex][columnIndex + 1] = Object.keys(jsonDataApi)[0];
    rowIndex++;

    // Loop through APIs. This only includes one API.
    Object.keys(jsonDataApi).forEach(function(keyApi) {
      // Array.isArray(jsonDataApi[keyApi]) is true.
      var sum = 0;
      jsonDataApi[keyApi].forEach(function(record) {
        // Put into array.
        var columnInnerIndex = columnIndex;
        const recordKeys = Object.keys(record);
        if (traceValueCount === 0) {
          traceValueCount = recordKeys.length;
        }
        recordKeys.forEach(function(key) {
          table[rowIndex][columnInnerIndex] = record[key];
          columnInnerIndex++;
        });
        rowIndex++;
      });
    });
  });
  return traceValueCount;
}

// xlsx view.
function parseAndWriteToXlsx(allFiles, apiNames, modelUrlTag) {
  var workbook = new Workbook();
  for (const file in allFiles) {
    // path.sep not work in git bash.
    var pathSep = '/';
    if (!allFiles[file].includes(pathSep)) {
      pathSep = '\\';
    }
    const sheetNames = allFiles[file].split(pathSep);
    const table = workbook.add(sheetNames[sheetNames.length - 1]);
    // console.log(JSON.stringify(jsonData));
    var columnIndex = 0;
    // Loop through API.
    apiNames.forEach(function(api) {
      const jsonData = tracingJsonParser.parseMultipleModels(
          allFiles[file], [api], modelUrlTag);
      // console.log(JSON.stringify(jsonData));
      const apiName = api.replace('DeviceBase::', '_');
      const traceValueCount =
          writeJsonDataToXLSX(table, jsonData, apiName, columnIndex);
      columnIndex = columnIndex + traceValueCount;
    });
  }

  workbook.save(getOutputFile());
}

function isJsonFile(fileName) {
  var splitFileName = fileName.split('.');
  if (splitFileName[splitFileName.length - 1] == 'json') {
    return true;
  }
  return false;
}

function getAllJsonFiles() {
  const jsonFolder = './';
  const files = new Array();

  fs.readdirSync(jsonFolder).forEach(fileName => {
    if (isJsonFile(fileName)) {
      files.push(fileName);
    }
  });
  return files;
}

// txt view. Depreciated.
function parseToTxt(allFiles, apiNames, modelUrlTag) {
  for (const file in allFiles) {
    apiNames.forEach(function(api) {
      const jsonData = parseMultipleModels(allFiles[file], [api], modelUrlTag);
      const apiName = api.replace('DeviceBase::', '_');
      fs.writeFileSync(
          allFiles[file] + apiName + '.txt',
          JSON.stringify(jsonData, '', '\t'));
    });
  }
}
