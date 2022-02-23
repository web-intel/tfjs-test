'use strict';

function createCPUModel(jsonData, data, categoriesIndex) {
  // handle createComputePipelineAsync
  let createComputePipelineAsyncName = 'CreateComputePipelineAsyncTask::Run';
  if (createComputePipelineAsyncName in jsonData) {
    let allData = jsonData[createComputePipelineAsyncName];
    let newAllData = [];
    let endTime = [];
    for (let i in allData) {
      let oneData = allData[i];
      let added = false;
      for (let j in endTime) {
        if (endTime[j] < oneData[0]) {
          newAllData[j].push(oneData);
          endTime[j] = oneData[0] + oneData[1];
          added = true;
        }
      }
      if (!added) {
        newAllData.push([]);
        let lastIndex = newAllData.length - 1;
        newAllData[lastIndex].push(oneData);
        endTime[newAllData.length - 1] = oneData[0] + oneData[1];
      }
    }
    delete jsonData[createComputePipelineAsyncName];
    for (let i in newAllData) {
      jsonData[`${createComputePipelineAsyncName}${i}(${
          newAllData[i].length})`] = newAllData[i];
    }
  }

  const cpuCategories = Object.keys(jsonData);
  cpuCategories.forEach(function(category, index) {
    let categoryData = jsonData[category];
    for (let i = 0; i < categoryData.length; i++) {
      let startTime = categoryData[i][0];
      let duration = categoryData[i][1];
      data.push({
        name: category,
        value: [categoriesIndex, startTime, (startTime += duration), duration],
        itemStyle: {normal: {color: `${getRandomColor()}`}}
      });
    }
    categoriesIndex++;
  });
  return [cpuCategories, categoriesIndex];
}

function createGPUModel(jsonData, data, categoriesIndex) {
  // Generate mock data
  const gpuCategories = ['GPU'];
  gpuCategories.forEach(function(category, index) {
    const dataCount = jsonData.length;
    for (var i = 0; i < dataCount; i++) {
      const item = jsonData[i];
      let startTime = item.query[0];
      let endTime = item.query[1];
      let duration = item.query[1] - item.query[0];
      data.push({
        name: item.name,
        value: [categoriesIndex, startTime, endTime, duration],
        itemStyle: {normal: {color: `${getRandomColor()}`}}
      });
    }
    categoriesIndex++;
  });
  return [gpuCategories, categoriesIndex];
}

async function readFileAsync(url, method = 'GET') {
  return new Promise(function(resolve, reject) {
    let xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.onload = function() {
      if (this.status >= 200 && this.status < 300) {
        resolve(xhr.response);
      } else {
        reject({status: this.status, statusText: xhr.statusText});
      }
    };
    xhr.onerror = function() {
      reject({status: this.status, statusText: xhr.statusText});
    };
    xhr.send();
  });
}
