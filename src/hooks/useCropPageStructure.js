import { useEffect, useMemo, useState } from 'react';
import { cropPageStructureState } from '../utils/cropPageFieldFilter';
import { fieldsForCropPageStructure } from '../utils/fieldTypeHelpers';

export function useCropPageStructure(siteFields) {
  const { groupedFields, availableTabs, defaultStructureId } = useMemo(
    () => cropPageStructureState(siteFields),
    [siteFields],
  );
  const [structureId, setStructureId] = useState(null);
  const [fieldId, setFieldId] = useState('');

  useEffect(() => {
    if (!defaultStructureId) {
      setStructureId(null);
      setFieldId('');
      return;
    }
    setStructureId((prev) => {
      if (prev && availableTabs.some((tab) => tab.id === prev)) return prev;
      return defaultStructureId;
    });
  }, [defaultStructureId, availableTabs]);

  const pickerFields = useMemo(
    () => fieldsForCropPageStructure(groupedFields, structureId),
    [groupedFields, structureId],
  );

  useEffect(() => {
    if (fieldId && !pickerFields.some((field) => field.id === fieldId)) {
      setFieldId('');
    }
  }, [fieldId, pickerFields]);

  const structureFieldIds = useMemo(
    () => new Set(pickerFields.map((field) => field.id)),
    [pickerFields],
  );

  return {
    availableTabs,
    structureId,
    setStructureId,
    fieldId,
    setFieldId,
    pickerFields,
    structureFieldIds,
  };
}
