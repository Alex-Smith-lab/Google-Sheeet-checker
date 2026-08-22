const masterHeaders = [
  "Site ID/Block Mapping", "LOCATION DESCRIPTION", "D", "LOCATION NAME",
  "STREET START", "STREET END", "BUS ROUTE", "SHARED BLOCKS", "VIDEO NAME",
  "MC LINK", "TIMESTAMP", "SCREENSHOT", "NOTES", "SPACER_1", "BS ID",
  "BS NAME", "ENFORCEMENT DAYS", "ENFORCEMENT HOURS", "LAT", "LONG",
  "Bus Stop Lane Type", "CLASSIFICATION", "MC LINK_dup1", "TIMESTAMP_dup1",
  "OTHER ROUTES", "SCREENSHOT_dup1", "STOP LENGTH", "SCREENSHOT_dup2",
  "NOTES_dup1", "SPACER_2", "BUS LANE? Y/N", "ENFORCEMENT HOURS_dup1",
  "ENFORCEMENT DAYS_dup1", "POSITION", "DASHED Y/N", "NOTES_dup2",
  "SPACER_3", "Assignee", "F.P. Status", "Review"
];

let projectDatabase = {};
let activeMainSheet = "";
let activeSubSheet = "";
let clipboardHtmlBuffer = "";
let detectedAssignees = [];
let selectedAssignee = "";
let parsedParsedRowsStream = [];
let detectedAssigneeColIdx = -1;
let detectedHeaderRowIdx = -1;

function verifyOnlineStatus() {
  const blocker = document.getElementById('global-offline-blocker');
  if (!navigator.onLine) {
    blocker.classList.remove('hidden');
    return false;
  } else {
    blocker.classList.add('hidden');
    return true;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  verifyOnlineStatus();
  const savedData = localStorage.getItem('projectDatabase');
  const savedTheme = localStorage.getItem('appTheme');
  const savedMain = localStorage.getItem('activeMainSheet');
  const savedSub = localStorage.getItem('activeSubSheet');

  if (savedData) {
    try {
      projectDatabase = JSON.parse(savedData);
      updateDropdownMenu();
      rebuildWorkbookTree();
    } catch (e) {
      projectDatabase = {};
    }
  }

  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) toggleBtn.textContent = "☼ Light Mode";
  }

  if (savedMain && savedSub && projectDatabase[savedMain] && projectDatabase[savedMain][savedSub]) {
    switchViewContext(savedMain, savedSub);
  }

  calculateGlobalMetrics();
});

window.addEventListener('offline', verifyOnlineStatus);
window.addEventListener('online', verifyOnlineStatus);

document.getElementById('paste-input').addEventListener('paste', (e) => {
  clipboardHtmlBuffer = "";
  if (e.clipboardData) {
    const htmlData = e.clipboardData.getData('text/html');
    if (htmlData) clipboardHtmlBuffer = htmlData;
  }
  setTimeout(parsePastedStreamForAssignees, 100);
});

document.getElementById('paste-input').addEventListener('input', () => {
  parsePastedStreamForAssignees();
});

