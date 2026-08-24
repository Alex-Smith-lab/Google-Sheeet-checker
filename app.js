/* ============================================================
   SHEET TASK EXTRACTOR PRO
   DYNAMIC HEADER VERSION
   ============================================================ */

let projectDatabase = {};

let activeMainSheet = "";
let activeSubSheet = "";

let clipboardHtmlBuffer = "";

let detectedAssignees = [];

let selectedAssignees = new Set();

let parsedRowsStream = [];

let detectedAssigneeColIdx = -1;

let detectedHeaderRowIdx = -1;

let detectedHeaders = [];

let loaderMode = "process";

let loaderCancelled = false;

let loaderRunId = 0;


/* ============================================================
   LOADER STAGES
   ============================================================ */

const loaderStages = [

  [
    "reading",
    "Reading data",
    "Reading the selected data stream...",
    18
  ],

  [
    "analysing",
    "Analysing data",
    "Detecting headers, Assignee and row structure...",
    38
  ],

  [
    "arranging",
    "Arranging data",
    "Aligning records using the pasted headers...",
    60
  ],

  [
    "storing",
    "Storing data to the web",
    "Saving the processed records to this workspace...",
    82
  ],

  [
    "success",
    "Successfully extracted",
    "The data is ready and the workspace is opening.",
    100
  ]

];


/* ============================================================
   BASIC HELPERS
   ============================================================ */

function wait(ms) {

  return new Promise(
    resolve => setTimeout(resolve, ms)
  );

}


function escapeHtml(value) {

  return String(value ?? "").replace(
    /[&<>"']/g,

    char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char])
  );

}


/* ============================================================
   HEADER NORMALIZATION
   ============================================================ */

function normalizeHeader(value) {

  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[_\-\/]+/g, " ")
    .trim();

}


function isAssigneeHeader(value) {

  const normalized =
    normalizeHeader(value);

  if (!normalized) {
    return false;
  }

  if (normalized === "assignee") {
    return true;
  }

  if (
    normalized === "assigned to" ||
    normalized === "assigned user" ||
    normalized === "assigned person"
  ) {
    return true;
  }

  return (
    normalized.startsWith("assignee ") ||
    normalized.startsWith("assigned ")
  );

}


/* ============================================================
   ROUTE HEADER DETECTION
   No master header list is used.
   ============================================================ */

function findRouteColumn(headers) {

  for (
    let i = 0;
    i < headers.length;
    i++
  ) {

    const normalized =
      normalizeHeader(headers[i]);

    if (
      normalized.includes("bus route") ||
      normalized === "route" ||
      normalized.includes("route name") ||
      normalized.includes("route identifier")
    ) {

      return i;

    }

  }

  return -1;

}


/* ============================================================
   URL ACTIVITY
   ============================================================ */

function setActivityUrl(
  state,
  folder = "",
  route = ""
) {

  const params =
    new URLSearchParams();

  if (state) {
    params.set("activity", state);
  }

  if (folder) {
    params.set("folder", folder);
  }

  if (route) {
    params.set("route", route);
  }

  try {

    history.replaceState(
      {
        state,
        folder,
        route
      },

      "",

      `${location.pathname}${
        params.toString()
          ? "?" + params.toString()
          : ""
      }`
    );

  } catch (error) {

    console.warn(
      "Unable to update activity URL:",
      error
    );

  }


  const titles = {

    opening:
      `Opening ${route} — ${folder} | Sheet Task Extractor Pro`,

    processing:
      `Processing data — ${folder} | Sheet Task Extractor Pro`,

    viewing:
      `${route} — ${folder} | Sheet Task Extractor Pro`,

    reading:
      `Reading data — ${route} | Sheet Task Extractor Pro`,

    analysing:
      `Analysing data — ${route} | Sheet Task Extractor Pro`,

    arranging:
      `Arranging data — ${route} | Sheet Task Extractor Pro`,

    storing:
      `Storing data — ${route} | Sheet Task Extractor Pro`,

    success:
      `Successfully extracted — ${route} | Sheet Task Extractor Pro`

  };


  document.title =
    titles[state] ||
    "Sheet Task Extractor Pro - Direct Ingest Workspace";

}


/* ============================================================
   ONLINE STATUS
   ============================================================ */

function verifyOnlineStatus() {

  const blocker =
    document.getElementById(
      "global-offline-blocker"
    );

  if (!navigator.onLine) {

    blocker.classList.remove(
      "hidden"
    );

    return false;

  }

  blocker.classList.add(
    "hidden"
  );

  return true;

}


/* ============================================================
   LOADER
   ============================================================ */

function showLoader(
  mode,
  folder = "",
  route = ""
) {

  loaderMode = mode;

  loaderCancelled = false;

  const overlay =
    document.getElementById(
      "view-loader-overlay"
    );

  if (!overlay) {
    return;
  }

  overlay.classList.remove(
    "hidden",
    "success-state"
  );


  const kicker =
    document.getElementById(
      "view-loader-kicker"
    );

  if (kicker) {

    kicker.textContent =
      mode === "route"
        ? "ROUTE WORKSPACE"
        : "DATA WORKFLOW";

  }


  const routeLabel =
    document.getElementById(
      "loader-route-name"
    );

  if (routeLabel) {

    if (folder || route) {

      routeLabel.textContent =
        `${mode === "route" ? "Opening" : "Processing"}: ${
          folder
        }${route ? " / " + route : ""}`;

      routeLabel.classList.remove(
        "hidden"
      );

    } else {

      routeLabel.classList.add(
        "hidden"
      );

      routeLabel.textContent = "";

    }

  }


  const closeButton =
    document.getElementById(
      "btn-close-loader"
    );

  if (closeButton) {

    closeButton.disabled = false;

  }

}


function hideLoader() {

  const overlay =
    document.getElementById(
      "view-loader-overlay"
    );

  if (overlay) {

    overlay.classList.add(
      "hidden"
    );

    overlay.classList.remove(
      "success-state"
    );

  }


  const closeButton =
    document.getElementById(
      "btn-close-loader"
    );

  if (closeButton) {

    closeButton.disabled = false;

  }

}


function cancelLoader() {

  loaderCancelled = true;

  loaderRunId++;

  hideLoader();

  setActivityUrl(
    "",
    "",
    ""
  );

}


