import { translateUi } from './pageLabels';

/**
 * Applies the Arabic interface wording (pageLabels.js) to page text that is
 * still written in English inside the page components: buttons, column headers,
 * field labels, chips, empty states, placeholders and accessible names.
 *
 * Only exact, known interface strings are replaced, so names, numbers and
 * anything staff typed stay as entered. Inputs, editable areas, code and
 * anything marked data-no-translate / translate="no" are never touched.
 * Switching back to English restores every original string.
 */
const ATTRS = ['placeholder', 'aria-label', 'title'];
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'KBD', 'NOSCRIPT']);

let observer = null;
const originalText = new Map(); // Text node -> English
const originalAttr = new Map(); // Element -> { attr: English }

const FIELD_TAGS = new Set(['INPUT', 'TEXTAREA']);

/** forAttrs: an input's own placeholder / label is interface text, its value is not. */
function skipped(el, forAttrs = false) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    if (SKIP_TAGS.has(n.tagName) && !(forAttrs && n === el && FIELD_TAGS.has(n.tagName))) return true;
    if (n.isContentEditable) return true;
    if (n.hasAttribute('data-no-translate') || n.getAttribute('translate') === 'no') return true;
  }
  return false;
}

function translateTextNode(node) {
  const value = node.nodeValue;
  if (!value || !/[A-Za-z]/.test(value)) return;
  const parent = node.parentElement;
  if (!parent || skipped(parent)) return;
  const ar = translateUi(value);
  if (ar == null || ar === value) return;
  if (originalText.size > 4000) originalText.forEach((_, n) => { if (!n.isConnected) originalText.delete(n); });
  originalText.set(node, value);
  node.nodeValue = ar;
}

function translateAttrs(el) {
  if (skipped(el, true)) return;
  for (const attr of ATTRS) {
    const value = el.getAttribute(attr);
    if (!value || !/[A-Za-z]/.test(value)) continue;
    const ar = translateUi(value);
    if (ar == null || ar === value) continue;
    const saved = originalAttr.get(el) || {};
    saved[attr] = value;
    originalAttr.set(el, saved);
    el.setAttribute(attr, ar);
  }
}

function translateTree(root) {
  if (root.nodeType === 3) { translateTextNode(root); return; }
  if (root.nodeType !== 1 || skipped(root, true)) return;
  translateAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === 1 && SKIP_TAGS.has(n.tagName) && !FIELD_TAGS.has(n.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 3) translateTextNode(n);
    else translateAttrs(n);
  }
}

function onMutations(records) {
  for (const r of records) {
    if (r.type === 'characterData') translateTextNode(r.target);
    else if (r.type === 'attributes') translateAttrs(r.target);
    else r.addedNodes.forEach(translateTree);
  }
}

export function enableAutoTranslate() {
  if (observer || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  translateTree(document.body);
  observer = new MutationObserver(onMutations);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
}

export function disableAutoTranslate() {
  if (observer) { observer.disconnect(); observer = null; }
  originalText.forEach((en, node) => {
    if (node.isConnected && translateUi(en) === node.nodeValue) node.nodeValue = en;
  });
  originalAttr.forEach((saved, el) => {
    if (!el.isConnected) return;
    Object.entries(saved).forEach(([attr, en]) => {
      if (el.getAttribute(attr) === translateUi(en)) el.setAttribute(attr, en);
    });
  });
  originalText.clear();
  originalAttr.clear();
}
