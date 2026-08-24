const masterHeaders = [
  "Site ID/Block Mapping",
  "LOCATION DESCRIPTION",
  "D",
  "LOCATION NAME",
  "STREET START",
  "STREET END",
  "BUS ROUTE",
  "SHARED BLOCKS",
  "VIDEO NAME",
  "MC LINK",
  "TIMESTAMP",
  "SCREENSHOT",
  "NOTES",
  "SPACER_1",
  "BS ID",
  "BS NAME",
  "ENFORCEMENT DAYS",
  "ENFORCEMENT HOURS",
  "LAT",
  "LONG",
  "Bus Stop Lane Type",
  "CLASSIFICATION",
  "MC LINK_dup1",
  "TIMESTAMP_dup1",
  "OTHER ROUTES",
  "SCREENSHOT_dup1",
  "STOP LENGTH",
  "SCREENSHOT_dup2",
  "NOTES_dup1",
  "SPACER_2",
  "BUS LANE? Y/N",
  "ENFORCEMENT HOURS_dup1",
  "ENFORCEMENT DAYS_dup1",
  "POSITION",
  "DASHED Y/N",
  "NOTES_dup2",
  "SPACER_3",
  "Assignee",
  "F.P. Status",
  "Review"
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

/*
 * DYNAMIC HEADER STATE
 * The pasted sheet header is the source of truth.
 * masterHeaders remains only as a fallback for headerless data.
 */
let detectedHeaders = [];
let detectedHeaderSourceRow = -1;


/* ============================================================
   PROFESSIONAL LOADER STATE
   ============================================================ */

let loaderMode = "process";
let loaderCancelled = false;
let loaderRunId = 0;

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
    "Checking assignees, routes and record structure...",
    38
  ],
  [
    "arranging",
    "Arranging data",
    "Aligning records for the workspace...",
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
  return new Promise(resolve => setTimeout(resolve, ms));
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
   URL ACTIVITY TRACKING
   ============================================================ */

function setActivityUrl(state, folder = "", route = "") {

  const params = new URLSearchParams();

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
    console.warn("Unable to update activity URL:", error);
  }


  if (state === "opening") {

    document.title =
      `Opening ${route} — ${folder} | Sheet Task Extractor Pro`;

  } else if (state === "processing") {

    document.title =
      `Processing data — ${folder} | Sheet Task Extractor Pro`;

  } else if (state === "viewing") {

    document.title =
      `${route} — ${folder} | Sheet Task Extractor Pro`;

  } else if (state === "reading") {

    document.title =
      `Reading data — ${route} | Sheet Task Extractor Pro`;

  } else if (state === "analysing") {

    document.title =
      `Analysing data — ${route} | Sheet Task Extractor Pro`;

  } else if (state === "arranging") {

    document.title =
      `Arranging data — ${route} | Sheet Task Extractor Pro`;

  } else if (state === "storing") {

    document.title =
      `Storing data — ${route} | Sheet Task Extractor Pro`;

  } else if (state === "success") {

    document.title =
      `Successfully extracted — ${route} | Sheet Task Extractor Pro`;

  } else {

    document.title =
      "Sheet Task Extractor Pro - Direct Ingest Workspace";
  }
}


/* ============================================================
   SHOW LOADER
   ============================================================ */

function showLoader(mode, folder = "", route = "") {

  loaderMode = mode;
  loaderCancelled = false;

  const overlay =
    document.getElementById("view-loader-overlay");

  if (!overlay) {
    return;
  }

  overlay.classList.remove(
    "hidden",
    "success-state"
  );


  const kicker =
    document.getElementById("view-loader-kicker");

  if (kicker) {

    kicker.textContent =
      mode === "route"
        ? "ROUTE WORKSPACE"
        : "DATA WORKFLOW";
  }


  const routeLabel =
    document.getElementById("loader-route-name");

  if (routeLabel) {

    if (mode === "route" && (folder || route)) {

      routeLabel.textContent =
        `Opening: ${folder}${route ? " / " + route : ""}`;

      routeLabel.classList.remove("hidden");

    } else {

      routeLabel.classList.add("hidden");

      routeLabel.textContent = "";
    }
  }


  const closeButton =
    document.getElementById("btn-close-loader");

  if (closeButton) {

    closeButton.disabled = false;
  }
}


/* ============================================================
   HIDE LOADER
   ============================================================ */