function setLoaderStage(key) {

  const index =
    loaderStages.findIndex(
      stage => stage[0] === key
    );

  if (index < 0) {
    return;
  }

  const stage =
    loaderStages[index];


  const title =
    document.getElementById(
      "view-loader-text"
    );

  const detail =
    document.getElementById(
      "view-loader-detail"
    );

  const progress =
    document.getElementById(
      "view-loader-progress"
    );


  if (title) {

    title.textContent =
      stage[1];

  }


  if (detail) {

    detail.textContent =
      stage[2];

  }


  if (progress) {

    progress.style.width =
      stage[3] + "%";

  }


  document
    .querySelectorAll(
      ".loader-step"
    )
    .forEach(
      element => {

        const stepKey =
          element.dataset.step;

        const stepIndex =
          loaderStages.findIndex(
            stageItem =>
              stageItem[0] === stepKey
          );


        element.classList.remove(
          "active",
          "done",
          "success"
        );


        if (
          key === "success" &&
          stepKey === "success"
        ) {

          element.classList.add(
            "success"
          );

        } else if (
          stepIndex < index
        ) {

          element.classList.add(
            "done"
          );

        } else if (
          stepIndex === index
        ) {

          element.classList.add(
            "active"
          );

        }

      }
    );


  const overlay =
    document.getElementById(
      "view-loader-overlay"
    );

  if (overlay) {

    overlay.classList.toggle(
      "success-state",
      key === "success"
    );

  }

}


async function runActivityLoader(
  mode,
  folder = "",
  route = ""
) {

  const myRunId =
    ++loaderRunId;

  showLoader(
    mode,
    folder,
    route
  );


  for (
    const stage of loaderStages
  ) {

    if (
      loaderCancelled ||
      myRunId !== loaderRunId
    ) {

      return false;

    }


    setLoaderStage(
      stage[0]
    );


    setActivityUrl(
      stage[0],
      folder,
      route
    );


    if (
      stage[0] !== "success"
    ) {

      await wait(
        mode === "route"
          ? 180
          : 240
      );

    }

  }


  await wait(
    mode === "route"
      ? 220
      : 350
  );


  if (
    loaderCancelled ||
    myRunId !== loaderRunId
  ) {

    return false;

  }


  return true;

}


/* ============================================================
   INITIAL LOAD
   ============================================================ */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    verifyOnlineStatus();


    const savedData =
      localStorage.getItem(
        "projectDatabase"
      );


    const savedTheme =
      localStorage.getItem(
        "appTheme"
      );


    const savedMain =
      localStorage.getItem(
        "activeMainSheet"
      );


    const savedSub =
      localStorage.getItem(
        "activeSubSheet"
      );


    if (savedData) {

      try {

        projectDatabase =
          JSON.parse(
            savedData
          ) || {};

      } catch (error) {

        console.error(
          "Unable to restore database:",
          error
        );

        projectDatabase = {};

      }

    }


    if (
      savedTheme === "dark"
    ) {

      document.documentElement
        .setAttribute(
          "data-theme",
          "dark"
        );


      const toggleButton =
        document.getElementById(
          "theme-toggle-btn"
        );


      if (toggleButton) {

        toggleButton.textContent =
          "☼ Light Mode";

      }

    }


    updateDropdownMenu();

    rebuildWorkbookTree();


    if (
      savedMain &&
      savedSub &&
      projectDatabase[savedMain] &&
      projectDatabase[savedMain][savedSub]
    ) {

      activeMainSheet =
        savedMain;

      activeSubSheet =
        savedSub;


      document
        .getElementById(
          "view-navigation-row"
        )
        .classList.remove(
          "hidden"
        );


      document
        .getElementById(
          "view-title"
        )
        .innerHTML =
          `Folder: <b>${escapeHtml(savedMain)}</b> ➔ Route: <b>${escapeHtml(savedSub)}</b>`;


      renderSpreadsheetViewGrid(
        projectDatabase[savedMain][savedSub]
      );

      setActivityUrl(
        "viewing",
        savedMain,
        savedSub
      );

    }


    calculateGlobalMetrics();

  }
);


/* ============================================================
   NETWORK
   ============================================================ */

window.addEventListener(
  "offline",
  verifyOnlineStatus
);

window.addEventListener(
  "online",
  verifyOnlineStatus
);


/* ============================================================
   PASTE EVENT
   ============================================================ */

document
  .getElementById(
    "paste-input"
  )
  .addEventListener(
    "paste",
    event => {

      clipboardHtmlBuffer = "";


      if (
        event.clipboardData
      ) {

        const htmlData =
          event.clipboardData.getData(
            "text/html"
          );


        if (htmlData) {

          clipboardHtmlBuffer =
            htmlData;

        }

      }


      setTimeout(
        parsePastedStreamForAssignees,
        100
      );

    }
  );


document
  .getElementById(
    "paste-input"
  )
  .addEventListener(
    "input",
    () => {

      parsePastedStreamForAssignees();

    }
  );


/* ============================================================
   PARSE PASTED DATA
   ============================================================ */

