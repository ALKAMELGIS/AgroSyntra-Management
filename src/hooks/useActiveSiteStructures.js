import { useMemo } from 'react';
import { useActiveSite } from '../contexts/ActiveSiteContext';
import { useMasterData } from '../utils/useMasterData';
import {
  getAvailableStructureTabs,
  getDefaultStructureId,
  getSiteFieldsFromMasterData,
  groupFieldsByStructure,
} from '../utils/fieldTypeHelpers';

export function useActiveSiteStructures() {
  const { activeSiteId } = useActiveSite();
  const { data: masterData } = useMasterData();

  return useMemo(() => {
    const siteFields = getSiteFieldsFromMasterData(masterData?.countries, activeSiteId);
    const groupedFields = groupFieldsByStructure(siteFields);
    const availableStructureTabs = getAvailableStructureTabs(groupedFields);
    const defaultStructureId = getDefaultStructureId(availableStructureTabs);

    return {
      activeSiteId,
      siteFields,
      groupedFields,
      availableStructureTabs,
      defaultStructureId,
      hasPivots: groupedFields.pivot.length > 0,
      hasNethouse: groupedFields.nethouse.length > 0,
      hasGreenhouse: groupedFields.greenhouse.length > 0,
      hasOpenField: groupedFields.openField.length > 0,
    };
  }, [masterData?.countries, activeSiteId]);
}
