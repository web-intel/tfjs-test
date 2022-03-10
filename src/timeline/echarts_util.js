function getOption(categories, data, marklineData) {
  let option = {
    tooltip: {
      formatter: function(params) {
        return params.marker + params.name + ': ' + params.value[3] + ' ms';
      }
    },
    title: {left: 'center'},
    dataZoom: [
      {
        type: 'slider',
        filterMode: 'weakFilter',
        showDataShadow: false,
        top: 400,
        labelFormatter: ''
      },
      {type: 'inside', filterMode: 'weakFilter'}
    ],
    grid: {height: 300},
    xAxis: {
      min: 0,
      scale: true,
      axisLabel: {
        formatter: function(val) {
          return val + ' ms';
        }
      }
    },
    yAxis: {data: categories},
    series: [{
      type: 'custom',
      renderItem: renderItem,
      itemStyle: {opacity: 0.8},
      encode: {x: [1, 2], y: 0},
      markLine: {data: marklineData},
      data: data
    }]
  };
  return option;
}

function renderItem(params, api) {
  let categoryIndex = api.value(0);
  let start = api.coord([api.value(1), categoryIndex]);
  let end = api.coord([api.value(2), categoryIndex]);
  let height = api.size([0, 1])[1] * 0.5;
  let rectShape = echarts.graphic.clipRectByRect(
      {
        x: start[0],
        y: start[1] - height / 2,
        width: end[0] - start[0],
        height: height
      },
      {
        x: params.coordSys.x,
        y: params.coordSys.y,
        width: params.coordSys.width,
        height: params.coordSys.height
      });
  return (rectShape && {
    type: 'rect',
    transition: ['shape'],
    shape: rectShape,
    style: api.style()
  });
}
