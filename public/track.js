// Anonymous visitor activity tracker. Records page visits, sections viewed,
// link/button clicks and time on page. Never reads form field contents.
(function () {
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;

  var ENDPOINT = "/api/track";

  function randomId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function stored(storage, key) {
    try {
      var value = storage.getItem(key);
      if (!value) {
        value = randomId();
        storage.setItem(key, value);
      }
      return value;
    } catch (e) {
      return randomId();
    }
  }

  var visitorId = stored(localStorage, "jv_visitor");
  var sessionId = stored(sessionStorage, "jv_session");
  var path = location.pathname;
  var startedAt = Date.now();
  var queue = [];
  var timer = null;

  function send(useBeacon) {
    if (!queue.length) return;
    var body = JSON.stringify({ visitorId: visitorId, sessionId: sessionId, events: queue.splice(0) });
    if (useBeacon && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, body);
    } else {
      fetch(ENDPOINT, { method: "POST", body: body, keepalive: true }).catch(function () {});
    }
  }

  function track(type, data) {
    var event = { type: type, path: path };
    for (var key in data) event[key] = data[key];
    queue.push(event);
    clearTimeout(timer);
    timer = setTimeout(send, 2000);
  }

  // Page visit
  var referrer = "";
  try {
    if (document.referrer && new URL(document.referrer).host !== location.host) {
      referrer = new URL(document.referrer).host;
    }
  } catch (e) {}
  track("pageview", { referrer: referrer || "Direct" });

  // Sections scrolled into view (each counted once per page load)
  var sections = document.querySelectorAll("section, footer");
  if ("IntersectionObserver" in window) {
    var seen = {};
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          var name = el.id || el.className.split(" ")[0] || el.tagName.toLowerCase();
          if (seen[name]) return;
          seen[name] = true;
          track("section", { target: name });
          observer.unobserve(el);
        });
      },
      { threshold: 0.4 }
    );
    sections.forEach(function (el) {
      observer.observe(el);
    });
  }

  // Clicks on links and buttons
  document.addEventListener(
    "click",
    function (e) {
      var el = e.target.closest && e.target.closest("a, button");
      if (!el) return;
      var label =
        el.getAttribute("aria-label") ||
        (el.textContent || "").replace(/\s+/g, " ").trim() ||
        el.getAttribute("href") ||
        el.tagName.toLowerCase();
      track("click", { target: label.slice(0, 120) });
      if (el.tagName === "A" && el.target !== "_blank") send(true);
    },
    true
  );

  // Time spent on page
  var left = false;
  function leave() {
    if (left) return;
    left = true;
    track("leave", { durationMs: Date.now() - startedAt });
    send(true);
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") leave();
  });
  window.addEventListener("pagehide", leave);
})();
