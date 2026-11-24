// Spreadsheet layout from the approved audit-package template. Saved cell text stays literal.
import {strToU8,zipSync} from 'fflate';

export function reportWorkbook(sheets) {

  const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const packageRels = "http://schemas.openxmlformats.org/package/2006/relationships";
  const officeRels = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const spreadsheet = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

  function escapeXml(value) {
    return String(value)
      .replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, "\ufffd")
      .replace(/[&<>"'\r]/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;", "\r": "&#13;"
      })[char]);
  }

  function literalText(value) {
    let text = String(value).slice(0, 32767);
    if (/[\ud800-\udbff]$/.test(text)) text = text.slice(0, -1);
    // Excel reserves _xNNNN_ escapes inside cell text.
    return text.replace(/_x[0-9a-fA-F]{4}_/g, marker => "_x005F_" + marker.slice(1));
  }

  function columnName(index) {
    let name = "";
    for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) {
      name = String.fromCharCode(65 + (value - 1) % 26) + name;
    }
    return name;
  }

  function columnWidths(rows, requested) {
    const count = Math.max(1, ...rows.map(row => row.length));
    return Array.from({length: count}, (_, index) => {
      if (Number.isFinite(requested?.[index])) return Math.min(100, Math.max(10, requested[index]));
      const samples = rows.slice(0, 30).map(row => String(row[index] ?? "").length);
      return Math.min(48, Math.max(15, Math.ceil(Math.max(0, ...samples) * 0.8 + 3)));
    });
  }

  function cell(value, reference, style) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return '<c r="' + reference + '" s="' + style + '"><v>' + value + '</v></c>';
    }
    if (value === undefined || value === null || value === "") return '<c r="' + reference + '" s="' + style + '"/>';
    return '<c r="' + reference + '" s="' + style + '" t="inlineStr"><is><t xml:space="preserve">' +
      escapeXml(literalText(value)) + '</t></is></c>';
  }

  function worksheet(sheet) {
    const rows = sheet.rows;
    const headerIndex = sheet.reportHeaderIndex || 0;
    const widths = columnWidths(rows.slice(headerIndex), sheet.widths);
    const range = "A1:" + columnName(widths.length - 1) + Math.max(1, rows.length);
    const columns = widths.map((width, index) =>
      '<col min="' + (index + 1) + '" max="' + (index + 1) + '" width="' + width + '" customWidth="1"/>').join("");
    const data = rows.map((row, rowIndex) => {
      const style = rowIndex === headerIndex || (headerIndex && rowIndex === 0) ? 1 : (rowIndex % 2 ? 2 : 3);
      const tallest = row.reduce((max, value, index) => {
        if (headerIndex && rowIndex < headerIndex) return max;
        const usableWidth = Math.floor(widths[index]) - 3;
        const lines = String(value ?? "").split(/\r?\n/).reduce((count, line) =>
          count + Math.max(1, Math.ceil(line.length / usableWidth)), 0);
        return Math.max(max, lines);
      }, 1);
      const height = headerIndex && rowIndex === 2 ? 9 :
        Math.min(409, Math.max(rowIndex === 0 || rowIndex === headerIndex ? 27 : 23, tallest * 15 + 8));
      const values = widths.map((_, column) => cell(row[column], columnName(column) + (rowIndex + 1), style));
      return '<row r="' + (rowIndex + 1) + '" ht="' + height + '" customHeight="1">' + values.join("") + '</row>';
    }).join("");
    const lastColumn = columnName(widths.length - 1);
    const tableRange = "A" + (headerIndex + 1) + ":" + lastColumn + rows.length;
    const filter = sheet.filter === false || rows.length <= headerIndex + 1 ? "" : '<autoFilter ref="' + tableRange + '"/>';
    const merged = headerIndex && widths.length > 1 ?
      '<mergeCells count="2"><mergeCell ref="A1:' + lastColumn + '1"/><mergeCell ref="A2:' + lastColumn + '2"/></mergeCells>' : "";
    const frozenColumns = sheet.filter === false || widths.length < 6 ? 0 : 1;
    const corner = (frozenColumns ? "B" : "A") + (headerIndex + 2);
    const pane = frozenColumns ? "bottomRight" : "bottomLeft";
    return '<worksheet xmlns="' + spreadsheet + '"><dimension ref="' + range + '"/>' +
      '<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane' + (frozenColumns ? ' xSplit="1"' : '') +
      ' ySplit="' + (headerIndex + 1) + '" topLeftCell="' + corner + '" activePane="' + pane + '" state="frozen"/>' +
      '<selection pane="' + pane + '" activeCell="' + corner + '" sqref="' + corner + '"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="23"/><cols>' + columns + '</cols><sheetData>' + data + '</sheetData>' +
      filter + merged + '</worksheet>';
  }

  const styles = '<styleSheet xmlns="' + spreadsheet + '">' +
    '<fonts count="2"><font><sz val="11"/><color rgb="FF17343C"/><name val="Calibri"/><family val="2"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF124B55"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F7F7"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">' +
    '<alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1">' +
    '<alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1">' +
    '<alignment vertical="top" wrapText="1"/></xf></cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  const sheetPaths = sheets.map((_, index) => "worksheets/sheet" + (index + 1) + ".xml");
  const types = "application/vnd.openxmlformats-officedocument.spreadsheetml.";
  const relationships = (id, type, target) =>
    '<Relationship Id="rId' + id + '" Type="' + officeRels + "/" + type + '" Target="' + target + '"/>';
  const files = [
    ["[Content_Types].xml",
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="' + types + 'sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="' + types + 'styles+xml"/>' +
      sheetPaths.map(path => '<Override PartName="/xl/' + path + '" ContentType="' + types + 'worksheet+xml"/>').join("") +
      '</Types>'],
    ["_rels/.rels", '<Relationships xmlns="' + packageRels + '">' +
      relationships(1, "officeDocument", "xl/workbook.xml") + '</Relationships>'],
    ["xl/workbook.xml", '<workbook xmlns="' + spreadsheet + '" xmlns:r="' + officeRels + '">' +
      '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
      sheets.map((sheet, index) => '<sheet name="' + escapeXml(sheet.name) + '" sheetId="' + (index + 1) +
        '" r:id="rId' + (index + 1) + '"/>').join("") + '</sheets></workbook>'],
    ["xl/_rels/workbook.xml.rels",
      '<Relationships xmlns="' + packageRels + '">' +
      sheetPaths.map((path, index) => relationships(index + 1, "worksheet", path)).join("") +
      relationships(sheets.length + 1, "styles", "styles.xml") + '</Relationships>'],
    ["xl/styles.xml", styles],
    ...sheets.map((sheet, index) => ["xl/" + sheetPaths[index], worksheet(sheet)])
  ];

  return zipSync(Object.fromEntries(files.map(([path,body]) => [path,strToU8(xmlHeader + body)])), {level:3,mtime:new Date(2000,0,1)});
}
