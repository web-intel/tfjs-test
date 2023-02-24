'use strict';

const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');
const {execSync} = require('child_process');
const util = require('./util.js');

async function sendMail(to, subject, html) {
  let from = 'webgraphics@intel.com';

  let transporter = nodemailer.createTransport({
    host: 'ecsmtp.sh.intel.com',
    port: 25,
    secure: false,
    auth: false,
  });

  transporter.verify(error => {
    if (error)
      util.log('transporter error: ', error);
    else
      util.log('Email was sent!');
  });

  let info = await transporter.sendMail({
    from: from,
    to: to,
    subject: subject,
    html: html,
  });
  return Promise.resolve();
}

function getSortedHash(inputHash) {
  var resultHash = {};

  var keys = Object.keys(inputHash);
  keys.sort(function(a, b) {
        return inputHash[a][0] - inputHash[b][0];
      })
      .reverse()
      .forEach(function(k) {
        resultHash[k] = inputHash[k];
      });
  return resultHash;
}

async function report(results) {
  const goodStyle = 'style=color:green';
  const badStyle = 'style=color:red';
  const neutralStyle = 'style=color:black';
  let backendsLength = util.backends.length;

  // main performance and conformance tables
  let benchmarkTables = '';
  for (let target of ['performance', 'conformance']) {
    if (!(target in results)) {
      continue;
    }
    let targetResults = results[target];
    let metrics = util.targetMetrics[target];
    let metricsLength = metrics.length;
    // for errorMsg
    if (target === 'conformance') {
      metricsLength += 1;
    }
    let unit;
    if (target === 'performance') {
      unit = ' (ms)';
    } else {
      unit = '';
    }

    for (let metricIndex = 0; metricIndex < metrics.length; metricIndex++) {
      let metric = metrics[metricIndex];
      let benchmarkTable = `<table>`;

      // header
      benchmarkTable += `<tr><th>${target} (${metric})</th>`;
      for (let backendIndex = 0; backendIndex < backendsLength;
           backendIndex++) {
        let backend = util.backends[backendIndex];
        if (metric === 'Subsequent average') {
          benchmarkTable +=
              `<th>${backend} total${unit}</th><th>${backend} ops${unit}</th>`;
        } else {
          benchmarkTable += `<th>${backend}${unit}</th>`;
          if (target === 'conformance') {
            benchmarkTable += `<th>${backend} error</th>`;
          }
        }

        if (target === 'performance' && backend !== 'webgpu') {
          if (metric === 'Subsequent average') {
            benchmarkTable += `<th>webgpu total vs ${
                backend} total (%)</th><th>webgpu ops vs ${
                backend} ops (%)</th>`;
          } else {
            benchmarkTable += `<th>webgpu vs ${backend} (%)</th>`;
          }
        }
      }
      benchmarkTable += '</tr>';

      // body
      for (let resultIndex = 0; resultIndex < targetResults.length;
           resultIndex++) {
        let result = targetResults[resultIndex];
        let opsResult = result[result.length - 1];
        benchmarkTable += `<tr><td>${result[0]}</td>`;

        let webgpuTotalValue = 'NA';
        let webgpuOpsValue = 'NA';
        for (let backendIndex = 0; backendIndex < backendsLength;
             backendIndex++) {
          let backend = util.backends[backendIndex];
          let backendTotalValue =
              result[backendIndex * metricsLength + metricIndex + 1];
          let backendOpsValue = 0.0;
          for (let op in opsResult) {
            backendOpsValue += opsResult[op][backendIndex];
          }
          backendOpsValue = parseFloat(backendOpsValue).toFixed(2);
          if (backend === 'webgpu') {
            webgpuTotalValue = backendTotalValue;
            webgpuOpsValue = backendOpsValue;
          }
          let style = neutralStyle;
          if (target === 'conformance') {
            if (backendTotalValue === 'false') {
              style = badStyle;
            } else if (backendTotalValue === 'true') {
              style = goodStyle;
            }
          }
          benchmarkTable += `<td ${style}>${backendTotalValue}</td>`;
          if (target === 'conformance') {
            benchmarkTable += `<td>${
                result[backendIndex * metricsLength + metricIndex + 2]}</td>`;
          }
          if (metric === 'Subsequent average') {
            benchmarkTable += `<td>${backendOpsValue}</td>`
          }
          if (target === 'performance' && backend !== 'webgpu') {
            let totalPercent = 'NA';
            let totalStyle = neutralStyle;
            if (backendTotalValue !== 'NA' && webgpuTotalValue !== 'NA') {
              totalPercent =
                  parseFloat(backendTotalValue / webgpuTotalValue * 100)
                      .toFixed(2);
              totalStyle = totalPercent > 100 ? goodStyle : badStyle;
            }
            benchmarkTable += `<td ${totalStyle}>${totalPercent}</td>`;

            if (metric === 'Subsequent average') {
              let opsPercent = 'NA';
              let opsStyle = neutralStyle;
              if (backendOpsValue !== 'NA' && webgpuOpsValue !== 'NA') {
                opsPercent = parseFloat(backendOpsValue / webgpuOpsValue * 100)
                                 .toFixed(2);
                opsStyle = opsPercent > 100 ? goodStyle : badStyle;
              }
              benchmarkTable += `<td ${opsStyle}>${opsPercent}</td>`;
            }
          }
        }
        benchmarkTable += '</tr>';
      }

      benchmarkTable += '</table><br>';
      benchmarkTables += benchmarkTable;
    }
  }

  // unit table
  let unitTable = '';
  if ('unit' in results) {
    let targetResults = results['unit'];
    unitTable = `<table><tr><th>unit</th><th>webgpu</th>`;
    for (let backendIndex = 1; backendIndex < backendsLength; backendIndex++) {
      let backend = util.backends[backendIndex];
      unitTable += `<th>${backend}</th>`;
    }
    unitTable += '</tr>';

    unitTable += '<tr><td></td>';
    for (let backendIndex = 0; backendIndex < backendsLength; backendIndex++) {
      let style;
      if (targetResults[backendIndex] === 'NA') {
        style = neutralStyle;
      } else if (targetResults[backendIndex].includes('FAILED')) {
        style = badStyle;
      } else {
        style = goodStyle;
      }
      unitTable += `<td ${style}>${targetResults[backendIndex]}</td>`;
    }
    unitTable += '</tr></table><br>';
  }

  // demo table
  let demoTable = '';
  if ('demo' in results) {
    let targetResults = results['demo'];
    demoTable = `<table><tr><th>demo</th><th>webgpu</th>`;
    for (let backendIndex = 1; backendIndex < backendsLength; backendIndex++) {
      let backend = util.backends[backendIndex];
      demoTable += `<th>${backend}</th>`;
    }
    demoTable += '</tr>';

    for (let resultIndex = 0; resultIndex < targetResults.length;
         resultIndex++) {
      let result = targetResults[resultIndex];
      demoTable += `<tr><td>${result[0]}</td>`;
      for (let backendIndex = 0; backendIndex < backendsLength;
           backendIndex++) {
        let style = neutralStyle;
        demoTable += `<td ${style}><a href=${result[backendIndex + 1][1]}>${
            result[backendIndex + 1][0]}</a></td>`;
      }
    }
    demoTable += '</tr></table><br>';
  }

  // config table
  let configTable = '<table><tr><th>Category</th><th>Info</th></tr>';
  if ('upload' in util.args || 'server-info' in util.args) {
    util['serverRepoDate'] =
        execSync(
            'ssh wp@wp-27.sh.intel.com "cd /workspace/project/tfjswebgpu/tfjs && git log -1 --format=%ci"')
            .toString();
    util['serverRepoCommit'] =
        execSync(
            'ssh wp@wp-27.sh.intel.com "cd /workspace/project/tfjswebgpu/tfjs && git rev-parse HEAD"')
            .toString();
    util['serverBuildDate'] =
        execSync(
            'ssh wp@wp-27.sh.intel.com "cd /workspace/project/tfjswebgpu/tfjs && stat --format=%y dist/bin/tfjs-backend-webgpu/dist/tf-backend-webgpu.js"')
            .toString();
  }

  for (let category
           of ['benchmarkUrl', 'benchmarkUrlArgs', 'browserArgs', 'browserPath',
               'chromeRevision', 'chromeVersion', 'clientRepoCommit',
               'clientRepoDate', 'cpuName', 'duration', 'gpuDeviceId',
               'gpuDriverVersion', 'gpuName', 'hostname', 'osVersion',
               'platform', 'pthreadPoolSize', 'serverBuildDate',
               'serverRepoDate', 'serverRepoCommit', 'wasmMultithread',
               'wasmSIMD']) {
    configTable += `<tr><td>${category}</td><td>${util[category]}</td></tr>`;
  }
  configTable += '</table><br>'

  // performance breakdown table
  let breakdownTable = '';
  let target = 'performance';
  if (target in results && !('disable-breakdown' in util.args)) {
    let targetResults = results[target];
    let backendsLength = util.backends.length;
    let metricsLength = util.targetMetrics[target].length;
    let unit = ' (ms)';
    let style = neutralStyle;
    breakdownTable =
        `<table><tr><th>benchmark</th><th>op</th><th>webgpu${unit}</th>`;
    for (let backendIndex = 1; backendIndex < backendsLength; backendIndex++) {
      let backend = util.backends[backendIndex];
      breakdownTable += `<th>${backend}${unit}</th>`;
      breakdownTable += `<th>webgpu vs ${backend} (%)</th>`;
    }
    breakdownTable += '</tr>';

    for (let resultIndex = 0; resultIndex < targetResults.length;
         resultIndex++) {
      let result = targetResults[resultIndex];
      let op_time = result[backendsLength * metricsLength + 1];
      let TOP = 5;
      let enableTOP = false;
      let count = 0;
      let benchmarkNameDisplayed = false;

      for (let op in getSortedHash(op_time)) {
        let time = op_time[op];
        let webgpuTotalValue = time[0];
        let benchmarkName;
        if (benchmarkNameDisplayed) {
          benchmarkName = '';
        } else {
          benchmarkName = result[0];
          benchmarkNameDisplayed = true;
        }

        breakdownTable += `<tr><td>${benchmarkName}</td><td>${op}</td><td ${
            style}>${webgpuTotalValue}</td>`;
        for (let backendIndex = 1; backendIndex < backendsLength;
             backendIndex++) {
          let backendTotalValue = time[backendIndex];
          breakdownTable += `<td>${backendTotalValue}</td>`;
          let percent = 'NA';
          let style = neutralStyle;
          if (backendTotalValue !== 'NA' && webgpuTotalValue !== 'NA') {
            percent = parseFloat(backendTotalValue / webgpuTotalValue * 100)
                          .toFixed(2);
            style = percent > 100 ? goodStyle : badStyle;
          }
          breakdownTable += `<td ${style}>${percent}</td>`;
        }
        breakdownTable += '</tr>';
        count += 1;
        if (enableTOP && count === TOP) {
          break;
        }
      }
    }
    breakdownTable += '</table><br>';
  }

  let style = '<style> \
		* {font-family: Calibri (Body);} \
	  table {border-collapse: collapse;} \
	  table, td, th {border: 1px solid black; vertical-align: top;} \
	  th {background-color: #0071c5; color: #ffffff; font-weight: normal;} \
    </style>';

  let html = style + configTable + unitTable + benchmarkTables + demoTable +
      breakdownTable;

  fs.writeFileSync(
      path.join(util.timestampDir, `${util.timestamp}.html`), html);

  if ('email' in util.args) {
    let subject = '[TFJS Test] ' + util['hostname'] + ' ' + util.timestamp;
    if (util['serverRepoDate'] && util['serverBuildDate']) {
      if (new Date(util['serverRepoDate']) >
          new Date(util['serverBuildDate'])) {
        subject += ' (server build failed)'
      }
    }

    await sendMail(util.args['email'], subject, html);
  }
}

module.exports = report;