function parsePastedStreamForAssignees() {

  const rawText =
    document.getElementById(
      "paste-input"
    ).value;


  const container =
    document.getElementById(
      "assignee-selector-box"
    );


  const pillsList =
    document.getElementById(
      "assignee-pills-list"
    );


  if (
    !rawText.trim()
  ) {

    container.classList.add(
      "hidden"
    );

    detectedAssignees = [];

    selectedAssignees =
      new Set();

    return;

  }


  const lines =
    rawText
      .split(/\r?\n/)
      .filter(
        line =>
          line.trim().length > 0
      );


  if (
    !lines.length
  ) {

    container.classList.add(
      "hidden"
    );

    return;

  }


  parsedRowsStream =
    lines.map(
      line =>
        line
          .split("\t")
          .map(
            cell =>
              cell.trim()
          )
    );


  /*
   * Find the actual header row.
   *
   * We inspect the first 10 rows.
   * No masterHeaders are used.
   */

  detectedHeaderRowIdx = -1;

  detectedAssigneeColIdx = -1;

  detectedHeaders = [];


  for (
    let rowIndex = 0;

    rowIndex <
    Math.min(
      parsedRowsStream.length,
      10
    );

    rowIndex++
  ) {

    const row =
      parsedRowsStream[
        rowIndex
      ];


    const assigneeIndex =
      row.findIndex(
        isAssigneeHeader
      );


    if (
      assigneeIndex !== -1
    ) {

      detectedHeaderRowIdx =
        rowIndex;

      detectedAssigneeColIdx =
        assigneeIndex;

      detectedHeaders =
        row.map(
          cell =>
            cell.trim()
        );

      break;

    }

  }


  /*
   * If no Assignee header is found,
   * still try to identify a sensible
   * header row.
   */

  if (
    detectedHeaderRowIdx === -1
  ) {

    const candidateIndex =
      parsedRowsStream.findIndex(
        row =>
          row.length >= 2 &&
          row.some(
            cell =>
              normalizeHeader(cell) ===
                "location name" ||
              normalizeHeader(cell) ===
                "location description" ||
              normalizeHeader(cell) ===
                "video name" ||
              normalizeHeader(cell) ===
                "site id"
          )
      );


    if (
      candidateIndex !== -1
    ) {

      detectedHeaderRowIdx =
        candidateIndex;

      detectedHeaders =
        parsedRowsStream[
          candidateIndex
        ].map(
          cell =>
            cell.trim()
        );

    } else {

      detectedHeaderRowIdx = 0;

      detectedHeaders =
        parsedRowsStream[0].map(
          cell =>
            cell.trim()
        );

    }

  }


  /*
   * Search Assignee again from
   * the selected actual header.
   */

  if (
    detectedHeaders.length
  ) {

    detectedAssigneeColIdx =
      detectedHeaders.findIndex(
        isAssigneeHeader
      );

  }


  /*
   * Extract unique assignees.
   */

  const assigneeSet =
    new Set();


  const startRow =
    detectedHeaderRowIdx + 1;


  if (
    detectedAssigneeColIdx !== -1
  ) {

    for (
      let rowIndex = startRow;

      rowIndex <
      parsedRowsStream.length;

      rowIndex++
    ) {

      const row =
        parsedRowsStream[
          rowIndex
        ];


      const value =
        row[
          detectedAssigneeColIdx
        ];


      if (
        value &&
        value.trim()
      ) {

        const cleanValue =
          value.trim();


        if (
          !isAssigneeHeader(
            cleanValue
          )
        ) {

          assigneeSet.add(
            cleanValue
          );

        }

      }

    }

  }


  detectedAssignees =
    Array.from(
      assigneeSet
    );


  /*
   * Default:
   * all assignees selected.
   */

  selectedAssignees =
    new Set(
      detectedAssignees
    );


  /*
   * Auto detect route from actual
   * pasted header if available.
   */

  const routeColumn =
    findRouteColumn(
      detectedHeaders
    );


  if (
    routeColumn !== -1 &&
    parsedRowsStream.length >
      detectedHeaderRowIdx + 1
  ) {

    const detectedRoute =
      parsedRowsStream[
        detectedHeaderRowIdx + 1
      ][routeColumn] || "";


    const routeInput =
      document.getElementById(
        "sub-sheet-input"
      );


    if (
      routeInput &&
      !routeInput.value.trim() &&
      detectedRoute.trim()
    ) {

      routeInput.value =
        detectedRoute.trim();

    }

  }


  /*
   * Render Assignee selector.
   */

  renderAssigneeSelector();

}


/* ============================================================
   ASSIGNEE SELECTOR
   ============================================================ */

function renderAssigneeSelector() {

  const container =
    document.getElementById(
      "assignee-selector-box"
    );


  const pillsList =
    document.getElementById(
      "assignee-pills-list"
    );


  const count =
    document.getElementById(
      "assignee-count"
    );


  if (
    !detectedAssignees.length
  ) {

    container.classList.add(
      "hidden"
    );

    return;

  }


  pillsList.innerHTML = "";


  count.textContent =
    `${detectedAssignees.length} found`;


  /*
   * ALL ASSIGNEES
   */

  const allPill =
    document.createElement(
      "div"
    );


  allPill.className =
    "assignee-pill";


  const allSelected =
    selectedAssignees.size ===
      detectedAssignees.length;


  if (allSelected) {

    allPill.classList.add(
      "all-selected"
    );

  }


  allPill.textContent =
    "All Assignees";


  allPill.title =
    "Select all assignees";


  allPill.addEventListener(
    "click",
    () => {

      selectedAssignees =
        new Set(
          detectedAssignees
        );

      renderAssigneeSelector();

    }
  );


  pillsList.appendChild(
    allPill
  );


  /*
   * INDIVIDUAL ASSIGNEES
   */

  detectedAssignees.forEach(
    name => {

      const pill =
        document.createElement(
          "div"
        );


      pill.className =
        "assignee-pill";


      if (
        selectedAssignees.has(
          name
        )
      ) {

        pill.classList.add(
          "selected"
        );

      }


      pill.textContent =
        name;


      pill.title =
        "Click to select or remove this assignee";


      pill.addEventListener(
        "click",
        () => {

          toggleAssignee(
            name
          );

        }
      );


      pillsList.appendChild(
        pill
      );

    }
  );


  container.classList.remove(
    "hidden"
  );

}


/* ============================================================
   TOGGLE ASSIGNEE
   ============================================================ */

function toggleAssignee(
  name
) {

  if (
    selectedAssignees.has(
      name
    )
  ) {

    selectedAssignees.delete(
      name
    );

  } else {

    selectedAssignees.add(
      name
    );

  }


  renderAssigneeSelector();

}


/* ============================================================
   THEME
   ============================================================ */

document
  .getElementById(
    "theme-toggle-btn"
  )
  .addEventListener(
    "click",
    () => {

      const currentTheme =
        document.documentElement
          .getAttribute(
            "data-theme"
          );


      const targetTheme =
        currentTheme === "light"
          ? "dark"
          : "light";


      document.documentElement
        .setAttribute(
          "data-theme",
          targetTheme
        );


      document
        .getElementById(
          "theme-toggle-btn"
        )
        .textContent =
          targetTheme === "dark"
            ? "☼ Light Mode"
            : "◑ Dark Mode";


      localStorage.setItem(
        "appTheme",
        targetTheme
      );

    }
  );


/* ============================================================
   ADD NEW FOLDER
   ============================================================ */

document
  .getElementById(
    "add-folder-btn"
  )
  .addEventListener(
    "click",
    () => {

      const name =
        prompt(
          "Enter the new Main Folder / Sheet Name:"
        );


      if (
        name === null
      ) {

        return;

      }


      const cleanName =
        name.trim();


      if (
        !cleanName
      ) {

        alert(
          "Folder / Sheet Name cannot be empty."
        );

        return;

      }


      if (
        !projectDatabase[
          cleanName
        ]
      ) {

        projectDatabase[
          cleanName
        ] = {};

      }


      localStorage.setItem(
        "projectDatabase",
        JSON.stringify(
          projectDatabase
        )
      );


      updateDropdownMenu();


      const select =
        document.getElementById(
          "main-sheet-select"
        );


      select.value =
        cleanName;


      rebuildWorkbookTree();


      calculateGlobalMetrics();

    }
  );


/* ============================================================
   FOLDER SELECT
   ============================================================ */

document
  .getElementById(
    "main-sheet-select"
  )
  .addEventListener(
    "change",
    event => {

      /*
       * Selecting an existing folder
       * automatically fills the selected value.
       */

      if (
        event.target.value
      ) {

        event.target.value =
          event.target.value;

      }

    }
  );


