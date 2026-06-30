// Global JS error + React-mount fallback for release builds.
// Logs errors to console and shows a visible fallback if React never mounts.

(function () {
  var ERRORS = [];
  var MOUNTED = false;

  window.onerror = function (msg, source, line, col, err) {
    ERRORS.push({ msg: String(msg), source: source, line: line, col: col, stack: err && err.stack });
    console.error("[error-monitor]", msg, source && "at " + source + ":" + line, err && err.stack);
  };

  window.addEventListener("unhandledrejection", function (e) {
    var reason = e.reason;
    ERRORS.push({
      msg: reason && reason.message ? reason.message : String(reason),
      stack: reason && reason.stack,
    });
    console.error("[error-monitor] Unhandled rejection:", reason);
  });

  // Detect when React mounts by observing #root for children
  var rootEl = document.getElementById("root");
  if (rootEl) {
    var observer = new MutationObserver(function () {
      if (rootEl.children.length > 0) {
        MOUNTED = true;
        observer.disconnect();
      }
    });
    observer.observe(rootEl, { childList: true });
  }

  // Fallback: if React hasn't mounted within 20s, show error info
  var FALLBACK_MS = 20000;
  var fallbackTimer = setTimeout(function () {
    if (MOUNTED) return;

    var root = document.getElementById("root");
    if (!root) return;

    var html = [
      '<div style="display:flex;height:100vh;width:100vw;align-items:center;justify-content:center;background:#0d0d11;color:#a1a1aa;font-family:monospace;font-size:13px;">',
      '<div style="display:flex;flex-direction:column;align-items:center;gap:16px;text-align:center;max-width:480px;padding:24px;">',
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      '<span style="color:#71717a;font-size:10px;text-transform:uppercase;letter-spacing:2px;">Application failed to initialize</span>',
      '<p style="color:#52525b;font-size:12px;margin:0;">The React UI did not mount within ' + (FALLBACK_MS / 1000) + ' seconds. Check logs below for errors.</p>',
    ].join("");

    if (ERRORS.length > 0) {
      var errLines = ERRORS.slice(0, 3).map(function (e) {
        return e.msg.length > 200 ? e.msg.slice(0, 200) + "..." : e.msg;
      });
      html += '<pre style="background:#00000040;color:#a1a1aa;padding:12px;border-radius:6px;font-size:11px;line-height:1.5;text-align:left;max-height:150px;overflow:auto;width:100%;">' + errLines.join("\n---\n") + '</pre>';
    }

    html += '<button onclick="location.reload()" style="padding:8px 20px;font-size:11px;text-transform:uppercase;letter-spacing:1px;background:transparent;border:1px solid #27272a;color:#a1a1aa;border-radius:4px;cursor:pointer;">Reload</button>';
    html += "</div></div>";

    root.innerHTML = html;
    root.style.display = "";
  }, FALLBACK_MS);

})();
