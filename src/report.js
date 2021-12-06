'use strict';

const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');
const { spawnSync, execSync } = require('child_process');
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

function getSortedHash(inputHash){
  var resultHash = {};

  var keys = Object.keys(inputHash);
  keys.sort(function(a, b) {
    return inputHash[a][0] - inputHash[b][0];
  }).reverse().forEach(function(k) {
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
      let resultsTable = `<table><tr><th>${target} (${metric}, duration ${targetResults[targetResults.length - 1]})</th><th>webgpu${unit}</th>`;
      for (let i = 1; i < backendsLength; i++) {
        let backend = util.backends[i];
        resultsTable += `<th>${backend}${unit}</th>`;
        if (target == 'performance') {
          resultsTable += `<th>webgpu vs ${backend} (%)</th>`;
        }
      }
      resultsTable += '</tr>';
      for (let resultIndex = 0; resultIndex < targetResults.length; resultIndex++) {
        // stop until duration
        if (resultIndex == targetResults.length - 1) {
          break;
        }
        let result = targetResults[resultIndex];
        let webgpuValue = result[metricIndex + 1];
        let style = neutralStyle;
        if (target == 'conformance') {
          if (webgpuValue == 'false') {
            style = badStyle;
          } else if (webgpuValue == 'true') {
            style = goodStyle;
          }
        }

        resultsTable += `<tr><td>${result[0]}</td><td ${style}>${webgpuValue}</td>`;
        for (let i = 1; i < backendsLength; i++) {
          let otherValue = result[i * metricsLength + metricIndex + 1];
          let style = neutralStyle;
          if (target == 'conformance') {
            if (otherValue == 'false') {
              style = badStyle;
            } else if (otherValue == 'true') {
              style = goodStyle;
            }
          }
          resultsTable += `<td ${style}>${otherValue}</td>`;
          if (target == 'performance') {
            let percent = 'NA';
            let style = neutralStyle;
            if (otherValue !== 'NA' && webgpuValue !== 'NA') {
              percent = parseFloat(otherValue / webgpuValue * 100).toFixed(2);
              style = percent > 100 ? goodStyle : badStyle;
            }
            resultsTable += `<td ${style}>${percent}</td>`;
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
    let resultsTable = `<table><tr><th>Unit</th><th>webgpu</th>`;
    for (let i = 1; i < backendsLength; i++) {
      let backend = util.backends[i];
      resultsTable += `<th>${backend}</th>`;
    }
    resultsTable += '</tr>';

    resultsTable += '<tr><td></td>';
    for (let i = 0; i < backendsLength; i++) {
      let style;
      if (targetResults[i] == 'NA') {
        style = neutralStyle;
      } else if (targetResults[i].includes('FAILED')) {
        style = badStyle;
      } else {
        style = goodStyle;
      }
      resultsTable += `<td ${style}>${targetResults[i]}</td>`;
    }
    resultsTable += '</tr></table><br>';
    html += resultsTable;
  }

  // config table
  let configTable = '<table><tr><th>Category</th><th>Info</th></tr>';
  if ('upload' in util.args || 'server-info' in util.args) {
    util['serverDate'] = execSync('ssh wp@wp-27.sh.intel.com "cd /workspace/project/tfjswebgpu/tfjs && git log -1 --format=\"%cd\""').toString();
    util['serverCommit'] = execSync('ssh wp@wp-27.sh.intel.com "cd /workspace/project/tfjswebgpu/tfjs && git rev-parse HEAD"').toString();
  }

  for (let category of ['browserArgs', 'browserPath', 'chromeRevision', 'chromeVersion', 'cpuName', 'duration', 'hostname', 'gpuDeviceId', 'gpuDriverVersion', 'gpuName', 'platform', 'powerPlan', 'pthreadPoolSize', 'screenResolution', 'serverDate', 'serverCommit', 'url', 'urlArgs', 'wasmMultithread', 'wasmSIMD']) {
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
    for (let i = 1; i < backendsLength; i++) {
      let backend = util.backends[i];
      breakdownTable += `<th>${backend}${unit}</th>`;
      breakdownTable += `<th>webgpu vs ${backend} (%)</th>`;
    }
    breakdownTable += '</tr>';

    for (let resultIndex = 0; resultIndex < targetResults.length; resultIndex++) {
      // stop until duration
      if (resultIndex == targetResults.length - 1) {
        break;
      }
      let result = targetResults[resultIndex];
      let op_time = result[backendsLength * metricsLength + 1];
      let TOP = 5;
      let count = 0;
      let benchmarkNameDisplayed = false;

      for (let op in getSortedHash(op_time)) {
        let time = op_time[op];
        let webgpuValue = time[0];
        let benchmarkName;
        if (benchmarkNameDisplayed) {
          benchmarkName = '';
        } else {
          benchmarkName = result[0];
          benchmarkNameDisplayed = true;
        }

        breakdownTable += `<tr><td>${benchmarkName}</td><td>${op}</td><td ${style}>${webgpuValue}</td>`;
        for (let i = 1; i < backendsLength; i++) {
          let otherValue = time[i];
          breakdownTable += `<td>${otherValue}</td>`;
          let percent = 'NA';
          let style = neutralStyle;
          if (otherValue !== 'NA' && webgpuValue !== 'NA') {
            percent = parseFloat(otherValue / webgpuValue * 100).toFixed(2);
            style = percent > 100 ? goodStyle : badStyle;
          }
          breakdownTable += `<td ${style}>${percent}</td>`;
        }
        breakdownTable += '</tr>';
        count += 1;
        if (count == TOP) {
          break;
        }
      }
    }
    breakdownTable += '</table><br>';
    html += breakdownTable;
  }

  fs.writeFileSync(path.join(util.outDir, `${util.timestamp}.html`), html);
  if ('performance' in results) {
    results['performance'].pop();
    let fileName = `${util.timestamp.substring(0, 8)}.json`;
    let file = path.join(util.outDir, fileName);
    fs.writeFileSync(file, JSON.stringify(results['performance']));
    if ('upload' in util.args) {
      let result = spawnSync('scp', [file, `wp@wp-27.sh.intel.com:/workspace/project/work/tfjs/perf/${util['gpuDeviceId']}/${fileName}`]);
      if (result.status !== 0) {
        util.log('[ERROR] Failed to upload report');
      } else {
        util.log('[INFO] Report was successfully uploaded');
      }
    }
  }

  if ('email' in util.args) {
    let subject = '[TFJS Test] ' + util['hostname'] + ' ' + util.timestamp;
    await sendMail(util.args['email'], subject, html);
  }
}

module.exports = report;
