/* ============================================================
   SHEET TASK EXTRACTOR PRO
   DYNAMIC HEADER VERSION
   ============================================================

   IMPORTANT FEATURES

   1. No fixed column positions.
   2. Header row is detected dynamically.
   3. Assignee column is detected dynamically.
   4. All pasted columns are retained.
   5. Main Folder / Sheet Name is entered by user.
   6. Sub-route / sheet name is entered by user.
   7. Table header stays frozen while scrolling.
   8. Processed headers flash green twice.
   9. Data is stored in localStorage.
   10. Previously stored folders/routes can be opened.
   11. Loader can be closed.
   12. Current data opens immediately after processing.
   ============================================================ */


(function () {

  "use strict";


  /* ==========================================================
     CONSTANTS
     ========================================================== */

  const STORAGE_KEY =
    "sheet_task_extractor_dynamic_v3";


  const THEME_KEY =
    "sheet_task_extractor_theme_v3";


  /* ==========================================================
     STATE
     ========================================================== */

  let database = loadDatabase();

  let currentFolder = "";

  let currentRoute = "";

  let currentDataset = null;

  let detectedHeaderIndex = -1;

  let detectedAssigneeIndex = -1;

  let detectedAssigneeHeader = "";

  let currentAssignees = [];


  /* ==========================================================
     DOM
     ========================================================== */

  const mainFolderInput =
    document.getElementById("main-folder");

  const subRouteInput =
    document.getElementById("sub-route");

  const pasteData =
    document.getElementById("paste-data");

  const processButton =
    document.getElementById("process-button");

  const detectionBox =
    document.getElementById("detection-box");

  const assigneeList =
    document.getElementById("assignee-list");

  const folderTree =
    document.getElementById("folder-tree");

  const tableContainer =
    document.getElementById("table-container");

  const workspaceTitle =
    document.getElementById("workspace-title");

  const workspaceSubtitle =
    document.getElementById("workspace-subtitle");

  const totalRows =
    document.getElementById("total-rows");

  const totalColumns =
    document.getElementById("total-columns");

  const totalAssignees =
    document.getElementById("total-assignees");

  const totalStruck =
    document.getElementById("total-struck");

  const exportButton =
    document.getElementById("export-button");

  const closeViewButton =
    document.getElementById("close-view-button");

  const clearDataButton =
    document.getElementById("clear-data-button");

  const themeButton =
    document.getElementById("theme-button");

  const loaderOverlay =
    document.getElementById("loader-overlay");

  const loaderMessage =
    document.getElementById("loader-message");

  const loaderDetail =
    document.getElementById("loader-detail");

  const loaderProgressBar =
    document.getElementById("loader-progress-bar");

  const loaderClose =
    document.getElementById("loader-close");


  /* ==========================================================
     INITIALISE
     ========================================================== */

  initialize();


  function initialize() {

    applySavedTheme();

    renderFolderTree();

    updateStats();

    setupEvents();

  }


  /* ==========================================================
     EVENTS
     ========================================================== */

  function setupEvents() {

    processButton.addEventListener(
      "click",
      processPastedData
    );


    pasteData.addEventListener(
      "paste",
      function () {

        /*
         Allow browser to finish putting the pasted
         content into the textarea first.
        */

        setTimeout(
          inspectPastedData,
          50
        );

      }
    );


    pasteData.addEventListener(
      "input",
      debounce(
        inspectPastedData,
        120
      )
    );


    exportButton.addEventListener(
      "click",
      exportCurrentCSV
    );


    closeViewButton.addEventListener(
      "click",
      closeCurrentView
    );


    clearDataButton.addEventListener(
      "click",
      clearDatabase
    );


    themeButton.addEventListener(
      "click",
      toggleTheme
    );


    loaderClose.addEventListener(
      "click",
      function () {

        hideLoader();

      }
    );


    window.addEventListener(
      "beforeunload",
      function () {

        saveDatabase();

      }
    );

  }


  /* ==========================================================
     STORAGE
     ========================================================== */

  function loadDatabase() {

    try {

      const raw =
        localStorage.getItem(STORAGE_KEY);

      if (!raw) {

        return {
          folders: {}
        };

      }

      const parsed =
        JSON.parse(raw);

      if (
        !parsed ||
        typeof parsed !== "object"
      ) {

        return {
          folders: {}
        };

      }

      if (
        !parsed.folders ||
        typeof parsed.folders !== "object"
      ) {

        parsed.folders = {};

      }

      return parsed;

    } catch (error) {

      console.error(
        "Could not load local database:",
        error
      );

      return {
        folders: {}
      };

    }

  }


  function saveDatabase() {

    try {

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(database)
      );

    } catch (error) {

      console.error(
        "Could not save database:",
        error
      );

      showToast(
        "Could not save data to local storage.",
        "error"
      );

    }

  }


  /* ==========================================================
     NORMALISE TEXT
     ========================================================== */

  function normalizeText(value) {

    if (
      value === null ||
      value === undefined
    ) {

      return "";

    }

    return String(value)
      .replace(/\uFEFF/g, "")
      .replace(/\u00A0/g, " ")
      .trim();

  }


  function normalizeHeader(value) {

    return normalizeText(value)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[_\-]+/g, " ")
      .trim();

  }


  /*
     This is NOT a fixed column position.

     The code looks through whatever headers the user
     pasted and finds the header that represents Assignee.

     Therefore:

     Assignee in A
     Assignee in AH
     Assignee in AJ
     Assignee in AK
     Assignee in AL

     all work.
  */

  function isAssigneeHeader(value) {

    const header =
      normalizeHeader(value);

    if (!header) {

      return false;

    }

    /*
       Exact / common semantic forms.
    */

    if (
      header === "assignee" ||
      header === "assignee name" ||
      header === "assigned to" ||
      header === "assigned user" ||
      header === "assigned person" ||
      header === "assignee email" ||
      header === "assignee e mail"
    ) {

      return true;

    }


    /*
       Handles headers such as:

       Assignee (Email)
       Task Assignee
       Assignee Name / Email
       Current Assignee
    */

    if (
      header.includes("assignee")
    ) {

      return true;

    }


    if (
      header.includes("assigned to")
    ) {

      return true;

    }


    return false;

  }


  /* ==========================================================
     TSV PARSER
     ========================================================== */

  function parsePastedText(text) {

    const cleaned =
      String(text || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/^\uFEFF/, "");


    const lines =
      cleaned.split("\n");


    const rows = [];


    for (
      let i = 0;
      i < lines.length;
      i++
    ) {

      const line =
        lines[i];


      /*
         Keep empty cells.

         Google Sheets uses TAB separated
         clipboard data.
      */

      const cells =
        parseTSVLine(line);


      /*
         Ignore completely empty lines.
      */

      const hasContent =
        cells.some(
          cell =>
            normalizeText(cell) !== ""
        );


      if (hasContent) {

        rows.push(cells);

      }

    }


    return rows;

  }


  function parseTSVLine(line) {

    const result = [];

    let current = "";

    let inQuotes = false;


    for (
      let i = 0;
      i < line.length;
      i++
    ) {

      const char =
        line[i];


      if (char === '"') {

        /*
           Double quote inside a quoted field.
        */

        if (
          inQuotes &&
          line[i + 1] === '"'
        ) {

          current += '"';

          i++;

          continue;

        }


        inQuotes =
          !inQuotes;

        continue;

      }


      if (
        char === "\t" &&
        !inQuotes
      ) {

        result.push(current);

        current = "";

        continue;

      }


      result.push;

      current += char;

    }


    result.push(current);

    return result;

  }


  /* ==========================================================
     HEADER ROW DETECTION
     ========================================================== */

  function detectHeaderRow(rows) {

    if (
      !Array.isArray(rows) ||
      rows.length === 0
    ) {

      return -1;

    }


    /*
       First priority:

       Find a row that contains the actual
       Assignee header.

       This makes Assignee detection work even
       if there are title rows above the headers.
    */

    for (
      let rowIndex = 0;
      rowIndex < Math.min(rows.length, 30);
      rowIndex++
    ) {

      const row =
        rows[rowIndex];


      for (
        let columnIndex = 0;
        columnIndex < row.length;
        columnIndex++
      ) {

        if (
          isAssigneeHeader(
            row[columnIndex]
          )
        ) {

          return rowIndex;

        }

      }

    }


    /*
       If Assignee is not present, detect the most
       likely header row based on the row containing
       the highest number of unique non-empty cells.
    */

    let bestIndex = 0;

    let bestScore = -Infinity;


    const limit =
      Math.min(rows.length, 20);


    for (
      let i = 0;
      i < limit;
      i++
    ) {

      const row =
        rows[i];


      const nonEmpty =
        row.filter(
          cell =>
            normalizeText(cell) !== ""
        );


      if (nonEmpty.length === 0) {

        continue;

      }


      const unique =
        new Set(
          nonEmpty.map(
            cell =>
              normalizeHeader(cell)
          )
        ).size;


      const textLike =
        nonEmpty.filter(
          cell =>
            /[a-zA-Z]/.test(
              String(cell)
            )
        ).length;


      const numericLike =
        nonEmpty.filter(
          cell =>
            /^[-+]?\d+([.,]\d+)?$/.test(
              normalizeText(cell)
            )
        ).length;


      /*
         Header rows usually contain many text fields
         and many unique values, but relatively fewer
         pure numbers.
      */

      let score =
        nonEmpty.length * 3;

      score += unique * 2;

      score += textLike * 2;

      score -= numericLike;


      /*
         Slight preference for earlier rows.
      */

      score -= i * 0.15;


      if (
        score > bestScore
      ) {

        bestScore = score;

        bestIndex = i;

      }

    }


    return bestIndex;

  }


  /* ==========================================================
     ASSIGNEE COLUMN DETECTION
     ========================================================== */

  function detectAssigneeColumn(headers) {

    if (
      !Array.isArray(headers)
    ) {

      return -1;

    }


    for (
      let i = 0;
      i < headers.length;
      i++
    ) {

      if (
        isAssigneeHeader(
          headers[i]
        )
      ) {

        return i;

      }

    }


    return -1;

  }


  /* ==========================================================
     NORMALISE DATASET
     ========================================================== */

  function buildDataset(
    rows,
    folderName,
    routeName
  ) {

    if (
      !rows ||
      !rows.length
    ) {

      throw new Error(
        "No usable rows were found."
      );

    }


    const headerIndex =
      detectHeaderRow(rows);


    if (
      headerIndex < 0
    ) {

      throw new Error(
        "Could not detect the header row."
      );

    }


    const rawHeaders =
      rows[headerIndex];


    /*
       Keep the user's headers.

       Do not replace them with our own
       hardcoded header list.
    */

    const headers =
      rawHeaders.map(
        (header, index) => {

          const value =
            normalizeText(header);

          /*
             Empty header cells still need a usable
             display name, but this is generated only
             for blank cells.
          */

          if (value) {

            return value;

          }

          return `Column ${index + 1}`;

        }
      );


    /*
       Remove trailing completely empty columns.

       Do NOT remove columns in the middle.
    */

    let lastUsefulColumn =
      headers.length - 1;


    for (
      let c = headers.length - 1;
      c >= 0;
      c--
    ) {

      let useful = false;


      for (
        let r = headerIndex + 1;
        r < rows.length;
        r++
      ) {

        if (
          normalizeText(
            rows[r][c]
          ) !== ""
        ) {

          useful = true;

          break;

        }

      }


      if (
        normalizeText(
          headers[c]
        ) !== ""
      ) {

        useful = true;

      }


      if (useful) {

        lastUsefulColumn = c;

        break;

      }

    }


    const finalHeaders =
      headers.slice(
        0,
        lastUsefulColumn + 1
      );


    const dataRows = [];


    for (
      let r = headerIndex + 1;
      r < rows.length;
      r++
    ) {

      const sourceRow =
        rows[r] || [];


      const row =
        [];


      let hasData = false;


      for (
        let c = 0;
        c < finalHeaders.length;
        c++
      ) {

        const value =
          sourceRow[c] === undefined
            ? ""
            : String(sourceRow[c]);


        row.push(value);


        if (
          normalizeText(value) !== ""
        ) {

          hasData = true;

        }

      }


      if (hasData) {

        dataRows.push(row);

      }

    }


    const assigneeIndex =
      detectAssigneeColumn(
        finalHeaders
      );


    const assigneeHeader =
      assigneeIndex >= 0
        ? finalHeaders[assigneeIndex]
        : "";


    const assignees =
      assigneeIndex >= 0
        ? uniqueNonEmptyValues(
            dataRows.map(
              row =>
                row[assigneeIndex]
            )
          )
        : [];


    return {

      id:
        createId(),

      folder:
        folderName,

      route:
        routeName,

      headers:
        finalHeaders,

      rows:
        dataRows,

      headerIndex,

      assigneeIndex,

      assigneeHeader,

      assignees,

      createdAt:
        new Date().toISOString(),

      updatedAt:
        new Date().toISOString()

    };

  }


  /* ==========================================================
     PROCESS DATA
     ========================================================== */

  async function processPastedData() {

    const folderName =
      normalizeText(
        mainFolderInput.value
      );


    const routeName =
      normalizeText(
        subRouteInput.value
      );


    const text =
      pasteData.value;


    if (!folderName) {

      showToast(
        "Enter the Main Folder / Sheet Name first.",
        "error"
      );

      mainFolderInput.focus();

      return;

    }


    if (!text.trim()) {

      showToast(
        "Paste the Google Sheets data first.",
        "error"
      );

      pasteData.focus();

      return;

    }


    processButton.disabled = true;


    try {

      showLoader();

      await loaderStage(
        "reading",
        "Reading Data",
        "Reading the pasted Google Sheets data...",
        20,
        300
      );


      const rows =
        parsePastedText(text);


      if (
        rows.length === 0
      ) {

        throw new Error(
          "No data was found in the pasted content."
        );

      }


      await loaderStage(
        "analysing",
        "Analysing Data",
        "Finding the real header row and Assignee column...",
        42,
        350
      );


      const dataset =
        buildDataset(
          rows,
          folderName,
          routeName
        );


      await loaderStage(
        "arranging",
        "Arranging Data",
        "Keeping all pasted columns in their original order...",
        64,
        300
      );


      /*
         Store dataset.
      */

      saveDataset(
        dataset
      );


      await loaderStage(
        "storing",
        "Storing Data",
        "Saving the processed dataset...",
        84,
        350
      );


      currentFolder =
        folderName;

      currentRoute =
        routeName;

      currentDataset =
        dataset;

      detectedHeaderIndex =
        dataset.headerIndex;

      detectedAssigneeIndex =
        dataset.assigneeIndex;

      detectedAssigneeHeader =
        dataset.assigneeHeader;

      currentAssignees =
        dataset.assignees;


      renderFolderTree();

      renderCurrentDataset();

      updateDetectionPanel();

      updateStats();


      await loaderStage(
        "success",
        "Success",
        "Data processed successfully. Opening it now...",
        100,
        250
      );


      hideLoader();


      /*
         IMPORTANT:
         Flash after table has actually been rendered.

         This is why the green flash now works.
      */

      requestAnimationFrame(
        function () {

          setTimeout(
            flashProcessedHeaders,
            80
          );

        }
      );


      showToast(
        `${dataset.rows.length} rows processed successfully.`,
        "success"
      );


    } catch (error) {

      console.error(
        "Processing error:",
        error
      );

      hideLoader();

      showToast(
        error.message ||
        "Could not process the pasted data.",
        "error"
      );

    } finally {

      processButton.disabled = false;

    }

  }


  /* ==========================================================
     SAVE DATASET
     ========================================================== */

  function saveDataset(dataset) {

    const folder =
      dataset.folder;


    const route =
      dataset.route ||
      "Main Data";


    if (
      !database.folders[folder]
    ) {

      database.folders[folder] = {

        name:
          folder,

        routes: {}

      };

    }


    database.folders[folder].routes[route] =
      dataset;


    saveDatabase();

  }


  /* ==========================================================
     RENDER FOLDER TREE
     ========================================================== */

  function renderFolderTree() {

    folderTree.innerHTML = "";


    const folderNames =
      Object.keys(
        database.folders
      );


    if (
      folderNames.length === 0
    ) {

      folderTree.innerHTML = `
        <div class="tree-empty">
          No stored folders yet.
        </div>
      `;

      return;

    }


    folderNames.forEach(
      folderName => {

        const folder =
          database.folders[
            folderName
          ];


        const folderBlock =
          document.createElement(
            "div"
          );

        folderBlock.className =
          "folder-block";


        const routes =
          folder.routes || {};


        const routeNames =
          Object.keys(routes);


        let totalRowsInFolder = 0;


        routeNames.forEach(
          routeName => {

            const dataset =
              routes[routeName];


            if (
              dataset &&
              Array.isArray(
                dataset.rows
              )
            ) {

              totalRowsInFolder +=
                dataset.rows.length;

            }

          }
        );


        const folderHeader =
          document.createElement(
            "div"
          );

        folderHeader.className =
          "folder-header";


        folderHeader.innerHTML = `

          <div class="folder-name">
            ${escapeHTML(folderName)}
          </div>

          <div class="folder-count">
            ${totalRowsInFolder}
          </div>

        `;


        const routesContainer =
          document.createElement(
            "div"
          );

        routesContainer.className =
          "folder-routes";


        routeNames.forEach(
          routeName => {

            const dataset =
              routes[routeName];


            const routeItem =
              document.createElement(
                "div"
              );

            routeItem.className =
              "route-item";


            if (
              currentFolder === folderName &&
              currentRoute === routeName
            ) {

              routeItem.classList.add(
                "active"
              );

            }


            const rowCount =
              dataset &&
              Array.isArray(
                dataset.rows
              )
                ? dataset.rows.length
                : 0;


            routeItem.innerHTML = `

              <div
                class="route-name"
                title="${escapeAttribute(routeName)}"
              >
                ${escapeHTML(routeName)}
              </div>

              <div class="route-count">
                ${rowCount}
              </div>

            `;


            routeItem.addEventListener(
              "click",
              function () {

                openStoredDataset(
                  folderName,
                  routeName
                );

              }
            );


            routesContainer.appendChild(
              routeItem
            );

          }
        );


        folderHeader.addEventListener(
          "click",
          function () {

            routesContainer.classList.toggle(
              "hidden"
            );

          }
        );


        folderBlock.appendChild(
          folderHeader
        );


        folderBlock.appendChild(
          routesContainer
        );


        folderTree.appendChild(
          folderBlock
        );

      }
    );

  }


  /* ==========================================================
     OPEN STORED DATASET
     ========================================================== */

  async function openStoredDataset(
    folderName,
    routeName
  ) {

    const folder =
      database.folders[
        folderName
      ];


    if (!folder) {

      showToast(
        "Folder was not found.",
        "error"
      );

      return;

    }


    const dataset =
      folder.routes &&
      folder.routes[
        routeName
      ];


    if (!dataset) {

      showToast(
        "Stored route was not found.",
        "error"
      );

      return;

    }


    showLoader();


    try {

      await loaderStage(
        "reading",
        "Reading Data",
        "Opening the selected dataset...",
        20,
        220
      );


      await loaderStage(
        "analysing",
        "Analysing Data",
        "Checking the stored headers...",
        40,
        220
      );


      await loaderStage(
        "arranging",
        "Arranging Data",
        "Preparing the table...",
        60,
        180
      );


      currentFolder =
        folderName;

      currentRoute =
        routeName;

      currentDataset =
        dataset;


      detectedHeaderIndex =
        dataset.headerIndex ?? 0;

      detectedAssigneeIndex =
        detectAssigneeColumn(
          dataset.headers
        );

      detectedAssigneeHeader =
        detectedAssigneeIndex >= 0
          ? dataset.headers[
              detectedAssigneeIndex
            ]
          : "";


      currentAssignees =
        uniqueNonEmptyValues(
          detectedAssigneeIndex >= 0
            ? dataset.rows.map(
                row =>
                  row[
                    detectedAssigneeIndex
                  ]
              )
            : []
        );


      renderCurrentDataset();

      updateDetectionPanel();

      updateStats();

      renderFolderTree();


      await loaderStage(
        "storing",
        "Loading View",
        "Opening the selected data...",
        82,
        180
      );


      await loaderStage(
        "success",
        "Success",
        "Dataset is ready.",
        100,
        180
      );


      hideLoader();


      /*
         Also flash headers when an existing dataset
         is opened.
      */

      requestAnimationFrame(
        function () {

          setTimeout(
            flashProcessedHeaders,
            80
          );

        }
      );


    } catch (error) {

      console.error(
        error
      );

      hideLoader();

      showToast(
        "Could not open the selected dataset.",
        "error"
      );

    }

  }


  /* ==========================================================
     RENDER TABLE
     ========================================================== */

  function renderCurrentDataset() {

    if (
      !currentDataset
    ) {

      return;

    }


    const headers =
      currentDataset.headers || [];


    const rows =
      currentDataset.rows || [];


    /*
       Build table using the exact dynamic headers.
    */

    const table =
      document.createElement(
        "table"
      );

    table.id =
      "data-table";


    const thead =
      document.createElement(
        "thead"
      );


    const headerRow =
      document.createElement(
        "tr"
      );


    headers.forEach(
      (header, index) => {

        const th =
          document.createElement(
            "th"
          );


        th.textContent =
          header;


        th.dataset.columnIndex =
          String(index);


        /*
           Mark Assignee header.
        */

        if (
          index ===
          currentDataset.assigneeIndex
        ) {

          th.classList.add(
            "header-assignee"
          );

          th.dataset.assignee =
            "true";

        }


        headerRow.appendChild(
          th
        );

      }
    );


    thead.appendChild(
      headerRow
    );


    const tbody =
      document.createElement(
        "tbody"
      );


    rows.forEach(
      (row, rowIndex) => {

        const tr =
          document.createElement(
            "tr"
          );


        tr.dataset.rowIndex =
          String(rowIndex);


        /*
           Preserve all columns.
        */

        for (
          let c = 0;
          c < headers.length;
          c++
        ) {

          const td =
            document.createElement(
              "td"
            );


          const value =
            row[c] === undefined
              ? ""
              : row[c];


          td.textContent =
            value;


          td.title =
            value;


          td.dataset.columnIndex =
            String(c);


          tr.appendChild(
            td
          );

        }


        /*
           Google Sheets copied data does not reliably
           carry strikethrough formatting through plain
           clipboard text.

           This class is therefore only applied if the
           stored dataset explicitly contains it.
        */

        if (
          Array.isArray(
            currentDataset.struckRows
          ) &&
          currentDataset.struckRows.includes(
            rowIndex
          )
        ) {

          tr.style.textDecoration =
            "line-through";

          tr.style.opacity =
            "0.55";

        }


        tbody.appendChild(
          tr
        );

      }
    );


    table.appendChild(
      thead
    );

    table.appendChild(
      tbody
    );


    tableContainer.innerHTML =
      "";

    tableContainer.appendChild(
      table
    );


    workspaceTitle.textContent =
      currentRoute
        ? `${currentFolder} / ${currentRoute}`
        : currentFolder;


    workspaceSubtitle.textContent =
      `${rows.length} rows • ${headers.length} columns` +
      (
        currentDataset.assigneeIndex >= 0
          ? ` • Assignee: ${currentDataset.assigneeHeader}`
          : " • Assignee header not found"
      );


    /*
       Make sure the table container is at the
       top whenever a new dataset opens.
    */

    tableContainer.scrollTop =
      0;

    tableContainer.scrollLeft =
      0;

  }


  /* ==========================================================
     GREEN FLASH
     ========================================================== */

  function flashProcessedHeaders() {

    const table =
      document.getElementById(
        "data-table"
      );


    if (!table) {

      return;

    }


    const headers =
      table.querySelectorAll(
        "thead th"
      );


    if (
      !headers.length
    ) {

      return;

    }


    /*
       Remove old animation classes first.
    */

    headers.forEach(
      th => {

        th.classList.remove(
          "flash-green-twice"
        );

        /*
           Force browser reflow.

           This is important when processing
           another dataset immediately after
           the previous one.
        */

        void th.offsetWidth;

      }
    );


    /*
       Flash ALL detected headers.

       This gives a clear visual confirmation that
       the extracted header row was successfully
       processed.

       Assignee is also included.
    */

    headers.forEach(
      th => {

        th.classList.add(
          "flash-green-twice"
        );

      }
    );


    /*
       Remove the class after the animation finishes
       so the next processing operation can trigger it.
    */

    setTimeout(
      function () {

        headers.forEach(
          th => {

            th.classList.remove(
              "flash-green-twice"
            );

          }
        );

      },
      1300
    );

  }


  /* ==========================================================
     DETECTION PANEL
     ========================================================== */

  function inspectPastedData() {

    const text =
      pasteData.value;


    if (!text.trim()) {

      detectionBox.innerHTML =
        `
        Paste sheet data first. The program will
        automatically inspect the pasted rows and
        locate the actual header row.
        `;

      assigneeList.innerHTML =
        "";

      return;

    }


    try {

      const rows =
        parsePastedText(text);


      const headerIndex =
        detectHeaderRow(rows);


      if (
        headerIndex < 0
      ) {

        detectionBox.innerHTML =
          `
          <span class="detection-warning">
            Header row not detected yet.
          </span>
          `;

        return;

      }


      const headers =
        rows[headerIndex] || [];


      const assigneeIndex =
        detectAssigneeColumn(
          headers
        );


      if (
        assigneeIndex >= 0
      ) {

        const values =
          uniqueNonEmptyValues(
            rows
              .slice(headerIndex + 1)
              .map(
                row =>
                  row[assigneeIndex]
              )
          );


        detectionBox.innerHTML =
          `
          <span class="detection-ok">
            ✓ Header detected
          </span>
          <br>
          Header row:
          ${headerIndex + 1}
          <br>
          Assignee column:
          ${columnNumberToLetters(
            assigneeIndex
          )}
          <br>
          Header:
          ${escapeHTML(
            normalizeText(
              headers[assigneeIndex]
            )
          )}
          `;


        renderAssigneeList(
          values
        );

      } else {

        detectionBox.innerHTML =
          `
          <span class="detection-warning">
            ✓ Header row detected
          </span>
          <br>
          Header row:
          ${headerIndex + 1}
          <br>
          <span class="detection-warning">
            Assignee header was not found in
            the pasted headers.
          </span>
          `;


        assigneeList.innerHTML =
          "";

      }

    } catch (error) {

      detectionBox.innerHTML =
        `
        <span class="detection-warning">
          Waiting for valid sheet data...
        </span>
        `;

    }

  }


  function updateDetectionPanel() {

    if (
      !currentDataset
    ) {

      return;

    }


    if (
      detectedAssigneeIndex >= 0
    ) {

      detectionBox.innerHTML =
        `
        <span class="detection-ok">
          ✓ Assignee detected
        </span>
        <br>
        Header row:
        ${detectedHeaderIndex + 1}
        <br>
        Assignee column:
        ${columnNumberToLetters(
          detectedAssigneeIndex
        )}
        <br>
        Header:
        ${escapeHTML(
          detectedAssigneeHeader
        )}
        `;


      renderAssigneeList(
        currentAssignees
      );

    } else {

      detectionBox.innerHTML =
        `
        <span class="detection-warning">
          Header row detected, but no Assignee
          header was found.
        </span>
        `;

      assigneeList.innerHTML =
        "";

    }

  }


  function renderAssigneeList(
    values
  ) {

    assigneeList.innerHTML =
      "";


    values
      .slice(0, 100)
      .forEach(
        value => {

          const pill =
            document.createElement(
              "div"
            );


          pill.className =
            "assignee-pill";


          pill.textContent =
            value;


          assigneeList.appendChild(
            pill
          );

        }
      );

  }


  /* ==========================================================
     STATS
     ========================================================== */

  function updateStats() {

    let allRows = 0;

    let allAssignees =
      new Set();

    let struck = 0;


    Object.values(
      database.folders
    ).forEach(
      folder => {

        Object.values(
          folder.routes || {}
        ).forEach(
          dataset => {

            const rows =
              dataset.rows || [];


            allRows +=
              rows.length;


            const assigneeIndex =
              detectAssigneeColumn(
                dataset.headers || []
              );


            if (
              assigneeIndex >= 0
            ) {

              rows.forEach(
                row => {

                  const value =
                    normalizeText(
                      row[
                        assigneeIndex
                      ]
                    );


                  if (value) {

                    allAssignees.add(
                      value
                    );

                  }

                }
              );

            }


            if (
              Array.isArray(
                dataset.struckRows
              )
            ) {

              struck +=
                dataset.struckRows.length;

            }

          }
        );

      }
    );


    totalRows.textContent =
      currentDataset
        ? currentDataset.rows.length
        : allRows;


    totalColumns.textContent =
      currentDataset
        ? currentDataset.headers.length
        : 0;


    totalAssignees.textContent =
      currentDataset
        ? currentDataset.assignees.length
        : allAssignees.size;


    totalStruck.textContent =
      currentDataset &&
      Array.isArray(
        currentDataset.struckRows
      )
        ? currentDataset.struckRows.length
        : struck;

  }


  /* ==========================================================
     LOADER
     ========================================================== */

  function showLoader() {

    loaderOverlay.classList.remove(
      "hidden"
    );


    loaderProgressBar.style.width =
      "0%";


    resetLoaderSteps();


    loaderMessage.textContent =
      "Reading Data";


    loaderDetail.textContent =
      "Preparing...";

  }


  function hideLoader() {

    loaderOverlay.classList.add(
      "hidden"
    );

  }


  function resetLoaderSteps() {

    document
      .querySelectorAll(
        ".loader-step"
      )
      .forEach(
        step => {

          step.classList.remove(
            "active",
            "done"
          );

        }
      );

  }


  function activateLoaderStep(
    name
  ) {

    resetActiveLoaderSteps();


    const step =
      document.getElementById(
        `step-${name}`
      );


    if (!step) {

      return;

    }


    step.classList.add(
      "active"
    );


    const order = [
      "reading",
      "analysing",
      "arranging",
      "storing",
      "success"
    ];


    const current =
      order.indexOf(name);


    order.forEach(
      (stepName, index) => {

        const element =
          document.getElementById(
            `step-${stepName}`
          );


        if (
          element &&
          index < current
        ) {

          element.classList.remove(
            "active"
          );

          element.classList.add(
            "done"
          );

        }

      }
    );

  }


  function resetActiveLoaderSteps() {

    document
      .querySelectorAll(
        ".loader-step"
      )
      .forEach(
        step => {

          step.classList.remove(
            "active"
          );

        }
      );

  }


  function loaderStage(
    name,
    title,
    detail,
    progress,
    delay
  ) {

    return new Promise(
      resolve => {

        activateLoaderStep(
          name
        );


        loaderMessage.textContent =
          title;


        loaderDetail.textContent =
          detail;


        loaderProgressBar.style.width =
          `${progress}%`;


        setTimeout(
          resolve,
          delay
        );

      }
    );

  }


  /* ==========================================================
     CLOSE VIEW
     ========================================================== */

  function closeCurrentView() {

    currentDataset = null;

    currentFolder = "";

    currentRoute = "";

    detectedHeaderIndex = -1;

    detectedAssigneeIndex = -1;

    detectedAssigneeHeader = "";

    currentAssignees = [];


    workspaceTitle.textContent =
      "No Data Loaded";


    workspaceSubtitle.textContent =
      "Paste data from Google Sheets on the left.";


    tableContainer.innerHTML =
      `
      <div class="empty-workspace">

        <div class="empty-box">

          <strong>Ready.</strong>

          Paste your Google Sheets data in the
          left panel, enter the Main Folder / Sheet Name,
          then click <strong>Process & Store Data</strong>.

        </div>

      </div>
      `;


    updateDetectionPanel();

    updateStats();

    renderFolderTree();

  }


  /* ==========================================================
     EXPORT CSV
     ========================================================== */

  function exportCurrentCSV() {

    if (
      !currentDataset
    ) {

      showToast(
        "Open or process a dataset first.",
        "error"
      );

      return;

    }


    const headers =
      currentDataset.headers || [];


    const rows =
      currentDataset.rows || [];


    const csvRows = [];


    csvRows.push(
      headers.map(
        csvEscape
      ).join(",")
    );


    rows.forEach(
      row => {

        const normalized =
          [];


        for (
          let i = 0;
          i < headers.length;
          i++
        ) {

          normalized.push(
            row[i] || ""
          );

        }


        csvRows.push(
          normalized
            .map(csvEscape)
            .join(",")
        );

      }
    );


    const csv =
      csvRows.join("\r\n");


    const blob =
      new Blob(
        [csv],
        {
          type:
            "text/csv;charset=utf-8;"
        }
      );


    const url =
      URL.createObjectURL(
        blob
      );


    const anchor =
      document.createElement(
        "a"
      );


    anchor.href =
      url;


    anchor.download =
      sanitizeFilename(
        currentFolder +
        "_" +
        (
          currentRoute ||
          "data"
        ) +
        ".csv"
      );


    document.body.appendChild(
      anchor
    );


    anchor.click();


    anchor.remove();


    URL.revokeObjectURL(
      url
    );

  }


  function csvEscape(value) {

    const text =
      String(
        value === undefined ||
        value === null
          ? ""
          : value
      );


    if (
      /[",\r\n]/.test(text)
    ) {

      return `"${text.replace(
        /"/g,
        '""'
      )}"`;

    }


    return text;

  }


  /* ==========================================================
     CLEAR DATABASE
     ========================================================== */

  function clearDatabase() {

    const confirmed =
      window.confirm(
        "Are you sure you want to delete all locally stored sheet data?"
      );


    if (!confirmed) {

      return;

    }


    database = {
      folders: {}
    };


    saveDatabase();


    closeCurrentView();


    renderFolderTree();


    showToast(
      "Local database cleared.",
      "success"
    );

  }


  /* ==========================================================
     THEME
     ========================================================== */

  function applySavedTheme() {

    const saved =
      localStorage.getItem(
        THEME_KEY
      );


    if (
      saved === "light"
    ) {

      document.body.style.background =
        "#f5f5f5";


      /*
         Keep original dark interface by default.
         The light mode button is intentionally
         lightweight so the original design is not
         changed during normal use.
      */

    }

  }


  function toggleTheme() {

    const current =
      document.body.dataset.theme ||
      "dark";


    if (
      current === "dark"
    ) {

      document.body.dataset.theme =
        "light";

      applyLightTheme();

      themeButton.textContent =
        "◐ Light Mode";

      localStorage.setItem(
        THEME_KEY,
        "light"
      );

    } else {

      document.body.dataset.theme =
        "dark";

      applyDarkTheme();

      themeButton.textContent =
        "◑ Dark Mode";

      localStorage.setItem(
        THEME_KEY,
        "dark"
      );

    }

  }


  function applyLightTheme() {

    document.documentElement.style.setProperty(
      "--bg",
      "#f5f5f7"
    );

    document.documentElement.style.setProperty(
      "--panel",
      "#ffffff"
    );

    document.documentElement.style.setProperty(
      "--panel2",
      "#f8f8fa"
    );

    document.documentElement.style.setProperty(
      "--text",
      "#18181b"
    );

    document.documentElement.style.setProperty(
      "--muted",
      "#71717a"
    );

  }


  function applyDarkTheme() {

    document.documentElement.style.setProperty(
      "--bg",
      "#0f0f11"
    );

    document.documentElement.style.setProperty(
      "--panel",
      "#121214"
    );

    document.documentElement.style.setProperty(
      "--panel2",
      "#18181b"
    );

    document.documentElement.style.setProperty(
      "--text",
      "#f5f5f7"
    );

    document.documentElement.style.setProperty(
      "--muted",
      "#9b9ba3"
    );

  }


  /* ==========================================================
     UNIQUE VALUES
     ========================================================== */

  function uniqueNonEmptyValues(
    values
  ) {

    const set =
      new Set();


    (values || []).forEach(
      value => {

        const cleaned =
          normalizeText(value);


        if (
          cleaned
        ) {

          set.add(
            cleaned
          );

        }

      }
    );


    return Array.from(
      set
    );

  }


  /* ==========================================================
     COLUMN LETTER
     ========================================================== */

  function columnNumberToLetters(
    zeroBasedIndex
  ) {

    let n =
      Number(
        zeroBasedIndex
      ) + 1;


    if (
      !Number.isFinite(n) ||
      n < 1
    ) {

      return "";

    }


    let result = "";


    while (
      n > 0
    ) {

      const remainder =
        (n - 1) % 26;


      result =
        String.fromCharCode(
          65 + remainder
        ) +
        result;


      n =
        Math.floor(
          (n - 1) / 26
        );

    }


    return result;

  }


  /* ==========================================================
     ID
     ========================================================== */

  function createId() {

    return (
      Date.now().toString(36) +
      "_" +
      Math.random()
        .toString(36)
        .slice(2, 10)
    );

  }


  /* ==========================================================
     ESCAPE HTML
     ========================================================== */

  function escapeHTML(
    value
  ) {

    return String(
      value === undefined ||
      value === null
        ? ""
        : value
    )
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#039;"
      );

  }


  function escapeAttribute(
    value
  ) {

    return escapeHTML(
      value
    );

  }


  /* ==========================================================
     FILENAME
     ========================================================== */

  function sanitizeFilename(
    value
  ) {

    return String(
      value || "export"
    )
      .replace(
        /[<>:"/\\|?*]+/g,
        "_"
      )
      .replace(
        /\s+/g,
        "_"
      );

  }


  /* ==========================================================
     TOAST
     ========================================================== */

  function showToast(
    message,
    type
  ) {

    const container =
      document.getElementById(
        "toast-container"
      );


    const toast =
      document.createElement(
        "div"
      );


    toast.className =
      "toast " +
      (
        type ||
        ""
      );


    toast.textContent =
      message;


    container.appendChild(
      toast
    );


    setTimeout(
      function () {

        toast.style.opacity =
          "0";

        toast.style.transform =
          "translateY(5px)";

        toast.style.transition =
          "opacity .2s ease, transform .2s ease";


        setTimeout(
          function () {

            toast.remove();

          },
          220
        );

      },
      3000
    );

  }


  /* ==========================================================
     DEBOUNCE
     ========================================================== */

  function debounce(
    fn,
    delay
  ) {

    let timer = null;


    return function () {

      clearTimeout(
        timer
      );


      const args =
        arguments;


      timer =
        setTimeout(
          function () {

            fn.apply(
              null,
              args
            );

          },
          delay
        );

    };

  }


})();
