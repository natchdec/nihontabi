/* Google Analytics 4 loads by default (no banner); visitors can opt out on /privacy.html (jp:consent="no"). Also counts outbound partner clicks. */
(function () {
  var ID = "G-E5WP4G9X5B", KEY = "jp:consent";
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) { } }
  function load() {
    if (window.__ga) return; window.__ga = 1; window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag("js", new Date()); gtag("config", ID, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
    var s = document.createElement("script"); s.async = 1; s.src = "https://www.googletagmanager.com/gtag/js?id=" + ID; document.head.appendChild(s);
  }
  var PARTNERS = [[/klook\.com/, "klook"], [/kkday\.com/, "kkday"], [/booking\.com/, "booking"], [/agoda\.com/, "agoda"], [/trip\.com/, "trip"], [/skyscanner/, "skyscanner"], [/google\.com\/travel/, "google_travel"], [/airalo/, "airalo"], [/shopee|lazada/, "shop"], [/travelpayouts|emrldtp|aviasales/, "travelpayouts"]];
  document.addEventListener("click", function (e) {
    if (get() === "no" || !window.gtag) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href^="http"]') : null; if (!a) return;
    for (var i = 0; i < PARTNERS.length; i++) if (PARTNERS[i][0].test(a.href)) { gtag("event", "outbound_click", { partner: PARTNERS[i][1], link_text: (a.textContent || "").trim().slice(0, 40), page_path: location.pathname }); break; }
  }, true);
  function banner() {
    var b = document.createElement("div"); var inApp = !!document.getElementById("app");
    b.style.cssText = "position:fixed;left:12px;right:12px;bottom:" + (inApp ? 84 : 12) + "px;z-index:70;max-width:520px;margin:0 auto;background:#1f2430;color:#fff;border-radius:14px;padding:12px 14px;font:13.5px/1.5 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.4)";
    b.innerHTML = '<div>เว็บนี้ใช้ Google Analytics เพื่อดูภาพรวมการใช้งานและการคลิกลิงก์ (ไม่ระบุตัวตน) ยอมรับไหม? <a href="/privacy.html" style="color:#9cc4ff">รายละเอียด</a></div><div style="margin-top:8px;display:flex;gap:8px"><button id="gaY" style="border:0;border-radius:10px;padding:7px 14px;background:#e8ecf4;color:#111;font:600 13px system-ui;cursor:pointer">ยอมรับ</button><button id="gaN" style="border:1px solid #556;border-radius:10px;padding:7px 14px;background:none;color:#fff;font:13px system-ui;cursor:pointer">ไม่ยอมรับ</button></div>';
    document.body.appendChild(b);
    b.querySelector("#gaY").onclick = function () { set("yes"); b.remove(); load(); };
    b.querySelector("#gaN").onclick = function () { set("no"); b.remove(); };
  }
  function init() { if (get() !== "no") load(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
