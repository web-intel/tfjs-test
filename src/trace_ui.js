// View.
function createTableStart() {
  return `<style>
  table {
    font-family: Arial, Helvetica, sans-serif;
    border-collapse: collapse;
    width: 30%;
  }

  td,
  th {
    border: 1px solid #ddd;
    padding: 8px;
  }

  tr:nth-child(even) {
    background-color: #f2f2f2;
  }

  tr:hover {
    background-color: #ddd;
  }

  th {
    padding-top: 12px;
    padding-bottom: 12px;
    text-align: left;
    background-color: #f4fAfD;
    color: black;
  }
  </style><table><thead>`;
}

function createTableEnd() {
  return '</table>';
}

function createTableStartWithInfo(data) {
  var header = createTableStart();
  header += `<th>${data}</th></thead>`;
  return header;
}

function createTableStartWithLink(data, modelName, linkInfo, tracingMode) {
  var header = createTableStart();
  header += createTableRowWithLink(data, modelName, linkInfo, tracingMode) +
      '</thead>';
  return header;
}

function createTableRows(data) {
  var rows = '';
  for (let element of data) {
    rows += createTableRow(element);
  }
  return rows;
}

function createTableRow(data) {
  let tr = '<tr>';
  for (key in data) {
    tr += `<td>${data[key]}</td>`;
  }
  tr += '</tr>';
  return tr;
}

function getParaFromLinkInfo(linkInfo) {
  let linkStr = '';
  for (const property in linkInfo) {
    linkStr += `&${property}=${linkInfo[property]}`;
  }
  return linkStr;
}

// linkinfo:  {date: 2022, gpufreq: 192000}
function createTableRowWithLink(data, modelName, linkInfo, tracingMode) {
  let tr = '<tr>';
  const linkStr = getParaFromLinkInfo(linkInfo);
  const rawTimestamp = '&rawtimestamp=true';
  for (key in data) {
    if (data[key] != 'name') {
      if (tracingMode == 'all') {
        tr += `<td><a href="./../../timeline.html?${linkStr}&${
            rawTimestamp}&trace=${modelName}-${key}">${data[key]}</a>
          </td>`;
      } else {
        tr += `<td><a href="./../../timeline.html?${linkStr}&${
            rawTimestamp}&gpufile=${modelName}-${key}">${data[key]}-GPU</a>
          </td>`;
      }
    } else {
      tr += `<td>${data[key]}</td>`;
    }
  }
  tr += '</tr>';
  return tr;
}

module.exports = {
  createTableStartWithLink: createTableStartWithLink,
  createTableStartWithInfo: createTableStartWithInfo,
  createTableEnd: createTableEnd,
  createTableRows: createTableRows
};
