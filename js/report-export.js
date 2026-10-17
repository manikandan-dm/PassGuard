import { escapeHtml } from './formatters.js';
import { renderReportHtml } from './security-report.js';

const REPORT_CSS = `:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f3f5fa;color:#182237;font:14px/1.8 system-ui,-apple-system,Segoe UI,Arial,sans-serif}.report-document{max-width:1000px;margin:35px auto;background:white;padding:44px;border:1px solid #dbe2ee;overflow-wrap:anywhere}.report-header{display:flex;justify-content:space-between;gap:25px;border-bottom:2px solid #416de0;padding-bottom:25px}.report-brand{color:#315fc1;font-size:11px;font-weight:650;letter-spacing:1px}.report-header h2{font-size:27px;letter-spacing:-.7px;line-height:1.3;margin:10px 0}.report-header p{color:#52617b;font-size:12px}.report-stamp{font-size:11px;text-align:right;color:#52617b;min-width:160px}.report-stamp strong{display:block;color:#182237}.report-summary{background:#edf2ff;border-radius:7px;padding:18px 20px;margin:25px 0}.report-section{margin-top:28px}.report-section h3{font-size:17px;border-bottom:1px solid #dbe2ee;padding-bottom:10px}.report-section dl{display:grid;grid-template-columns:1fr 2fr;gap:8px 25px}.report-section dt{color:#52617b}.report-section dd{margin:0}.report-section ul{padding-left:20px}.report-section li{padding:5px 0;color:#45516a}.report-section strong{color:#182237}.table-wrap{overflow-x:auto}.data-table{border-collapse:collapse;width:100%;font-size:12px;text-align:left}.data-table th{color:#52617b;font-size:10px;text-transform:uppercase;letter-spacing:.5px}.data-table td,.data-table th{padding:13px 14px 13px 0;border-bottom:1px solid #dbe2ee;vertical-align:top}.report-footnote{font-size:11px;color:#52617b;border-top:1px solid #dbe2ee;padding-top:18px;margin-top:35px}@media(max-width:650px){.report-document{padding:22px;margin:0}.report-header{flex-direction:column}.report-stamp{text-align:left}.report-section dl{grid-template-columns:1fr;gap:3px}.report-section dd{margin-bottom:10px}.data-table{min-width:650px}}@media print{@page{margin:15mm}.report-document{padding:0;margin:0;border:0;max-width:none}body{background:white;font-size:10pt}.report-section h3{break-after:avoid}.report-header,.report-section li,.report-section dl{break-inside:avoid}.table-wrap{overflow:visible}.data-table{min-width:0;font-size:8pt}.report-summary{print-color-adjust:exact}}`;
export function buildHtmlReport(report) {
  if (!report) throw new RangeError('Generate a report before exporting.');
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(report.title)} — PassGuard</title><style>${REPORT_CSS}</style></head><body>${renderReportHtml(report)}</body></html>`;
}
export function buildTextReport(report) {
  if (!report) throw new RangeError('Generate a report before exporting.');
  const lines = [
    'PASSGUARD — PASSWORD SECURITY ASSESSMENT',
    `Generated: ${report.generatedAt}`,
    `Version: ${report.version}`,
    '',
    report.summary,
  ];
  for (const section of report.sections) {
    lines.push('', section.title.toUpperCase(), '-'.repeat(section.title.length));
    for (const [label, value] of section.rows || []) lines.push(`${label}: ${value}`);
    for (const item of section.bullets || [])
      lines.push(`• ${typeof item === 'string' ? item : `${item.title}: ${item.description}`}`);
    if (section.table) {
      for (const row of section.table.rows) {
        lines.push('');
        row.forEach((value, index) => lines.push(`${section.table.headers[index]}: ${value}`));
      }
    }
  }
  lines.push(
    '',
    'No password or complete hash is included. This report was generated locally, not uploaded.',
    '',
  );
  return lines.join('\n');
}
export function downloadReport(
  report,
  format,
  { documentRef = globalThis.document, urlApi = globalThis.URL } = {},
) {
  if (!['html', 'text'].includes(format)) throw new RangeError('Choose HTML or text format.');
  if (!report) throw new RangeError('Generate a report before exporting.');
  const content = format === 'html' ? buildHtmlReport(report) : buildTextReport(report);
  const blob = new Blob([content], {
    type: format === 'html' ? 'text/html;charset=utf-8' : 'text/plain;charset=utf-8',
  });
  const url = urlApi.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = `passguard-assessment-${report.generatedAt.slice(0, 10)}.${format === 'html' ? 'html' : 'txt'}`;
  anchor.hidden = true;
  documentRef.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => urlApi.revokeObjectURL(url), 1000);
  }
}
export function printReport(report, windowRef = globalThis.window) {
  if (!report) throw new RangeError('Generate a current report before printing.');
  if (typeof windowRef?.print !== 'function')
    throw new Error('Printing is unavailable in this browser. Download the HTML report instead.');
  windowRef.print();
}
