// 相機：平移、整數縮放（1 倍、2 倍）。純邏輯。
// 相機狀態：{ x, y, zoom }。(x, y) 是視窗中心對到的世界像素座標。
// 視窗 view：{ x, y, w, h }，是畫布上用來顯示店面的區域（邏輯像素）。

export function createCamera(view) {
  return { x: 0, y: 0, zoom: 1, view: { ...view }, bounds: null };
}

/** 設定可以看的世界範圍。相機中心會被限制在這個範圍內。 */
export function setBounds(cam, bounds) {
  cam.bounds = { ...bounds };
  clampCamera(cam);
}

export function clampCamera(cam) {
  const b = cam.bounds;
  if (!b) return;
  const halfW = cam.view.w / 2 / cam.zoom;
  const halfH = cam.view.h / 2 / cam.zoom;
  // 範圍比視窗小的那一軸：置中。否則視窗邊緣不超出範圍。
  if (b.maxX - b.minX <= halfW * 2) cam.x = (b.minX + b.maxX) / 2;
  else cam.x = Math.min(b.maxX - halfW, Math.max(b.minX + halfW, cam.x));
  if (b.maxY - b.minY <= halfH * 2) cam.y = (b.minY + b.maxY) / 2;
  else cam.y = Math.min(b.maxY - halfH, Math.max(b.minY + halfH, cam.y));
  cam.x = Math.round(cam.x);
  cam.y = Math.round(cam.y);
}

/** 平移。dx、dy 是螢幕上拖曳的邏輯像素。 */
export function panCamera(cam, dx, dy) {
  cam.x -= dx / cam.zoom;
  cam.y -= dy / cam.zoom;
  clampCamera(cam);
}

/** 設定縮放（只接受 1 或 2）。(sx, sy) 是縮放中心的螢幕座標，縮放後它對到的世界位置不變。 */
export function zoomCamera(cam, zoom, sx, sy) {
  const z = zoom >= 2 ? 2 : 1;
  if (z === cam.zoom) return;
  const before = screenToWorld(cam, sx ?? cam.view.x + cam.view.w / 2, sy ?? cam.view.y + cam.view.h / 2);
  cam.zoom = z;
  const after = screenToWorld(cam, sx ?? cam.view.x + cam.view.w / 2, sy ?? cam.view.y + cam.view.h / 2);
  cam.x += before.x - after.x;
  cam.y += before.y - after.y;
  clampCamera(cam);
}

export function worldToScreen(cam, wx, wy) {
  return {
    x: cam.view.x + cam.view.w / 2 + (wx - cam.x) * cam.zoom,
    y: cam.view.y + cam.view.h / 2 + (wy - cam.y) * cam.zoom,
  };
}

export function screenToWorld(cam, sx, sy) {
  return {
    x: cam.x + (sx - cam.view.x - cam.view.w / 2) / cam.zoom,
    y: cam.y + (sy - cam.view.y - cam.view.h / 2) / cam.zoom,
  };
}

/** 把相機中心移到指定的世界座標。 */
export function centerCamera(cam, wx, wy) {
  cam.x = wx;
  cam.y = wy;
  clampCamera(cam);
}
