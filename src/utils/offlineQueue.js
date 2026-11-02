/**
 * Offline mutation queue backed by IndexedDB.
 *
 * When the browser is offline (or the network request throws a
 * connection error), JSON mutations are persisted here instead of
 * failing. A foreground worker drains the queue as soon as the
 * browser regains network, or when the user clicks "Retry now".
 *
 * Why IndexedDB rather than localStorage:
 *   - localStorage is synchronous and blocks the UI thread on every
 *     write, which hurts scout-form ergonomics.
 *   - localStorage has a ~5MB limit shared with everything else on
 *     the origin; IndexedDB has a generous per-origin quota that
 *     handles a week's worth of queued scouting reports without
 *     stress.
 *   - IndexedDB also survives Safari's aggressive "clean up small
 *     stores" behaviour under low-disk conditions better.
 *
 * Why foreground-only instead of a Service Worker Background Sync:
 *   - Safari / iOS PWAs do not implement Background Sync.
 *   - Our target users often keep the tab open while walking the
 *     greenhouse; a foreground retry on `online` is enough.
 *   - Simpler mental model: "reload the tab and everything flushes"
 *     is easier to explain than service-worker lifecycle rules.
 *
 * Limitations (by design, for this prototype):
 *   - Only JSON request bodies are queued. FormData / file uploads
 *     cannot round-trip through IndexedDB reliably (browsers don't
 *     guarantee `File` objects survive structured-cloning across
 *     all browsers), so we fail them fast with a clear message and
 *     let the caller decide how to degrade.
 *   - Idempotency is the server's job: every mutation endpoint that
 *     is queueable should be safe to replay. Today, scouting-report
 *     create, harvest entry create, and ecph create all satisfy
 *     that (either via ON CONFLICT or tolerant upserts).
 */

// We share one IndexedDB database across two object stores:
//   - `mutations`       → the new generic queue used by apiRequest /
//                         OfflineQueueBanner. Holds {endpoint, method,
//                         body, createdAt, retries, lastError}.
//   - `pending_entries` → the legacy form-specific queue used by the
//                         original HarvestEntry / ECPHEntry /
//                         FertigationEntry pages + OfflineBanner.
//                         Holds {type: 'harvest'|'ecph'|'fertigation',
//                         data, queuedAt}. Its contents survive from
//                         the previous deploy so we keep the shape
//                         intact.
// Bumping the version to 2 adds the `mutations` store without
// touching pre-existing data in `pending_entries`.
const DB_NAME = 'almaha_offline';
const DB_VERSION = 2;
const STORE = 'mutations';
const LEGACY_STORE = 'pending_entries';

let dbPromise = null;

function resetDbConnection() {
  dbPromise = null;
}

function isDbClosingError(err) {
  if (!err) return false;
  if (err.name === 'InvalidStateError') return true;
  const msg = err.message || '';
  return msg.includes('connection is closing') || msg.includes('database connection is closing');
}

function attachDbLifecycleHandlers(db) {
  db.onversionchange = () => {
    db.close();
    resetDbConnection();
  };
  db.onclose = () => {
    resetDbConnection();
  };
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resetDbConnection();
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // New store for the generic queue.
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt');
      }
      // Keep the legacy store shape identical so no prior scout
      // loses their unsynced harvest/ecph/fertigation rows during
      // this upgrade.
      if (!db.objectStoreNames.contains(LEGACY_STORE)) {
        db.createObjectStore(LEGACY_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      attachDbLifecycleHandlers(db);
      resolve(db);
    };
    req.onerror = () => {
      resetDbConnection();
      reject(req.error);
    };
  });
  return dbPromise;
}

