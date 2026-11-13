#!/usr/bin/env bash
# Builds the self-contained demo (in-browser demo data, no server needed) into build-demo/.
# Used by the published demo page and by the Android APK (android-app/).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
TMP=$(mktemp -d)
cp src/App.js "$TMP/App.js"; cp src/index.js "$TMP/index.js"
restore() { cp "$TMP/App.js" "$ROOT/src/App.js"; cp "$TMP/index.js" "$ROOT/src/index.js"; }
trap restore EXIT
# Hash routes and no service worker: the demo runs from a static folder or inside a WebView.
sed -i 's/BrowserRouter/HashRouter/g' src/App.js
sed -i 's/^serviceWorkerRegistration.register({/serviceWorkerRegistration.unregister(); (() => ({/; s/^});$/}))();/' src/index.js
rm -rf build-demo
GENERATE_SOURCEMAP=false PUBLIC_URL=. BUILD_PATH=build-demo npx react-scripts build
cd build-demo
find . -name "service-worker*" -delete
find . -name "*.LICENSE.txt" -delete
python3 - <<'PY'
import re
s = open('index.html').read()
s = s.replace('<head>', '<head><script>' + open('../demo/demo-shim.js').read() + '</script>', 1)
s = re.sub(r'<title>.*?</title>', '<title>AgroSyntra Management</title>', s)
open('index.html', 'w').write(s)
PY
echo "build-demo ready"
