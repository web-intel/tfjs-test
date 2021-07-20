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
      for (let i = 1; i < util.targetBackends[target].length; i++) {
        let backend = util.targetBackends[target][i];
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
        if (target == 'conformance' && webgpuValue == 'false') {
          style = badStyle;
        }
        resultsTable += `<tr><td>${result[0]}</td><td ${style}>${webgpuValue}</td>`;
        for (let i = 1; i < util.targetBackends[target].length; i++) {
          let otherValue = result[i * metricsLength + metricIndex + 1];
          resultsTable += `<td>${otherValue}</td>`;
          if (target == 'performance') {
            let percent = 'NA';
            if (otherValue !== 0 && webgpuValue !== 0) {
              percent = parseFloat(otherValue / webgpuValue * 100).toFixed(2);
            }
            let style = (webgpuValue == 0 || otherValue == 0 ? neutralStyle : (percent > 100 ? goodStyle : badStyle));
            resultsTable += `<td ${style}>${percent}%</td>`;
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
    let resultsTable = `<table><tr><th>Unit</th></tr>`;
    let result = targetResults[targetResults.length - 1];
    let style = result.includes('FAILED') ? badStyle : goodStyle;
    resultsTable += `<tr><td ${style}>${result}</td></tr></table><br>`;
    html += resultsTable;
  }

  // config table
  let configTable = '<table><tr><th>Category</th><th>Info</th></tr>';
  if ('upload' in util.args) {
    util['serverDate'] = execSync('ssh wp@wp-27.sh.intel.com cd /workspace/project/tfjswebgpu/tfjs && git log -1 --date=format:"%Y%m%d" --format="%cd"').toString();
  }

  for (let category of ['hostname', 'platform', 'url', 'browserPath', 'browserArgs', 'cpuName', 'pthreadPoolSize', 'gpuName', 'powerPlan', 'gpuDeviceId', 'gpuDriverVersion', 'screenResolution', 'chromeVersion', 'chromeRevision', 'wasmMultithread', 'wasmSIMD', 'serverDate']) {
    configTable += `<tr><td>${category}</td><td>${util[category]}</td></tr>`;
  }
  configTable += '</table><br>'
  html += configTable;

  // performance breakdown table
  let target = 'performance';
  if (target in results && !('disable-breakdown' in util.args)) {
    let targetResults = results[target];
    let backendLength = util.targetBackends[target].length;
    let metricsLength = util.targetMetrics[target].length;
    let unit = ' (ms)';
    let style = neutralStyle;
    let breakdownTable = `<table><tr><th>benchmark</th><th>op</th><th>webgpu${unit}</th>`;
    for (let i = 1; i < util.targetBackends[target].length; i++) {
      let backend = util.targetBackends[target][i];
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
      let op_time = result[backendLength * metricsLength + 1];
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
        for (let i = 1; i < util.targetBackends[target].length; i++) {
          let backend = util.targetBackends[target][i];
          let otherValue = time[util.targetBackends[target].indexOf(backend)];
          breakdownTable += `<td>${otherValue}</td>`;
          let percent = 'NA';
          if (otherValue !== 0 && webgpuValue !== 0) {
            percent = parseFloat(otherValue / webgpuValue * 100).toFixed(2);
          }
          let style = (webgpuValue == 0 || otherValue == 0 ? neutralStyle : (percent > 100 ? goodStyle : badStyle));
          breakdownTable += `<td ${style}>${percent}%</td>`;
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
      let result = spawnSync('scp', [file, `wp@wp-27.sh.intel.com:/workspace/project/work/tfjs/data/${util['gpuDeviceId']}/${fileName}`]);
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
