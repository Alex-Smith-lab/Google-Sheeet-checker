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


/* ============================================================
   PROFESSIONAL LOADER
   ============================================================ */

const loaderStages = [
  {
    key: "reading",
    title: "Reading data",
    detail: "Reading the selected data stream...",
    progress: 18
  },
  {
    key: "analysing",
    title: "Analysing data",
    detail: "Checking assignees, routes and record structure...",
    progress: 38
  },
  {
    key: "arranging",
    title: "Arranging data",
    detail: "Aligning records for the workspace...",
    progress: 60
  },
  {
    key: "storing",
    title: "Storing data to the web",
    detail: "Saving the processed records to this workspace...",
    progress: 82
  },
  {
    key: "success",
    title: "Successfully extracted",
    detail: "The data is ready and the workspace is opening.",
    progress: 100
  }
];


function wait(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}


/* ============================================================
   SAFE HTML
   ============================================================ */

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(
    /[&<>"']/g,
    function(char) {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      };

      return map[char];
    }
  );
}


/* ============================================================
   URL / ACTIVITY TRACKING
   ============================================================ */

function setActivityUrl(
  activity,
  folder,
  route
) {

  try {

    const params = new URLSearchParams();

    if (activity) {
      params.set("activity", activity);
    }

    if (folder) {
      params.set("folder", folder);
    }

    if (route) {
      params.set("route", route);
    }

    const queryString = params.toString();

    const newUrl =
      window.location.pathname +
      (queryString ? "?" + queryString : "");

    window.history.replaceState(
      {
        activity: activity || "",
        folder: folder || "",
        route: route || ""
      },
      "",
      newUrl
    );

    if (activity === "opening") {

      document.title =
        "Opening " +
        (route || "Route") +
        " — " +
        (folder || "Folder");

    } else if (activity === "processing") {

      document.title =
        "Processing data — " +
        (folder || "Workspace");

    } else if (activity === "reading") {

      document.title =
        "Reading data — " +
        (folder || "Workspace");

    } else if (activity === "analysing") {

      document.title =
        "Analysing data — " +
        (folder || "Workspace");

    } else if (activity === "arranging") {

      document.title =
        "Arranging data — " +
        (folder || "Workspace");

    } else if (activity === "storing") {

      document.title =
        "Storing data — " +
        (folder || "Workspace");

    } else if (activity === "success") {

      document.title =
        "Successfully extracted — " +
        (route || folder || "Workspace");

    } else if (activity === "viewing") {

      document.title =
        (route || "Workspace") +
        " — " +
        (folder || "Folder");

    } else if (activity === "error") {

      document.title =
        "Error — Sheet Task Extractor Pro";

    } else {

      document.title =
        "Sheet Task Extractor Pro - Direct Ingest Workspace";
    }

  } catch (error) {

    console.warn(
      "Unable to update browser URL:",
      error
    );

  }
}


/* ============================================================
   LOADER DISPLAY
   ============================================================ */

function showLoader(
  mode,
  folder,
  route
) {

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

  const routeBadge =
    document.getElementById(
      "loader-route-name"
    );

  if (
    mode === "route" &&
    (folder || route)
  ) {

    routeBadge.textContent =
      "Opening: " +
      (folder || "") +
      (route ? " / " + route : "");

    routeBadge.classList.remove(
      "hidden"
    );

  } else {

    routeBadge.textContent = "";

    routeBadge.classList.add(
      "hidden"
    );
  }
}


/* ============================================================
   SET LOADER STAGE
   ============================================================ */