function parsePastedStreamForAssignees() {
  const rawText = document.getElementById('paste-input').value;
  const container = document.getElementById('assignee-selector-box');
  const pillsList = document.getElementById('assignee-pills-list');
  
  if (!rawText.trim()) {
    container.classList.add('hidden');
    selectedAssignee = "";
    return;
  }

  const lines = rawText.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length === 0) return;

  parsedParsedRowsStream = lines.map(line => line.split('\t').map(c => c.trim()));
  detectedAssigneeColIdx = -1;
  detectedHeaderRowIdx = -1;

  for (let r = 0; r < Math.min(parsedParsedRowsStream.length, 5); r++) {
    const row = parsedParsedRowsStream[r];
    for (let c = 0; c < row.length; c++) {
      const cellVal = row[c].toUpperCase();
      if (cellVal.includes("ASSIGNEE") || cellVal.includes("ASSIGNED")) {
        detectedAssigneeColIdx = c;
        detectedHeaderRowIdx = r;
        break;
      }
    }
    if (detectedAssigneeColIdx !== -1) break;
  }

  const assigneeSet = new Set();
  const startRow = (detectedHeaderRowIdx !== -1) ? detectedHeaderRowIdx + 1 : 0;

  for (let r = startRow; r < parsedParsedRowsStream.length; r++) {
    const row = parsedParsedRowsStream[r];
    if (detectedAssigneeColIdx !== -1 && detectedAssigneeColIdx < row.length) {
      const val = row[detectedAssigneeColIdx];
      if (val && val.trim().length > 0 && val.toUpperCase() !== "ASSIGNEE") {
        assigneeSet.add(val.trim());
      }
    }
  }

  detectedAssignees = Array.from(assigneeSet);

  let detectedRoute = "";
  if (detectedHeaderRowIdx !== -1) {
    const headerRow = parsedParsedRowsStream[detectedHeaderRowIdx];
    const busRouteColIdx = headerRow.findIndex(h => h.toUpperCase().includes("BUS ROUTE") || h.toUpperCase().includes("ROUTE"));
    if (busRouteColIdx !== -1 && parsedParsedRowsStream.length > detectedHeaderRowIdx + 1) {
      detectedRoute = parsedParsedRowsStream[detectedHeaderRowIdx + 1][busRouteColIdx] || "";
    }
  }
  
  if (detectedRoute && !document.getElementById('sub-sheet-input').value) {
    document.getElementById('sub-sheet-input').value = detectedRoute;
  }

  if (detectedAssignees.length > 0) {
    pillsList.innerHTML = "";
    const allPill = document.createElement('div');
    allPill.className = `assignee-pill ${selectedAssignee === '' ? 'selected' : ''}`;
    allPill.textContent = "All Assignees";
    allPill.addEventListener('click', () => selectAssigneeFilter(''));
    pillsList.appendChild(allPill);

    detectedAssignees.forEach(name => {
      const pill = document.createElement('div');
      pill.className = `assignee-pill ${selectedAssignee === name ? 'selected' : ''}`;
      pill.textContent = name;
      pill.addEventListener('click', () => selectAssigneeFilter(name));
      pillsList.appendChild(pill);
    });
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
}

function selectAssigneeFilter(name) {
  selectedAssignee = name;
  document.querySelectorAll('.assignee-pill').forEach(el => {
    if ((name === '' && el.textContent === "All Assignees") || el.textContent === name) {
      el.classList.add('selected');
    } else {
      el.classList.remove('selected');
    }
  });
}

document.getElementById('theme-toggle-btn').addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  let targetTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.getElementById('theme-toggle-btn').textContent = targetTheme === 'dark' ? "☼ Light Mode" : "◑ Dark Mode";
  document.documentElement.setAttribute('data-theme', targetTheme);
  localStorage.setItem('appTheme', targetTheme);
});

document.getElementById('main-sheet-select').addEventListener('change', (e) => {
  if (e.target.value) {
    document.getElementById('main-sheet-input').value = e.target.value;
  }
});

document.getElementById('btn-close-view').addEventListener('click', () => {
  activeMainSheet = "";
  activeSubSheet = "";
  localStorage.removeItem('activeMainSheet');
  localStorage.removeItem('activeSubSheet');
  document.getElementById('view-navigation-row').classList.add('hidden');
  document.getElementById('view-title').textContent = "Active Workspace View";
  document.getElementById('view-range-indicator').textContent = "";
  document.getElementById('grid-output-view').innerHTML = `
    <div class="splash-container">
      <div class="splash-text">Paste sheet data stream or select a subfolder node from the workbook index to mount sheet records.</div>
    </div>
  `;
  document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
  calculateGlobalMetrics();
});