function hideLoader() {

  const overlay =
    document.getElementById("view-loader-overlay");

  if (overlay) {

    overlay.classList.add("hidden");

    overlay.classList.remove("success-state");
  }


  const closeButton =
    document.getElementById("btn-close-loader");

  if (closeButton) {

    closeButton.disabled = false;
  }
}


/* ============================================================
   CANCEL LOADER
   ============================================================ */

function cancelLoader() {

  loaderCancelled = true;

  loaderRunId++;

  hideLoader();


  const route =
    activeSubSheet || "";

  const folder =
    activeMainSheet || "";


  if (folder && route) {

    setActivityUrl(
      "cancelled",
      folder,
      route
    );

  } else {

    setActivityUrl(
      "",
      "",
      ""
    );
  }
}


/* ============================================================
   UPDATE LOADER STAGE
   ============================================================ */

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
    .querySelectorAll(".loader-step")
    .forEach(element => {

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

    });


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


/* ============================================================
   RUN LOADER
   ============================================================ */

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


  for (const stage of loaderStages) {

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

  } else {

    blocker.classList.add(
      "hidden"
    );

    return true;
  }
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
          JSON.parse(savedData);


        updateDropdownMenu();

        rebuildWorkbookTree();

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


    /*
     * IMPORTANT:
     * Do not automatically run the route animation
     * on page refresh. The data is already stored locally,
     * so simply restore the selected workspace.
     */

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

      rebuildWorkbookTree();
    }


    calculateGlobalMetrics();
  }
);


/* ============================================================
   NETWORK EVENTS
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
  .getElementById("paste-input")
  .addEventListener(
    "paste",
    event => {

      clipboardHtmlBuffer = "";


      if (event.clipboardData) {

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
  .getElementById("paste-input")
  .addEventListener(
    "input",
    () => {

      parsePastedStreamForAssignees();
    }
  );


/* ============================================================
   DYNAMIC HEADER DETECTION
   ============================================================ */

function normalizeHeaderName(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .replace(/[：:]+$/g, "")
    .replace(/\s*[-–—]\s*/g, " ")
    .trim();
}

function isAssigneeHeader(value) {
  const normalized = normalizeHeaderName(value);

  if (!normalized) {
    return false;
  }

  return [
    "ASSIGNEE",
    "ASSIGNEE NAME",
    "ASSIGNEE EMAIL",
    "ASSIGNED TO",
    "ASSIGNED",
    "ASSIGNED USER",
    "ASSIGNED USERNAME",
    "WORKER",
    "WORKER NAME",
    "ANNOTATOR",
    "ANNOTATOR NAME",
    "ANNOTATOR EMAIL"
  ].includes(normalized) ||
  normalized.includes("ASSIGNEE") ||
  normalized.startsWith("ASSIGNED TO") ||
  normalized.startsWith("ASSIGNED USER");
}

function isRouteHeader(value) {
  const normalized = normalizeHeaderName(value);

  return (
    normalized === "BUS ROUTE" ||
    normalized === "ROUTE" ||
    normalized.includes("BUS ROUTE") ||
    normalized.includes("ROUTE")
  );
}

function looksLikeHeaderRow(row) {

  if (
    !Array.isArray(row) ||
    row.length === 0
  ) {
    return false;
  }

  const nonEmpty =
    row.filter(
      cell =>
        String(cell ?? "").trim() !== ""
    );

  if (
    nonEmpty.length < 2
  ) {
    return false;
  }

  const hasAssignee =
    row.some(
      isAssigneeHeader
    );

  const hasKnownMasterHeader =
    nonEmpty.filter(
      cell =>
        masterHeaders.some(
          master =>
            normalizeHeaderName(master) ===
              normalizeHeaderName(cell) ||
            (
              normalizeHeaderName(master) &&
              normalizeHeaderName(cell) &&
              normalizeHeaderName(master).includes(
                normalizeHeaderName(cell)
              )
            )
        )
    ).length;

  return (
    hasAssignee ||
    hasKnownMasterHeader >= 2
  );
}

function findDetectedHeaderRow(rows) {

  /*
   * Search the first 10 rows. This also supports pasted
   * streams with a title/filter row above the real header.
   */

  for (
    let rowIndex = 0;
    rowIndex < Math.min(
      rows.length,
      10
    );
    rowIndex++
  ) {

    if (
      looksLikeHeaderRow(
        rows[rowIndex]
      )
    ) {
      return rowIndex;
    }
  }

  return -1;
}

