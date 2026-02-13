(function () {
  function $(sel) { return document.querySelector(sel); }

  function setEnabled(el, enabled) {
    if (!el) return;
    el.style.opacity = enabled ? "1" : ".5";
    el.style.pointerEvents = enabled ? "auto" : "none";
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image: " + url));
      img.src = url;
    });
  }

  async function drawPoster({ frameUrl, rawQrUrl, canvas, qrScale = 0.60, offsetX = 0, offsetY = 0 }) {
    const ctx = canvas.getContext("2d");

    const [frameImg, qrImg] = await Promise.all([
      loadImage(frameUrl),
      loadImage(rawQrUrl)
    ]);

    canvas.width = frameImg.naturalWidth;
    canvas.height = frameImg.naturalHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);

    const qrSize = Math.round(Math.min(canvas.width, canvas.height) * qrScale);
    const x = Math.round((canvas.width - qrSize) / 2 + offsetX);
    const y = Math.round((canvas.height - qrSize) / 2 + offsetY);

    ctx.drawImage(qrImg, x, y, qrSize, qrSize);
  }

  function downloadCanvasPng(canvas, filename) {
    const a = document.createElement("a");
    a.download = filename;
    a.href = canvas.toDataURL("image/png");
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function main() {
    const mount = $("#qrPosterMount");
    if (!mount) return;

    const storeSel = $("#storeSel"); // exists on test page only
    const rawBtn = $("#rawBtn");
    const framedBtn = $("#framedBtn");
    const rawPreview = $("#rawPreview");
    const canvas = $("#posterCanvas");

    const frameUrl = mount.dataset.frameUrl;
    const rawTemplate = mount.dataset.rawTemplate;

    // NEW: store page can provide fixed store id via data-store-id
    const fixedStoreId = mount.dataset.storeId || "";

    function rawUrlFor(id) {
      return rawTemplate.replace("{ID}", String(id));
    }

    function getActiveStoreId() {
      // If dropdown exists, use it (test page)
      if (storeSel) return storeSel.value;
      // Otherwise use fixed store id (store QR page)
      return fixedStoreId;
    }

    async function update() {
      const id = getActiveStoreId();

      if (!id) {
        if (rawBtn) rawBtn.href = "#";
        if (rawPreview) rawPreview.removeAttribute("src");
        setEnabled(rawBtn, false);
        setEnabled(framedBtn, false);
        return;
      }

      const rawUrl = rawUrlFor(id);

      if (rawBtn) rawBtn.href = rawUrl;
      if (rawPreview) rawPreview.src = rawUrl;

      setEnabled(rawBtn, true);
      setEnabled(framedBtn, true);

      try {
        await drawPoster({
          frameUrl,
          rawQrUrl: rawUrl,
          canvas,
          qrScale: Number(mount.dataset.qrScale || "0.60"),
          offsetX: Number(mount.dataset.offsetX || "0"),
          offsetY: Number(mount.dataset.offsetY || "0")
        });
      } catch (e) {
        console.error(e);
      }
    }

    if (storeSel) {
      storeSel.addEventListener("change", update);
    }

    if (framedBtn) {
      framedBtn.addEventListener("click", async () => {
        const id = getActiveStoreId();
        if (!id) return;
        await update();
        downloadCanvasPng(canvas, `thlengta-framed-qr-${id}.png`);
      });
    }

    await update();
  }

  document.addEventListener("DOMContentLoaded", main);
})();
