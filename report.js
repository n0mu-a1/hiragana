// ====================================================================
// report.js  —  ふぐあい ほうこく（画像つき）/ 承認型修正の入口（漢字ドリル方式）
//
// 画面のスクショ(自動) + 一言 + 自動メタ を patch-bot の /api/report へ POST。
// patch-bot は別オリジンなので絶対URL（CORS対応済み）へ送る。
// 失敗時は localStorage キューに退避し、次回起動/オンライン復帰で再送する。
// game.js とは疎結合（内部 state を参照せず、画面状態は DOM から導出）。
// ====================================================================

(function () {
  var APP = "hiragana";
  // patch-bot のデプロイ先。window.PATCHBOT_REPORT_URL で上書き可。
  var ENDPOINT = window.PATCHBOT_REPORT_URL || "https://reflex-lab-two.vercel.app/api/report";
  var RQ_KEY = "hiragana_report_queue_v1";
  var H2C_URL = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
  var rpt = { shot: null, busy: false };

  function $(id) { return document.getElementById(id); }

  function curScreen() {
    if ($("screen-quiz") && !$("screen-quiz").classList.contains("hidden")) return "quiz";
    if ($("screen-result") && !$("screen-result").classList.contains("hidden")) return "result";
    return "start";
  }

  function reportMeta() {
    var prog = $("progress");
    var score = prog ? (prog.textContent || "").replace(/\s/g, "").length : null;
    return {
      screen: curScreen(),
      mode: APP,
      score: score,
      url: location.href,
      ua: navigator.userAgent,
      lang: navigator.language,
      vw: innerWidth, vh: innerHeight, dpr: window.devicePixelRatio || 1,
      ts: new Date().toISOString()
    };
  }

  function loadH2C() {
    return new Promise(function (res, rej) {
      if (window.html2canvas) return res(window.html2canvas);
      var s = document.createElement("script");
      s.src = H2C_URL; s.async = true;
      s.onload = function () { window.html2canvas ? res(window.html2canvas) : rej(new Error("h2c missing")); };
      s.onerror = function () { rej(new Error("h2c load failed")); };
      document.head.appendChild(s);
    });
  }

  // canvas を最大幅 maxW に縮小し JPEG dataURL 化（送信サイズ抑制）
  function downscale(canvas, maxW, q) {
    var w = canvas.width, h = canvas.height;
    if (w <= maxW) return canvas.toDataURL("image/jpeg", q);
    var nh = Math.round(h * maxW / w);
    var c2 = document.createElement("canvas"); c2.width = maxW; c2.height = nh;
    c2.getContext("2d").drawImage(canvas, 0, 0, maxW, nh);
    return c2.toDataURL("image/jpeg", q);
  }

  function captureShot() {
    return loadH2C().then(function (h2c) {
      return h2c(document.body, { logging: false, useCORS: true, backgroundColor: "#fff7e6", scale: 1 });
    }).then(function (canvas) {
      rpt.shot = downscale(canvas, 720, 0.72);
      return rpt.shot;
    });
  }

  function fileToShot(file) {
    return new Promise(function (res, rej) {
      if (!file || !/^image\//.test(file.type)) return rej(new Error("not image"));
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
          c.getContext("2d").drawImage(img, 0, 0);
          rpt.shot = downscale(c, 720, 0.72); res(rpt.shot);
        };
        img.onerror = function () { rej(new Error("img decode")); };
        img.src = fr.result;
      };
      fr.onerror = function () { rej(new Error("read")); };
      fr.readAsDataURL(file);
    });
  }

  function buildReportUI() {
    var fab = document.createElement("button");
    fab.id = "rpt-fab"; fab.type = "button";
    fab.setAttribute("aria-label", "ふぐあいを ほうこく");
    fab.textContent = "🐞 ふぐあい";

    var ov = document.createElement("div"); ov.id = "rpt-ov"; ov.hidden = true;
    ov.innerHTML =
      '<div id="rpt-modal" role="dialog" aria-modal="true" aria-labelledby="rpt-ttl">' +
        '<h2 id="rpt-ttl">🐞 ふぐあいを おしえてね</h2>' +
        '<p class="rpt-sub">いまの がめんを じどうで つけて おくります。</p>' +
        '<div id="rpt-prev" class="rpt-prev"><span>📸 がめんを よみこみちゅう…</span></div>' +
        '<label class="rpt-re">がぞうを じぶんで えらぶ<input id="rpt-file" type="file" accept="image/*" hidden></label>' +
        '<textarea id="rpt-cmt" maxlength="500" rows="3" placeholder="どこが おかしい？（れい：おとが ちがう／こたえが おかしい）"></textarea>' +
        '<div id="rpt-msg" class="rpt-msg" hidden></div>' +
        '<div class="rpt-btns">' +
          '<button id="rpt-cancel" type="button" class="rpt-ghost">とじる</button>' +
          '<button id="rpt-send" type="button" class="rpt-send">おくる</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(fab);
    document.body.appendChild(ov);

    var prev = ov.querySelector("#rpt-prev");
    var msg = ov.querySelector("#rpt-msg");
    var cmt = ov.querySelector("#rpt-cmt");
    var fileIn = ov.querySelector("#rpt-file");

    function setPrev() {
      if (rpt.shot) { prev.innerHTML = '<img alt="プレビュー" src="' + rpt.shot + '">'; }
      else { prev.innerHTML = '<span>📷 がめんを よみこめませんでした（がぞうを じぶんで えらべます）</span>'; }
    }
    function showMsg(t, ok) { msg.hidden = false; msg.textContent = t; msg.className = "rpt-msg " + (ok ? "ok" : "ng"); }

    function open() {
      ov.hidden = false; rpt.shot = null; cmt.value = ""; msg.hidden = true;
      prev.innerHTML = '<span>📸 がめんを よみこみちゅう…</span>';
      captureShot().then(setPrev).catch(function () { rpt.shot = null; setPrev(); });
    }
    function close() { ov.hidden = true; }

    fab.addEventListener("click", open);
    ov.querySelector("#rpt-cancel").addEventListener("click", close);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    fileIn.addEventListener("change", function () {
      var f = fileIn.files && fileIn.files[0]; if (!f) return;
      prev.innerHTML = '<span>📷 よみこみちゅう…</span>';
      fileToShot(f).then(setPrev).catch(function () { showMsg("この がぞうは つかえません", false); });
    });

    ov.querySelector("#rpt-send").addEventListener("click", function () {
      if (rpt.busy) return;
      var comment = cmt.value.trim();
      if (!comment && !rpt.shot) { showMsg("ひとことか がぞうの どちらかは ひつようです", false); return; }
      rpt.busy = true; showMsg("おくっています…", true);
      var payload = { app: APP, comment: comment, image: rpt.shot || null, meta: reportMeta() };
      sendReport(payload).then(function () {
        showMsg("ありがとう！ おくれました 🎉", true);
        setTimeout(close, 1200);
      }).catch(function () {
        queueReport(payload);
        showMsg("いまは おくれないので あとで さいそうします", true);
        setTimeout(close, 1600);
      }).then(function () { rpt.busy = false; });
    });
  }

  function sendReport(payload) {
    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    }).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); });
  }

  function queueReport(p) {
    try {
      var q = JSON.parse(localStorage.getItem(RQ_KEY) || "[]");
      q.push(p); if (q.length > 20) q = q.slice(-20);
      localStorage.setItem(RQ_KEY, JSON.stringify(q));
    } catch (e) {}
  }
  function flushQueue() {
    if (!navigator.onLine) return;
    var q;
    try { q = JSON.parse(localStorage.getItem(RQ_KEY) || "[]"); } catch (e) { return; }
    if (!q.length) return;
    var rest = q.slice();
    (function step() {
      if (!rest.length) { try { localStorage.setItem(RQ_KEY, JSON.stringify([])); } catch (e) {} return; }
      var item = rest[0];
      sendReport(item).then(function () {
        rest.shift(); try { localStorage.setItem(RQ_KEY, JSON.stringify(rest)); } catch (e) {} step();
      }).catch(function () { /* オフライン: 次回起動/オンライン復帰で再試行 */ });
    })();
  }

  function init() {
    buildReportUI();
    flushQueue();
    window.addEventListener("online", flushQueue);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