function buildDetectedHeaders(
  rows,
  headerRowIndex
) {

  if (
    headerRowIndex < 0 ||
    !rows[headerRowIndex]
  ) {
    return [];
  }

  const headers = [];
  const seen = new Map();

  rows[headerRowIndex].forEach(
    (rawHeader, index) => {

      const text =
        String(rawHeader ?? "")
          .replace(/\r?\n/g, " ")
          .replace(/\s+/g, " ")
          .trim();

      if (!text) {

        /*
         * Preserve blank Google Sheet columns instead of
         * shifting all following values to the left.
         */

        headers.push(
          `SPACER_${index + 1}`
        );

        return;
      }

      const key =
        normalizeHeaderName(
          text
        );

      if (
        !seen.has(key)
      ) {

        seen.set(
          key,
          1
        );

        headers.push(
          text
        );

      } else {

        const count =
          seen.get(key) + 1;

        seen.set(
          key,
          count
        );

        headers.push(
          `${text}_dup${count - 1}`
        );
      }
    }
  );

  return headers;
}

function findAssigneeColumn(
  headers
) {

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

function findRouteColumn(
  headers
) {

  for (
    let i = 0;
    i < headers.length;
    i++
  ) {

    if (
      isRouteHeader(
        headers[i]
      )
    ) {
      return i;
    }
  }

  return -1;
}

function getHeaderKey(
  header
) {

  return normalizeHeaderName(
    String(header ?? "")
      .replace(
        /_dup\d+$/i,
        ""
      )
  );
}

function createHeaderIndexMap(
  sourceHeaders
) {

  const map =
    new Map();

  sourceHeaders.forEach(
    (header, index) => {

      const key =
        getHeaderKey(
          header
        );

      if (!key) {
        return;
      }

      if (
        !map.has(key)
      ) {

        map.set(
          key,
          []
        );
      }

      map.get(key).push(
        index
      );
    }
  );

  return map;
}

function mergeHeaderSets(
  existingHeaders,
  incomingHeaders
) {

  if (
    !Array.isArray(
      existingHeaders
    ) ||
    existingHeaders.length === 0
  ) {

    return [
      ...incomingHeaders
    ];
  }

  const result =
    [
      ...existingHeaders
    ];

  const existingKeys =
    new Set(
      existingHeaders
        .map(
          getHeaderKey
        )
        .filter(
          Boolean
        )
    );

  incomingHeaders.forEach(
    header => {

      const key =
        getHeaderKey(
          header
        );

      if (!key) {
        return;
      }

      if (
        !existingKeys.has(
          key
        )
      ) {

        result.push(
          header
        );

        existingKeys.add(
          key
        );
      }
    }
  );

  return result;
}

function alignRowByHeaders(
  cells,
  sourceHeaders,
  targetHeaders
) {

  const aligned =
    new Array(
      targetHeaders.length
    ).fill("");

  const sourceMap =
    createHeaderIndexMap(
      sourceHeaders
    );

  targetHeaders.forEach(
    (
      targetHeader,
      targetIndex
    ) => {

      const key =
        getHeaderKey(
          targetHeader
        );

      if (!key) {

        /*
         * Blank/spacer columns remain positional.
         */

        if (
          targetIndex <
            cells.length &&
          sourceHeaders[
            targetIndex
          ] &&
          sourceHeaders[
            targetIndex
          ].startsWith(
            "SPACER_"
          )
        ) {

          aligned[
            targetIndex
          ] =
            cells[
              targetIndex
            ] ?? "";
        }

        return;
      }

      const indexes =
        sourceMap.get(
          key
        );

      if (
        !indexes ||
        indexes.length === 0
      ) {
        return;
      }

      const sourceIndex =
        indexes[0];

      if (
        sourceIndex <
        cells.length
      ) {

        aligned[
          targetIndex
        ] =
          cells[
            sourceIndex
          ] ?? "";
      }
    }
  );

  /*
   * Safety fallback for unusual headerless structures.
   */

  if (
    !sourceHeaders.length ||
    !targetHeaders.length
  ) {

    for (
      let i = 0;
      i <
      Math.min(
        cells.length,
        targetHeaders.length
      );
      i++
    ) {

      aligned[i] =
        cells[i] ?? "";
    }
  }

  return aligned;
}

function flashProcessedHeadersTwice() {

  const headers =
    document.querySelectorAll(
      "#grid-output-view thead th"
    );

  if (
    !headers.length
  ) {
    return;
  }

  headers.forEach(
    header => {

      header.classList.remove(
        "processed-header-flash"
      );

      /*
       * Force reflow so the animation restarts
       * even when processing the same route again.
       */

      void header.offsetWidth;

      header.classList.add(
        "processed-header-flash"
      );
    }
  );

  setTimeout(
    () => {

      headers.forEach(
        header =>
          header.classList.remove(
            "processed-header-flash"
          )
      );

    },
    1500
  );
}


/* ============================================================
   ASSIGNEE DETECTION
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

    selectedAssignee = "";

    detectedHeaders = [];

    detectedHeaderSourceRow =
      -1;

    detectedHeaderRowIdx =
      -1;

    detectedAssigneeColIdx =
      -1;

    return;
  }

  const lines =
    rawText
      .split(/\r?\n/)
      .filter(
        line =>
          line.length > 0
      );

  if (
    lines.length === 0
  ) {
    return;
  }

  parsedParsedRowsStream =
    lines.map(
      line =>
        line
          .split("\t")
          .map(
            cell =>
              cell.trim()
          )
    );

  detectedAssigneeColIdx =
    -1;

  detectedHeaderRowIdx =
    findDetectedHeaderRow(
      parsedParsedRowsStream
    );

  /*
   * The pasted header is now the source of truth.
   */

  if (
    detectedHeaderRowIdx !== -1
  ) {

    detectedHeaders =
      buildDetectedHeaders(
        parsedParsedRowsStream,
        detectedHeaderRowIdx
      );

    detectedHeaderSourceRow =
      detectedHeaderRowIdx;

    detectedAssigneeColIdx =
      findAssigneeColumn(
        detectedHeaders
      );

  } else {

    /*
     * Headerless paste: keep the original fallback.
     */

    detectedHeaders = [];

    detectedHeaderSourceRow =
      -1;

    const masterAssigneeIndex =
      masterHeaders.indexOf(
        "Assignee"
      );

    if (
      masterAssigneeIndex !== -1
    ) {

      let physicalIndex =
        0;

      for (
        let i = 0;
        i < masterAssigneeIndex;
        i++
      ) {

        if (
          !masterHeaders[i]
            .startsWith(
              "SPACER_"
            )
        ) {

          physicalIndex++;
        }
      }

      detectedAssigneeColIdx =
        physicalIndex;
    }
  }

  const assigneeSet =
    new Set();

  const startRow =
    detectedHeaderRowIdx !== -1
      ? detectedHeaderRowIdx + 1
      : 0;

  for (
    let rowIndex = startRow;
    rowIndex <
      parsedParsedRowsStream.length;
    rowIndex++
  ) {

    const row =
      parsedParsedRowsStream[
        rowIndex
      ];

    if (
      detectedAssigneeColIdx !== -1 &&
      detectedAssigneeColIdx <
        row.length
    ) {

      const value =
        row[
          detectedAssigneeColIdx
        ];

      if (
        value &&
        value.trim().length > 0 &&
        !isAssigneeHeader(
          value
        )
      ) {

        assigneeSet.add(
          value.trim()
        );
      }
    }
  }

  detectedAssignees =
    Array.from(
      assigneeSet
    );

  /*
   * Detect route from the actual pasted header.
   */

  let detectedRoute = "";

  if (
    detectedHeaderRowIdx !== -1 &&
    detectedHeaders.length
  ) {

    const routeColIdx =
      findRouteColumn(
        detectedHeaders
      );

    if (
      routeColIdx !== -1 &&
      parsedParsedRowsStream.length >
        detectedHeaderRowIdx + 1
    ) {

      detectedRoute =
        parsedParsedRowsStream[
          detectedHeaderRowIdx + 1
        ][routeColIdx] || "";
    }
  }

  if (
    detectedRoute &&
    !document.getElementById(
      "sub-sheet-input"
    ).value
  ) {

    document.getElementById(
      "sub-sheet-input"
    ).value =
      detectedRoute;
  }

  /*
   * Render assignee buttons.
   */

  if (
    detectedAssignees.length > 0
  ) {

    pillsList.innerHTML = "";

    const allPill =
      document.createElement(
        "div"
      );

    allPill.className =
      `assignee-pill ${
        selectedAssignee === ""
          ? "selected"
          : ""
      }`;

    allPill.textContent =
      "All Assignees";

    allPill.addEventListener(
      "click",
      () =>
        selectAssigneeFilter("")
    );

    pillsList.appendChild(
      allPill
    );

    detectedAssignees.forEach(
      name => {

        const pill =
          document.createElement(
            "div"
          );

        pill.className =
          `assignee-pill ${
            selectedAssignee === name
              ? "selected"
              : ""
          }`;

        pill.textContent =
          name;

        pill.addEventListener(
          "click",
          () =>
            selectAssigneeFilter(
              name
            )
        );

        pillsList.appendChild(
          pill
        );
      }
    );

    container.classList.remove(
      "hidden"
    );

  } else {

    container.classList.add(
      "hidden"
    );
  }
}


