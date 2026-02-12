(function () {
  // set year
  const y = document.getElementById("year");
  if (y) y.textContent = String(new Date().getFullYear());

  // smooth scroll with header offset + slower timing
  const header = document.querySelector(".nav");
  const headerH = () => (header ? header.getBoundingClientRect().height : 0);

  function smoothScrollTo(targetEl) {
    const startY = window.scrollY;
    const targetY =
      targetEl.getBoundingClientRect().top + window.scrollY - headerH() - 10;

    const distance = targetY - startY;
    const duration = 1100; // slow, adjust if you want slower
    const startTime = performance.now();

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = easeInOutCubic(t);
      window.scrollTo(0, startY + distance * eased);
      if (t < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  // nav active state while scrolling
  const sections = Array.from(document.querySelectorAll("section[id]"));
  const navLinks = Array.from(document.querySelectorAll("[data-nav]"));

  function setActive(hash) {
    navLinks.forEach((a) => a.classList.remove("active"));
    const match = navLinks.find((a) => a.getAttribute("href") === hash);
    if (match) match.classList.add("active");
  }

  function currentSectionId() {
    const offset = headerH() + 20;
    let current = sections[0]?.id || "";
    for (const s of sections) {
      const top = s.getBoundingClientRect().top;
      if (top - offset <= 0) current = s.id;
    }
    return current;
  }

  window.addEventListener(
    "scroll",
    () => {
      const id = currentSectionId();
      if (id) setActive("#" + id);
    },
    { passive: true }
  );

  // click handler for hash links
  document.addEventListener("DOMContentLoaded", () => {
  const contactForm = document.getElementById("contactForm");
  const contactStatus = document.getElementById("contactStatus");

  if (!contactForm || !contactStatus) return;

  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    contactStatus.textContent = "Sending...";

    const payload = {
      name: contactForm.elements.name?.value || "",
      email: contactForm.elements.email?.value || "",
      message: contactForm.elements.message?.value || "",
    };

    try {
      const r = await fetch("/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await r.text();

      if (!r.ok) {
        contactStatus.textContent = text || "Failed to send.";
        return;
      }

      contactStatus.textContent = "Sent! We will reply soon.";
      contactForm.reset();
    } catch (err) {
      contactStatus.textContent = "Network error. Try again.";
    }
  });
});


  // if page loads with a hash, scroll to it smoothly
  window.addEventListener("load", () => {
    const hash = window.location.hash;
    if (!hash) {
      setActive("#home");
      return;
    }
    const targetEl = document.querySelector(hash);
    if (targetEl) {
      setTimeout(() => smoothScrollTo(targetEl), 50);
      setActive(hash);
    }
  });

  // ---------- Scroll Reveal ----------
  (function () {
    const els = Array.from(document.querySelectorAll(".reveal"));
    if (!els.length) return;

    // If IntersectionObserver not supported, just show everything.
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" }
    );

    els.forEach((el) => io.observe(el));
  })();

  // ---------- Subtle Grid Parallax (very light) ----------
  (function () {
    const body = document.body;
    if (!body || !body.classList.contains("bg-grid")) return;

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        // tiny movement only
        body.style.backgroundPosition = `0px ${Math.round(y * 0.08)}px`;
        ticking = false;
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  })();
})();

const contactForm = document.getElementById("contactForm");
const contactStatus = document.getElementById("contactStatus");

if (contactForm && contactStatus) {
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    contactStatus.textContent = "Sending...";

    const payload = {
      name: contactForm.name.value,
      email: contactForm.email.value,
      message: contactForm.message.value,
    };

    try {
      const r = await fetch("/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        contactStatus.textContent = await r.text();
        return;
      }

      contactStatus.textContent = "Sent! We will reply soon.";
      contactForm.reset();
    } catch (err) {
      contactStatus.textContent = "Network error. Try again.";
    }
  });
}