/* ============================================================
   UPDATE FOLDER DROPDOWN
   ============================================================ */

function updateDropdownMenu() {

  const select =
    document.getElementById(
      "main-sheet-select"
    );


  if (!select) {
    return;
  }


  const currentValue =
    select.value;


  select.innerHTML = `

    <option value="">
      -- Select Existing Folder --
    </option>

  `;


  Object.keys(
    projectDatabase
  )
    .sort(
      (a, b) =>
        a.localeCompare(
          b
        )
    )
    .forEach(
      mainKey => {

        const option =
          document.createElement(
            "option"
          );


        option.value =
          mainKey;


        option.textContent =
          mainKey;


        select.appendChild(
          option
        );

      }
    );


  if (
    currentValue &&
    projectDatabase[
      currentValue
    ]
  ) {

    select.value =
      currentValue;

  }

}


/* ============================================================
   CLOSE LOADER
   ============================================================ */

document
  .getElementById(
    "btn-close-loader"
  )
  .addEventListener(
    "click",
    () => {

      cancelLoader();

    }
  );


/* ============================================================
   CLOSE ACTIVE WORKSPACE
   ============================================================ */

document
  .getElementById(
    "btn-close-view"
  )
  .addEventListener(
    "click",
    () => {

      loaderCancelled = true;

      loaderRunId++;


      activeMainSheet = "";

      activeSubSheet = "";


      localStorage.removeItem(
        "activeMainSheet"
      );

      localStorage.removeItem(
        "activeSubSheet"
      );


      document
        .getElementById(
          "view-navigation-row"
        )
        .classList.add(
          "hidden"
        );


      document
        .getElementById(
          "view-title"
        )
        .textContent =
          "Active Workspace View";


      document
        .getElementById(
          "view-range-indicator"
        )
        .textContent = "";


      document
        .getElementById(
          "grid-output-view"
        )
        .innerHTML = `

          <div class="splash-container">

            <div class="splash-text">
              Paste sheet data stream or select a subfolder node
              from the workbook index to mount sheet records.
            </div>

          </div>

        `;


      hideLoader();

      calculateGlobalMetrics();

    }
  );


/* ============================================================
   PROCESS AND STORE DATA
   ============================================================ */

