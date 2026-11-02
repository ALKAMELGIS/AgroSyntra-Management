import AdmZip from 'adm-zip';
import { basenameFromZipPath } from '../utils/pppMsdsMatch';

export type ExtractedPdf = { filename: string; buffer: Buffer };
export type SkippedZipEntry = { filename: string; reason: string };

const MAX_PDFS = 200;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;

function isPdfMagic(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1').startsWith('%PDF');
}

export function extractPdfsFromZipBuffer(zipBuffer: Buffer): {
  files: ExtractedPdf[];
  skipped: SkippedZipEntry[];
} {
  const zip = new AdmZip(zipBuffer);
  const files: ExtractedPdf[] = [];
  const skipped: SkippedZipEntry[] = [];
  let totalBytes = 0;

  for (const entry of zip.getEntries()) {
    const filename = basenameFromZipPath(entry.entryName);
    if (entry.isDirectory || !filename) continue;
    if (entry.entryName.includes('__MACOSX') || filename.startsWith('.')) continue;

    if (!filename.toLowerCase().endsWith('.pdf')) {
      skipped.push({ filename, reason: 'Not a PDF' });
      continue;
    }
    if (files.length >= MAX_PDFS) {
      skipped.push({ filename, reason: 'Too many PDFs in zip' });
      continue;
    }

    let buffer: Buffer;
    try {
      buffer = entry.getData();
    } catch {
      skipped.push({ filename, reason: 'Could not read zip entry' });
      continue;
    }

    if (!buffer.length) {
      skipped.push({ filename, reason: 'Empty file' });
      continue;
    }
    if (buffer.length > MAX_PDF_BYTES) {
      skipped.push({ filename, reason: 'PDF is larger than 15 MB' });
      continue;
    }
    if (totalBytes + buffer.length > MAX_TOTAL_BYTES) {
      skipped.push({ filename, reason: 'Zip contents exceed size limit' });
      continue;
    }
    if (!isPdfMagic(buffer)) {
      skipped.push({ filename, reason: 'File is not a valid PDF' });
      continue;
    }

    files.push({ filename, buffer });
    totalBytes += buffer.length;
  }

  files.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base' }));
  return { files, skipped };
}
