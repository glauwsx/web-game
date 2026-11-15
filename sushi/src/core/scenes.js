// 場景堆疊。
// 場景是一個物件：
//   { name, overlay?, root?, enter(params), exit(), pause(), resume(result),
//     update(dtMs), render(ctx), input(evt), debug? }
// - 只有最上層的場景會 update 和收到輸入。
// - overlay 場景蓋在下層上面，下層照樣繪圖（但不 update）。
// - root 是場景自己的 DOM 節點。掛載和隱藏交給 host（讓這個檔案不直接碰 DOM）。

export function createSceneManager(host = {}) {
  const stack = [];
  const mount = host.mount || (() => {});
  const unmount = host.unmount || (() => {});
  const setVisible = host.setVisible || (() => {});
  const onChange = host.onChange || (() => {});

  function refreshVisibility() {
    // 從最上層往下找：遇到非 overlay 的場景之後，下面的都隱藏。
    let covered = false;
    for (let i = stack.length - 1; i >= 0; i--) {
      const sc = stack[i];
      if (sc.root) setVisible(sc.root, !covered);
      if (!sc.overlay) covered = true;
    }
  }

  const mgr = {
    /** 把新場景疊上去。 */
    push(scene, params) {
      const prev = stack[stack.length - 1];
      if (prev && prev.pause) prev.pause();
      stack.push(scene);
      if (scene.enter) scene.enter(params);
      if (scene.root) mount(scene.root);
      refreshVisibility();
      onChange(mgr);
      return scene;
    },
    /** 移除最上層場景。result 會傳給下一層的 resume。 */
    pop(result) {
      const sc = stack.pop();
      if (!sc) return undefined;
      if (sc.exit) sc.exit();
      if (sc.root) unmount(sc.root);
      const top = stack[stack.length - 1];
      refreshVisibility();
      if (top && top.resume) top.resume(result);
      onChange(mgr);
      return sc;
    },
    /** 用新場景取代最上層。 */
    replace(scene, params) {
      const sc = stack.pop();
      if (sc) {
        if (sc.exit) sc.exit();
        if (sc.root) unmount(sc.root);
      }
      stack.push(scene);
      if (scene.enter) scene.enter(params);
      if (scene.root) mount(scene.root);
      refreshVisibility();
      onChange(mgr);
      return scene;
    },
    /** 清空堆疊，只留一個新場景。 */
    reset(scene, params) {
      while (stack.length) {
        const sc = stack.pop();
        if (sc.exit) sc.exit();
        if (sc.root) unmount(sc.root);
      }
      return mgr.push(scene, params);
    },
    top() { return stack[stack.length - 1]; },
    depth() { return stack.length; },
    names() { return stack.map((s) => s.name); },
    update(dtMs) {
      const top = stack[stack.length - 1];
      if (top && top.update) top.update(dtMs);
    },
    render(ctx) {
      // 找出最上面的非 overlay 場景，從它開始往上畫。
      let start = stack.length - 1;
      while (start > 0 && stack[start].overlay) start--;
      for (let i = Math.max(0, start); i < stack.length; i++) {
        if (stack[i].render) stack[i].render(ctx);
      }
    },
    input(evt) {
      const top = stack[stack.length - 1];
      if (top && top.input) return top.input(evt);
      return undefined;
    },
  };
  return mgr;
}
