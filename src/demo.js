'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const readline = require('readline');

const util = require('./util.js')

async function startContext() {
  if (!util.dryrun) {
    let context = await chromium.launchPersistentContext(util.userDataDir, {
      headless: false,
      executablePath: util['browserPath'],
      viewport: null,
      ignoreHTTPSErrors: true,
      args: util['browserArgs'].split(' '),
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
  let backendsLength = util.backends.length;

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

  if (!('new-context' in util.args)) {
    [context, page] = await startContext();
  }

  for (let runDemoIndex = 0; runDemoIndex < runDemosLength; runDemoIndex++) {
    let fps = 0;
    let demo = runDemos[runDemoIndex];
    util.log(`[${runDemoIndex + 1}/${runDemosLength}] ${demo}`);
    results.push([demo].concat(Array(backendsLength).fill(defaultValue)));

    for (let runBackendIndex = 0; runBackendIndex < runBackends.length; runBackendIndex++) {
      let runBackend = runBackends[runBackendIndex];
      let backendIndex = util.backends.indexOf(runBackend);
      if ('new-context' in util.args) {
        [context, page] = await startContext(traceFile);
      }

      if (!util.dryrun) {
        let url = `${util.demoUrl}/?backend=tfjs-${runBackend}&model=${demo}`;
        await page.goto(url);

        // This has to be called so that camera can work properly
        page.bringToFront();

        let selector = '#fps';
        try {
          await page.waitForSelector(selector, { timeout: timeout });
        } catch (err) {
          console.log(`Could not get FPS of demo ${demo}`);
          continue;
        }

        let start = new Date();
        let consecutiveGoodCount = 0;
        while (new Date() - start < timeout) {
          await util.sleep(1000);
          let newFps = await page.$eval(selector, el => el.innerText);
          if (Math.abs(newFps - fps) < fps * 10 / 100) {
            consecutiveGoodCount++;
            if (consecutiveGoodCount == 3) {
              break;
            }
          } else {
            consecutiveGoodCount = 0;
          }
          fps = newFps;
        }
        results[results.length - 1][backendIndex + 1] = fps;
      }

      util.log(results[results.length - 1]);

      if ('new-context' in util.args) {
        await closeContext(context);
      }
    }
  }

  if (!('new-context' in util.args)) {
    await closeContext(context);
  }

  return Promise.resolve(results);
}

module.exports = runDemo;