function setLoaderStage(
  stageKey,
  folder,
  route,
  mode
) {

  const stageIndex =
    loaderStages.findIndex(
      function(stage) {
        return stage.key === stageKey;
      }
    );

  if (stageIndex === -1) {
    return;
  }

  const stage =
    loaderStages[stageIndex];

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
      stage.title;
  }

  if (detail) {
    detail.textContent =
      stage.detail;
  }

  if (progress) {
    progress.style.width =
      stage.progress + "%";
  }

  const steps =
    document.querySelectorAll(
      ".loader-step"
    );

  steps.forEach(
    function(element) {

      const elementIndex =
        loaderStages.findIndex(
          function(item) {
            return item.key ===
              element.dataset.step;
          }
        );

      element.classList.remove(
        "active",
        "done",
        "success"
      );

      if (
        stageKey === "success" &&
        element.dataset.step === "success"
      ) {

        element.classList.add(
          "success"
        );

      } else if (
        elementIndex < stageIndex
      ) {

        element.classList.add(
          "done"
        );

      } else if (
        elementIndex === stageIndex
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
      stageKey === "success"
    );
  }

  /*
   * Update URL while user is working.
   */

  if (mode === "route") {

    setActivityUrl(
      "opening",
      folder,
      route
    );

  } else {

    if (stageKey === "success") {

      setActivityUrl(
        "success",
        folder,
        route
      );

    } else {

      setActivityUrl(
        stageKey,
        folder,
        route
      );
    }
  }
}


/* ============================================================
   RUN LOADER
   ============================================================ */

async function runActivityLoader(
  mode,
  folder,
  route
) {

  showLoader(
    mode,
    folder,
    route
  );

  for (
    let i = 0;
    i < loaderStages.length;
    i++
  ) {

    const stage =
      loaderStages[i];

    setLoaderStage(
      stage.key,
      folder,
      route,
      mode
    );

    if (
      stage.key !== "success"
    ) {

      await wait(
        mode === "route"
          ? 220
          : 320
      );

    }

  }

  await wait(450);
}


/* ============================================================
   HIDE LOADER
   ============================================================ */

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
  function() {

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
          "Unable to restore workspace:",
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
     * If the user previously had a route open,
     * reopen it.
     */

    if (
      savedMain &&
      savedSub &&
      projectDatabase[savedMain] &&
      projectDatabase[savedMain][savedSub]
    ) {

      switchViewContext(
        savedMain,
        savedSub
      );

    }


    calculateGlobalMetrics();

  }
);


/* ============================================================
   ONLINE / OFFLINE
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
   PASTE LISTENER
   ============================================================ */