document
  .getElementById(
    "process-entry-btn"
  )
  .addEventListener(
    "click",
    async () => {

      if (
        !verifyOnlineStatus()
      ) {

        return;

      }


      const folderSelect =
        document.getElementById(
          "main-sheet-select"
        );


      const mainName =
        folderSelect.value.trim();


      const subName =
        document
          .getElementById(
            "sub-sheet-input"
          )
          .value
          .trim();


      const rawDataText =
        document
          .getElementById(
            "paste-input"
          )
          .value;


      if (
        !mainName
      ) {

        alert(
          "Please select or create a Main Folder / Sheet Name."
        );

        return;

      }


      if (
        !subName
      ) {

        alert(
          "Please provide the Sub Route / Route Identifier."
        );

        return;

      }


      if (
        !rawDataText.trim()
      ) {

        alert(
          "Please paste the Google Sheet data first."
        );

        return;

      }


      /*
       * Re-parse immediately before processing.
       * This prevents stale Assignee indexes.
       */

      parsePastedStreamForAssignees();


      const button =
        document.getElementById(
          "process-entry-btn"
        );


      button.disabled = true;


      setActivityUrl(
        "processing",
        mainName,
        subName
      );


      showLoader(
        "process",
        mainName,
        subName
      );


      try {

        /* ======================================================
           READING
           ====================================================== */

        setLoaderStage(
          "reading"
        );


        setActivityUrl(
          "reading",
          mainName,
          subName
        );


        await wait(250);


        const lines =
          rawDataText
            .split(/\r?\n/)
            .filter(
              line =>
                line.trim().length > 0
            );


        if (
          !lines.length
        ) {

          throw new Error(
            "No data rows were detected."
          );

        }


        /*
         * Parse actual pasted rows.
         */

        const rows =
          lines.map(
            line =>
              line
                .split("\t")
                .map(
                  cell =>
                    cell.trim()
                )
          );


        /*
         * Use the actual detected header.
         */

        let headerRowIndex =
          detectedHeaderRowIdx;


        let headers =
          detectedHeaders.slice();


        /*
         * Safety fallback if user
         * changed the textarea.
         */

        if (
          !headers.length ||
          headerRowIndex < 0
        ) {

          headerRowIndex = 0;

          headers =
            rows[0].map(
              cell =>
                cell.trim()
            );

        }


        /*
         * Remove completely empty headers
         * only if they are trailing.
         */

        while (
          headers.length > 1 &&
          !headers[
            headers.length - 1
          ].trim()
        ) {

          headers.pop();

        }


        /*
         * Make sure every header has
         * something unique internally.
         *
         * Display name remains unchanged.
         */

        headers =
          makeUniqueHeaders(
            headers
          );


        /*
         * Actual Assignee column.
         */

        let assigneeIndex =
          headers.findIndex(
            isAssigneeHeader
          );


        /*
         * If original header was duplicated
         * with internal suffix, try original
         * text as well.
         */

        if (
          assigneeIndex === -1
        ) {

          assigneeIndex =
            headers.findIndex(
              header =>
                isAssigneeHeader(
                  stripInternalDuplicateSuffix(
                    header
                  )
                )
            );

        }


        /* ======================================================
           ANALYSING
           ====================================================== */

        setLoaderStage(
          "analysing"
        );


        setActivityUrl(
          "analysing",
          mainName,
          subName
        );


        await wait(250);


        const extractedRows =
          [];


        const selected =
          Array.from(
            selectedAssignees
          );


        /*
         * If there are assignees detected
         * but none are selected, stop.
         */

        if (
          assigneeIndex !== -1 &&
          detectedAssignees.length > 0 &&
          selected.length === 0
        ) {

          throw new Error(
            "Please select at least one Assignee."
          );

        }


        /*
         * Process every data row.
         */

        for (
          let rowIndex =
            headerRowIndex + 1;

          rowIndex <
          rows.length;

          rowIndex++
        ) {

          const cells =
            rows[rowIndex];


          if (
            !cells.length
          ) {

            continue;

          }


          /*
           * Make row exactly same width
           * as the actual pasted header.
           */

          const aligned =
            new Array(
              headers.length
            ).fill("");


          for (
            let i = 0;

            i < headers.length;

            i++
          ) {

            aligned[i] =
              cells[i] !== undefined
                ? cells[i]
                : "";

          }


          /*
           * Assignee filter.
           */

          if (
            assigneeIndex !== -1
          ) {

            const rowAssignee =
              String(
                aligned[
                  assigneeIndex
                ] || ""
              ).trim();


            /*
             * Ignore completely empty
             * Assignee rows.
             */

            if (
              !rowAssignee
            ) {

              continue;

            }


            /*
             * If specific users were selected,
             * only keep their rows.
             */

            if (
              selected.length > 0
            ) {

              const matches =
                selected.some(
                  selectedName =>
                    selectedName
                      .trim()
                      .toLowerCase() ===
                    rowAssignee
                      .trim()
                      .toLowerCase()
                );


              if (!matches) {

                continue;

              }

            }

          }


          /*
           * Google Sheets strikethrough.
           */

          const strike =
            detectHtmlStrikethrough(
              rowIndex,
              cells
            );


          extractedRows.push({

            data:
              aligned,

            isStrikethrough:
              strike

          });

        }


        if (
          !extractedRows.length
        ) {

          throw new Error(
            "No valid rows matching the selected Assignee were found."
          );

        }


        /* ======================================================
           ARRANGING
           ====================================================== */

        setLoaderStage(
          "arranging"
        );


        setActivityUrl(
          "arranging",
          mainName,
          subName
        );


        await wait(260);


        if (
          !projectDatabase[
            mainName
          ]
        ) {

          projectDatabase[
            mainName
          ] = {};

        }


        /*
         * First time route.
         */

        if (
          !projectDatabase[
            mainName
          ][subName]
        ) {

          projectDatabase[
            mainName
          ][subName] = {

            headers:
              headers,

            rows:
              extractedRows

          };

        } else {

          /*
           * Existing route.
           *
           * Merge headers dynamically.
           * This allows future pasted sheets
           * to have changed columns/order.
           */

          const existing =
            projectDatabase[
              mainName
            ][subName];


          const merged =
            mergeSheetData(
              existing.headers || [],
              existing.rows || [],
              headers,
              extractedRows
            );


          projectDatabase[
            mainName
          ][subName] = merged;

        }


        /* ======================================================
           STORING
           ====================================================== */

        setLoaderStage(
          "storing"
        );


        setActivityUrl(
          "storing",
          mainName,
          subName
        );


        await wait(260);


        localStorage.setItem(
          "projectDatabase",
          JSON.stringify(
            projectDatabase
          )
        );


        /* ======================================================
           SUCCESS
           ====================================================== */

        setLoaderStage(
          "success"
        );


        setActivityUrl(
          "success",
          mainName,
          subName
        );


        await wait(650);


        /*
         * Update directory.
         */

        updateDropdownMenu();

        rebuildWorkbookTree();


        /*
         * Render FIRST.
         */

        activeMainSheet =
          mainName;

        activeSubSheet =
          subName;


        localStorage.setItem(
          "activeMainSheet",
          mainName
        );

        localStorage.setItem(
          "activeSubSheet",
          subName
        );


        document
          .getElementById(
            "view-navigation-row"
          )
          .classList.remove(
            "hidden"
          );


        document
          .getElementById(
            "view-title"
          )
          .innerHTML =
            `Folder: <b>${escapeHtml(mainName)}</b> ➔ Route: <b>${escapeHtml(subName)}</b>`;


        renderSpreadsheetViewGrid(
          projectDatabase[
            mainName
          ][subName]
        );


        calculateGlobalMetrics();


        /*
         * Flash Assignee header twice.
         */

        flashAssigneeHeader();


        /*
         * Clean input fields.
         */

        document
          .getElementById(
            "paste-input"
          )
          .value = "";


        document
          .getElementById(
            "sub-sheet-input"
          )
          .value = "";


        clipboardHtmlBuffer = "";


        parsedRowsStream = [];


        detectedAssignees = [];


        selectedAssignees =
          new Set();


        detectedHeaders = [];


        detectedAssigneeColIdx =
          -1;


        detectedHeaderRowIdx =
          -1;


        /*
         * Close Assignee card automatically.
         */

        document
          .getElementById(
            "assignee-selector-box"
          )
          .classList.add(
            "hidden"
          );


        /*
         * Hide loader only after
         * actual table is mounted.
         */

        hideLoader();


        setActivityUrl(
          "viewing",
          mainName,
          subName
        );


      } catch (error) {

        console.error(
          "Processing error:",
          error
        );


        hideLoader();


        setActivityUrl(
          "error",
          mainName,
          subName
        );


        alert(
          `Unable to process the data: ${
            error.message || error
          }`
        );

      } finally {

        button.disabled = false;

      }

    }
  );


/* ============================================================
   MAKE UNIQUE INTERNAL HEADERS
   ============================================================ */

function makeUniqueHeaders(
  headers
) {

  const used =
    new Map();


  return headers.map(
    original => {

      const clean =
        String(
          original ?? ""
        ).trim();


      if (
        !clean
      ) {

        const emptyCount =
          used.get(
            "__EMPTY__"
          ) || 0;


        used.set(
          "__EMPTY__",
          emptyCount + 1
        );


        return `Column ${emptyCount + 1}`;

      }


      const key =
        normalizeHeader(
          clean
        );


      const count =
        used.get(
          key
        ) || 0;


      used.set(
        key,
        count + 1
      );


      if (
        count === 0
      ) {

        return clean;

      }


      /*
       * Internal duplicate marker.
       * It is removed when displaying/exporting.
       */

      return `${clean}_dup${count}`;

    }
  );

}


/* ============================================================
   STRIP INTERNAL DUPLICATE SUFFIX
   ============================================================ */

function stripInternalDuplicateSuffix(
  header
) {

  return String(
    header ?? ""
  ).replace(
    /_dup\d+$/i,
    ""
  );

}


/* ============================================================
   HEADER DISPLAY NAME
   ============================================================ */

function displayHeaderName(
  header
) {

  return stripInternalDuplicateSuffix(
    header
  );

}


/* ============================================================
   HTML STRIKETHROUGH DETECTION
   ============================================================ */

