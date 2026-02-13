(function () {
  function parseSmart12h(raw) {
    if (!raw) return null;

    let s = String(raw).trim().toLowerCase();
    if (!s) return null;

    // remove spaces, dots
    s = s.replace(/\s+/g, "").replace(/\./g, "");

    // detect am/pm
    let hasAM = s.includes("am");
    let hasPM = s.includes("pm");
    s = s.replace("am", "").replace("pm", "");

    // allow inputs like 10:30, 10:30am, 1030, 1030am, 930, 7pm, 7
    // remove colon for parsing, but remember if user used it
    s = s.replace(":", "");

    // must be digits now
    if (!/^\d{1,4}$/.test(s)) return null;

    let hh = 0;
    let mm = 0;

    if (s.length <= 2) {
      // "7" or "12" or "21"
      hh = parseInt(s, 10);
      mm = 0;
    } else if (s.length === 3) {
      // "930" => 9:30
      hh = parseInt(s.slice(0, 1), 10);
      mm = parseInt(s.slice(1), 10);
    } else {
      // "1030" => 10:30
      hh = parseInt(s.slice(0, 2), 10);
      mm = parseInt(s.slice(2), 10);
    }

    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (mm < 0 || mm > 59) return null;

    // handle cases:
    // - if user typed am/pm => treat hh as 1..12
    // - if user typed no suffix:
    //    - if hh is 0..23, assume 24h when hh > 12
    //    - otherwise assume AM by default
    let hh24 = hh;

    if (hasAM || hasPM) {
      if (hh < 1 || hh > 12) return null;

      if (hasAM) {
        hh24 = hh === 12 ? 0 : hh;
      } else {
        hh24 = hh === 12 ? 12 : hh + 12;
      }
    } else {
      // no suffix
      if (hh < 0 || hh > 23) return null;
      // treat as 24h if > 12, else AM by default
      hh24 = hh;
    }

    // format to 12h display
    const suffix = hh24 >= 12 ? "PM" : "AM";
    let h12 = hh24 % 12;
    if (h12 === 0) h12 = 12;

    const mm2 = String(mm).padStart(2, "0");
    return `${h12}:${mm2} ${suffix}`;
  }

  function wireSmartTime(input) {
    if (!input) return;

    input.setAttribute("autocomplete", "off");
    input.setAttribute("inputmode", "text");

    input.addEventListener("blur", () => {
      const formatted = parseSmart12h(input.value);
      if (formatted) input.value = formatted;
    });

    // optional: press Enter triggers blur formatting too
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const formatted = parseSmart12h(input.value);
        if (formatted) input.value = formatted;
      }
    });
  }

  // auto-wire by data attribute
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-smarttime='1']").forEach(wireSmartTime);
  });
})();