function runStoreTx(storeName, mode, fn, attempt = 0) {
  return openDb().then((db) =>
    new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(storeName, mode);
      } catch (err) {
        reject(err);
        return;
      }
      const store = tx.objectStore(storeName);
      let result;
      Promise.resolve(fn(store))
        .then((r) => { result = r; })
        .catch(reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }),
  ).catch((err) => {
    if (isDbClosingError(err) && attempt < 2) {
      resetDbConnection();
      return runStoreTx(storeName, mode, fn, attempt + 1);
    }
    throw err;
  });
}

function runTx(mode, fn) {
  return runStoreTx(STORE, mode, fn);
}

/**
 * Push a mutation onto the queue. Returns the stored id.
 */
export function enqueueMutation(entry) {
  const record = {
    ...entry,
    createdAt: Date.now(),
    retries: 0,
    lastError: null,
  };
  return runTx('readwrite', (store) =>
    new Promise((resolve, reject) => {
      const req = store.add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }),
  ).then((id) => {
    notifyListeners();
    return id;
  });
}

export function listQueue() {
  return runTx('readonly', (store) =>
    new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    }),
  );
}

export function deleteQueueItem(id) {
  return runTx('readwrite', (store) => store.delete(id)).then(notifyListeners);
}

export async function updateQueueItem(id, patch) {
  await runTx('readwrite', (store) =>
    new Promise((resolve, reject) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const cur = getReq.result;
        if (!cur) { resolve(); return; }
        const next = { ...cur, ...patch };
        const putReq = store.put(next);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    }),
  );
  notifyListeners();
}

export async function queueCount() {
  const items = await listQueue();
  return items.length;
}

// ── Subscribers (React can hook into these to re-render the badge)

const listeners = new Set();
function notifyListeners() {
  for (const cb of listeners) {
    try { cb(); } catch { /* ignore subscriber errors */ }
  }
}
export function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ─── Legacy form-queue API ────────────────────────────────────────────
//
// Retained so the existing OfflineBanner component plus the three
// entry pages (HarvestEntry, ECPHEntry, FertigationEntry) keep
// compiling and keep their previously-queued offline data intact.
//
// This store is entirely independent of the generic `mutations`
// store above — it holds typed entries that sync via the
// `/sync/batch` backend endpoint. Do not use this for new code;
// prefer the generic queue (enqueueMutation) which auto-captures
// any network failure in the api.js layer.

export async function queueEntry(entry) {
  return runStoreTx(LEGACY_STORE, 'readwrite', (store) =>
    new Promise((resolve, reject) => {
      const req = store.add({
        ...entry,
        queuedAt: new Date().toISOString(),
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }),
  );
}

export async function getPendingEntries() {
  return runStoreTx(LEGACY_STORE, 'readonly', (store) =>
    new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    }),
  );
}

export async function getPendingCount() {
  const entries = await getPendingEntries();
  return entries.length;
}

export async function clearEntry(id) {
  return runStoreTx(LEGACY_STORE, 'readwrite', (store) => store.delete(id));
}

export async function clearAll() {
  return runStoreTx(LEGACY_STORE, 'readwrite', (store) => store.clear());
}

export async function syncPendingEntries(apiRequest) {
  const entries = await getPendingEntries();
  if (entries.length === 0) return { synced: 0, failed: 0 };

  const harvests = entries.filter((e) => e.type === 'harvest');
  const fertigations = entries.filter((e) => e.type === 'fertigation');
  const ecph = entries.filter((e) => e.type === 'ecph');

  const payload = {};
  if (harvests.length) payload.harvests = harvests.map((e) => e.data);
  if (fertigations.length) payload.fertigations = fertigations.map((e) => e.data);
  if (ecph.length) payload.ecph = ecph.map((e) => e.data);

  let synced = 0;
  let failed = 0;

  try {
    const result = await apiRequest('/sync/batch', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    for (const entry of entries) {
      try {
        await clearEntry(entry.id);
        synced++;
      } catch {
        failed++;
      }
    }

    return { synced, failed, result };
  } catch (err) {
    return { synced: 0, failed: entries.length, error: err.message };
  }
}
