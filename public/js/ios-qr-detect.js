// public/js/ios-qr-detect.js
(function () {
  function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  }

  function urlObj() {
    return new URL(window.location.href);
  }

  function getParam(name) {
    try {
      return urlObj().searchParams.get(name);
    } catch {
      return null;
    }
  }

  function makeXSafariUrlWithBypass() {
    const u = urlObj();

    // Add bypass flag so once Safari opens, we don't show the gate again
    u.searchParams.set("opened", "1");

    const href = u.toString();
    if (href.startsWith("https://")) return "x-safari-https://" + href.slice("https://".length);
    if (href.startsWith("http://")) return "x-safari-http://" + href.slice("http://".length);
    return null;
  }

  async function copyLink(text) {
    await navigator.clipboard.writeText(text);
  }

  function showGate() {
    const normal = document.querySelector("[data-normal-scan]");
    const gate = document.querySelector("[data-ios-qr-gate]");
    if (!normal || !gate) return;

    normal.style.display = "none";
    gate.style.display = "block";

    const btn = gate.querySelector("[data-open-safari]");
    const hint = gate.querySelector("[data-ios-hint]");

    async function fallbackCopy() {
      try {
        const u = urlObj();
        u.searchParams.set("opened", "1");
        await copyLink(u.toString());

        if (btn) btn.textContent = "Link Copied ✔ Open Safari and paste";
        if (hint) {
          hint.innerHTML =
            'Safari did not open automatically. Please open Safari and paste the copied link, or use Share → <b>Open in Safari</b>.';
        }
      } catch {
        if (hint) {
          hint.innerHTML =
            'Please tap the Share icon and choose <b>Open in Safari</b>.';
        } else {
          alert("Please tap Share and choose Open in Safari.");
        }
      }
    }

    if (btn) {
      btn.addEventListener("click", function () {
        const schemeUrl = makeXSafariUrlWithBypass();

        if (schemeUrl) {
          // Best-effort: open full Safari
          window.location.href = schemeUrl;

          // If still here, fallback by copying link (with opened=1)
          setTimeout(() => {
            fallbackCopy();
          }, 700);

          return;
        }

        fallbackCopy();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!isIOS()) return;

    const src = getParam("src");        // should be "qr"
    const opened = getParam("opened");  // bypass once Safari has opened

    // Gate only for iOS QR visits that have not already opened Safari
    if (src === "qr" && opened !== "1") {
      showGate();
    }
  });
})();
