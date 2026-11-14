/**
 * Draw an ArcGIS feature layer the way ArcGIS Online does: its own renderer
 * (simple, unique value or class breaks), its transparency, and coded-value
 * labels for attributes.
 *
 *   const s = makeArcgisStyler(meta);   // meta = layer metadata (f=json shape)
 *   style={(f) => s.style(f)}  legend={s.legend}  s.label('Structure_Type', 2)
 *
 * Features keep their raw coded values (that is what the renderer matches on);
 * labels are decoded only for display.
 */

const PT = 4 / 3; // ArcGIS symbol widths are points; Leaflet wants pixels.

const rgba = (c) => (Array.isArray(c) ? `rgba(${c[0]},${c[1]},${c[2]},${((c[3] ?? 255) / 255).toFixed(3)})` : null);
const hex = (c) => (Array.isArray(c) ? `#${c.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('')}` : null);
const alphaOf = (c) => (Array.isArray(c) ? (c[3] ?? 255) / 255 : 1);

/** Esri symbol JSON → Leaflet path options. */
export function symbolToStyle(sym, transparency = 0) {
  const keep = 1 - Math.min(Math.max(Number(transparency) || 0, 0), 100) / 100;
  if (!sym) return { color: '#3388ff', weight: 1.5, opacity: keep, fillColor: '#3388ff', fillOpacity: 0.25 * keep };
  const type = sym.type || '';
  if (type === 'esriSLS') {
    return { color: hex(sym.color) || '#3388ff', opacity: alphaOf(sym.color) * keep, weight: Math.max(0.5, (sym.width ?? 1) * PT), fill: false,
      dashArray: /Dash/.test(sym.style || '') ? '6 4' : /Dot/.test(sym.style || '') ? '2 4' : undefined };
  }
  if (type === 'esriSMS') {
    const o = sym.outline || {};
    return { radius: Math.max(3, (sym.size ?? 8) * PT / 2), fillColor: hex(sym.color) || '#3388ff', fillOpacity: alphaOf(sym.color) * keep,
      color: hex(o.color) || '#ffffff', opacity: alphaOf(o.color) * keep, weight: Math.max(0.5, (o.width ?? 1) * PT) };
  }
  // esriSFS (and anything else with fill + outline)
  const o = sym.outline || {};
  const noFill = sym.style === 'esriSFSNull' || !sym.color;
  const noLine = !o.color || o.style === 'esriSLSNull';
  return {
    fillColor: hex(sym.color) || '#000000',
    fillOpacity: noFill ? 0 : alphaOf(sym.color) * keep,
    color: hex(o.color) || '#000000',
    opacity: noLine ? 0 : alphaOf(o.color) * keep,
    weight: noLine ? 0 : Math.max(0.5, (o.width ?? 0.75) * PT),
    stroke: !noLine,
  };
}

function swatch(sym, transparency) {
  const s = symbolToStyle(sym, transparency);
  const keep = 1 - (Number(transparency) || 0) / 100;
  if (sym?.type === 'esriSLS') return { color: rgba(sym.color) || s.color, shape: 'line' };
  return {
    color: sym?.color && sym.style !== 'esriSFSNull' ? `rgba(${sym.color[0]},${sym.color[1]},${sym.color[2]},${(alphaOf(sym.color) * keep).toFixed(3)})` : 'transparent',
    stroke: s.stroke === false ? 'transparent' : (sym?.outline?.color ? rgba(sym.outline.color) : s.color),
    shape: sym?.type === 'esriSMS' ? 'dot' : 'fill',
  };
}

export function makeArcgisStyler(meta) {
  const renderer = meta?.drawingInfo?.renderer || null;
  const transparency = meta?.drawingInfo?.transparency || 0;

  // Coded-value domains + subtypes → labels.
  const domains = {};
  for (const f of meta?.fields || []) {
    const cv = Array.isArray(f.domain) ? f.domain : f.domain?.codedValues;
    if (cv) domains[f.name] = Object.fromEntries(cv.map((c) => [String(c.code), c.name]));
  }
  if (meta?.typeIdField && meta?.types?.length) {
    domains[meta.typeIdField] = { ...(domains[meta.typeIdField] || {}), ...Object.fromEntries(meta.types.map((t) => [String(t.id), t.name])) };
  }
  const aliases = Object.fromEntries((meta?.fields || []).map((f) => [f.name, f.alias || f.name]));
  const label = (field, value) => {
    if (value === null || value === undefined) return value;
    const d = domains[field];
    return d && d[String(value)] !== undefined ? d[String(value)] : value;
  };
  const prop = (props, name) => {
    if (!name || !props) return undefined;
    if (name in props) return props[name];
    const k = Object.keys(props).find((key) => key.toLowerCase() === String(name).toLowerCase());
    return k ? props[k] : undefined;
  };

  let pickSymbol = () => null;
  let legend = [];

  if (renderer?.type === 'simple') {
    pickSymbol = () => renderer.symbol;
    legend = [{ label: renderer.label || meta?.name || 'Features', ...swatch(renderer.symbol, transparency) }];
  } else if (renderer?.type === 'uniqueValue') {
    const fields = [renderer.field1, renderer.field2, renderer.field3].filter(Boolean);
    const delim = renderer.fieldDelimiter || ',';
    const infos = renderer.uniqueValueInfos
      || (renderer.uniqueValueGroups || []).flatMap((g) => (g.classes || []).map((c) => ({ value: (c.values?.[0] || []).join(delim), label: c.label, symbol: c.symbol })));
    const byValue = new Map(infos.map((i) => [String(i.value), i]));
    pickSymbol = (props) => {
      const key = fields.map((f) => prop(props, f)).map((v) => (v === null || v === undefined ? '<Null>' : String(v))).join(delim);
      return byValue.get(key)?.symbol || renderer.defaultSymbol || null;
    };
    legend = infos.map((i) => ({ label: i.label || String(label(fields[0], i.value)), ...swatch(i.symbol, transparency) }));
    if (renderer.defaultSymbol) legend.push({ label: renderer.defaultLabel || 'Other', ...swatch(renderer.defaultSymbol, transparency) });
  } else if (renderer?.type === 'classBreaks') {
    const infos = [...(renderer.classBreakInfos || [])].sort((a, b) => a.classMaxValue - b.classMaxValue);
    const min = renderer.minValue ?? -Infinity;
    pickSymbol = (props) => {
      const v = Number(prop(props, renderer.field));
      if (!Number.isFinite(v) || v < min) return renderer.defaultSymbol || null;
      return (infos.find((i) => v <= i.classMaxValue) || {}).symbol || renderer.defaultSymbol || null;
    };
    legend = infos.map((i) => ({ label: i.label || `≤ ${i.classMaxValue}`, ...swatch(i.symbol, transparency) }));
  }

  return {
    hasRenderer: !!renderer,
    style: (feature) => symbolToStyle(pickSymbol(feature?.properties || {}), transparency),
    legend,
    label,
    alias: (field) => aliases[field] || field,
  };
}
