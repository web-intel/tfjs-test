'use strict';
const yargs = require('yargs');
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
        .option('url', {
          type: 'string',
          describe: 'Url is used to get model name',
        })
        .option('apis', {
          type: 'string',
          describe: 'List all used APIs, split by comma',
          default:
              'DeviceBase::APICreateShaderModule,DeviceBase::APICreateComputePipeline,DeviceBase::APICreateComputePipelineAsync',
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
  let apiNames = args['apis'].split(',');
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
    console.log(JSON.stringify(jsonData));
  }
}


main();
