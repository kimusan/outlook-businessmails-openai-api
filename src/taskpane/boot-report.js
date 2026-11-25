/* Boot diagnostics probe. Loaded by taskpane.html BEFORE office.js and the
 * main bundle so it can observe every later startup failure and report it in
 * the #boot-status placeholder.
 *
 * Deliberately ES5-only with no build step: it must execute even when the
 * main bundle cannot (old engine, parse error, blocked script). It never
 * touches the Office API and never throws outward. */
/* global window, document, navigator, XMLHttpRequest */
(function () {
  "use strict";

  var log = [];
  var el = null;

  function push(msg) {
    log.push(msg);
    if (el) {
      el.textContent = log.join(" | ");
    }
  }

  // Single writer protocol: the main bundle reports through this hook so
  // probe messages and bundle messages end up in one coherent log.
  window.__bootReport = push;

  function ready() {
    el = document.getElementById("boot-status");
    if (el && log.length) {
      el.textContent = log.join(" | ");
    }
    probeBundle();
  }

  // Capture phase: script/resource load failures do not bubble.
  window.addEventListener(
    "error",
    function (e) {
      var t = e.target;
      if (t && t.src) {
        push("load failed: " + (t.tagName || "?") + " " + t.src);
      } else if (e.message) {
        push("error: " + e.message);
      }
    },
    true
  );

  var engine = navigator.userAgent.match(
    /(MSIE [0-9.]+|Trident\/[0-9.]+|Edg(e|A|iOS)?\/[0-9.]+|Chrome\/[0-9.]+|Firefox\/[0-9.]+)/g
  );
  push("boot-report loaded, engine: " + (engine ? engine.join(" ") : "unknown"));
  push("origin: " + window.location.origin);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready);
  } else {
    ready();
  }

  // Ask the server what it would actually serve for the bundle: catches 404s,
  // wrong MIME types and stale cached builds from inside the WebView itself.
  function probeBundle() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", "taskpane.js", true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) {
          return;
        }
        var type = xhr.getResponseHeader("Content-Type");
        var len = xhr.responseText ? xhr.responseText.length : 0;
        var m = xhr.responseText.match(/build ([A-Za-z0-9]{7,40} [0-9-]+ [0-9:]+ UTC)/);
        push(
          "taskpane.js: HTTP " +
            xhr.status +
            ", " +
            type +
            ", " +
            len +
            "B" +
            (m ? ", build " + m[1] : ", NO BUILD ID (stale or wrong file)")
        );
      };
      xhr.send();
    } catch (e) {
      push("taskpane.js probe failed: " + e.message);
    }
  }

  window.setTimeout(function () {
    if (!window.__taskpaneEntryRan) {
      push("3s: bundle has not started (blocked, missing or parse error)");
    }
  }, 3000);

  window.setTimeout(function () {
    if (!window.__taskpaneMounted) {
      push("10s: not mounted, entry stage: " + (window.__taskpaneEntryRan || "never ran"));
    }
  }, 10000);
})();
