'use strict';

const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');
const { execSync } = require('child_process');
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
  keys.sort(function (a, b) {
    return inputHash[a][0] - inputHash[b][0];
  }).reverse().forEach(function (k) {
    resultHash[k] = inputHash[k];
  });
  return resultHash;
}

async function report(results) {
  const goodStyle = 'style=color:green';
  const badStyle = 'style=color:red';
  const neutralStyle = 'style=color:black';
  let backendsLength = util.backends.length;

  let html = '<style> \
		* {font-family: Calibri (Body);} \
	  table {border-collapse: collapse;} \
	  table, td, th {border: 1px solid black;} \
	  th {background-color: #0071c5; color: #ffffff; font-weight: normal;} \
    </style>';

  // main performance and conformance tables
  for (let target of ['performance', 'conformance']) {
    if (!(target in results)) {
      continue;
    }
    let targetResults = results[target];
    let metrics = util.targetMetrics[target];
    let metricsLength = metrics.length;
    let unit;
    if (target == 'performance') {
      unit = ' (ms)';
    } else {
      unit = '';
    }
    for (let metricIndex = 0; metricIndex < metrics.length; metricIndex++) {
      let metric = metrics[metricIndex];
      let resultsTable = `<table><tr><th>${target} (${metric})</th><th>webgpu total${unit}</th>`;
      if (target == 'performance' && metric == 'Subsequent average') {
        resultsTable += `<th>webgpu ops${unit}</th>`
      }
      for (let backendIndex = 1; backendIndex < backendsLength; backendIndex++) {
        let backend = util.backends[backendIndex];
        resultsTable += `<th>${backend} total${unit}</th>`;
        if (target == 'performance' && metric == 'Subsequent average') {
          resultsTable += `<th>${backend} ops${unit}</th>`
        }
        if (target == 'performance') {
          resultsTable += `<th>webgpu total vs ${backend} total (%)</th>`;
          if (metric == 'Subsequent average') {
            resultsTable += `<th>webgpu ops vs ${backend} ops (%)</th>`;
          }
        }
      }
      resultsTable += '</tr>';
      for (let resultIndex = 0; resultIndex < targetResults.length; resultIndex++) {
        let result = targetResults[resultIndex];
        let opsResult = result[result.length - 1];
        let webgpuTotalValue = result[metricIndex + 1];
        let webgpuIndex = util.backends.indexOf('webgpu');
        let style = neutralStyle;
        if (target == 'conformance') {
          if (webgpuTotalValue == 'false') {
            style = badStyle;
          } else if (webgpuTotalValue == 'true') {
            style = goodStyle;
          }
        }
        resultsTable += `<tr><td>${result[0]}</td><td ${style}>${webgpuTotalValue}</td>`;

        let webgpuOpsValue = 0;
        for (let op in opsResult) {
          webgpuOpsValue += opsResult[op][webgpuIndex];
        }
        webgpuOpsValue = parseFloat(webgpuOpsValue).toFixed(2);

        if (target == 'performance' && metric == 'Subsequent average') {
          resultsTable += `<td>${webgpuOpsValue}</td>`
        }

        for (let backendIndex = 1; backendIndex < backendsLength; backendIndex++) {
          let backendTotalValue = result[backendIndex * metricsLength + metricIndex + 1];
          let backendOpsValue = 0.0;
          for (let op in opsResult) {
            backendOpsValue += opsResult[op][backendIndex];
          }
          backendOpsValue = parseFloat(backendOpsValue).toFixed(2);
          let style = neutralStyle;
          if (target == 'conformance') {
            if (backendTotalValue == 'false') {
              style = badStyle;
            } else if (backendTotalValue == 'true') {
              style = goodStyle;
            }
          }
          resultsTable += `<td ${style}>${backendTotalValue}</td>`;
          if (target == 'performance' && metric == 'Subsequent average') {
            resultsTable += `<td>${backendOpsValue}</td>`
          }
          if (target == 'performance') {
            let totalPercent = 'NA';
            let totalStyle = neutralStyle;
            if (backendTotalValue !== 'NA' && webgpuTotalValue !== 'NA') {
              totalPercent = parseFloat(backendTotalValue / webgpuTotalValue * 100).toFixed(2);
              totalStyle = totalPercent > 100 ? goodStyle : badStyle;
            }
            resultsTable += `<td ${totalStyle}>${totalPercent}</td>`;

            if (metric == 'Subsequent average') {
              let opsPercent = 'NA';
              let opsStyle = neutralStyle;
              if (backendOpsValue !== 'NA' && webgpuOpsValue !== 'NA') {
                opsPercent = parseFloat(backendOpsValue / webgpuOpsValue * 100).toFixed(2);
                opsStyle = opsPercent > 100 ? goodStyle : badStyle;
              }
              resultsTable += `<td ${opsStyle}>${opsPercent}</td>`;
            }
          }
        }
        resultsTable += '</tr>';
      }
      resultsTable += '</table><br>';
      html += resultsTable;
    }
  }

  // unit table
  if ('unit' in results) {
    let targetResults = results['unit'];
    let resultsTable = `<table><tr><th>unit</th><th>webgpu</th>`;
    for (let backendIndex = 1; backendIndex < backendsLength; backendIndex++) {
      let backend = util.backends[backendIndex];
      resultsTable += `<th>${backend}</th>`;
    }
    resultsTable += '</tr>';

    resultsTable += '<tr><td></td>';
    for (let backendIndex = 0; backendIndex < backendsLength; backendIndex++) {
      let style;
      if (targetResults[backendIndex] == 'NA') {
        style = neutralStyle;
      } else if (targetResults[backendIndex].includes('FAILED')) {
        style = badStyle;
      } else {
        style = goodStyle;
      }
      resultsTable += `<td ${style}>${targetResults[backendIndex]}</td>`;
    }
    resultsTable += '</tr></table><br>';
    html += resultsTable;
  }

  // demo table
  if ('demo' in results) {
    let targetResults = results['demo'];
    let resultsTable = `<table><tr><th>demo</th><th>webgpu</th>`;
    for (let backendIndex = 1; backendIndex < backendsLength; backendIndex++) {
      let backend = util.backends[backendIndex];
      resultsTable += `<th>${backend}</th>`;
    }
    resultsTable += '</tr>';

    for (let resultIndex = 0; resultIndex < targetResults.length; resultIndex++) {
      let result = targetResults[resultIndex];
      resultsTable += `<tr><td>${result[0]}</td>`;
      for (let backendIndex = 0; backendIndex < backendsLength; backendIndex++) {
        let style = neutralStyle;
        resultsTable += `<td ${style}><a href=${result[backendIndex + 1][1]}>${result[backendIndex + 1][0]}</a></td>`;
      }
    }
    resultsTable += '</tr></table><br>';
    html += resultsTable;
  }

  // config table
  let configTable = '<table><tr><th>Category</th><th>Info</th></tr>';
  if ('upload' in util.args || 'server-info' in util.args) {
    util['serverRepoDate'] = execSync('ssh wp@wp-27.sh.intel.com "cd /workspace/project/tfjswebgpu/tfjs && git log -1 --format=\"%cd\""').toString();
    util['serverRepoCommit'] = execSync('ssh wp@wp-27.sh.intel.com "cd /workspace/project/tfjswebgpu/tfjs && git rev-parse HEAD"').toString();
    util['serverBuildDate'] = execSync('ssh wp@wp-27.sh.intel.com "cd /workspace/project/tfjswebgpu/tfjs && stat dist/bin/tfjs-backend-webgpu/dist/tf-backend-webgpu.js |grep Modify"').toString();
  }

  for (let category of [
    'benchmarkUrl', 'benchmarkUrlArgs', 'browserArgs', 'browserPath', 'chromeRevision',
    'chromeVersion', 'clientRepoCommit', 'clientRepoDate', 'cpuName', 'duration', 'gpuDeviceId',
    'gpuDriverVersion', 'gpuName', 'hostname', 'platform', 'powerPlan', 'pthreadPoolSize',
    'screenResolution', 'serverBuildDate', 'serverRepoCommit', 'serverRepoDate',
    'wasmMultithread', 'wasmSIMD']) {
    configTable += `<tr><td>${category}</td><td>${util[category]}</td></tr>`;
  }
  configTable += '</table><br>'
  html += configTable;

  // performance breakdown table
  let target = 'performance';
  if (target in results && !('disable-breakdown' in util.args)) {
    let targetResults = results[target];
    let backendsLength = util.backends.length;
    let metricsLength = util.targetMetrics[target].length;
    let unit = ' (ms)';
    let style = neutralStyle;
    let breakdownTable = `<table><tr><th>benchmark</th><th>op</th><th>webgpu${unit}</th>`;
    for (let backendIndex = 1; backendIndex < backendsLength; backendIndex++) {
      let backend = util.backends[backendIndex];
      breakdownTable += `<th>${backend}${unit}</th>`;
      breakdownTable += `<th>webgpu vs ${backend} (%)</th>`;
    }
    breakdownTable += '</tr>';

    for (let resultIndex = 0; resultIndex < targetResults.length; resultIndex++) {
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

        breakdownTable += `<tr><td>${benchmarkName}</td><td>${op}</td><td ${style}>${webgpuTotalValue}</td>`;
        for (let backendIndex = 1; backendIndex < backendsLength; backendIndex++) {
          let backendTotalValue = time[backendIndex];
          breakdownTable += `<td>${backendTotalValue}</td>`;
          let percent = 'NA';
          let style = neutralStyle;
          if (backendTotalValue !== 'NA' && webgpuTotalValue !== 'NA') {
            percent = parseFloat(backendTotalValue / webgpuTotalValue * 100).toFixed(2);
            style = percent > 100 ? goodStyle : badStyle;
          }
          breakdownTable += `<td ${style}>${percent}</td>`;
        }
        breakdownTable += '</tr>';
        count += 1;
        if (enableTOP && count == TOP) {
          break;
        }
      }
    }
    breakdownTable += '</table><br>';
    html += breakdownTable;
  }

  fs.writeFileSync(path.join(util.timestampDir, `${util.timestamp}.html`), html);
  if ('email' in util.args) {
    let subject = '[TFJS Test] ' + util['hostname'] + ' ' + util.timestamp;
    await sendMail(util.args['email'], subject, html);
  }
}

module.exports = report;
