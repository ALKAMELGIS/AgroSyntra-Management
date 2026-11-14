import { useEffect, useMemo, useState } from 'react';
import {
  Box, Paper, Typography, IconButton, Button, Collapse, CircularProgress, Divider, Link,
} from '@mui/material';
import {
  Close as CloseIcon, ExpandMore as ExpandIcon, ExpandLess as CollapseIcon,
  Link as LinkIcon, InfoOutlined as InfoIcon,
} from '@mui/icons-material';
import { API_BASE, getAuthHeaders } from '../../config/api';

/**
 * Side card for a clicked map feature (e.g. an Agro_Structures polygon).
 *
 * The business key ZONE_ID + Farm_Code comes first, because it is what ties the
 * ArcGIS geometry to the AgroCloud field and, through the field, to every form
 * record (FORM_ID). Below it: the main attributes, the forms recorded on the
 * linked field, and the full attribute list on demand.
 */

const pick = (props, names) => {
  const keys = Object.keys(props || {});
  for (const n of names) {
    const k = keys.find((key) => key.toLowerCase() === n.toLowerCase());
    if (k && props[k] !== null && props[k] !== undefined && props[k] !== '') return { key: k, value: props[k] };
  }
  return null;
};

const show = (v) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

// Attributes worth reading first, in this order; the rest sit under "All attributes".
const MAIN = [
  ['Farm name', ['Farm_Name', 'field_name', 'name']],
  ['Site', ['Site_Code', 'SITE', 'site']],
  ['Structure type', ['Structure_Type', 'structure_type', 'type']],
  ['Category', ['Farm_Category', 'Category']],
  ['Area (ha)', ['Area_ha', 'area_ha', 'area']],
  ['Region', ['Region']],
];