document.getElementById('process-entry-btn').addEventListener('click', () => {
  if (!verifyOnlineStatus()) return;

  const mainName = document.getElementById('main-sheet-input').value.trim();
  const subName = document.getElementById('sub-sheet-input').value.trim();
  const rawDataText = document.getElementById('paste-input').value;

  if (!mainName || !subName || !rawDataText.trim()) {
    alert("Please ensure Folder Name, Sub-Route Name, and Data Stream are all provided.");
    return;
  }

  const overlay = document.getElementById('view-loader-overlay');
  const loaderText = document.getElementById('view-loader-text');
  
  overlay.classList.remove('hidden');
  loaderText.textContent = "Processing direct raw ingest stream...";

  setTimeout(() => {
    let htmlRows = [];
    if (clipboardHtmlBuffer) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(clipboardHtmlBuffer, 'text/html');
      htmlRows = Array.from(doc.querySelectorAll('tr'));
    }

    const lines = rawDataText.split(/\r?\n/).filter(l => l.trim().length > 0);
    const extractedRows = [];

    // Auto Header Row Detection
    let isHeaderRowPresent = false;
    if (lines.length > 0) {
      const firstLineCells = lines[0].split('\t').map(c => c.trim().toUpperCase());
      const headerMatches = firstLineCells.filter(c => c && masterHeaders.some(m => m.toUpperCase().includes(c)));
      if (headerMatches.length >= 2) {
        isHeaderRowPresent = true;
      }
    }

    const startIndex = isHeaderRowPresent ? 1 : 0;

    for (let index = startIndex; index < lines.length; index++) {
      const line = lines[index];
      const cells = line.split('\t').map(c => c.trim());

      // Filter by Assignee
      if (selectedAssignee && detectedAssigneeColIdx !== -1 && detectedAssigneeColIdx < cells.length) {
        const rowAssignee = cells[detectedAssigneeColIdx] || "";
        if (rowAssignee.toLowerCase() !== selectedAssignee.toLowerCase()) continue;
      }

      // DIRECT SEQUENTIAL INGESTION (Fixes blank shift)
      let alignedRowCells = new Array(masterHeaders.length).fill("");
      let cellPointer = 0;

      for (let mIdx = 0; mIdx < masterHeaders.length; mIdx++) {
        // If master column is a spacer, keep empty and preserve original cell for actual data column
        if (masterHeaders[mIdx].startsWith("SPACER_")) {
          alignedRowCells[mIdx] = "";
          continue;
        }

        if (cellPointer < cells.length) {
          alignedRowCells[mIdx] = cells[cellPointer];
          cellPointer++;
        }
      }

      // Strikethrough Detection
      let isStrikethrough = false;
      if (htmlRows.length > 0) {
        const matchingHtmlRow = htmlRows[index] || htmlRows.find(tr => tr.textContent.includes(cells[0]));
        if (matchingHtmlRow) {
          const rowStyles = matchingHtmlRow.getAttribute('style') || "";
          const innerHtml = matchingHtmlRow.innerHTML.toLowerCase();
          if (rowStyles.includes('line-through') || innerHtml.includes('line-through') || innerHtml.includes('<strike>') || innerHtml.includes('<del>')) {
            isStrikethrough = true;
          }
        }
      }

      extractedRows.push({
        data: alignedRowCells,
        isStrikethrough: isStrikethrough
      });
    }

    if (extractedRows.length === 0) {
      overlay.classList.add('hidden');
      alert("No valid rows extracted.");
      return;
    }

    if (!projectDatabase[mainName]) projectDatabase[mainName] = {};
    if (!projectDatabase[mainName][subName]) {
      projectDatabase[mainName][subName] = { headers: masterHeaders, rows: [] };
    }
    
    projectDatabase[mainName][subName].rows = projectDatabase[mainName][subName].rows.concat(extractedRows);

    localStorage.setItem('projectDatabase', JSON.stringify(projectDatabase));
    
    overlay.classList.add('hidden');
    document.getElementById('paste-input').value = "";
    document.getElementById('sub-sheet-input').value = "";
    document.getElementById('assignee-selector-box').classList.add('hidden');
    selectedAssignee = "";
    
    updateDropdownMenu();
    rebuildWorkbookTree();
    switchViewContext(mainName, subName);
  }, 300);
});

function updateDropdownMenu() {
  const select = document.getElementById('main-sheet-select');
  select.innerHTML = `<option value="" selected>-- Select Existing Folder --</option>`;
  Object.keys(projectDatabase).forEach(mainKey => {
    const opt = document.createElement('option');
    opt.value = mainKey; 
    opt.textContent = mainKey;
    select.appendChild(opt);
  });
}