function detectHtmlStrikethrough(
  rowIndex,
  cells
) {

  if (
    !clipboardHtmlBuffer
  ) {

    return false;

  }


  try {

    const parser =
      new DOMParser();


    const doc =
      parser.parseFromString(
        clipboardHtmlBuffer,
        "text/html"
      );


    const htmlRows =
      Array.from(
        doc.querySelectorAll(
          "tr"
        )
      );


    /*
     * Google Sheets HTML normally
     * follows the same row order.
     *
     * Try direct index first.
     */

    let tr =
      htmlRows[
        rowIndex
      ];


    /*
     * Fallback:
     * search for first cell text.
     */

    if (
      !tr &&
      cells.length
    ) {

      const firstValue =
        String(
          cells[0] || ""
        );


      if (
        firstValue
      ) {

        tr =
          htmlRows.find(
            element =>
              element.textContent
                .includes(
                  firstValue
                )
          );

      }

    }


    if (!tr) {

      return false;

    }


    const style =
      tr.getAttribute(
        "style"
      ) || "";


    const html =
      tr.innerHTML
        .toLowerCase();


    return (
      style
        .toLowerCase()
        .includes(
          "line-through"
        ) ||

      html.includes(
        "line-through"
      ) ||

      html.includes(
        "<strike"
      ) ||

      html.includes(
        "<del"
      )
    );

  } catch (error) {

    console.warn(
      "Strikethrough detection failed:",
      error
    );

    return false;

  }

}


/* ============================================================
   MERGE EXISTING + NEW SHEET DATA
   ============================================================ */

function mergeSheetData(
  oldHeaders,
  oldRows,
  newHeaders,
  newRows
) {

  /*
   * Create stable header keys based on
   * normalized name + occurrence number.
   */

  const oldKeys =
    createHeaderKeys(
      oldHeaders
    );


  const newKeys =
    createHeaderKeys(
      newHeaders
    );


  const mergedHeaders = [];

  const mergedKeys = [];


  /*
   * Keep old columns first.
   */

  oldHeaders.forEach(
    (header, index) => {

      const key =
        oldKeys[index];


      if (
        !mergedKeys.includes(
          key
        )
      ) {

        mergedKeys.push(
          key
        );

        mergedHeaders.push(
          header
        );

      }

    }
  );


  /*
   * Add newly pasted columns.
   */

  newHeaders.forEach(
    (header, index) => {

      const key =
        newKeys[index];


      if (
        !mergedKeys.includes(
          key
        )
      ) {

        mergedKeys.push(
          key
        );

        mergedHeaders.push(
          header
        );

      }

    }
  );


  /*
   * Convert old rows.
   */

  const finalRows = [];


  oldRows.forEach(
    rowObject => {

      const oldCells =
        Array.isArray(
          rowObject
        )
          ? rowObject
          : rowObject.data;


      const output =
        new Array(
          mergedHeaders.length
        ).fill("");


      oldKeys.forEach(
        (key, index) => {

          const target =
            mergedKeys.indexOf(
              key
            );


          if (
            target !== -1
          ) {

            output[target] =
              oldCells[index] ??
              "";

          }

        }
      );


      finalRows.push({

        data:
          output,

        isStrikethrough:
          !Array.isArray(
            rowObject
          ) &&
          rowObject.isStrikethrough === true

      });

    }
  );


  /*
   * Convert new rows.
   */

  newRows.forEach(
    rowObject => {

      const newCells =
        Array.isArray(
          rowObject
        )
          ? rowObject
          : rowObject.data;


      const output =
        new Array(
          mergedHeaders.length
        ).fill("");


      newKeys.forEach(
        (key, index) => {

          const target =
            mergedKeys.indexOf(
              key
            );


          if (
            target !== -1
          ) {

            output[target] =
              newCells[index] ??
              "";

          }

        }
      );


      finalRows.push({

        data:
          output,

        isStrikethrough:
          !Array.isArray(
            rowObject
          ) &&
          rowObject.isStrikethrough === true

      });

    }
  );


  return {

    headers:
      mergedHeaders,

    rows:
      finalRows

  };

}


/* ============================================================
   CREATE HEADER KEYS
   ============================================================ */

function createHeaderKeys(
  headers
) {

  const counts =
    new Map();


  return headers.map(
    header => {

      const normalized =
        normalizeHeader(
          displayHeaderName(
            header
          )
        );


      const current =
        counts.get(
          normalized
        ) || 0;


      counts.set(
        normalized,
        current + 1
      );


      return `${normalized}::${current}`;

    }
  );

}


/* ============================================================
   FLASH ASSIGNEE HEADER TWICE
   ============================================================ */

function flashAssigneeHeader() {

  setTimeout(
    () => {

      const header =
        document.querySelector(
          "th[data-assignee-header='true']"
        );


      if (!header) {

        return;

      }


      header.classList.remove(
        "header-success-flash"
      );


      /*
       * Force animation restart.
       */

      void header.offsetWidth;


      header.classList.add(
        "header-success-flash"
      );


      setTimeout(
        () => {

          header.classList.remove(
            "header-success-flash"
          );

        },

        1500
      );

    },

    50
  );

}


/* ============================================================
   BUILD WORKBOOK TREE
   ============================================================ */

