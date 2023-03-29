'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const readline = require('readline');

const util = require('./util.js');

async function startContext() {
  if (!util.dryrun) {
    let context = await puppeteer.launch({
      args: util['browserArgs'].split(' '),
      defaultViewport: null,
      executablePath: util['browserPath'],
      headless: false,
      ignoreHTTPSErrors: true,
      userDataDir: util.userDataDir,
    });
    let page = await context.newPage();
    return [context, page];
  } else {
    return [undefined, undefined];
  }
}

async function closeContext(context) {
  if (!util.dryrun) {
    await context.close();
  }
}

async function runDemo() {
  let context;
  let defaultValue = 'NA';
  let page;
  let results = [];
  let timeout = 20 * 1000;
  let backendsLength = util.allBackends.length;

  let runDemos;
  if ('demo' in util.args) {
    runDemos = util.args['demo'].split(',');
  } else {
    runDemos = ['blazepose', 'movenet', 'posenet'];
  }
  let runDemosLength = runDemos.length;

  let runBackends;
  if ('demo-backend' in util.args) {
    runBackends = util.args['demo-backend'].split(',');
  } else {
    runBackends = ['webgpu', 'webgl'];
  }
  util.demoBackends = runBackends;

  if (!('new-context' in util.args)) {
    [context, page] = await startContext();
  }

  let runTypes;
  if ('demo-type' in util.args) {
    runTypes = util.args['demo-type'].split(',');
  } else {
    runTypes = ['camera', 'video'];
  }
  for (let runTypeIndex = 0; runTypeIndex < runTypes.length; runTypeIndex++) {
    let runType = runTypes[runTypeIndex];
    let runTypeInUrl;
    if (runType === 'camera') {
      runTypeInUrl = 'live';
    } else {
      runTypeInUrl = 'upload';
    }

    for (let runDemoIndex = 0; runDemoIndex < runDemosLength; runDemoIndex++) {
      let fps = 0;
      let demo = runDemos[runDemoIndex];
      util.log(`[${runDemoIndex + 1}/${runDemosLength}] ${demo}`);

      results.push([`${runType}-${demo}`]);
      // Array.fill doesn't work as ref is passed instead of a new instance
      for (let i = 0; i < backendsLength; i++) {
        results[results.length - 1].push([defaultValue, defaultValue]);
      }

      for (let runBackendIndex = 0; runBackendIndex < runBackends.length;
           runBackendIndex++) {
        let runBackend = runBackends[runBackendIndex];
        let backendIndex = util.allBackends.indexOf(runBackend);
        if ('new-context' in util.args) {
          [context, page] = await startContext(traceFile);
        }

        if (!util.dryrun) {
          let url = `${util.demoUrl}/${runTypeInUrl}_video/dist?backend=tfjs-${
              runBackend}&model=${demo}`;
          results[results.length - 1][backendIndex + 1][1] = url;

          try {
            await page.goto(url);

            // This has to be called so that camera can work properly
            page.bringToFront();

            let selector = '#fps';
            await page.waitForSelector(selector);
            let start = new Date();
            let consecutiveGoodCount = 0;
            while (new Date() - start < timeout) {
              await util.sleep(1000);
              let newFps = await page.$eval(selector, el => el.innerText);
              if (Math.abs(newFps - fps) < fps * 10 / 100) {
                consecutiveGoodCount++;
                if (consecutiveGoodCount === 3) {
                  break;
                }
              } else {
                consecutiveGoodCount = 0;
              }
              fps = newFps;
            }

            results[results.length - 1][backendIndex + 1][0] = fps;
          } catch (error) {
          }
        }

        util.log(results[results.length - 1]);

        if ('new-context' in util.args) {
          await closeContext(context);
        }
      }
    }
  }

  if (!('new-context' in util.args)) {
    await closeContext(context);
  }

  return Promise.resolve(results);
}

module.exports = runDemo;
