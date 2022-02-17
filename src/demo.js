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
  let demos = [
    'posenet',
    'movenet',
    'blazepose',
  ];
  let demosLength = demos.length;
  let context;
  let page;
  let results = [];

  if (!('new-context' in util.args)) {
    [context, page] = await startContext();
  }

  for (let i = 0; i < demosLength; i++) {
    let fps = 0;
    let demo = demos[i];
    let timeout = 10 * 1000;

    results.push([demo, fps]);
    util.log(`[${i + 1}/${demosLength}] ${demo}`);

    if ('new-context' in util.args) {
      [context, page] = await startContext(traceFile);
    }

    if (!util.dryrun) {
      let url = `${util.demoUrl}${demo}`;
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
      while (new Date() - start < timeout) {
        await util.sleep(1000);
        let newFps = await page.$eval(selector, el => el.innerText);
        if (Math.abs(newFps - fps) < fps * 5 / 100) {
          break;
        } else {
          fps = newFps;
        }
      }
      results[i][1] = fps;
    }

    util.log(results[i]);

    if ('new-context' in util.args) {
      await closeContext(context);
    }
  }

  if (!('new-context' in util.args)) {
    await closeContext(context);
  }

  return Promise.resolve(results);
}

module.exports = runDemo;
