import { Fragment } from 'react';
import { Box, Typography } from '@mui/material';

/**
 * Small Markdown renderer for assistant answers: headings, paragraphs, bold,
 * italics, inline code, bullet / numbered lists and pipe tables. No HTML is
 * ever injected; everything becomes React text nodes.
 */
function inline(text, keyBase) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let m;
  let i = 0;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i += 1}`;
    if (tok.startsWith('**')) parts.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) parts.push(<Box key={key} component="code" sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.85em', px: 0.5, borderRadius: 0.5, bgcolor: 'action.hover' }}>{tok.slice(1, -1)}</Box>);
    else parts.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function MiniMarkdown({ text }) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      blocks.push(<Typography key={i} sx={{ fontWeight: 700, fontSize: h[1].length <= 2 ? '1rem' : '0.9375rem', mt: 1, mb: 0.5 }}>{inline(h[2], i)}</Typography>);
      i += 1; continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const row = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = row(line);
      const body = [];
      const tKey = i;
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { body.push(row(lines[i])); i += 1; }
      blocks.push(
        <Box key={`t${tKey}`} sx={{ overflowX: 'auto', my: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Box component="table" sx={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.8125rem', '& th, & td': { px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', textAlign: 'start', whiteSpace: 'nowrap' }, '& th': { bgcolor: 'action.hover', fontWeight: 600 } }}>
            <thead><tr>{head.map((c, k) => <th key={k}>{inline(c, `h${k}`)}</th>)}</tr></thead>
            <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, k) => <td key={k}>{inline(c, `c${ri}-${k}`)}</td>)}</tr>)}</tbody>
          </Box>
        </Box>,
      );
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items = [];
      const lKey = i;
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
        i += 1;
      }
      blocks.push(
        <Box key={`l${lKey}`} component={ordered ? 'ol' : 'ul'} sx={{ my: 0.5, ps: 2.5, pl: 2.5, '& li': { mb: 0.25 } }}>
          {items.map((it, k) => <li key={k}>{inline(it, `li${lKey}-${k}`)}</li>)}
        </Box>,
      );
      continue;
    }
    const para = [line];
    const pKey = i;
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*([-*•]|\d+[.)])\s|\s*\|)/.test(lines[i])) { para.push(lines[i]); i += 1; }
    blocks.push(
      <Typography key={`p${pKey}`} component="p" sx={{ fontSize: '0.875rem', lineHeight: 1.65, my: 0.5 }}>
        {para.map((p, k) => <Fragment key={k}>{k > 0 && <br />}{inline(p, `p${pKey}-${k}`)}</Fragment>)}
      </Typography>,
    );
  }
  return <Box sx={{ '& > :first-of-type': { mt: 0 } }}>{blocks}</Box>;
}
