export type ManpowerOverlap = {
  workerId: string;
  workerName: string;
  recordDate: string;
  approvalStatus: string;
  otherSubmitterName: string;
  submissionKey: string;
};

function ymd(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function formatDateEnGb(value: string | Date): string {
  const iso = ymd(value);
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

export function formatClashBanner(
  recordDate: string | Date,
  clashes: ManpowerOverlap[],
): string {
  if (clashes.length === 0) return '';
  const dateLabel = formatDateEnGb(recordDate);
  const names = [...new Set(clashes.map((c) => c.workerName))].join(', ');
  const details = clashes.map((c) => {
    const status = c.approvalStatus === 'approved' ? 'already approved' : 'still pending';
    return `${c.otherSubmitterName} (${status})`;
  });
  const uniqueDetails = [...new Set(details)].join(' / ');
  return `Clash — ${names} already have hours on ${dateLabel} (also submitted by ${uniqueDetails}). Approve one set and reject the extra.`;
}

export function clashesForWorkers(
  workerIds: string[],
  otherRows: ManpowerOverlap[],
): ManpowerOverlap[] {
  const wanted = new Set(workerIds);
  return otherRows.filter((row) => wanted.has(row.workerId));
}

export function attachClashesToSubmissions<T extends {
  submissionKey: string;
  recordDate: string;
  workers: Array<{ workerId: string; workerName?: string }>;
}>(submissions: T[], overlapRows: ManpowerOverlap[]): Array<T & {
  hasClash: boolean;
  clashBanner: string;
  workers: Array<T['workers'][number] & {
    clash?: { otherSubmitterName: string; approvalStatus: string } | null;
  }>;
}> {
  return submissions.map((submission) => {
    const workerClashes: ManpowerOverlap[] = [];
    const workers = submission.workers.map((worker) => {
      const hit = overlapRows.find((row) => (
        row.workerId === worker.workerId
        && ymd(row.recordDate) === ymd(submission.recordDate)
        && row.submissionKey !== submission.submissionKey
      ));
      if (hit) {
        workerClashes.push({ ...hit, workerName: worker.workerName || hit.workerName });
      }
      return {
        ...worker,
        clash: hit
          ? { otherSubmitterName: hit.otherSubmitterName, approvalStatus: hit.approvalStatus }
          : null,
      };
    });
    return {
      ...submission,
      workers,
      hasClash: workerClashes.length > 0,
      clashBanner: formatClashBanner(submission.recordDate, workerClashes),
    };
  });
}

export function sortSubmissionsClashesFirst<T extends { hasClash?: boolean }>(submissions: T[]): T[] {
  return [...submissions].sort((a, b) => Number(Boolean(b.hasClash)) - Number(Boolean(a.hasClash)));
}
