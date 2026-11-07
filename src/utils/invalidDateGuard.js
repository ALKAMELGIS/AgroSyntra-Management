/**
 * A record with a missing or malformed date used to print "Invalid Date" in
 * tables and cards across the app (new Date(undefined).toLocaleDateString()).
 * Staff read that as broken data. An empty cell says the same thing honestly,
 * so invalid dates render as '' everywhere. Valid dates are untouched: the
 * format each page already uses stays exactly as it was.
 */
const METHODS = ['toLocaleDateString', 'toLocaleString', 'toLocaleTimeString', 'toDateString'];

export default function installInvalidDateGuard() {
  if (typeof Date === 'undefined' || Date.prototype.__invalidDateGuard) return;
  METHODS.forEach((name) => {
    const original = Date.prototype[name];
    if (typeof original !== 'function') return;
    // eslint-disable-next-line no-extend-native
    Date.prototype[name] = function guarded(...args) {
      return Number.isNaN(this.getTime()) ? '' : original.apply(this, args);
    };
  });
  Object.defineProperty(Date.prototype, '__invalidDateGuard', { value: true });
}