function rebuildWorkbookTree() {

  const container =
    document.getElementById(
      "workbook-tree-container"
    );


  container.innerHTML = "";


  const workbooks =
    Object.keys(
      projectDatabase
    );


  if (
    workbooks.length === 0
  ) {

    container.innerHTML = `

      <div
        style="
          padding:10px;
          color:var(--text-muted);
        "
      >
        No datasets loaded.
      </div>

    `;

    return;

  }


  workbooks
    .sort(
      (a, b) =>
        a.localeCompare(
          b
        )
    )
    .forEach(
      mainKey => {

        const subMap =
          projectDatabase[
            mainKey
          ] || {};


        const subList =
          Object.keys(
            subMap
          );


        let sumTotal = 0;


        subList.forEach(
          subKey => {

            sumTotal +=
              (
                subMap[
                  subKey
                ].rows || []
              ).length;

          }
        );


        const node =
          document.createElement(
            "div"
          );


        node.className =
          "tree-node";


        node.innerHTML = `

          <div class="tree-header">

            <span>
              📂 ${escapeHtml(mainKey)}
            </span>

            <span class="count-badge">
              ${sumTotal} rows
            </span>

          </div>

          <div class="tree-children"></div>

        `;


        const childrenContainer =
          node.querySelector(
            ".tree-children"
          );


        if (
          subList.length === 0
        ) {

          childrenContainer.innerHTML = `

            <div
              style="
                padding:6px;
                color:var(--text-muted);
                font-size:10px;
              "
            >
              Empty folder
            </div>

          `;

        }


        subList.forEach(
          subKey => {

            const route =
              subMap[
                subKey
              ];


            const rowVolume =
              (
                route.rows || []
              ).length;


            const strikeCount =
              (
                route.rows || []
              ).filter(
                row =>
                  row.isStrikethrough
              ).length;


            const item =
              document.createElement(
                "div"
              );


            item.className =
              `tree-item ${
                activeMainSheet === mainKey &&
                activeSubSheet === subKey
                  ? "active"
                  : ""
              }`;


            item.innerHTML = `

              <span>
                📄 ${escapeHtml(subKey)}
              </span>

              <div class="tree-item-meta">

                ${
                  strikeCount > 0
                    ? `
                      <span
                        class="count-badge"
                        style="
                          background:rgba(217,48,37,0.15);
                          color:var(--danger);
                        "
                      >
                        ☠ ${strikeCount}
                      </span>
                    `
                    : ""
                }

                <span class="count-badge">
                  ${rowVolume}
                </span>

                <button
                  class="btn-delete-node"
                  data-main="${escapeHtml(mainKey)}"
                  data-sub="${escapeHtml(subKey)}"
                  type="button"
                >
                  ✕
                </button>

              </div>

            `;


            item.addEventListener(
              "click",
              () => {

                switchViewContext(
                  mainKey,
                  subKey
                );

              }
            );


            const deleteButton =
              item.querySelector(
                ".btn-delete-node"
              );


            deleteButton.addEventListener(
              "click",
              event => {

                event.stopPropagation();


                const mainTarget =
                  event.currentTarget
                    .getAttribute(
                      "data-main"
                    );


                const subTarget =
                  event.currentTarget
                    .getAttribute(
                      "data-sub"
                    );


                if (
                  confirm(
                    `Delete route [${subTarget}] from [${mainTarget}]?`
                  )
                ) {

                  delete projectDatabase[
                    mainTarget
                  ][
                    subTarget
                  ];


                  if (
                    Object.keys(
                      projectDatabase[
                        mainTarget
                      ]
                    ).length === 0
                  ) {

                    delete projectDatabase[
                      mainTarget
                    ];

                  }


                  localStorage.setItem(
                    "projectDatabase",
                    JSON.stringify(
                      projectDatabase
                    )
                  );


                  if (
                    activeMainSheet ===
                      mainTarget &&
                    activeSubSheet ===
                      subTarget
                  ) {

                    document
                      .getElementById(
                        "btn-close-view"
                      )
                      .click();

                  }


                  updateDropdownMenu();

                  rebuildWorkbookTree();

                  calculateGlobalMetrics();

                }

              }
            );


            childrenContainer.appendChild(
              item
            );

          }
        );


        container.appendChild(
          node
        );

      }
    );

}


/* ============================================================
   OPEN ROUTE
   ============================================================ */

async function switchViewContext(
  mainKey,
  subKey
) {

  if (
    !projectDatabase[
      mainKey
    ] ||
    !projectDatabase[
      mainKey
    ][subKey]
  ) {

    return;

  }


  loaderCancelled = true;

  loaderRunId++;


  activeMainSheet =
    mainKey;

  activeSubSheet =
    subKey;


  localStorage.setItem(
    "activeMainSheet",
    mainKey
  );

  localStorage.setItem(
    "activeSubSheet",
    subKey
  );


  document
    .getElementById(
      "view-navigation-row"
    )
    .classList.remove(
      "hidden"
    );


  document
    .getElementById(
      "view-title"
    )
    .innerHTML =
      `Folder: <b>${escapeHtml(mainKey)}</b> ➔ Route: <b>${escapeHtml(subKey)}</b>`;


  const completed =
    await runActivityLoader(
      "route",
      mainKey,
      subKey
    );


  if (!completed) {

    return;

  }


  const routeData =
    projectDatabase[
      mainKey
    ][subKey];


  renderSpreadsheetViewGrid(
    routeData
  );


  calculateGlobalMetrics();

  rebuildWorkbookTree();


  setActivityUrl(
    "viewing",
    mainKey,
    subKey
  );


  hideLoader();

}


/* ============================================================
   RENDER SPREADSHEET
   ============================================================ */

function renderSpreadsheetViewGrid(
  sheetObject
) {

  const display =
    document.getElementById(
      "grid-output-view"
    );


  const rangeIndicator =
    document.getElementById(
      "view-range-indicator"
    );


  if (
    !sheetObject
  ) {

    display.innerHTML = `

      <div style="padding:12px;color:var(--text-dark);">
        No workspace data found.
      </div>

    `;

    rangeIndicator.textContent = "";

    return;

  }


  const headers =
    sheetObject.headers || [];


  const rows =
    sheetObject.rows || [];


  if (
    !rows.length
  ) {

    display.innerHTML = `

      <div style="padding:12px;color:var(--text-dark);">
        No row data present in this route.
      </div>

    `;

    rangeIndicator.textContent = "";

    return;

  }


  rangeIndicator.textContent =
    `Displaying total ${rows.length} record entries.`;


  let tableHtml =
    `<table><thead><tr>`;


  headers.forEach(
    header => {

      const cleanHeader =
        displayHeaderName(
          header
        );


      const isAssignee =
        isAssigneeHeader(
          cleanHeader
        );


      tableHtml += `

        <th
          title="${escapeHtml(cleanHeader)}"
          ${
            isAssignee
              ? 'data-assignee-header="true"'
              : ""
          }
        >
          ${escapeHtml(cleanHeader)}
        </th>

      `;

    }
  );


  tableHtml +=
    `</tr></thead><tbody>`;


  rows.forEach(
    rowObject => {

      const rowCells =
        Array.isArray(
          rowObject
        )
          ? rowObject
          : (
              rowObject.data || []
            );


      const isStriked =
        !Array.isArray(
          rowObject
        ) &&
        rowObject.isStrikethrough === true;


      tableHtml += `

        <tr
          class="${
            isStriked
              ? "row-strikethrough"
              : ""
          }"
        >

      `;


      for (
        let index = 0;

        index <
        headers.length;

        index++
      ) {

        const value =
          rowCells[index] !== undefined
            ? rowCells[index]
            : "";


        tableHtml += `

          <td
            title="${escapeHtml(value)}"
          >
            ${escapeHtml(value)}
          </td>

        `;

      }


      tableHtml +=
        `</tr>`;

    }
  );


  tableHtml +=
    `</tbody></table>`;


  display.innerHTML =
    tableHtml;

}


/* ============================================================
   OPEN GOOGLE SHEETS
   ============================================================ */