export default function FeatureInfoPanel({ feature, styler, onClose, onViewField, onLink, canEdit, rtl }) {
  // Coded values (e.g. Structure_Type 2) read as their ArcGIS labels.
  const lab = (k, v) => (styler && k ? styler.label(k, v) : v);
  const props = useMemo(() => feature?.properties || {}, [feature]);
  const zone = pick(props, ['ZONE_ID', 'zone_id', 'zone']);
  const code = pick(props, ['Farm_Code', 'farm_code']);
  const globalId = pick(props, ['GlobalID', 'global_id']);
  const name = pick(props, ['Farm_Name', 'field_name', 'name', 'NAME']);
  const linkKey = zone && code ? `${String(zone.value).toUpperCase()}|${String(code.value).toUpperCase()}` : null;
  const site = pick(props, ['Site_Code', 'SITE', 'site_code']);
  const siteKey = zone && site ? `${String(zone.value).toUpperCase()}|${String(site.value).toUpperCase()}` : null;

  const [forms, setForms] = useState(null); // null = loading, {error} or API result
  const [showAll, setShowAll] = useState(false);
  const [siteData, setSiteData] = useState(null);
  const [siteOpen, setSiteOpen] = useState(false);

  // One-to-many: ZONE_ID + SITE → the AgroCloud site, its fields and their records.
  useEffect(() => {
    if (!zone || !site) { setSiteData({ error: 'none' }); return undefined; }
    let live = true;
    setSiteData(null);
    const qs = new URLSearchParams({ zone_id: String(zone.value), site_code: String(site.value), records: '0' });
    fetch(`${API_BASE}/gis/sites/forms?${qs.toString()}`, { headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } })
      .then((r) => r.json())
      .then((d) => { if (live) setSiteData(d?.success ? d.data : { error: d?.error?.message || 'Request failed' }); })
      .catch((e) => { if (live) setSiteData({ error: e.message }); });
    return () => { live = false; };
  }, [zone?.value, site?.value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const qs = new URLSearchParams();
    if (zone && code) { qs.set('zone_id', String(zone.value)); qs.set('farm_code', String(code.value)); }
    else if (globalId) qs.set('global_id', String(globalId.value));
    else { setForms({ error: 'none' }); return undefined; }
    qs.set('records', '3');
    let live = true;
    setForms(null);
    fetch(`${API_BASE}/gis/features/forms?${qs.toString()}`, { headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } })
      .then((r) => r.json())
      .then((d) => { if (live) setForms(d?.success ? d.data : { error: d?.error?.message || 'Request failed' }); })
      .catch((e) => { if (live) setForms({ error: e.message }); });
    return () => { live = false; };
  }, [zone?.value, code?.value, globalId?.value]); // eslint-disable-line react-hooks/exhaustive-deps

  const mainRows = MAIN.map(([label, names]) => [label, pick(props, names)]).filter(([, v]) => v);
  const mainKeys = new Set([zone?.key, code?.key, ...mainRows.map(([, v]) => v.key)]);
  const restRows = Object.entries(props).filter(([k]) => !k.startsWith('_') && !mainKeys.has(k));
  const linkedField = forms?.fields?.[0] || null;
  const linkedFieldId = props._linkedFieldId || linkedField?.field_id;

  const row = (label, value, key) => (
    <Box key={key || label} sx={{ display: 'contents' }}>
      <Typography component="dt" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{label}</Typography>
      <Typography component="dd" sx={{ m: 0, fontSize: '0.8125rem', minWidth: 0, overflowWrap: 'anywhere' }}><bdi>{show(lab(key, value))}</bdi></Typography>
    </Box>
  );

  return (
    <Paper
      variant="outlined"
      role="region"
      aria-label="Feature info"
      sx={{
        position: 'absolute', bottom: 12, insetInlineEnd: 12, zIndex: 1000,
        // Below the zoom buttons (top corner), so the card never covers them.
        width: { xs: 'calc(100% - 24px)', sm: 340 }, maxHeight: { xs: '52%', sm: 'calc(100% - 104px)' },
        overflow: 'auto', display: 'flex', flexDirection: 'column', boxShadow: '0 4px 16px rgba(18,23,20,0.12)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, p: 3, pb: 2 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="h2" sx={{ fontSize: '0.9375rem', fontWeight: 600 }} noWrap>
            <bdi>{name ? show(lab(name.key, name.value)) : 'Feature'}</bdi>
          </Typography>
          {linkKey ? (
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.5 }}>
              <bdi translate="no" dir="ltr">ZONE_ID + Farm_Code</bdi>{' · '}
              <bdi translate="no" dir="ltr" style={{ color: 'inherit', fontFamily: 'var(--font-mono, monospace)' }}>{linkKey}</bdi>
            </Typography>
          ) : (
            <Typography sx={{ fontSize: '0.75rem', color: 'warning.dark', mt: 0.5 }}>No ZONE_ID + Farm_Code on this feature</Typography>
          )}
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close"><CloseIcon fontSize="small" /></IconButton>
      </Box>

      <Box component="dl" sx={{ m: 0, px: 3, pb: 3, display: 'grid', gridTemplateColumns: 'minmax(96px, auto) minmax(0, 1fr)', columnGap: 3, rowGap: 1.5 }}>
        {zone && row('Zone', zone.value, zone.key)}
        {code && row('Farm code', code.value, code.key)}
        {mainRows.map(([label, v]) => row(label, v.value, v.key))}
      </Box>

      <Divider />
      <Box sx={{ p: 3, display: 'grid', gap: 2 }}>
        <Typography component="h3" sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>Forms on this field</Typography>
        {forms === null && <CircularProgress size={18} aria-label="Loading" />}
        {forms?.error && forms.error !== 'none' && <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{forms.error}</Typography>}
        {forms && !forms.error && (
          <>
            {linkedField ? (
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }} translate="no">
                {[linkedField.zone_code, linkedField.site_name, linkedField.farm_area_name, linkedField.field_name].filter(Boolean).join(' › ')}
              </Typography>
            ) : (
              <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>Not linked to a field yet</Typography>
            )}
            {(forms.forms || []).length === 0 && linkedField && (
              <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>No records yet</Typography>
            )}
            {(forms.forms || []).length > 0 && (
              <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, border: 1, borderColor: 'divider' }}>
                {forms.forms.map((f) => {
                  const last = (f.records || []).map((r) => String(r.record_date || '').slice(0, 10)).filter(Boolean).sort().pop();
                  return (
                    <Box component="li" key={f.form_id} sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1.5, '& + &': { borderTop: 1, borderColor: 'divider' } }}>
                      <Typography sx={{ fontSize: '0.8125rem', flex: 1, minWidth: 0 }} noWrap>{rtl && f.title_ar ? f.title_ar : f.title_en}</Typography>
                      {last && <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}><bdi>{last}</bdi></Typography>}
                      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{f.record_count}</Typography>
                    </Box>
                  );
                })}
              </Box>
            )}
          </>
        )}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {linkedFieldId ? (
            <Button size="small" variant="contained" startIcon={<InfoIcon />} onClick={() => onViewField(linkedFieldId)}>View field data</Button>
          ) : canEdit && (
            <Button size="small" variant="outlined" startIcon={<LinkIcon />} onClick={onLink}>Link to field / area</Button>
          )}
        </Box>
      </Box>

      {siteKey && (
        <>
          <Divider />
          <Box sx={{ p: 3, display: 'grid', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2 }}>
              <Typography component="h3" sx={{ fontSize: '0.8125rem', fontWeight: 600 }}>Site records</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                <bdi translate="no" dir="ltr">ZONE_ID + SITE</bdi>{' · '}
                <bdi translate="no" dir="ltr" style={{ fontFamily: 'var(--font-mono, monospace)' }}>{siteKey}</bdi>
              </Typography>
            </Box>
            {siteData === null && <CircularProgress size={18} aria-label="Loading" />}
            {siteData?.error && siteData.error !== 'none' && <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>{siteData.error}</Typography>}
            {siteData && !siteData.error && (
              siteData.field_count === 0 ? (
                <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>No AgroCloud site matches this ZONE_ID + SITE yet</Typography>
              ) : (
                <>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', border: 1, borderColor: 'divider' }}>
                    {[
                      ['Site', siteData.site?.site_name || '—'],
                      ['Fields', siteData.field_count],
                      ['Records', (siteData.forms || []).reduce((n, f) => n + (Number(f.record_count) || 0), 0)],
                    ].map(([k, v], i) => (
                      <Box key={k} sx={{ px: 2, py: 1.5, borderInlineStart: i ? 1 : 0, borderColor: 'divider', minWidth: 0 }}>
                        <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}>{k}</Typography>
                        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }} noWrap><bdi>{v}</bdi></Typography>
                      </Box>
                    ))}
                  </Box>
                  {(siteData.forms || []).length > 0 && (
                    <>
                      <Link component="button" type="button" underline="none" onClick={() => setSiteOpen((v) => !v)} aria-expanded={siteOpen}
                        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'text.secondary', width: '100%' }}>
                        <span><span>Forms on this site</span> <bdi>({siteData.forms.length})</bdi></span>
                        {siteOpen ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
                      </Link>
                      <Collapse in={siteOpen} unmountOnExit>
                        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, border: 1, borderColor: 'divider' }}>
                          {siteData.forms.map((f) => (
                            <Box component="li" key={f.form_id} sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 1.5, '& + &': { borderTop: 1, borderColor: 'divider' } }}>
                              <Typography sx={{ fontSize: '0.8125rem', flex: 1, minWidth: 0 }} noWrap>{rtl && f.title_ar ? f.title_ar : f.title_en}</Typography>
                              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{f.record_count}</Typography>
                            </Box>
                          ))}
                        </Box>
                      </Collapse>
                    </>
                  )}
                </>
              )
            )}
          </Box>
        </>
      )}

      {restRows.length > 0 && (
        <>
          <Divider />
          <Link
            component="button"
            type="button"
            underline="none"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 3, py: 2, fontSize: '0.8125rem', color: 'text.secondary', width: '100%' }}
          >
            <span><span>All attributes</span> <bdi>({restRows.length})</bdi></span>
            {showAll ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
          </Link>
          <Collapse in={showAll} unmountOnExit>
            <Box component="dl" sx={{ m: 0, px: 3, pb: 3, display: 'grid', gridTemplateColumns: 'minmax(96px, auto) minmax(0, 1fr)', columnGap: 3, rowGap: 1.5 }}>
              {restRows.map(([k, v]) => row(<span translate="no">{styler ? styler.alias(k) : k}</span>, v, k))}
            </Box>
          </Collapse>
        </>
      )}
    </Paper>
  );
}
