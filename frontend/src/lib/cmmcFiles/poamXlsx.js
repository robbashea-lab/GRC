// Spreadsheet formulas, styles and print settings from the reviewed v3.0 workbook.
import cmmcPoamTemplateParts from "./poamTemplate.json";
import {officeZip,validDay,FAMILIES} from "./office";

export function poamXlsx(model, workbook, generatedAt) {
  const client = {name:model.clientName};
  const baseSheets = workbook.sheets;
  const summaries = baseSheets.slice(1,5);
  const sourceItems = new Map(model.rows.map(row => [row.practice,row]));
  const status = model.score;
  const exportedAt = generatedAt.toISOString();
  const localDate = new Intl.DateTimeFormat("en-US", {
    timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(new Date(exportedAt));
  const datePart = type => localDate.find(part => part.type === type).value;
  const date = [datePart("year"),datePart("month"),datePart("day")].join("-");
  const utcDate = new Date(date + "T00:00:00Z");
  const longDate = new Intl.DateTimeFormat("en-US", {timeZone:"UTC",dateStyle:"long"}).format(utcDate);
  const shortDate = new Intl.DateTimeFormat("en-US", {
    timeZone:"UTC",month:"short",day:"numeric",year:"numeric"
  }).format(utcDate);
  const dated = value => {
    const day = validDay(value);
    return day ? (Date.parse(day + "T00:00:00Z") - Date.UTC(1899,11,30)) / 86400000 : "";
  };
  const asOf = dated(date);

  function xml(value) {
    return String(value)
      .replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu,"\ufffd")
      .replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"})[char]);
  }

  function text(value) {
    let output = String(value).slice(0,32767);
    if (/[\ud800-\udbff]$/.test(output)) output = output.slice(0,-1);
    return xml(output.replace(/_[xX][0-9a-fA-F]{4}_/g, marker => "_x005F_" + marker.slice(1)));
  }

  function cell(ref, style, value, formula) {
    const attrs = '<c r="' + ref + '"' + (style === undefined ? '' : ' s="' + style + '"');
    const numeric = typeof value === "number" && Number.isFinite(value);
    if (formula) return attrs + (numeric ? '' : ' t="str"') + '><f>' + xml(formula) + '</f><v>' +
      (numeric ? value : text(value ?? "")) + '</v></c>';
    if (numeric) return attrs + '><v>' + value + '</v></c>';
    if (value == null || value === "") return attrs + '/>';
    return attrs + ' t="inlineStr"><is><t xml:space="preserve">' + text(value) + '</t></is></c>';
  }

  function replaceCell(sheet, ref, value) {
    const pattern = new RegExp('<c r="' + ref + '"(?: s="(\\d+)")?[^>]*?(?:/>|>(.*?)</c>)','s');
    return sheet.replace(pattern, (_,style,body) => {
      const formula = body?.match(/<f>(.*?)<\/f>/s)?.[1];
      return cell(ref,style,value,formula && unescapeFormula(formula));
    });
  }

  function unescapeFormula(value) {
    return value.replace(/&(amp|lt|gt|quot|apos);/g, (_,entity) => ({
      amp:"&",lt:"<",gt:">",quot:'"',apos:"'"
    })[entity]);
  }

  const widths = [15,15,40,10,16,17,36,32,17,14,28,26,18,30,12,12,16,30];
  const historyWidths = [22,20,16,16,20,16,12,46,38];
  const groups = summaries.map(sheet => sheet.rows.slice(1).map(row => {
    const [id,practice,title,point,workflow,owner,due,milestone,notes,evidence,implementation,gap,eligibility,
      details,opened,closed,actor,closeout] = row;
    return [
      id, practice, sourceItems.get(practice)?.text || title, point, workflow, implementation,
      gap || "Not recorded", milestone || (id ? "Milestone needed" : ""), owner || (id ? "Unassigned" : ""),
      dated(due) || (id ? "Not scheduled" : ""),notes,evidence,eligibility,details,
      dated(opened),dated(closed),actor,closeout
    ];
  }));
  const history = baseSheets[5].rows.slice(1).filter(row => row[4] === "Closed" || row[4] === "Reopened");
  const tracked = groups.flat().filter(row => row[0]);
  const open = tracked.filter(row => row[4] !== "Closed");
  const closed = tracked.filter(row => row[4] === "Closed");
  const sum = rows => rows.reduce((total,row) => total + (typeof row[3] === "number" ? row[3] : 0),0);
  const datedOpen = open.filter(row => typeof row[9] === "number");
  const upcoming = datedOpen.slice().sort((a,b) => a[9]-b[9]);
  const ownerCounts = new Map();
  for (const row of open) ownerCounts.set(row[8],(ownerCounts.get(row[8]) || 0) + 1);
  const ownerNames = [...ownerCounts.keys()].sort((a,b) =>
    ownerCounts.get(b) - ownerCounts.get(a) || a.localeCompare(b));
  const ownerOverflow = ownerNames.length > 4;
  const owners = ownerOverflow ? [...ownerNames.slice(0,3),"Other owners"] : ownerNames;
  const directValues = {
    B3:client.name,C7:client.name,I7:asOf,I8:asOf,C10:"GoverNara compliance workspace, exported " + longDate,
    B14:status.available ? model.score.value : "—",
    L26:dated(model.conditional.statusDate) || "Not issued",
    L27:dated(model.conditional.closeoutDate) || "Not set"
  };
  const scoreLabel = status.ready ? "" : " · provisional";
  const cache = {
    D14:open.length,F14:sum(open),H14:datedOpen.filter(row => row[9] < asOf).length,
    J14:datedOpen.filter(row => row[9] >= asOf && row[9] <= asOf + 30).length,L14:closed.length,
    B15:status.available ? "of 110 maximum" + scoreLabel : "Working score not assessed",
    D15:datedOpen.length + " have a target date",H15:"As of " + shortDate,
    L15:workbook.rows.filter(row => row.status === "Closed" && row.currentGap).length + " closed with an open assessment gap",
    D23:open.length,E23:closed.length,F23:tracked.length,G23:sum(open),
    G24:groups[3].filter(row => row[4] === "Assessment follow-up").length,
    L20:88,L21:status.available ? model.score.value : "Not assessed",
    L22:status.available ? Math.max(0,88-model.score.value) : "Not assessed",
    L23:open.filter(row => row[12] === "Restricted").length,
    L24:open.filter(row => row[12] === "Potential candidate").length,
    L25:open.filter(row => row[12] === "Needs review").length,
    B42:(open.length - datedOpen.length) + " open items do not have a target date yet. Planning them is the next step toward a complete POA&M.",
    F60:open.length,G60:sum(open)
  };
  groups.forEach((group,index) => {
    const subtotal = 19 + index;
    const items = group.filter(row => row[0]);
    const active = items.filter(row => row[4] !== "Closed");
    cache["D"+subtotal] = active.length;
    cache["E"+subtotal] = items.length-active.length;
    cache["F"+subtotal] = items.length;
    if (index < 3) cache["G"+subtotal] = sum(active);
  });
  for (let index = 0; index < 8; index++) {
    const row = upcoming[index];
    const number = 34 + index;
    const difference = row ? row[9] - asOf : 0;
    const timing = difference < 0 ? "Past due " + -difference + " days" : "In " + difference + " days";
    Object.assign(cache,{
      ["B"+number]:row?.[9] ?? "",["C"+number]:row?.[0] ?? "",["E"+number]:row?.[1] ?? "",
      ["F"+number]:row?.[7] ?? "",["J"+number]:row?.[8] ?? "",["L"+number]:row ? timing : ""
    });
  }
  const families = FAMILIES;
  families.forEach((key,index) => {
    const count = open.filter(row => row[1].startsWith(key + "."));
    cache["F"+(46+index)] = count.length;
    cache["G"+(46+index)] = sum(count);
  });

  function rowXml(items, rowNumber, cols, detail) {
    const odd = rowNumber % 2 !== 0;
    const cells = items.map((value,index) => {
      let style = odd ? 44 : 47;
      if (index === (detail ? 0 : 2)) style = odd ? 43 : 46;
      if (index === (detail ? 3 : 6)) style = odd ? 45 : 48;
      if (detail && [9,14,15].includes(index) && typeof value === "number") style = odd ? 50 : 49;
      return cell(String.fromCharCode(65+index) + rowNumber,style,value);
    });
    const lines = items.reduce((max,value,index) => {
      const usableWidth = cols[index] - 2;
      const count = String(value ?? "").split(/\r?\n/).reduce((total,line) =>
        total + Math.max(1,Math.ceil(line.length / usableWidth)),0);
      return Math.max(max,count);
    },1);
    const height = Math.max(28,Math.min(409,lines*13+13));
    return '<row r="' + rowNumber + '" ht="' + height + '" customHeight="1">' + cells.join("") + '</row>';
  }

  function ownerFormula(row, sumPoints) {
    const criteria = '"="&SUBSTITUTE(SUBSTITUTE(SUBSTITUTE($I' + row + ',"~","~~"),"*","~*"),"?","~?")';
    return summaries.map(({name}) => {
      const sheet = "'" + name + "'!";
      const col = c => sheet + "$" + c + "$5:$" + c + "$1000";
      const ranges = [col("A"),'"POAM-*"',col("E"),'"<>Closed"',col("I"),criteria];
      return (sumPoints ? "SUMIFS(" + col("D") + "," : "COUNTIFS(") + ranges.join(",") + ")";
    }).join("+");
  }

  const calcRows = [];
  // Every requirement can appear on one of these tabs. Reserve space on each tab
  // so adding plan rows in Excel can also feed the date preview.
  const calcCapacity = 110;
  summaries.forEach(({name},group) => {
    for(let index = 0; index < calcCapacity; index++) {
      const detail = groups[group][index];
      const number = calcRows.length + 2;
      const reference = "'" + name + "'!$";
      const sourceRow = index + 5;
      const source = col => reference + col + sourceRow;
      const data = [0,1,7,8,9,4].map(index => detail?.[index] ?? "");
      const mapping = ["A","B","H","I","J","E"];
      const cells = mapping.map((col,i) => {
        const ref = String.fromCharCode(65+i) + number;
        const formula = 'IF(' + source("B") + '="","",' + source(col) + (col !== "J" ? '&""' : '') + ')';
        return cell(ref,undefined,data[i],formula);
      });
      const score = data[0] && typeof data[4] === "number" && data[5] !== "Closed" ? data[4]+number/100000 : "";
      const formula = 'IF(AND(A' + number + '<>"",ISNUMBER(E' + number + '),E' +
        number + '>0,F' + number + '<>"Closed"),E' + number + '+ROW()/100000,"")';
      calcRows.push('<row r="' + number + '">' + cells.join("") + cell("G"+number,undefined,score,formula) + '</row>');
    }
  });
  const calcLast = calcRows.length + 1;

  function dashboard(sheet) {
    const provisional = 'IF(ISNUMBER(WorkingScore),"of "&MaxScore&" maximum' + scoreLabel + '","Working score not assessed")';
    sheet = sheet.replace(/<c r="B15"[^>]*>.*?<\/c>/s,() => cell("B15",17,cache.B15,provisional));
    sheet = sheet.replace(/<c r="H14"[^>]*>.*?<\/c>/s, original =>
      original.replace(/('(?:5-point|3-point|1-point|Scoring Review and SSP)'!\$J\$5:\$J\$1000),("&lt;"&amp;StatusAsOf)/g,
        '$1,"&gt;0",$1,$2'));
    sheet = sheet.replace(/\$189/g,"$"+calcLast);
    for (const [ref,value] of Object.entries({...directValues,...cache})) sheet = replaceCell(sheet,ref,value);
    for (let i=0;i<4;i++) {
      const row = 46 + i;
      const name = owners[i];
      if (!name) continue;
      const namedRows = open.filter(entry => entry[8] === name);
      const otherRows = open.filter(entry => !owners.slice(0,3).includes(entry[8]));
      const aggregate = ownerOverflow && i === 3;
      const countFormula = aggregate ? "D14-SUM(L46:L48)" : ownerFormula(row,false);
      const pointsFormula = aggregate ? "F14-SUM(M46:M48)" : ownerFormula(row,true);
      const matching = aggregate ? otherRows : namedRows;
      for (const [col,num,val,formula] of [
        ["I",21,name],["L",23,matching.length,countFormula],["M",23,sum(matching),pointsFormula]
      ]) {
        sheet = sheet.replace(new RegExp('<c r="' + col + row + '"[^>]*?/>'),
          () => cell(col+row,num,val,formula));
      }
    }
    return sheet;
  }

  return officeZip(cmmcPoamTemplateParts.map(([path, body, binary]) => {
    if (binary) return [path,Uint8Array.from(atob(body),character => character.charCodeAt(0))];
    const sheet = /^xl\/worksheets\/sheet(\d+)\.xml$/.exec(path);
    const part = sheet && Number(sheet[1]);
    let output = body.replace(/@@(?:CLIENT_POSSESSIVE|CLIENT|DATE_LONG|EXPORTED_AT)@@/g,marker => ({
      "@@CLIENT_POSSESSIVE@@":text(client.name + (/s$/i.test(client.name) ? "'" : "'s")),
      "@@CLIENT@@":text(client.name),"@@DATE_LONG@@":text(longDate),"@@EXPORTED_AT@@":xml(exportedAt)
    })[marker]);
    if (part === 1) output = dashboard(output);
    if (part >= 2 && part <= 5) {
      const rows = groups[part-2], last = rows.length + 4;
      output = output.replace("@@ROWS@@",() => rows.map((row,index) => rowXml(row,index+5,widths,true)).join(""));
      output = output.replace(/<dimension ref="A1:R\d+"\//,'<dimension ref="A1:R' + last + '"/')
        .replace(/<autoFilter ref="A4:R\d+"\//,'<autoFilter ref="A4:R' + last + '"/');
    }
    if (part === 6) {
      output = output.replace("@@ROWS@@",() => history.length ? history.map((row,i) => rowXml(row,i+5,historyWidths,false)).join("") :
        '<row r="5" ht="24" customHeight="1">' + cell("A5",51,"No closeouts recorded as of " + longDate + ".") + '</row>');
      output = output.replace(/<dimension ref="A1:I\d+"\//,'<dimension ref="A1:I' + Math.max(5,history.length + 4) + '"/');
    }
    if (part === 8) output = output.replace("@@ROWS@@",() => calcRows.join("")).replace("A1:G189","A1:G" + calcLast);
    if (path === "xl/workbook.xml") {
      output = output.replace(/(<definedName name="_xlnm\.(Print_Area|_FilterDatabase)" localSheetId="([1-4])"[^>]*>'[^']+'!)\$A\$4:\$R\$\d+/g,
        (_,prefix,name,index) => {
          const count = groups[Number(index)-1].length;
          // Empty tiers only need the title and first header band on paper. Excel still filters all columns.
          const range = name === 'Print_Area' && count === 0 ? '$A$1:$G$4' : '$A$4:$R$' + (count + 4);
          return prefix + range;
        });
    }
    if (part >= 2 && part <= 6) {
      // Navigate inside the workbook, regardless of how the file is opened.
      output = output.replace(/ r:id="rId1"\s*\/>/g,' location="Dashboard!A1"/>');
    }
    return [path,output];
  }));
}
