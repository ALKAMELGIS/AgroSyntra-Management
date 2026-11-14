import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Tab, Tabs } from '@mui/material';
import { EditNoteOutlined as EntryIcon, TableRowsOutlined as RecordsIcon } from '@mui/icons-material';

/**
 * Entry pages: "Data entry" and "Records" as two tabs, so the form is not
 * followed by a long table. The tab lives in the URL (?tab=records) so a link,
 * the back button and a reload keep it.
 */
export function useEntryTab() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'records' ? 'records' : 'entry';
  const setTab = useCallback((next) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'records') p.set('tab', 'records'); else p.delete('tab');
      return p;
    }, { replace: true });
  }, [setParams]);
  return [tab, setTab];
}

const a11y = (id, name) => ({ id: `${id}-tab-${name}`, 'aria-controls': `${id}-panel-${name}` });

export default function EntryTabs({ id = 'entry', tab, onChange, entry, records, entryLabel = 'Data entry', recordsLabel = 'Records' }) {
  // The records table mounts on first view and then stays, so switching back and
  // forth keeps its filters and scroll; the form always stays mounted (nothing typed is lost).
  const [seenRecords, setSeenRecords] = useState(tab === 'records');
  if (tab === 'records' && !seenRecords) setSeenRecords(true);

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={(_, v) => onChange(v)}
        aria-label="Entry and records"
        sx={{
          minHeight: 40, mb: 3, borderBottom: 1, borderColor: 'divider',
          '& .MuiTab-root': { minHeight: 40, py: 1, px: 3, fontSize: '0.875rem', fontWeight: 500, gap: 1.5 },
          '& .MuiTab-root.Mui-selected': { fontWeight: 600 },
        }}
      >
        <Tab value="entry" label={entryLabel} icon={<EntryIcon sx={{ fontSize: 18 }} />} iconPosition="start" {...a11y(id, 'entry')} />
        <Tab value="records" label={recordsLabel} icon={<RecordsIcon sx={{ fontSize: 18 }} />} iconPosition="start" {...a11y(id, 'records')} />
      </Tabs>
      <Box role="tabpanel" id={`${id}-panel-entry`} aria-labelledby={`${id}-tab-entry`} hidden={tab !== 'entry'}>
        {entry}
      </Box>
      <Box role="tabpanel" id={`${id}-panel-records`} aria-labelledby={`${id}-tab-records`} hidden={tab !== 'records'}>
        {seenRecords && records}
      </Box>
    </Box>
  );
}