function rebuildWorkbookTree() {
  const container = document.getElementById('workbook-tree-container');
  container.innerHTML = '';
  const workbooks = Object.keys(projectDatabase);

  if (workbooks.length === 0) {
    container.innerHTML = '<div style="padding:10px; color:var(--text-muted);">No datasets loaded.</div>';
    return;
  }

  workbooks.forEach(mKey => {
    const subMap = projectDatabase[mKey];
    const subList = Object.keys(subMap);
    let sumTotal = 0;
    subList.forEach(sKey => { sumTotal += subMap[sKey].rows.length; });

    const node = document.createElement('div');
    node.className = 'tree-node';
    node.innerHTML = `
      <div class="tree-header">
        <span>📂 ${mKey}</span>
        <span class="count-badge">${sumTotal} rows</span>
      </div>
      <div class="tree-children"></div>
    `;

    const childrenContainer = node.querySelector('.tree-children');
    subList.forEach(sKey => {
      const rowVol = subMap[sKey].rows.length;
      let strikeCount = subMap[sKey].rows.filter(r => r.isStrikethrough).length;

      const item = document.createElement('div');
      item.className = `tree-item ${(activeMainSheet === mKey && activeSubSheet === sKey) ? 'active' : ''}`;
      
      item.innerHTML = `
        <span>📄 ${sKey}</span> 
        <div class="tree-item-meta">
          ${strikeCount > 0 ? `<span class="count-badge" style="background:rgba(217,48,37,0.15); color:var(--danger);">☠ ${strikeCount}</span>` : ''}
          <span class="count-badge">${rowVol}</span>
          <button class="btn-delete-node" data-main="${mKey}" data-sub="${sKey}">✕</button>
        </div>
      `;
      
      item.addEventListener('click', () => switchViewContext(mKey, sKey));

      item.querySelector('.btn-delete-node').addEventListener('click', (e) => {
        e.stopPropagation();
        const mainTarget = e.target.getAttribute('data-main');
        const subTarget = e.target.getAttribute('data-sub');
        
        if (confirm(`Delete route folder [ ${subTarget} ] from [ ${mainTarget} ]?`)) {
          delete projectDatabase[mainTarget][subTarget];
          if (Object.keys(projectDatabase[mainTarget]).length === 0) {
            delete projectDatabase[mainTarget];
          }
          
          localStorage.setItem('projectDatabase', JSON.stringify(projectDatabase));
          if (activeMainSheet === mainTarget && activeSubSheet === subTarget) {
            document.getElementById('btn-close-view').click();
          }
          updateDropdownMenu();
          rebuildWorkbookTree();
          calculateGlobalMetrics();
        }
      });

      childrenContainer.appendChild(item);
    });
    container.appendChild(node);
  });
}

function switchViewContext(mKey, sKey) {
  activeMainSheet = mKey;
  activeSubSheet = sKey;
  
  localStorage.setItem('activeMainSheet', mKey);
  localStorage.setItem('activeSubSheet', sKey);

  document.getElementById('view-navigation-row').classList.remove('hidden');
  document.getElementById('view-title').innerHTML = `Folder: <b>${mKey}</b> ➔ Route: <b>${sKey}</b>`;
  
  rebuildWorkbookTree();
  renderSpreadsheetViewGrid(projectDatabase[mKey][sKey]);
  calculateGlobalMetrics();
}

function renderSpreadsheetViewGrid(sheetObject) {
  const display = document.getElementById('grid-output-view');
  const rangeIndicator = document.getElementById('view-range-indicator');
  const { headers, rows } = sheetObject;

  if (!rows || rows.length === 0) {
    display.innerHTML = '<div style="padding:12px;">No row data present in this route.</div>';
    rangeIndicator.textContent = "";
    return;
  }

  rangeIndicator.textContent = `Displaying total ${rows.length} record entries.`;

  let tableHtml = `<table><thead><tr>`;
  headers.forEach(h => {
    if (h.startsWith("SPACER_")) {
      tableHtml += `<th class="spacer-col"></th>`;
    } else {
      const cleanHeader = h.split('_dup')[0];
      tableHtml += `<th title="${cleanHeader}">${cleanHeader}</th>`;
    }
  });
  tableHtml += `</tr></thead><tbody>`;

  rows.forEach(rowObj => {
    const rowCells = Array.isArray(rowObj) ? rowObj : rowObj.data;
    const isStriked = rowObj.isStrikethrough === true;

    tableHtml += `<tr class="${isStriked ? 'row-strikethrough' : ''}">`;
    
    for (let i = 0; i < headers.length; i++) {
      const headerTitle = headers[i];
      if (headerTitle.startsWith("SPACER_")) {
        tableHtml += `<td class="spacer-col"></td>`;
      } else {
        const val = rowCells[i] !== undefined ? rowCells[i] : "";
        tableHtml += `<td title="${val}">${val}</td>`;
      }
    }
    tableHtml += `</tr>`;
  });

  tableHtml += `</tbody></table>`;
  display.innerHTML = tableHtml;
}

