'use strict';

const {chromium} = require('playwright');

let logStatus = {logEnd: false};

async function waitForCondition(condition) {
  return new Promise(resolve => {
    var startTime = Date.now();
    function checkCondition() {
      if (condition.logEnd == true) {
        console.log('Test end');
        condition.logEnd = false;
        resolve();
      } else if (Date.now() > startTime + 3600 * 1000) {
        console.log('Test time out');
        resolve();
      } else {
        setTimeout(checkCondition, 1000);
      }
    }
    checkCondition();
  });
}

const browserPath =
    `${process.env.LOCALAPPDATA}/Google/Chrome SxS/Application/chrome.exe`;
const userDataDir = `${process.env.LOCALAPPDATA}/Google/Chrome SxS/User Data`;

function log(info, logFile) {
  const fs = require('fs');
  fs.appendFileSync(logFile, String(info) + '\n');
}

async function startContext(exitCondition, tracingFile, logFile) {
  let browserArgs =
      `--disable-dawn-features=disallow_unsafe_apis  --enable-dawn-features=record_detailed_timing_in_trace_events,disable_timestamp_query_conversion --enable-unsafe-webgpu --enable-tracing=disabled-by-default-gpu.dawn  --trace-startup-file=${
          tracingFile} --trace-startup-format=json`;
  console.log(browserArgs);
  let context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    executablePath: browserPath,
    viewport: null,
    ignoreHTTPSErrors: true,
    args: browserArgs.split(' '),
  });
  let page = await context.newPage();
  page.on('console', async msg => {
    for (let i = 0; i < msg.args().length; ++i) {
      log(`[console] ${i}: ${await msg.args()[i].jsonValue()}`, logFile);
    }

    let msgStr = ('' + msg.args()[0]).replace('JSHandle@', '');
    if (msgStr.includes('gpudataend')) {
      exitCondition.logEnd = true;
    } else {
      // Unsupported.
    }
  });
  page.on('pageerror', (err) => {console.log(err.message)});
  return [context, page];
}

async function closeContext(context) {
  await context.close();
}

async function openPage(url, tracingFile, logFile) {
  if (url == '') {
    throw 'URL is empty';
  }
  const [context, page] = await startContext(logStatus, tracingFile, logFile);
  await page.goto(url);
  await waitForCondition(logStatus);

  await closeContext(context);
  return logFile;
}

module.exports = openPage;
