function getJsonFromString(str, start, end) {
  const regStr = String.raw`${start}.*?${end}`;
  var matchRegex = new RegExp(regStr, 'g');
  const matchResults = str.match(matchRegex);
  if (Array.isArray(matchResults)) {
    var results = [];
    for (const item of matchResults) {
      results.push(JSON.parse(item.replace(start, '').replace(end, '')));
    }
    return results;
  } else {
    if (matchResults == null) throw new Error('Please make sure log is valid!');
    return new Array(
        JSON.parse(matchResults.replace(start, '').replace(end, '')));
  }
}

function getModelNames(modelNamesJson) {
  if (modelNamesJson == null) {
    console.error('No Model names!');
    return [];
  }
  const modelNames = [];
  for (const item in modelNamesJson['performance']) {
    modelNames.push(modelNamesJson['performance'][item][0]);
  }
  return modelNames;
}

// Make name simple.
function getName(item) {
  return item.replace(/[\[\]]/g, '').replace(/\//g, '_').replace(/[,\s]/g, '-');
}

function getModelNamesFromLog(logStr) {
  const matchRegex = /\[\d{1,2}\/\d{1,2}\].*webgpu/g;
  const matchResults = logStr.match(matchRegex);

  if (Array.isArray(matchResults)) {
    var results = [];
    for (const item of matchResults) {
      const name = getName(item);
      results.push(name);
    }
    return results;
  } else {
    return getName(matchResults);
  }
}

function getAverageInfoFromLog(logStr) {
  // TODO: This regex takes too long.
  const matchRegex = /.*\[object Object\]/g;
  const matchResults = logStr.match(matchRegex);
  return matchResults;
}

module.exports = {
  getJsonFromString: getJsonFromString,
  getModelNames: getModelNames,
  getModelNamesFromLog: getModelNamesFromLog,
  getAverageInfoFromLog: getAverageInfoFromLog,
};