document.getElementById('btn-create-gsheet').addEventListener('click', () => {
  if (!verifyOnlineStatus()) return;
  if (!activeMainSheet || !activeSubSheet || !projectDatabase[activeMainSheet] || !projectDatabase[activeMainSheet][activeSubSheet]) return;

  const targetWorkbook = projectDatabase[activeMainSheet][activeSubSheet];
  const headerCleanText = targetWorkbook.headers.map(h => h.startsWith("SPACER_") ? "" : h.split('_dup')[0]).join('\t');
  
  const textRowsArray = targetWorkbook.rows.map(rowObj => {
    const rowCells = Array.isArray(rowObj) ? rowObj : rowObj.data;
    return targetWorkbook.headers.map((h, i) => h.startsWith("SPACER_") ? "" : (rowCells[i] !== undefined ? rowCells[i] : "")).join('\t');
  });

  const fullDataClipboardString = [headerCleanText, ...textRowsArray].join('\n');

  navigator.clipboard.writeText(fullDataClipboardString).then(() => {
    alert("Formatted data copied to clipboard! Opening Google Sheets... Press Ctrl+V to paste.");
    window.open("https://sheets.new", "_blank");
  });
});

document.getElementById('btn-export-csv').addEventListener('click', () => {
  if (!verifyOnlineStatus()) return;
  if (!activeMainSheet || !activeSubSheet || !projectDatabase[activeMainSheet] || !projectDatabase[activeMainSheet][activeSubSheet]) return;

  const targetWorkbook = projectDatabase[activeMainSheet][activeSubSheet];
  const sanitizeCsvCell = (val) => {
    if (val === null || val === undefined) return '""';
    return `"${val.toString().replace(/"/g, '""')}"`;
  };

  const headerRowString = targetWorkbook.headers.map(h => h.startsWith("SPACER_") ? '""' : sanitizeCsvCell(h.split('_dup')[0])).join(',');
  
  const dataRowsStringArray = targetWorkbook.rows.map(rowObj => {
    const rowCells = Array.isArray(rowObj) ? rowObj : rowObj.data;
    return targetWorkbook.headers.map((h, i) => h.startsWith("SPACER_") ? '""' : sanitizeCsvCell(rowCells[i] !== undefined ? rowCells[i] : "")).join(',');
  });

  const fullCsvPayloadString = [headerRowString, ...dataRowsStringArray].join('\n');
  const dataBlobFileStream = new Blob([fullCsvPayloadString], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(dataBlobFileStream);
  link.download = `${activeMainSheet}_${activeSubSheet}.csv`.replace(/[^a-z0-9_.-]/gi, '_').toLowerCase();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

function calculateGlobalMetrics() {
  let grandTotal = 0, mainTotal = 0, subTotal = 0, strikeTotal = 0;
  
  Object.keys(projectDatabase).forEach(mKey => {
    Object.keys(projectDatabase[mKey]).forEach(sKey => {
      const rowsArray = projectDatabase[mKey][sKey].rows;
      grandTotal += rowsArray.length;
      
      if (mKey === activeMainSheet) mainTotal += rowsArray.length;
      if (mKey === activeMainSheet && sKey === activeSubSheet) subTotal = rowsArray.length;
      
      rowsArray.forEach(r => {
        if (r.isStrikethrough) strikeTotal++;
      });
    });
  });
  
  document.getElementById('stat-grand-total').textContent = `${grandTotal} Rows`;
  document.getElementById('stat-main-total').textContent = `${mainTotal} Rows`;
  document.getElementById('stat-sub-total').textContent = `${subTotal} Rows`;
  document.getElementById('stat-strike-total').textContent = `${strikeTotal} Rows`;
}

document.getElementById('clear-db-btn').addEventListener('click', () => {
  if (confirm("Permanently wipe local workspace database memory?")) {
    localStorage.removeItem('projectDatabase');
    localStorage.removeItem('activeMainSheet');
    localStorage.removeItem('activeSubSheet');
    projectDatabase = {};
    document.getElementById('btn-close-view').click();
    updateDropdownMenu();
    rebuildWorkbookTree();
  }
});