document
  .getElementById(
    "btn-create-gsheet"
  )
  .addEventListener(
    "click",
    () => {

      if (
        !verifyOnlineStatus()
      ) {

        return;

      }


      if (
        !activeMainSheet ||
        !activeSubSheet ||
        !projectDatabase[
          activeMainSheet
        ] ||
        !projectDatabase[
          activeMainSheet
        ][activeSubSheet]
      ) {

        return;

      }


      const workbook =
        projectDatabase[
          activeMainSheet
        ][activeSubSheet];


      const headers =
        workbook.headers || [];


      const headerText =
        headers
          .map(
            header =>
              displayHeaderName(
                header
              )
          )
          .join("\t");


      const rows =
        (workbook.rows || [])
          .map(
            rowObject => {

              const cells =
                Array.isArray(
                  rowObject
                )
                  ? rowObject
                  : (
                      rowObject.data ||
                      []
                    );


              return headers
                .map(
                  (
                    header,
                    index
                  ) =>
                    cells[index] !==
                      undefined
                      ? cells[index]
                      : ""
                )
                .join("\t");

            }
          );


      const fullText =
        [
          headerText,
          ...rows
        ].join("\n");


      navigator.clipboard
        .writeText(
          fullText
        )
        .then(
          () => {

            alert(
              "Formatted data copied to clipboard! Opening Google Sheets... Press Ctrl+V to paste."
            );


            window.open(
              "https://sheets.new",
              "_blank"
            );

          }
        )
        .catch(
          error => {

            console.error(
              "Clipboard error:",
              error
            );


            alert(
              "Unable to copy automatically. Please allow clipboard access."
            );

          }
        );

    }
  );


/* ============================================================
   EXPORT CSV
   ============================================================ */

document
  .getElementById(
    "btn-export-csv"
  )
  .addEventListener(
    "click",
    () => {

      if (
        !verifyOnlineStatus()
      ) {

        return;

      }


      if (
        !activeMainSheet ||
        !activeSubSheet ||
        !projectDatabase[
          activeMainSheet
        ] ||
        !projectDatabase[
          activeMainSheet
        ][activeSubSheet]
      ) {

        return;

      }


      const workbook =
        projectDatabase[
          activeMainSheet
        ][activeSubSheet];


      const sanitize =
        value => {

          if (
            value === null ||
            value === undefined
          ) {

            return '""';

          }


          return `"${String(value)
            .replace(
              /"/g,
              '""'
            )}"`;

        };


      const headers =
        workbook.headers || [];


      const headerRow =
        headers
          .map(
            header =>
              sanitize(
                displayHeaderName(
                  header
                )
              )
          )
          .join(",");


      const dataRows =
        (workbook.rows || [])
          .map(
            rowObject => {

              const cells =
                Array.isArray(
                  rowObject
                )
                  ? rowObject
                  : (
                      rowObject.data ||
                      []
                    );


              return headers
                .map(
                  (
                    header,
                    index
                  ) =>
                    sanitize(
                      cells[index] !==
                        undefined
                        ? cells[index]
                        : ""
                    )
                )
                .join(",");

            }
          );


      const csv =
        [
          headerRow,
          ...dataRows
        ].join("\n");


      const blob =
        new Blob(
          [csv],
          {
            type:
              "text/csv;charset=utf-8;"
          }
        );


      const link =
        document.createElement(
          "a"
        );


      link.href =
        URL.createObjectURL(
          blob
        );


      link.download =
        `${activeMainSheet}_${activeSubSheet}.csv`
          .replace(
            /[^a-z0-9_.-]/gi,
            "_"
          )
          .toLowerCase();


      document.body.appendChild(
        link
      );


      link.click();


      document.body.removeChild(
        link
      );


      setTimeout(
        () =>
          URL.revokeObjectURL(
            link.href
          ),
        1000
      );

    }
  );


/* ============================================================
   GLOBAL METRICS
   ============================================================ */

function calculateGlobalMetrics() {

  let grandTotal = 0;

  let mainTotal = 0;

  let subTotal = 0;

  let strikeTotal = 0;


  Object.keys(
    projectDatabase
  ).forEach(
    mainKey => {

      Object.keys(
        projectDatabase[
          mainKey
        ] || {}
      ).forEach(
        subKey => {

          const rows =
            projectDatabase[
              mainKey
            ][subKey].rows || [];


          grandTotal +=
            rows.length;


          if (
            mainKey ===
            activeMainSheet
          ) {

            mainTotal +=
              rows.length;

          }


          if (
            mainKey ===
              activeMainSheet &&
            subKey ===
              activeSubSheet
          ) {

            subTotal =
              rows.length;

          }


          rows.forEach(
            row => {

              if (
                row &&
                row.isStrikethrough
              ) {

                strikeTotal++;

              }

            }
          );

        }
      );

    }
  );


  const grandElement =
    document.getElementById(
      "stat-grand-total"
    );


  const mainElement =
    document.getElementById(
      "stat-main-total"
    );


  const subElement =
    document.getElementById(
      "stat-sub-total"
    );


  const strikeElement =
    document.getElementById(
      "stat-strike-total"
    );


  if (grandElement) {

    grandElement.textContent =
      `${grandTotal} Rows`;

  }


  if (mainElement) {

    mainElement.textContent =
      `${mainTotal} Rows`;

  }


  if (subElement) {

    subElement.textContent =
      `${subTotal} Rows`;

  }


  if (strikeElement) {

    strikeElement.textContent =
      `${strikeTotal} Rows`;

  }

}


/* ============================================================
   WIPE STORAGE
   ============================================================ */

document
  .getElementById(
    "clear-db-btn"
  )
  .addEventListener(
    "click",
    () => {

      if (
        !confirm(
          "Permanently wipe local workspace database memory?"
        )
      ) {

        return;

      }


      loaderCancelled = true;

      loaderRunId++;


      localStorage.removeItem(
        "projectDatabase"
      );


      localStorage.removeItem(
        "activeMainSheet"
      );


      localStorage.removeItem(
        "activeSubSheet"
      );


      projectDatabase = {};

      activeMainSheet = "";

      activeSubSheet = "";


      hideLoader();


      document
        .getElementById(
          "view-navigation-row"
        )
        .classList.add(
          "hidden"
        );


      document
        .getElementById(
          "view-title"
        )
        .textContent =
          "Active Workspace View";


      document
        .getElementById(
          "view-range-indicator"
        )
        .textContent = "";


      document
        .getElementById(
          "grid-output-view"
        )
        .innerHTML = `

          <div class="splash-container">

            <div class="splash-text">
              Paste sheet data stream or select a subfolder node
              from the workbook index to mount sheet records.
            </div>

          </div>

        `;


      document
        .getElementById(
          "paste-input"
        )
        .value = "";


      document
        .getElementById(
          "sub-sheet-input"
        )
        .value = "";


      document
        .getElementById(
          "assignee-selector-box"
        )
        .classList.add(
          "hidden"
        );


      clipboardHtmlBuffer = "";

      detectedAssignees = [];

      selectedAssignees =
        new Set();


      updateDropdownMenu();

      rebuildWorkbookTree();

      calculateGlobalMetrics();

      setActivityUrl(
        "",
        "",
        ""
      );

    }
  );
