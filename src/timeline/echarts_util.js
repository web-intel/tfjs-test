
function getOption(categories, data, marklineData, tooltip = 0) {
  const pointerTooltip = {trigger: 'none', axisPointer: {type: 'cross'}};
  let option = {
    tooltip: tooltip == 0 ? {
      formatter: function(params) {
        return params.marker + params.name + ': ' + params.value[3] + ' ms';
      }
    } :
                            pointerTooltip,
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
      },
      axisTick: {alignWithLabel: true},
      axisLine: {onZero: false},
      axisPointer: {
        label: {
          formatter: function(params) {
            return (
                'X  ' + params.value.toFixed(2) +
                (params.seriesData.length ? '：' + params.seriesData[0].data :
                                            ''));
          }
        }
      },
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

function drawArraw(context, fromX, fromY, toX, toY, name, color) {
  var headlen = 10;
  var dx = toX - fromX;
  var dy = toY - fromY;
  var angle = Math.atan2(dy, dx);
  context.beginPath();
  context.setLineDash([5, 3]);
  context.strokeStyle = color;
  context.moveTo(fromX, fromY);
  context.lineTo(toX, toY);
  ctx.stroke();
  context.beginPath();
  context.setLineDash([]);
  context.moveTo(toX, toY);
  context.lineTo(
      toX - headlen * Math.cos(angle - Math.PI / 6),
      toY - headlen * Math.sin(angle - Math.PI / 6));
  ctx.stroke();
  context.beginPath();
  context.setLineDash([]);
  context.moveTo(toX, toY);
  context.lineTo(
      toX - headlen * Math.cos(angle + Math.PI / 6),
      toY - headlen * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
  context.beginPath();
  const textWidth = context.measureText(name).width;
  ctx.fillText(name, fromX - textWidth / 2, fromY + 10);
  ctx.stroke();
}
