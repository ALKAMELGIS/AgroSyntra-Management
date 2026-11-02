import { Autocomplete, Box, Tab, Tabs, TextField } from '@mui/material';

export default function StructureAndFieldToolbar({
  availableTabs = [],
  structureId,
  onStructureChange,
  pickerFields = [],
  fieldId,
  onFieldChange,
}) {
  const selectedField = pickerFields.find((field) => field.id === fieldId) || null;
  const tabValue = structureId && availableTabs.some((tab) => tab.id === structureId)
    ? structureId
    : false;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', width: '100%' }}>
      {availableTabs.length > 0 && (
        <Tabs
          value={tabValue}
          onChange={(_, next) => onStructureChange(next)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 36,
            '& .MuiTab-root': {
              textTransform: 'none',
              minHeight: 36,
              py: 0,
              fontSize: '0.8125rem',
            },
          }}
        >
          {availableTabs.map((tab) => (
            <Tab key={tab.id} value={tab.id} label={tab.label} />
          ))}
        </Tabs>
      )}
      <Autocomplete
        size="small"
        sx={{ minWidth: 220 }}
        options={pickerFields}
        value={selectedField}
        onChange={(_, next) => onFieldChange(next?.id || '')}
        getOptionLabel={(option) => option.name || ''}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        renderInput={(params) => (
          <TextField {...params} label="Field" placeholder="All fields" />
        )}
      />
    </Box>
  );
}