/* ============================================================
   ASSIGNEE FILTER
   ============================================================ */

function selectAssigneeFilter(
  name
) {

  selectedAssignee =
    name;


  document
    .querySelectorAll(
      ".assignee-pill"
    )
    .forEach(
      element => {

        if (
          (
            name === "" &&
            element.textContent ===
              "All Assignees"
          ) ||
          element.textContent ===
            name
        ) {

          element.classList.add(
            "selected"
          );

        } else {

          element.classList.remove(
            "selected"
          );
        }
      }
    );
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


      document
        .getElementById(
          "theme-toggle-btn"
        )
        .textContent =
          targetTheme === "dark"
            ? "☼ Light Mode"
            : "◑ Dark Mode";


      document.documentElement
        .setAttribute(
          "data-theme",
          targetTheme
        );


      localStorage.setItem(
        "appTheme",
        targetTheme
      );
    }
  );


/* ============================================================
   CLOSE LOADER
   ============================================================ */

document
  .getElementById(
    "btn-close-loader"
  )
  ?.addEventListener(
    "click",
    () => {

      cancelLoader();
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

      if (
        event.target.value
      ) {

        document.getElementById(
          "main-sheet-input"
        ).value =
          event.target.value;
      }
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

      /*
       * Cancel any running animation.
       */

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


      document
        .querySelectorAll(
          ".tree-item"
        )
        .forEach(
          element =>
            element.classList.remove(
              "active"
            )
        );


      hideLoader();


      setActivityUrl(
        "",
        "",
        ""
      );


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


      const mainName =
        document
          .getElementById(
            "main-sheet-input"
          )
          .value
          .trim();


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
        !mainName ||
        !subName ||
        !rawDataText.trim()
      ) {

        alert(
          "Please ensure Folder Name, Sub-Route Name, and Data Stream are all provided."
        );

        return;
      }


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

        let htmlRows = [];


        setLoaderStage(
          "reading"
        );


        setActivityUrl(
          "reading",
          mainName,
          subName
        );


        await wait(250);


        if (
          clipboardHtmlBuffer
        ) {

          const parser =
            new DOMParser();


          const doc =
            parser.parseFromString(
              clipboardHtmlBuffer,
              "text/html"
            );


          htmlRows =
            Array.from(
              doc.querySelectorAll(
                "tr"
              )
            );
        }


        const lines =
          rawDataText
            .split(/\r?\n/)
            .filter(
              line =>
                line.trim().length > 0
            );


        setLoaderStage(
          "analysing"
        );


        setActivityUrl(
          "analysing",
          mainName,
          subName
        );


        await wait(250);


        /*
         * DYNAMIC HEADER ANALYSIS
         *
         * The pasted header is the source of truth.
         * masterHeaders is used only when the paste is
         * genuinely headerless.
         */

        const parsedLines =
          lines.map(
            line =>
              line
                .split("\t")
                .map(
                  cell =>
                    cell.trim()
                )
          );

        const headerRowIndex =
          findDetectedHeaderRow(
            parsedLines
          );

        let inputHeaders = [];

        if (
          headerRowIndex !== -1
        ) {

          inputHeaders =
            buildDetectedHeaders(
              parsedLines,
              headerRowIndex
            );
        }

        const hasDynamicHeader =
          headerRowIndex !== -1 &&
          inputHeaders.length > 0;

        const sourceRowsStart =
          hasDynamicHeader
            ? headerRowIndex + 1
            : 0;

        /*
         * Always detect Assignee from the SAME header
         * that will be used for processing.
         */

        const activeAssigneeColIdx =
          hasDynamicHeader
            ? findAssigneeColumn(
                inputHeaders
              )
            : detectedAssigneeColIdx;

        const extractedRows = [];

        for (
          let index = sourceRowsStart;
          index < parsedLines.length;
          index++
        ) {

          const cells =
            parsedLines[index];

          if (
            cells.every(
              cell => !cell
            )
          ) {

            continue;
          }

          const rowAssignee =
            activeAssigneeColIdx !== -1 &&
            activeAssigneeColIdx <
              cells.length
              ? cells[
                  activeAssigneeColIdx
                ].trim()
              : "";

          /*
           * If a specific assignee was selected,
           * only save that person's rows.
           */

          if (
            selectedAssignee !== "" &&
            rowAssignee.toLowerCase() !==
              selectedAssignee.toLowerCase()
          ) {

            continue;
          }

          /*
           * If Assignee exists, preserve the original rule:
           * rows without an assignee are not stored.
           */

          if (
            selectedAssignee === "" &&
            activeAssigneeColIdx !== -1 &&
            !rowAssignee
          ) {

            continue;
          }

          /*
           * Detect Google Sheet strikethrough.
           */

          let strike = false;

          if (
            htmlRows.length
          ) {

            const tr =
              htmlRows[index] ||
              htmlRows.find(
                element =>
                  element.textContent.includes(
                    cells[0] || ""
                  )
              );

            if (tr) {

              const style =
                tr.getAttribute(
                  "style"
                ) || "";

              const innerHtml =
                tr.innerHTML
                  .toLowerCase();

              strike =
                style.includes(
                  "line-through"
                ) ||
                innerHtml.includes(
                  "line-through"
                ) ||
                innerHtml.includes(
                  "<strike>"
                ) ||
                innerHtml.includes(
                  "<del>"
                );
            }
          }

          /*
           * Keep the row in the exact order of the pasted
           * headers. It is aligned to stored headers below.
           */

          extractedRows.push({
            data: cells,
            isStrikethrough:
              strike
          });
        }


        if (
          !extractedRows.length
        ) {

          hideLoader();

          setActivityUrl(
            "",
            "",
            ""
          );


          alert(
            "No valid rows matching the selected assignee were found."
          );


          return;
        }


        /*
         * ARRANGING
         */

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


        if (
          !projectDatabase[
            mainName
          ][subName]
        ) {

          projectDatabase[
            mainName
          ][subName] = {
            headers:
              hasDynamicHeader
                ? [...inputHeaders]
                : [...masterHeaders],
            rows: []
          };
        }


        const existingWorkbook =
          projectDatabase[
            mainName
          ][subName];


        const existingHeaders =
          Array.isArray(
            existingWorkbook.headers
          ) &&
          existingWorkbook.headers.length
            ? existingWorkbook.headers
            : (
                hasDynamicHeader
                  ? [...inputHeaders]
                  : [...masterHeaders]
              );


        /*
         * Merge the new header with the stored header.
         * Column names, not physical positions, determine
         * where each value belongs.
         */

        existingWorkbook.headers =
          mergeHeaderSets(
            existingHeaders,
            hasDynamicHeader
              ? inputHeaders
              : existingHeaders
          );


        const finalHeaders =
          existingWorkbook.headers;

        const sourceHeaders =
          hasDynamicHeader
            ? inputHeaders
            : finalHeaders;


        const alignedExtractedRows =
          extractedRows.map(
            rowObject => ({

              data:
                alignRowByHeaders(
                  rowObject.data,
                  sourceHeaders,
                  finalHeaders
                ),

              isStrikethrough:
                rowObject.isStrikethrough
            })
          );


        existingWorkbook.rows =
          existingWorkbook.rows.concat(
            alignedExtractedRows
          );


        /*
         * STORING
         */

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


        /*
         * SUCCESS
         */

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


        document
          .getElementById(
            "assignee-selector-box"
          )
          .classList.add(
            "hidden"
          );


        selectedAssignee = "";

        clipboardHtmlBuffer = "";


        /*
         * Update directory BEFORE opening route.
         */

        updateDropdownMenu();

        rebuildWorkbookTree();


        hideLoader();


        /*
         * OPEN ROUTE IMMEDIATELY.
         *
         * This is the important fix.
         */

        await switchViewContext(
          mainName,
          subName
        );

        /*
         * Successful processing confirmation:
         * flash the processed header row green twice.
         */

        flashProcessedHeadersTwice();

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
   UPDATE FOLDER DROPDOWN
   ============================================================ */

function updateDropdownMenu() {

  const select =
    document.getElementById(
      "main-sheet-select"
    );


  select.innerHTML = `
    <option value="" selected>
      -- Select Existing Folder --
    </option>
  `;


  Object.keys(
    projectDatabase
  ).forEach(
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

    container.innerHTML =
      `
        <div style="padding:10px;color:var(--text-muted);">
          No datasets loaded.
        </div>
      `;

    return;
  }


  workbooks.forEach(
    mainKey => {

      const subMap =
        projectDatabase[
          mainKey
        ];


      const subList =
        Object.keys(
          subMap
        );


      let sumTotal = 0;


      subList.forEach(
        subKey => {

          sumTotal +=
            subMap[
              subKey
            ].rows.length;
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


      subList.forEach(
        subKey => {

          const rowVolume =
            subMap[
              subKey
            ].rows.length;


          const strikeCount =
            subMap[
              subKey
            ].rows.filter(
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
              >
                ✕
              </button>

            </div>
          `;


          /*
           * Route click.
           */

          item.addEventListener(
            "click",
            () => {

              switchViewContext(
                mainKey,
                subKey
              );
            }
          );


          /*
           * Delete route.
           */

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
                  `Delete route folder [ ${subTarget} ] from [ ${mainTarget} ]?`
                )
              ) {

                delete projectDatabase[
                  mainTarget
                ][subTarget];


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
   OPEN ROUTE WORKSPACE
   ============================================================ */

async function switchViewContext(
  mainKey,
  subKey
) {

  /*
   * Validate route before doing anything.
   */

  if (
    !projectDatabase[mainKey] ||
    !projectDatabase[mainKey][subKey]
  ) {

    console.warn(
      "Requested route does not exist:",
      mainKey,
      subKey
    );

    return;
  }


  /*
   * Cancel any previous loader.
   */

  loaderCancelled = true;

  loaderRunId++;


  /*
   * Set new active route.
   */

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


  /*
   * Show workspace controls immediately.
   */

  document
    .getElementById(
      "view-navigation-row"
    )
    .classList.remove(
      "hidden"
    );


  /*
   * Show selected route title immediately.
   */

  document
    .getElementById(
      "view-title"
    )
    .innerHTML =
      `Folder: <b>${escapeHtml(mainKey)}</b> ➔ Route: <b>${escapeHtml(subKey)}</b>`;


  /*
   * Start professional opening sequence.
   */

  const completed =
    await runActivityLoader(
      "route",
      mainKey,
      subKey
    );


  /*
   * User closed the loader.
   */

  if (!completed) {

    return;
  }


  /*
   * VERY IMPORTANT:
   *
   * Render the actual route data FIRST,
   * then hide the loader.
   *
   * This prevents the previous issue where
   * the loader disappeared but the data did
   * not open.
   */

  const routeData =
    projectDatabase[
      mainKey
    ][subKey];


  renderSpreadsheetViewGrid(
    routeData
  );


  calculateGlobalMetrics();

  rebuildWorkbookTree();


  /*
   * Change URL to viewing mode.
   */

  setActivityUrl(
    "viewing",
    mainKey,
    subKey
  );


  /*
   * Now hide the loader.
   */

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

    display.innerHTML =
      `
        <div style="padding:12px;">
          No workspace data found.
        </div>
      `;

    rangeIndicator.textContent = "";

    return;
  }


  const {
    headers,
    rows
  } = sheetObject;


  if (
    !rows ||
    rows.length === 0
  ) {

    display.innerHTML =
      `
        <div style="padding:12px;">
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

      if (
        header.startsWith(
          "SPACER_"
        )
      ) {

        tableHtml +=
          `<th class="spacer-col"></th>`;

      } else {

        const cleanHeader =
          header.split(
            "_dup"
          )[0];


        tableHtml +=
          `
            <th
              title="${escapeHtml(cleanHeader)}"
            >
              ${escapeHtml(cleanHeader)}
            </th>
          `;
      }
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
          : rowObject.data;


      const isStriked =
        !Array.isArray(rowObject) &&
        rowObject.isStrikethrough === true;


      tableHtml +=
        `
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
        index < headers.length;
        index++
      ) {

        const header =
          headers[index];


        if (
          header.startsWith(
            "SPACER_"
          )
        ) {

          tableHtml +=
            `<td class="spacer-col"></td>`;

        } else {

          const value =
            rowCells[index] !== undefined
              ? rowCells[index]
              : "";


          tableHtml +=
            `
              <td
                title="${escapeHtml(value)}"
              >
                ${escapeHtml(value)}
              </td>
            `;
        }
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


      const targetWorkbook =
        projectDatabase[
          activeMainSheet
        ][activeSubSheet];


      const headerCleanText =
        targetWorkbook.headers
          .map(
            header =>
              header.startsWith(
                "SPACER_"
              )
                ? ""
                : header.split(
                    "_dup"
                  )[0]
          )
          .join("\t");


      const textRowsArray =
        targetWorkbook.rows.map(
          rowObject => {

            const rowCells =
              Array.isArray(
                rowObject
              )
                ? rowObject
                : rowObject.data;


            return targetWorkbook.headers
              .map(
                (header, index) =>
                  header.startsWith(
                    "SPACER_"
                  )
                    ? ""
                    : rowCells[index] !==
                        undefined
                      ? rowCells[index]
                      : ""
              )
              .join("\t");
          }
        );


      const fullDataClipboardString =
        [
          headerCleanText,
          ...textRowsArray
        ].join("\n");


      navigator.clipboard
        .writeText(
          fullDataClipboardString
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
              "Unable to copy automatically. Please allow clipboard access and try again."
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


      const targetWorkbook =
        projectDatabase[
          activeMainSheet
        ][activeSubSheet];


      const sanitizeCsvCell =
        value => {

          if (
            value === null ||
            value === undefined
          ) {

            return '""';
          }


          return `"${value
            .toString()
            .replace(
              /"/g,
              '""'
            )}"`;
        };


      const headerRowString =
        targetWorkbook.headers
          .map(
            header =>
              header.startsWith(
                "SPACER_"
              )
                ? '""'
                : sanitizeCsvCell(
                    header.split(
                      "_dup"
                    )[0]
                  )
          )
          .join(",");


      const dataRowsStringArray =
        targetWorkbook.rows.map(
          rowObject => {

            const rowCells =
              Array.isArray(
                rowObject
              )
                ? rowObject
                : rowObject.data;


            return targetWorkbook
              .headers
              .map(
                (header, index) =>
                  header.startsWith(
                    "SPACER_"
                  )
                    ? '""'
                    : sanitizeCsvCell(
                        rowCells[index] !==
                          undefined
                          ? rowCells[index]
                          : ""
                      )
              )
              .join(",");
          }
        );


      const fullCsvPayloadString =
        [
          headerRowString,
          ...dataRowsStringArray
        ].join("\n");


      const dataBlobFileStream =
        new Blob(
          [
            fullCsvPayloadString
          ],
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
          dataBlobFileStream
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
        ]
      ).forEach(
        subKey => {

          const rowsArray =
            projectDatabase[
              mainKey
            ][subKey].rows;


          grandTotal +=
            rowsArray.length;


          if (
            mainKey ===
            activeMainSheet
          ) {

            mainTotal +=
              rowsArray.length;
          }


          if (
            mainKey ===
              activeMainSheet &&
            subKey ===
              activeSubSheet
          ) {

            subTotal =
              rowsArray.length;
          }


          rowsArray.forEach(
            row => {

              if (
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


  if (
    grandElement
  ) {

    grandElement.textContent =
      `${grandTotal} Rows`;
  }


  if (
    mainElement
  ) {

    mainElement.textContent =
      `${mainTotal} Rows`;
  }


  if (
    subElement
  ) {

    subElement.textContent =
      `${subTotal} Rows`;
  }


  if (
    strikeElement
  ) {

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
        confirm(
          "Permanently wipe local workspace database memory?"
        )
      ) {

        /*
         * Stop any loader first.
         */

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


        updateDropdownMenu();

        rebuildWorkbookTree();

        calculateGlobalMetrics();


        setActivityUrl(
          "",
          "",
          ""
        );
      }
    }
  );