document
  .getElementById("paste-input")
  .addEventListener(
    "paste",
    function(event) {

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


/* ============================================================
   TEXT INPUT LISTENER
   ============================================================ */

document
  .getElementById("paste-input")
  .addEventListener(
    "input",
    function() {

      parsePastedStreamForAssignees();

    }
  );


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


  if (!rawText.trim()) {

    container.classList.add(
      "hidden"
    );

    selectedAssignee = "";

    return;
  }


  const lines =
    rawText
      .split(/\r?\n/)
      .filter(
        function(line) {
          return line.length > 0;
        }
      );


  if (lines.length === 0) {
    return;
  }


  parsedParsedRowsStream =
    lines.map(
      function(line) {
        return line
          .split("\t")
          .map(
            function(cell) {
              return cell.trim();
            }
          );
      }
    );


  detectedAssigneeColIdx = -1;
  detectedHeaderRowIdx = -1;


  /*
   * Search first five rows for Assignee.
   */

  for (
    let r = 0;
    r < Math.min(
      parsedParsedRowsStream.length,
      5
    );
    r++
  ) {

    const row =
      parsedParsedRowsStream[r];

    for (
      let c = 0;
      c < row.length;
      c++
    ) {

      const cellValue =
        row[c].toUpperCase();

      if (
        cellValue === "ASSIGNEE" ||
        cellValue.includes("ASSIGNED")
      ) {

        detectedAssigneeColIdx =
          c;

        detectedHeaderRowIdx =
          r;

        break;
      }
    }

    if (
      detectedAssigneeColIdx !== -1
    ) {

      break;
    }
  }


  /*
   * Fallback to master Assignee position.
   */

  if (
    detectedAssigneeColIdx === -1
  ) {

    const masterAssigneeIndex =
      masterHeaders.indexOf(
        "Assignee"
      );

    if (
      masterAssigneeIndex !== -1
    ) {

      let nonSpacerIndex = 0;

      for (
        let i = 0;
        i < masterAssigneeIndex;
        i++
      ) {

        if (
          !masterHeaders[i]
            .startsWith("SPACER_")
        ) {

          nonSpacerIndex++;
        }
      }

      detectedAssigneeColIdx =
        nonSpacerIndex;
    }
  }


  const assigneeSet =
    new Set();


  const startRow =
    detectedHeaderRowIdx !== -1
      ? detectedHeaderRowIdx + 1
      : 0;


  for (
    let r = startRow;
    r < parsedParsedRowsStream.length;
    r++
  ) {

    const row =
      parsedParsedRowsStream[r];

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
        value.toUpperCase() !==
          "ASSIGNEE"
      ) {

        assigneeSet.add(
          value.trim()
        );
      }
    }
  }


  detectedAssignees =
    Array.from(assigneeSet);


  /*
   * Detect route automatically.
   */

  let detectedRoute = "";

  if (
    detectedHeaderRowIdx !== -1
  ) {

    const headerRow =
      parsedParsedRowsStream[
        detectedHeaderRowIdx
      ];

    const routeColumnIndex =
      headerRow.findIndex(
        function(header) {

          const upper =
            header.toUpperCase();

          return (
            upper.includes(
              "BUS ROUTE"
            ) ||
            upper.includes(
              "ROUTE"
            )
          );
        }
      );


    if (
      routeColumnIndex !== -1 &&
      parsedParsedRowsStream.length >
        detectedHeaderRowIdx + 1
    ) {

      detectedRoute =
        parsedParsedRowsStream[
          detectedHeaderRowIdx + 1
        ][routeColumnIndex] || "";
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
   * Build assignee buttons.
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
      "assignee-pill " +
      (
        selectedAssignee === ""
          ? "selected"
          : ""
      );

    allPill.textContent =
      "All Assignees";

    allPill.addEventListener(
      "click",
      function() {

        selectAssigneeFilter(
          ""
        );

      }
    );

    pillsList.appendChild(
      allPill
    );


    detectedAssignees.forEach(
      function(name) {

        const pill =
          document.createElement(
            "div"
          );

        pill.className =
          "assignee-pill " +
          (
            selectedAssignee === name
              ? "selected"
              : ""
          );

        pill.textContent =
          name;

        pill.addEventListener(
          "click",
          function() {

            selectAssigneeFilter(
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
      function(element) {

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
    function() {

      const currentTheme =
        document.documentElement
          .getAttribute(
            "data-theme"
          );

      const targetTheme =
        currentTheme === "light"
          ? "dark"
          : "light";


      document.getElementById(
        "theme-toggle-btn"
      ).textContent =
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
   EXISTING FOLDER SELECT
   ============================================================ */

document
  .getElementById(
    "main-sheet-select"
  )
  .addEventListener(
    "change",
    function(event) {

      if (event.target.value) {

        document.getElementById(
          "main-sheet-input"
        ).value =
          event.target.value;
      }

    }
  );


/* ============================================================
   CLOSE WORKSPACE
   ============================================================ */

document
  .getElementById(
    "btn-close-view"
  )
  .addEventListener(
    "click",
    function() {

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


      document.getElementById(
        "view-title"
      ).textContent =
        "Active Workspace View";


      document.getElementById(
        "view-range-indicator"
      ).textContent = "";


      document.getElementById(
        "grid-output-view"
      ).innerHTML = `
        <div class="splash-container">
          <div class="splash-text">
            Paste sheet data stream or select a subfolder node from
            the workbook index to mount sheet records.
          </div>
        </div>
      `;


      document
        .querySelectorAll(
          ".tree-item"
        )
        .forEach(
          function(element) {
            element.classList.remove(
              "active"
            );
          }
        );


      setActivityUrl(
        "",
        "",
        ""
      );


      calculateGlobalMetrics();

    }
  );


/* ============================================================
   PROCESS DATA
   ============================================================ */

document
  .getElementById(
    "process-entry-btn"
  )
  .addEventListener(
    "click",
    async function() {

      if (
        !verifyOnlineStatus()
      ) {

        return;
      }


      const mainName =
        document.getElementById(
          "main-sheet-input"
        ).value.trim();

      const subName =
        document.getElementById(
          "sub-sheet-input"
        ).value.trim();

      const rawDataText =
        document.getElementById(
          "paste-input"
        ).value;


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


      /*
       * Start URL state.
       */

      setActivityUrl(
        "processing",
        mainName,
        subName
      );


      /*
       * Show loader.
       */

      showLoader(
        "process",
        mainName,
        subName
      );


      try {

        let htmlRows = [];


        /*
         * STEP 1
         * Reading data
         */

        setLoaderStage(
          "reading",
          mainName,
          subName,
          "process"
        );

        await wait(350);


        /*
         * Read clipboard HTML.
         */

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
              function(line) {
                return line.trim().length >
                  0;
              }
            );


        const extractedRows = [];


        /*
         * STEP 2
         * Analysing data
         */

        setLoaderStage(
          "analysing",
          mainName,
          subName,
          "process"
        );

        await wait(350);


        /*
         * Header detection.
         */

        let isHeaderRowPresent =
          false;


        if (
          lines.length > 0
        ) {

          const firstLineCells =
            lines[0]
              .split("\t")
              .map(
                function(cell) {
                  return cell
                    .trim()
                    .toUpperCase();
                }
              );


          const headerMatches =
            firstLineCells.filter(
              function(cell) {

                return (
                  cell &&
                  masterHeaders.some(
                    function(master) {

                      return master
                        .toUpperCase()
                        .includes(cell);

                    }
                  )
                );
              }
            );


          if (
            headerMatches.length >= 2
          ) {

            isHeaderRowPresent =
              true;
          }
        }


        const startIndex =
          isHeaderRowPresent
            ? 1
            : 0;


        /*
         * Extract records.
         */

        for (
          let index = startIndex;
          index < lines.length;
          index++
        ) {

          const line =
            lines[index];

          const cells =
            line
              .split("\t")
              .map(
                function(cell) {
                  return cell.trim();
                }
              );


          const rowAssignee =
            (
              detectedAssigneeColIdx !== -1 &&
              detectedAssigneeColIdx <
                cells.length
            )
              ? cells[
                  detectedAssigneeColIdx
                ].trim()
              : "";


          /*
           * Selected assignee.
           */

          if (
            selectedAssignee !== ""
          ) {

            if (
              rowAssignee.toLowerCase() !==
              selectedAssignee.toLowerCase()
            ) {

              continue;
            }

          } else {

            /*
             * All assignees:
             * Ignore blank assignee rows.
             */

            if (
              !rowAssignee
            ) {

              continue;
            }
          }


          /*
           * Align row to master headers.
           */

          const alignedRowCells =
            new Array(
              masterHeaders.length
            ).fill("");


          let cellPointer = 0;


          for (
            let mIdx = 0;
            mIdx < masterHeaders.length;
            mIdx++
          ) {

            if (
              masterHeaders[mIdx]
                .startsWith(
                  "SPACER_"
                )
            ) {

              alignedRowCells[
                mIdx
              ] = "";

              continue;
            }


            if (
              cellPointer <
              cells.length
            ) {

              alignedRowCells[
                mIdx
              ] =
                cells[
                  cellPointer
                ];

              cellPointer++;
            }
          }


          /*
           * Strikethrough detection.
           */

          let isStrikethrough =
            false;


          if (
            htmlRows.length > 0
          ) {

            const matchingHtmlRow =
              htmlRows[index] ||
              htmlRows.find(
                function(row) {

                  return row.textContent
                    .includes(
                      cells[0] || ""
                    );

                }
              );


            if (
              matchingHtmlRow
            ) {

              const rowStyles =
                matchingHtmlRow
                  .getAttribute(
                    "style"
                  ) || "";


              const innerHtml =
                matchingHtmlRow
                  .innerHTML
                  .toLowerCase();


              if (
                rowStyles.includes(
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
                )
              ) {

                isStrikethrough =
                  true;
              }
            }
          }


          extractedRows.push({
            data: alignedRowCells,
            isStrikethrough:
              isStrikethrough
          });

        }


        /*
         * Nothing found.
         */

        if (
          extractedRows.length === 0
        ) {

          hideLoader();

          setActivityUrl(
            "error",
            mainName,
            subName
          );

          alert(
            "No valid rows matching the selected assignee were found."
          );

          return;
        }


        /*
         * STEP 3
         * Arranging data
         */

        setLoaderStage(
          "arranging",
          mainName,
          subName,
          "process"
        );

        await wait(350);


        /*
         * Create folder.
         */

        if (
          !projectDatabase[mainName]
        ) {

          projectDatabase[
            mainName
          ] = {};
        }


        /*
         * Create route.
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
              masterHeaders,
            rows: []
          };
        }


        /*
         * Store extracted records.
         */

        projectDatabase[
          mainName
        ][subName]
          .rows =
          projectDatabase[
            mainName
          ][subName]
            .rows.concat(
              extractedRows
            );


        /*
         * STEP 4
         * Storing data
         */

        setLoaderStage(
          "storing",
          mainName,
          subName,
          "process"
        );

        await wait(350);


        localStorage.setItem(
          "projectDatabase",
          JSON.stringify(
            projectDatabase
          )
        );


        /*
         * STEP 5
         * Success
         */

        setLoaderStage(
          "success",
          mainName,
          subName,
          "process"
        );


        setActivityUrl(
          "success",
          mainName,
          subName
        );


        await wait(700);


        /*
         * Clear input.
         */

        document.getElementById(
          "paste-input"
        ).value = "";


        document.getElementById(
          "sub-sheet-input"
        ).value = "";


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
         * Refresh workspace.
         */

        updateDropdownMenu();

        rebuildWorkbookTree();


        hideLoader();


        /*
         * Open the newly processed route.
         */

        await switchViewContext(
          mainName,
          subName
        );

      } catch (error) {

        console.error(
          "Data processing failed:",
          error
        );


        hideLoader();


        setActivityUrl(
          "error",
          mainName,
          subName
        );


        alert(
          "Unable to process the data: " +
          (
            error.message ||
            error
          )
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


  select.innerHTML =
    `
      <option value="" selected>
        -- Select Existing Folder --
      </option>
    `;


  Object.keys(
    projectDatabase
  ).forEach(
    function(mainKey) {

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
   REBUILD WORKBOOK TREE
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


  workbooks.forEach(
    function(mKey) {

      const subMap =
        projectDatabase[mKey];

      const subList =
        Object.keys(
          subMap
        );


      let sumTotal = 0;


      subList.forEach(
        function(sKey) {

          sumTotal +=
            subMap[sKey]
              .rows.length;

        }
      );


      const node =
        document.createElement(
          "div"
        );


      node.className =
        "tree-node";


      node.innerHTML =
        `
          <div class="tree-header">

            <span>
              📂 ${escapeHtml(mKey)}
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
        function(sKey) {

          const rowVol =
            subMap[sKey]
              .rows.length;


          const strikeCount =
            subMap[sKey]
              .rows
              .filter(
                function(row) {
                  return row.isStrikethrough;
                }
              )
              .length;


          const item =
            document.createElement(
              "div"
            );


          item.className =
            "tree-item " +
            (
              activeMainSheet === mKey &&
              activeSubSheet === sKey
                ? "active"
                : ""
            );


          item.innerHTML =
            `
              <span>
                📄 ${escapeHtml(sKey)}
              </span>

              <div class="tree-item-meta">

                ${
                  strikeCount > 0
                    ? `
                      <span
                        class="count-badge"
                        style="
                          background:rgba(
                            217,
                            48,
                            37,
                            0.15
                          );
                          color:var(--danger);
                        "
                      >
                        ☠ ${strikeCount}
                      </span>
                    `
                    : ""
                }

                <span class="count-badge">
                  ${rowVol}
                </span>

                <button
                  class="btn-delete-node"
                  data-main="${escapeHtml(mKey)}"
                  data-sub="${escapeHtml(sKey)}"
                >
                  ✕
                </button>

              </div>
            `;


          /*
           * Open route.
           */

          item.addEventListener(
            "click",
            function() {

              switchViewContext(
                mKey,
                sKey
              );

            }
          );


          /*
           * Delete route.
           */

          item
            .querySelector(
              ".btn-delete-node"
            )
            .addEventListener(
              "click",
              function(event) {

                event.stopPropagation();


                const mainTarget =
                  event.target
                    .getAttribute(
                      "data-main"
                    );

                const subTarget =
                  event.target
                    .getAttribute(
                      "data-sub"
                    );


                if (
                  confirm(
                    "Delete route folder [ " +
                    subTarget +
                    " ] from [ " +
                    mainTarget +
                    " ]?"
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
   OPEN ROUTE
   ============================================================ */

async function switchViewContext(
  mainKey,
  subKey
) {

  if (
    !projectDatabase[mainKey] ||
    !projectDatabase[mainKey][subKey]
  ) {

    console.warn(
      "Route not found:",
      mainKey,
      subKey
    );

    return;
  }


  /*
   * Store active route.
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
   * Show workspace controls.
   */

  document
    .getElementById(
      "view-navigation-row"
    )
    .classList.remove(
      "hidden"
    );


  /*
   * Display folder + route.
   */

  document.getElementById(
    "view-title"
  ).innerHTML =
    "Folder: <b>" +
    escapeHtml(mainKey) +
    "</b> ➔ Route: <b>" +
    escapeHtml(subKey) +
    "</b>";


  /*
   * Run professional route opening loader.
   */

  await runActivityLoader(
    "route",
    mainKey,
    subKey
  );


  /*
   * Now display data.
   */

  rebuildWorkbookTree();

  renderSpreadsheetViewGrid(
    projectDatabase[
      mainKey
    ][subKey]
  );

  calculateGlobalMetrics();


  /*
   * Final URL tells user what
   * is currently being viewed.
   */

  setActivityUrl(
    "viewing",
    mainKey,
    subKey
  );
}


/* ============================================================
   RENDER TABLE
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


  const headers =
    sheetObject.headers;


  const rows =
    sheetObject.rows;


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

    rangeIndicator.textContent =
      "";

    return;
  }


  rangeIndicator.textContent =
    "Displaying total " +
    rows.length +
    " record entries.";


  let tableHtml =
    "<table><thead><tr>";


  headers.forEach(
    function(header) {

      if (
        header.startsWith(
          "SPACER_"
        )
      ) {

        tableHtml +=
          `
            <th
              class="spacer-col"
            ></th>
          `;

      } else {

        const cleanHeader =
          header.split(
            "_dup"
          )[0];


        tableHtml +=
          `
            <th
              title="${escapeHtml(
                cleanHeader
              )}"
            >
              ${escapeHtml(
                cleanHeader
              )}
            </th>
          `;
      }

    }
  );


  tableHtml +=
    "</tr></thead><tbody>";


  rows.forEach(
    function(rowObject) {

      const rowCells =
        Array.isArray(rowObject)
          ? rowObject
          : rowObject.data;


      const isStriked =
        rowObject.isStrikethrough ===
        true;


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
        let i = 0;
        i < headers.length;
        i++
      ) {

        const headerTitle =
          headers[i];


        if (
          headerTitle.startsWith(
            "SPACER_"
          )
        ) {

          tableHtml +=
            `
              <td
                class="spacer-col"
              ></td>
            `;

        } else {

          const value =
            rowCells[i] !== undefined
              ? rowCells[i]
              : "";


          tableHtml +=
            `
              <td
                title="${escapeHtml(
                  value
                )}"
              >
                ${escapeHtml(
                  value
                )}
              </td>
            `;
        }
      }


      tableHtml +=
        "</tr>";

    }
  );


  tableHtml +=
    "</tbody></table>";


  display.innerHTML =
    tableHtml;
}


/* ============================================================
   GOOGLE SHEETS EXPORT
   ============================================================ */

document
  .getElementById(
    "btn-create-gsheet"
  )
  .addEventListener(
    "click",
    function() {

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
            function(header) {

              return header.startsWith(
                "SPACER_"
              )
                ? ""
                : header.split(
                    "_dup"
                  )[0];

            }
          )
          .join("\t");


      const textRowsArray =
        targetWorkbook.rows.map(
          function(rowObject) {

            const rowCells =
              Array.isArray(rowObject)
                ? rowObject
                : rowObject.data;


            return targetWorkbook.headers
              .map(
                function(header, index) {

                  if (
                    header.startsWith(
                      "SPACER_"
                    )
                  ) {

                    return "";
                  }


                  return rowCells[
                    index
                  ] !== undefined
                    ? rowCells[index]
                    : "";

                }
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
          function() {

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
          function(error) {

            console.error(
              "Clipboard error:",
              error
            );

            alert(
              "Unable to copy data to clipboard. Please allow clipboard access in your browser."
            );

          }
        );

    }
  );


/* ============================================================
   CSV EXPORT
   ============================================================ */

document
  .getElementById(
    "btn-export-csv"
  )
  .addEventListener(
    "click",
    function() {

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
        function(value) {

          if (
            value === null ||
            value === undefined
          ) {

            return '""';
          }


          return (
            '"' +
            value
              .toString()
              .replace(
                /"/g,
                '""'
              ) +
            '"'
          );
        };


      const headerRowString =
        targetWorkbook.headers
          .map(
            function(header) {

              return header.startsWith(
                "SPACER_"
              )
                ? '""'
                : sanitizeCsvCell(
                    header.split(
                      "_dup"
                    )[0]
                  );

            }
          )
          .join(",");


      const dataRowsStringArray =
        targetWorkbook.rows.map(
          function(rowObject) {

            const rowCells =
              Array.isArray(rowObject)
                ? rowObject
                : rowObject.data;


            return targetWorkbook.headers
              .map(
                function(header, index) {

                  if (
                    header.startsWith(
                      "SPACER_"
                    )
                  ) {

                    return '""';
                  }


                  return sanitizeCsvCell(
                    rowCells[
                      index
                    ] !== undefined
                      ? rowCells[
                          index
                        ]
                      : ""
                  );

                }
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
        (
          activeMainSheet +
          "_" +
          activeSubSheet +
          ".csv"
        )
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
        function() {

          URL.revokeObjectURL(
            link.href
          );

        },
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
    function(mainKey) {

      Object.keys(
        projectDatabase[
          mainKey
        ]
      ).forEach(
        function(subKey) {

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
            function(row) {

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


  document.getElementById(
    "stat-grand-total"
  ).textContent =
    grandTotal +
    " Rows";


  document.getElementById(
    "stat-main-total"
  ).textContent =
    mainTotal +
    " Rows";


  document.getElementById(
    "stat-sub-total"
  ).textContent =
    subTotal +
    " Rows";


  document.getElementById(
    "stat-strike-total"
  ).textContent =
    strikeTotal +
    " Rows";
}


/* ============================================================
   CLEAR DATABASE
   ============================================================ */

document
  .getElementById(
    "clear-db-btn"
  )
  .addEventListener(
    "click",
    function() {

      if (
        confirm(
          "Permanently wipe local workspace database memory?"
        )
      ) {

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


        document
          .getElementById(
            "btn-close-view"
          )
          .click();


        updateDropdownMenu();

        rebuildWorkbookTree();

        calculateGlobalMetrics();
      }

    }
  );
