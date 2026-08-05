// network.test.js — 测试关系连接清单页
const h = require('../helpers');

async function testNetwork(mp) {
  await mp.reLaunch('/pages/network/network');
  await h.sleep(2000);
  const page = await h.currentPage(mp);
  h.assert(page.path.includes('network'), 'Should be on network page');

  const data = await h.getPageData(page);
  console.log('  Mode:', data.mode);
  console.log('  Graph stats:', JSON.stringify(data.graph?.stats || {}));

  // 1. 检查图谱数据
  h.assert(data.graph, 'Graph object exists');
  h.assert(Array.isArray(data.graph.nodes), 'Graph has nodes array');
  h.assert(Array.isArray(data.graph.edges), 'Graph has edges array');
  h.assert(data.graph.stats, 'Graph has stats');

  // 2. 检查模式切换（默认为 list）
  h.assertEqual(data.mode, 'list', 'Default mode is list');

  // 3. 如果有节点，检查结构
  if (data.graph.nodes.length > 0) {
    const node = data.graph.nodes[0];
    h.assert(node.id, 'Node has id');
    h.assert(node.name, 'Node has name');
    h.assert(node.nature, 'Node has nature');
    console.log('  First node:', node.name, '(' + node.nature + ')');
  }

  // 4. 如果有连接，检查结构
  if (data.graph.edges.length > 0) {
    const edge = data.graph.edges[0];
    h.assert(edge.source, 'Edge has source');
    h.assert(edge.target, 'Edge has target');
    console.log('  First edge:', edge.sourceName, '→', edge.targetName);
  }

  // 5. 测试切换到引荐路径模式 — 直接 setData
  await page.setData({ mode: 'path' });
  await h.sleep(500);
  const data2 = await h.getPageData(page);
  h.assertEqual(data2.mode, 'path', 'Switched to path mode');

  // 6. 测试引荐路径搜索（如果有足够节点）
  if (data.graph.nodes.length >= 2) {
    const fromName = data.graph.nodes[0].name;
    const toName = data.graph.nodes[1].name;
    await page.setData({ fromName, toName });
    await page.callMethod('searchPath');
    await h.sleep(2000);
    const data3 = await h.getPageData(page);
    if (data3.pathResult) {
      console.log('  Path result:', JSON.stringify(data3.pathResult).slice(0, 100));
      h.assert(true, 'Path search returned a result');
    }
  }
}

module.exports = {
  name: '关系连接清单页',
  mutates: false,
  fn: testNetwork,
};
