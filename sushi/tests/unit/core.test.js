import test from 'node:test';
import assert from 'node:assert/strict';
import { createStepper } from '../../src/core/loop.js';
import { createSceneManager } from '../../src/core/scenes.js';
import { createSaveStore } from '../../src/core/save.js';

test('loop：固定步長累加器', () => {
  const st = createStepper(50);
  let n = 0;
  let alpha = st.advance(120, () => n++);
  assert.equal(n, 2);
  assert.ok(Math.abs(alpha - 0.4) < 1e-9);
  alpha = st.advance(30, () => n++);
  assert.equal(n, 3);
  assert.ok(Math.abs(alpha) < 1e-9);
  // 落後太多時有上限
  const st2 = createStepper(10, 5);
  let m = 0;
  st2.advance(10000, () => m++);
  assert.equal(m, 5);
});

test('scenes：堆疊、overlay、pause/resume', () => {
  const log = [];
  const vis = new Map();
  const mgr = createSceneManager({ setVisible: (root, on) => vis.set(root, on) });
  const mk = (name, overlay) => ({
    name, overlay, root: name,
    enter: (p) => log.push(`enter:${name}:${p ?? ''}`),
    exit: () => log.push(`exit:${name}`),
    pause: () => log.push(`pause:${name}`),
    resume: (r) => log.push(`resume:${name}:${r ?? ''}`),
    update: () => log.push(`update:${name}`),
    render: () => log.push(`render:${name}`),
  });
  mgr.push(mk('a'), 1);
  mgr.push(mk('b'));
  mgr.push(mk('c', true));
  assert.deepEqual(mgr.names(), ['a', 'b', 'c']);
  assert.equal(vis.get('a'), false);
  assert.equal(vis.get('b'), true);
  assert.equal(vis.get('c'), true);
  log.length = 0;
  mgr.update(16);
  mgr.render(null);
  assert.deepEqual(log, ['update:c', 'render:b', 'render:c']);
  log.length = 0;
  mgr.pop('done');
  assert.deepEqual(log, ['exit:c', 'resume:b:done']);
  mgr.replace(mk('d'));
  assert.deepEqual(mgr.names(), ['a', 'd']);
  mgr.reset(mk('e'));
  assert.deepEqual(mgr.names(), ['e']);
});

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('save：存檔、讀檔、遷移、壞檔、無法存檔', () => {
  const spec = {
    version: 3,
    defaults: () => ({ version: 3, coins: 0, name: '' }),
    migrations: {
      1: (d) => ({ version: 2, coins: d.money }),
      2: (d) => ({ ...d, version: 3, name: 'x' }),
    },
  };
  const st = createSaveStore(fakeStorage());
  assert.equal(st.available, true);
  assert.equal(st.load('k', spec).status, 'empty');
  assert.equal(st.save('k', { version: 3, coins: 5, name: 'a' }), true);
  assert.deepEqual(st.load('k', spec), { data: { version: 3, coins: 5, name: 'a' }, status: 'ok' });
  // 舊版本一路遷移上來
  st.save('old', { version: 1, money: 9 });
  assert.deepEqual(st.load('old', spec).data, { version: 3, coins: 9, name: 'x' });
  // 壞檔不當機
  const raw = fakeStorage();
  raw.setItem('bad', '{not json');
  raw.setItem('bad2', '"string"');
  raw.setItem('future', JSON.stringify({ version: 99 }));
  const st2 = createSaveStore(raw);
  for (const k of ['bad', 'bad2', 'future']) {
    const r = st2.load(k, spec);
    assert.equal(r.status, 'corrupt');
    assert.deepEqual(r.data, spec.defaults());
  }
  st2.remove('bad');
  assert.equal(st2.load('bad', spec).status, 'empty');
  // 沒有 storage：存在記憶體，提示一次
  const st3 = createSaveStore(null);
  assert.equal(st3.available, false);
  assert.equal(st3.consumeUnavailableNotice(), true);
  assert.equal(st3.consumeUnavailableNotice(), false);
  st3.save('k', { version: 3, coins: 1, name: '' });
  assert.equal(st3.load('k', spec).data.coins, 1);
  // 寫入時丟例外也不當機
  const broken = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  const st4 = createSaveStore(broken);
  assert.equal(st4.save('k', { version: 3 }), false);
  assert.equal(st4.consumeUnavailableNotice(), true);
});
