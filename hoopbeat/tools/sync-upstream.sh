#!/usr/bin/env bash
# 把 hoops／loops 分支的新版合併進 hoopbeat。
#   hoops：三方合併（base = 上次複製的版本、mine = hoopbeat/src/hoops、theirs = 新版），保留標了 HOOPBEAT 的修改。
#   loops：hoopbeat 沒改過這些檔案，直接覆蓋。
# 用法：bash hoopbeat/tools/sync-upstream.sh <hoops 的 commit> <loops 的 commit>
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
HB=hoopbeat
NEW_HOOPS=${1:?hoops commit}
NEW_LOOPS=${2:?loops commit}
BASE_HOOPS=$(cat $HB/src/hoops/SOURCE_COMMIT)
TMP=$(mktemp -d)
conflicts=0
for f in $(git ls-tree -r --name-only "$NEW_HOOPS" hoops/src | sed 's#^hoops/src/##'); do
  [ "$f" = "main.js" ] && continue
  mine="$HB/src/hoops/$f"
  git show "$NEW_HOOPS:hoops/src/$f" > "$TMP/theirs"
  if git cat-file -e "$BASE_HOOPS:hoops/src/$f" 2>/dev/null; then git show "$BASE_HOOPS:hoops/src/$f" > "$TMP/base"; else : > "$TMP/base"; fi
  if [ ! -f "$mine" ]; then mkdir -p "$(dirname "$mine")"; cp "$TMP/theirs" "$mine"; echo "新增 $f"; continue; fi
  if git merge-file -L hoopbeat -L base -L hoops "$mine" "$TMP/base" "$TMP/theirs"; then :; else
    echo "衝突：$f"; conflicts=$((conflicts + 1)); fi
done
for f in $(git ls-tree --name-only "$NEW_HOOPS" hoops/vendor/); do git show "$NEW_HOOPS:$f" > "$HB/vendor/$(basename "$f")"; done
echo "$(git rev-parse --short "$NEW_HOOPS")" > $HB/src/hoops/SOURCE_COMMIT
for f in genres generator rng theory synth mixer player song transport project wav; do
  git show "$NEW_LOOPS:loops/src/$f.js" > "$HB/src/loops/$f.js"
done
echo "$(git rev-parse --short "$NEW_LOOPS")" > $HB/src/loops/SOURCE_COMMIT
rm -rf "$TMP"
echo "hoops $BASE_HOOPS → $(cat $HB/src/hoops/SOURCE_COMMIT)、loops → $(cat $HB/src/loops/SOURCE_COMMIT)、衝突 $conflicts 個"
exit $conflicts
