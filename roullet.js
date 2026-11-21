/* Roullet 분리 최종본
   - DOMContentLoaded 이후 바인딩(무반응 방지)
   - 입력/파일(UTF-8+CP949 폴백)/편집/비중/기록/옵션/SFX/대형화면/퀴즈답변 팝업/localStorage 자동저장 포함
*/
(() => {
  "use strict";

  const TWO_PI = Math.PI * 2;
  const POINTER_ANGLE = -Math.PI / 2;
  const STORAGE_KEY = "class-roullet:v1";
  const MAX_HISTORY = 200;

  // ========= 작은 유틸 =========
  const qs = (id, root = document) => root.getElementById(id);
  const show = (el) => el.classList.remove("hidden");
  const hide = (el) => el.classList.add("hidden");
  const toggle = (el) => el.classList.toggle("hidden");
  const norm = (a) => ((a % TWO_PI) + TWO_PI) % TWO_PI;
  const esc = (s) =>
    (s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
  const nowstr = () => {
    const d = new Date(),
      p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(
      d.getSeconds()
    )}`;
  };

  // ========= 상태 =========
  let items = []; // {label, answer, weight}
  let segments = [];
  let allowDuplicate = true;
  let angle = 0,
    spinning = false;
  const historyLog = [];
  let composing = false;
  let lastTick = -1;

  // ========= localStorage 영속화 =========
  function saveState() {
    try {
      const theme = document.documentElement.getAttribute("data-theme") || "dark";
      const sfxInput = document.querySelector('input[name="sfxSet"]:checked');
      const data = {
        items,
        historyLog: historyLog.slice(0, MAX_HISTORY),
        allowDuplicate,
        theme,
        vol: rngVol ? Number(rngVol.value) : 70,
        mute: chkMute ? !!chkMute.checked : false,
        sfxSet: sfxInput ? sfxInput.value : "quiet",
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (_) {
      // 스토리지 비활성/용량 초과 시 무시
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data.items)) {
        items = data.items
          .filter((x) => x && typeof x.label === "string" && x.label.trim() !== "")
          .map((x) => ({
            label: x.label.trim(),
            answer: typeof x.answer === "string" ? x.answer : "",
            weight: x.weight == null || x.weight === "" || isNaN(Number(x.weight)) ? null : Number(x.weight),
          }));
      }
      if (Array.isArray(data.historyLog)) {
        historyLog.length = 0;
        for (const r of data.historyLog.slice(0, MAX_HISTORY)) {
          if (r && typeof r.v === "string" && typeof r.t === "string") {
            historyLog.push({ t: r.t, v: r.v });
          }
        }
      }
      if (typeof data.allowDuplicate === "boolean") {
        allowDuplicate = data.allowDuplicate;
        const chkDupe = qs("chkDupe");
        if (chkDupe) chkDupe.checked = allowDuplicate;
      }
      if (data.theme === "light" || data.theme === "dark") {
        document.documentElement.setAttribute("data-theme", data.theme);
        const chkTheme = qs("chkTheme");
        if (chkTheme) chkTheme.checked = data.theme === "light";
      }
      if (typeof data.vol === "number" && rngVol) {
        rngVol.value = String(Math.max(0, Math.min(100, data.vol)));
        SFX.setVol(Number(rngVol.value) / 100);
      }
      if (typeof data.mute === "boolean" && chkMute) {
        chkMute.checked = data.mute;
        SFX.setMute(data.mute);
      }
      if (data.sfxSet === "quiet" || data.sfxSet === "hype") {
        const radio = document.querySelector(`input[name="sfxSet"][value="${data.sfxSet}"]`);
        if (radio) radio.checked = true;
        SFX.setSet(data.sfxSet);
      }
    } catch (_) {
      // 손상된 스토리지 데이터 무시
    }
  }

  // ========= SFX =========
  const SFX = (() => {
    let set = "quiet",
      vol = 0.7,
      mute = false;
    // 실제 저장소(assets/sfx/) 파일과 일치하도록 매핑
    const map = {
      quiet: {
        start: "assets/sfx/quiet/start_soft.mp3",
        win: "assets/sfx/quiet/win_soft.mp3",
        popup: "assets/sfx/quiet/popup_soft.mp3",
      },
      hype: {
        start: "assets/sfx/hype/start_hype.mp3",
        win: "assets/sfx/hype/win_hype.mp3",
        popup: "assets/sfx/hype/popup_hype.mp3",
      },
    };
    const cache = {};
    let audioCtx = null;

    function ensure(name) {
      if (!cache[name]) cache[name] = {};
      for (const k of Object.keys(map[name])) {
        if (!cache[name][k]) {
          cache[name][k] = new Audio(map[name][k]);
          cache[name][k].preload = "auto";
        }
      }
    }
    function playSynthTick(scale = 0.35) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtx) audioCtx = new Ctx();
        if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(set === "hype" ? 980 : 760, audioCtx.currentTime);
        gain.gain.setValueAtTime(Math.max(0.001, vol * scale), audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.035);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.04);
      } catch (_) {}
    }

    ensure("quiet");
    return {
      setSet(v) {
        if (map[v]) {
          set = v;
          ensure(v);
        }
      },
      setVol(v) {
        vol = Math.max(0, Math.min(1, v));
      },
      setMute(m) {
        mute = !!m;
      },
      play(id, { volume = 1 } = {}) {
        if (mute) return;
        if (id === "tick") {
          playSynthTick(0.28 * volume);
          return;
        }
        if (id === "click") {
          playSynthTick(0.18 * volume);
          return;
        }
        ensure(set);
        const base = (cache[set] || {})[id];
        if (!base) return;
        const a = base.cloneNode();
        a.volume = Math.max(0, Math.min(1, volume * vol));
        a.play().catch(() => {});
      },
    };
  })();

  // ========= 대비 계산 =========
  function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s,
      x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
      m = l - c / 2;
    let r = 0,
      g = 0,
      b = 0;
    if (0 <= h && h < 60) {
      r = c;
      g = x;
    } else if (60 <= h && h < 120) {
      r = x;
      g = c;
    } else if (120 <= h && h < 180) {
      g = c;
      b = x;
    } else if (180 <= h && h < 240) {
      g = x;
      b = c;
    } else if (240 <= h && h < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  function luminance(r, g, b) {
    const a = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function bestTextColorForHue(h) {
    const [r, g, b] = hslToRgb(h, 0.75, 0.52);
    return luminance(r, g, b) > 0.5 ? "#0b0f1c" : "#ffffff";
  }

  // ========= 세그먼트 계산 (메인/대형 공용 규칙) =========
  function computeWeights(list) {
    const n = list.length;
    const weights = new Array(n).fill(0);
    const unspecified = [];
    let sumSpecified = 0;
    for (let i = 0; i < n; i++) {
      const w = Number(list[i].weight);
      if (!isNaN(w) && w > 0) {
        weights[i] = w;
        sumSpecified += w;
      } else {
        unspecified.push(i);
      }
    }
    if (sumSpecified === 0) {
      for (let i = 0; i < n; i++) weights[i] = 100 / n;
    } else if (unspecified.length > 0) {
      const rem = 100 - sumSpecified;
      const share = rem > 0 ? rem / unspecified.length : 1;
      for (const i of unspecified) weights[i] = share;
    }
    return weights;
  }

  function rebuildSegments() {
    if (items.length === 0) {
      segments = [];
      drawWheel();
      return;
    }
    const weights = computeWeights(items);
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const fracs = weights.map((w) => w / sum);
    segments = [];
    let acc = 0;
    for (let i = 0; i < items.length; i++) {
      const start = acc * TWO_PI,
        end = (acc + fracs[i]) * TWO_PI;
      segments.push({
        itemIndex: i,
        label: items[i].label,
        start,
        end,
        center: (start + end) / 2,
        weight: weights[i],
        answer: items[i].answer,
      });
      acc += fracs[i];
    }
    drawWheel();
  }

  // ========= 캔버스 그리기 =========
  let canvas, ctx;
  function drawWheel() {
    const W = canvas.width,
      H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(angle);

    const R = Math.min(W, H) / 2 - 36;
    const rimO = R + 26,
      rimI = R + 6,
      innerW = R + 2;

    // 림
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.45)";
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, 0, rimO, 0, TWO_PI);
    ctx.fillStyle = "#0a0c12";
    ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(0, 0, rimI, 0, TWO_PI);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath();
    ctx.arc(0, 0, innerW, 0, TWO_PI);
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.lineWidth = 6;
    ctx.stroke();

    // 볼트
    for (let i = 0; i < 8; i++) {
      const a = i * (TWO_PI / 8),
        r = (rimO + rimI) / 2,
        x = Math.cos(a) * r,
        y = Math.sin(a) * r;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, TWO_PI);
      ctx.fillStyle = "#e6e8ef";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, TWO_PI);
      ctx.fillStyle = "#1b1e2a";
      ctx.fill();
    }

    // 조각 + 라벨
    if (segments.length) {
      for (let i = 0; i < segments.length; i++) {
        const s = segments[i],
          hue = Math.floor((360 / segments.length) * i);

        // 조각
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, s.start, s.end);
        ctx.closePath();
        ctx.fillStyle = `hsl(${hue} 75% 52%)`;
        ctx.fill();

        // 경계선
        ctx.strokeStyle = "rgba(5,10,30,.6)";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, 0, R, s.start, s.end);
        ctx.stroke();

        // 라벨 텍스트(자동 크기/대비)
        ctx.save();
        ctx.rotate(s.center);
        const rr = R * 0.72;
        ctx.fillStyle = bestTextColorForHue(hue);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        let fs = segments.length > 24 ? 20 : 28;
        ctx.font = "700 " + fs + "px ui-sans-serif,system-ui,'Noto Sans KR'";
        while (ctx.measureText(s.label).width > 170 && fs > 12) {
          fs -= 1;
          ctx.font = "700 " + fs + "px ui-sans-serif,system-ui,'Noto Sans KR'";
        }
        ctx.fillText(s.label, rr, 0);
        ctx.restore();
      }
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TWO_PI);
      ctx.fillStyle = "#3b4a9e";
      ctx.fill();
    }

    // 허브
    ctx.beginPath();
    ctx.arc(0, 0, 80, 0, TWO_PI);
    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 80);
    g.addColorStop(0, "#7bd3ff");
    g.addColorStop(1, "#0b76d1");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 90, 0, TWO_PI);
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.lineWidth = 10;
    ctx.stroke();

    ctx.restore();
  }

  // ========= 회전/결과 =========
  function getIndexAtPointer() {
    const a = norm(POINTER_ANGLE - angle);
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      if (s.start <= a && a < s.end) return i;
      if (i === segments.length - 1 && Math.abs(a - s.end) < 1e-6) return i;
    }
    return -1;
  }
  function pickIndexWeighted() {
    const total = segments.reduce((a, s) => a + (s.end - s.start), 0);
    let r = Math.random() * total,
      acc = 0;
    for (let i = 0; i < segments.length; i++) {
      const len = segments[i].end - segments[i].start;
      if (r < acc + len) return i;
      acc += len;
    }
    return segments.length - 1;
  }
  function targetAngleForIndex(i) {
    const desired = POINTER_ANGLE - segments[i].center;
    const delta = norm(desired - angle);
    const turns = 6 + Math.floor(Math.random() * 2);
    return angle + turns * TWO_PI + delta;
  }

  function spin() {
    if (spinning || segments.length === 0) return;
    spinning = true;
    btnCenterStart.disabled = true;
    lastTick = -1;
    SFX.play("start");

    const idx = pickIndexWeighted();
    const target = targetAngleForIndex(idx);
    const start = angle,
      duration = 3600 + Math.random() * 1400,
      t0 = performance.now();

    (function anim(now) {
      const t = Math.min((now - t0) / duration, 1),
        ease = 1 - Math.pow(1 - t, 3);
      angle = start + (target - start) * ease;
      drawWheel();

      const cur = getIndexAtPointer();
      if (cur !== -1 && cur !== lastTick) {
        lastTick = cur;
        SFX.play("tick", { volume: 0.6 });
      }

      if (t < 1) requestAnimationFrame(anim);
      else {
        angle = target;
        drawWheel();
        const finalIdx = getIndexAtPointer() >= 0 ? getIndexAtPointer() : idx;
        onWin(finalIdx);
        spinning = false;
        btnCenterStart.disabled = false;
      }
    })(t0);
  }

  // 모달
  let modal, mQ, mA, btnReveal;
  function closeModal() {
    modal.classList.remove("show");
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  }
  function onWin(i) {
    const seg = segments[i];
    if (!seg) return;
    const item = items[seg.itemIndex];
    const label = item ? item.label : seg.label;
    const ans = ((item ? item.answer : seg.answer) || "").trim();

    historyLog.unshift({ t: nowstr(), v: label });
    if (historyLog.length > MAX_HISTORY) historyLog.length = MAX_HISTORY;
    renderLog();

    mQ.textContent = label || "";
    mA.textContent = ans ? "정답: " + ans : "";
    mA.style.display = "none";
    if (btnReveal) {
      btnReveal.style.display = ans ? "inline-flex" : "none";
    }
    modal.style.display = "flex";
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    SFX.play("win");

    if (!allowDuplicate && seg.itemIndex >= 0 && seg.itemIndex < items.length) {
      items.splice(seg.itemIndex, 1);
      renderEditor();
      rebuildSegments();
      if (!items.length) hide(editorWrap);
    }
    saveState();
  }

  // ========= 편집/입력 =========
  let ta, editorWrap, itemTable;
  function autosize(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }
  function splitLabelAnswer(v) {
    for (const sep of ["//", "||"]) {
      const idx = v.indexOf(sep);
      if (idx !== -1) {
        return [v.slice(0, idx).trim(), v.slice(idx + sep.length).trim()];
      }
    }
    return [v.trim(), ""];
  }
  function addFromTextarea() {
    if (composing || spinning) return;
    const raw = (ta.value || "").replace(/\r/g, "");
    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    for (const line of lines) {
      const [label, answer] = splitLabelAnswer(line);
      if (label) items.push({ label, answer, weight: null });
    }
    ta.value = "";
    autosize(ta);
    showEditor();
    rebuildSegments();
    saveState();
    SFX.play("click");
  }
  function renderEditor() {
    itemTable.innerHTML = items.length
      ? items
          .map(
            (o, i) => `
      <tr>
        <td class="td-index">${i + 1}.</td>
        <td class="td-label"><input data-k="${i}" class="ipt-label" value="${esc(o.label)}" /></td>
        <td class="td-answer"><input data-k="${i}" class="ipt-answer" value="${esc(o.answer || "")}" /></td>
        <td class="td-weight"><input data-k="${i}" class="ipt-weight" type="number" min="0" step="0.1" placeholder="-" value="${
              o.weight ?? ""
            }"/></td>
        <td class="td-actions"><button class="icon-btn btn-del" title="삭제" data-k="${i}">🗑</button></td>
      </tr>`
          )
          .join("")
      : `<tr><td colspan="5" style="opacity:.7;padding:10px">항목이 없습니다.</td></tr>`;
  }
  function showEditor() {
    renderEditor();
    show(editorWrap);
  }
  function onEditorInput(e) {
    if (spinning) return;
    const t = e.target;
    const k = +t.dataset.k;
    if (!items[k]) return;
    if (t.classList.contains("ipt-label")) {
      items[k].label = t.value;
      rebuildSegments();
      saveState();
    }
    if (t.classList.contains("ipt-answer")) {
      items[k].answer = t.value;
      saveState();
    }
    if (t.classList.contains("ipt-weight")) {
      items[k].weight = t.value === "" ? null : Number(t.value);
      rebuildSegments();
      saveState();
    }
  }
  function onEditorClick(e) {
    if (spinning) return;
    const del = e.target.closest(".btn-del");
    if (del) {
      const k = +del.dataset.k;
      items.splice(k, 1);
      renderEditor();
      rebuildSegments();
      if (!items.length) hide(editorWrap);
      saveState();
    }
  }
  function syncEditor() {
    document.querySelectorAll(".ipt-label").forEach((el) => {
      const k = +el.dataset.k;
      if (items[k]) items[k].label = el.value;
    });
    document.querySelectorAll(".ipt-answer").forEach((el) => {
      const k = +el.dataset.k;
      if (items[k]) items[k].answer = el.value;
    });
    document.querySelectorAll(".ipt-weight").forEach((el) => {
      const k = +el.dataset.k;
      if (items[k]) items[k].weight = el.value === "" ? null : Number(el.value);
    });
  }

  // ========= 기록 =========
  let logBox;
  function renderLog() {
    if (logBox.classList.contains("hidden")) return;
    logBox.innerHTML = historyLog
      .map((r) => `<div>• <b>${esc(r.v)}</b> <span style="opacity:.75">(${esc(r.t)})</span></div>`)
      .join("");
  }

  // ========= 파일 I/O =========
  let fileInputEl;
  async function readFileSmart(file) {
    const buf = await file.arrayBuffer();
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch (_) {
      return new TextDecoder("euc-kr").decode(buf);
    }
  }
  function onFilePicked(e) {
    if (spinning) {
      e.target.value = "";
      return;
    }
    const f = e.target.files[0];
    if (!f) return;
    readFileSmart(f)
      .then((text) => {
        const name = (f.name || "").toLowerCase();
        const parsed = name.endsWith(".csv") ? parseCSV(text) : parseTXT(text);
        if (!parsed.length) {
          alert("파일에서 항목을 찾지 못했습니다.");
          return;
        }
        items = parsed;
        showEditor();
        rebuildSegments();
        saveState();
      })
      .catch(() => alert("파일 읽기 오류"))
      .finally(() => {
        e.target.value = "";
      });
  }
  function parseTXT(s) {
    return s
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, answer] = splitLabelAnswer(line);
        return { label, answer, weight: null };
      });
  }
  function parseCSVLine(line) {
    const cells = [];
    let cur = "",
      inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ",") {
          cells.push(cur.trim());
          cur = "";
        } else {
          cur += ch;
        }
      }
    }
    cells.push(cur.trim());
    return cells;
  }
  function parseCSV(s) {
    const lines = s
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = parseCSVLine(lines[i]);
      if (!a) continue;
      if (i === 0 && /^(label|항목|이름|문제)$/i.test(a)) continue;
      const w = c == null || c === "" ? null : Number(c);
      out.push({ label: a, answer: b || "", weight: isNaN(w) ? null : w });
    }
    return out;
  }
  function downloadSamples() {
    const txt = "사과 // Apple\n바나나 // Banana\n체리 // Cherry\n포도 // Grape";
    const csv = "label,answer,weight\n사과,Apple,40\n바나나,Banana,\n체리,Cherry,30\n포도,Grape,";
    download("sample.txt", txt, "text/plain;charset=utf-8");
    download("sample.csv", "\uFEFF" + csv, "text/csv;charset=utf-8");
  }
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ========= 대형 화면(팝업) =========
  function openBig() {
    const theme = document.documentElement.getAttribute("data-theme") || "dark";
    const payload = buildBigHtml({ theme, items, allowDuplicate, angle });
    const w = window.open("", "_blank", "width=1200,height=1000");
    if (!w) {
      alert("팝업이 차단되었습니다. 팝업 허용 후 다시 시도하세요.");
      return;
    }
    w.document.open();
    w.document.write(payload);
    w.document.close();
  }
  function buildBigHtml({ theme, items: srcItems, allowDuplicate: allowDupe, angle: initAngle }) {
    const safeItemsJson = JSON.stringify(srcItems).replace(/<\//g, "<\\/");
    return `
<!DOCTYPE html><html lang="ko" data-theme="${theme}">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>대형 룰렛</title>
<style>
  html,body{height:100%;margin:0;background:${theme === "light" ? "#f6f7fb" : "#0a0d1f"};color:${
      theme === "light" ? "#101322" : "#fff"
    };font-family:ui-sans-serif,system-ui,'Noto Sans KR',sans-serif}
  .stage{position:relative;display:grid;place-items:center;height:100%}
  .pointer{position:absolute; top:-8px; left:50%; transform:translateX(-50%); width:0;height:0;border-left:20px solid transparent;border-right:20px solid transparent;border-top:30px solid #ff5a5a; filter:drop-shadow(0 10px 14px rgba(0,0,0,.45)); z-index:50;}
  canvas{width:min(92vmin,1200px);height:min(92vmin,1200px);z-index:10}
  .center{position:absolute; inset:0; display:grid; place-items:center; z-index:40}
  .start{all:unset; width:190px; height:190px; border-radius:50%; display:grid; place-items:center; font-weight:900; font-size:26px; color:#fff; background: radial-gradient(circle at 35% 30%, #7bd3ff, #3aa7ff 60%, #0b76d1 100%); border:12px solid #fff; box-shadow:0 18px 28px rgba(0,0,0,.4); cursor:pointer; user-select:none;}
  .result{position:fixed;left:0;right:0;bottom:18px;display:grid;place-items:center;z-index:60}
  .result > div{padding:16px 22px;border-radius:16px;font-size:40px;font-weight:900;color:#fff;background:#0b1139e6;border:2px solid #3b4bd4a6;box-shadow:0 18px 32px rgba(0,0,0,.45)}
</style></head>
<body>
  <div class="stage">
    <div class="pointer"></div>
    <canvas id="C" width="1400" height="1400"></canvas>
    <div class="center"><button class="start" id="B">시작</button></div>
  </div>
  <div class="result"><div id="R" style="display:none"></div></div>
<script>
var TWO_PI=Math.PI*2, POINTER_ANGLE=-Math.PI/2;
var C=document.getElementById("C"), X=C.getContext("2d");
var items=${safeItemsJson}, allow=${allowDupe ? "true" : "false"}, angle=${initAngle || 0}, spinning=false, seg=[];
function computeWeights(list){
  var n=list.length, weights=new Array(n).fill(0), unspec=[], sumSpec=0;
  for(var i=0;i<n;i++){
    var w=Number(list[i].weight);
    if(!isNaN(w)&&w>0){ weights[i]=w; sumSpec+=w; } else { unspec.push(i); }
  }
  if(sumSpec===0){ for(var i=0;i<n;i++) weights[i]=100/n; }
  else if(unspec.length>0){ var rem=100-sumSpec, share=rem>0?rem/unspec.length:1; for(var j=0;j<unspec.length;j++) weights[unspec[j]]=share; }
  return weights;
}
function rebuild(){
  if(items.length===0){ seg=[]; draw(); return; }
  var weights=computeWeights(items), s=weights.reduce(function(a,b){return a+b;},0)||1, f=weights.map(function(w){return w/s;});
  seg=[]; var a=0;
  for(var k=0;k<items.length;k++){ var st=a*TWO_PI,en=(a+f[k])*TWO_PI; seg.push({itemIndex:k,label:items[k].label,start:st,end:en,center:(st+en)/2}); a+=f[k]; }
  draw();
}
function h2rgb(h,s,l){var c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2,r=0,g=0,b=0;if(0<=h&&h<60){r=c;g=x;}else if(60<=h&&h<120){r=x;g=c;}else if(120<=h&&h<180){g=c;b=x;}else if(180<=h&&h<240){g=x;b=c;}else if(240<=h&&h<300){r=x;b=c;}else{r=c;b=x;}return [(r+m)*255,(g+m)*255,(b+m)*255];}
function lum(r,g,b){var a=[r,g,b].map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];}
function txtColor(h){var rgb=h2rgb(h,.75,.52);return lum(rgb[0],rgb[1],rgb[2])>0.5?"#0b0f1c":"#ffffff";}
function draw(){var W=C.width,H=C.height;X.clearRect(0,0,W,H);X.save();X.translate(W/2,H/2);X.rotate(angle);var R=Math.min(W,H)/2-36,rimO=R+26,rimI=R+6,innerW=R+2;X.save();X.shadowColor="rgba(0,0,0,.45)";X.shadowBlur=18;X.beginPath();X.arc(0,0,rimO,0,TWO_PI);X.fillStyle="#0a0c12";X.fill();X.restore();X.globalCompositeOperation="destination-out";X.beginPath();X.arc(0,0,rimI,0,TWO_PI);X.fill();X.globalCompositeOperation="source-over";X.beginPath();X.arc(0,0,innerW,0,TWO_PI);X.strokeStyle="rgba(255,255,255,.9)";X.lineWidth=10;X.stroke();if(seg.length){for(var i=0;i<seg.length;i++){var s=seg[i],hue=Math.floor((360/seg.length)*i);X.beginPath();X.moveTo(0,0);X.arc(0,0,R,s.start,s.end);X.closePath();X.fillStyle="hsl("+hue+" 75% 52%)";X.fill();X.strokeStyle="rgba(5,10,30,.6)";X.lineWidth=6;X.beginPath();X.arc(0,0,R,s.start,s.end);X.stroke();X.save();X.rotate(s.center);var rr=R*0.72;X.fillStyle=txtColor(hue);X.textAlign="center";X.textBaseline="middle";var fs=seg.length>24?28:42;X.font="700 "+fs+"px ui-sans-serif,'Noto Sans KR'";while(X.measureText(s.label).width>260&&fs>16){fs--;X.font="700 "+fs+"px ui-sans-serif,'Noto Sans KR'";}X.fillText(s.label, rr, 0);X.restore();}}else{X.beginPath();X.arc(0,0,R,0,TWO_PI);X.fillStyle="#3b4a9e";X.fill();}X.beginPath();X.arc(0,0,95,0,TWO_PI);var g=X.createRadialGradient(0,0,10,0,0,95);g.addColorStop(0,"#7bd3ff");g.addColorStop(1,"#0b76d1");X.fillStyle=g;X.fill();X.beginPath();X.arc(0,0,105,0,TWO_PI);X.strokeStyle="rgba(255,255,255,.9)";X.lineWidth=12;X.stroke();X.restore();}
function norm(a){return (a%TWO_PI+TWO_PI)%TWO_PI;}
function idxAt(){var a=norm(POINTER_ANGLE - angle);for(var i=0;i<seg.length;i++){var s=seg[i];if(s.start<=a&&a<s.end) return i;if(i===seg.length-1&&Math.abs(a-s.end)<1e-6) return i;}return -1;}
function pick(){var tot=seg.reduce(function(a,s){return a+(s.end-s.start);},0),r=Math.random()*tot,acc=0;for(var i=0;i<seg.length;i++){var len=seg[i].end-seg[i].start;if(r<acc+len) return i; acc+=len;}return seg.length-1;}
function target(i){var desired=POINTER_ANGLE - seg[i].center; var delta=norm(desired - angle); var turns=6+Math.floor(Math.random()*2); return angle + turns*TWO_PI + delta;}
function spin(){if(spinning||seg.length===0) return; spinning=true; var i=pick(), tgt=target(i), st=angle, dur=3600+Math.random()*1400, t0=performance.now(); (function anim(now){var t=Math.min((now-t0)/dur,1), ease=1-Math.pow(1-t,3); angle=st+(tgt-st)*ease; draw(); if(t<1) requestAnimationFrame(anim); else { angle=tgt; draw(); var idx=(idxAt()>=0)?idxAt():i; var s=seg[idx]; var R=document.getElementById("R"); R.style.display="inline-block"; R.textContent="🎉 "+s.label; if(!allow && s && s.itemIndex>=0 && s.itemIndex<items.length){ items.splice(s.itemIndex,1); rebuild(); } spinning=false; } })(performance.now());}
document.getElementById("B").onclick=spin; rebuild(); draw();
<\/script>
</body></html>`;
  }

  // ========= 초기화 =========
  let btnCenterStart, editorSaveBtn, clearWeightBtn, btnToggleList, btnAdd, btnReset, btnBig;
  let rngVol, chkMute;
  window.addEventListener("DOMContentLoaded", () => {
    // DOM 캐시
    canvas = qs("wheel");
    ctx = canvas.getContext("2d");
    ta = qs("quizInput");
    editorWrap = qs("editorWrap");
    itemTable = qs("itemTable");
    logBox = qs("logBox");
    fileInputEl = qs("fileInput");
    modal = qs("modal");
    mQ = qs("mQuestion");
    mA = qs("mAnswer");
    btnReveal = qs("btnReveal");

    btnCenterStart = qs("btnCenterStart");
    editorSaveBtn = qs("btnSave");
    clearWeightBtn = qs("btnClearWeight");
    btnToggleList = qs("btnToggleList");
    btnAdd = qs("btnAdd");
    btnReset = qs("btnReset");
    btnBig = qs("btnBig");

    rngVol = qs("rngVol");
    chkMute = qs("chkMute");

    // 저장된 상태 복원
    loadState();

    // 버튼 바인딩
    btnAdd.addEventListener("click", addFromTextarea);
    btnCenterStart.addEventListener("click", spin);
    btnReset.addEventListener("click", () => {
      if (spinning) return;
      angle = 0;
      drawWheel();
    });
    btnBig.addEventListener("click", openBig);

    editorSaveBtn.addEventListener("click", () => {
      if (spinning) return;
      syncEditor();
      rebuildSegments();
      hide(editorWrap);
      saveState();
      alert("저장 완료");
    });
    clearWeightBtn.addEventListener("click", () => {
      if (spinning) return;
      items.forEach((o) => (o.weight = null));
      renderEditor();
      rebuildSegments();
      saveState();
    });
    btnToggleList.addEventListener("click", () => {
      if (editorWrap.classList.contains("hidden")) renderEditor();
      toggle(editorWrap);
    });

    // 기록 버튼
    qs("btnToggleLog").addEventListener("click", () => {
      toggle(logBox);
      renderLog();
    });
    qs("btnClearLog").addEventListener("click", () => {
      historyLog.length = 0;
      renderLog();
      saveState();
    });

    // 파일
    qs("btnLoadFile").addEventListener("click", () => {
      if (!spinning) fileInputEl.click();
    });
    fileInputEl.addEventListener("change", onFilePicked);
    qs("btnDownloadSamples").addEventListener("click", downloadSamples);

    // 옵션
    qs("chkDupe").addEventListener("change", (e) => {
      allowDuplicate = e.target.checked;
      saveState();
    });
    qs("chkTheme").addEventListener("change", (e) => {
      document.documentElement.setAttribute("data-theme", e.target.checked ? "light" : "dark");
      saveState();
    });
    rngVol.addEventListener("input", (e) => {
      SFX.setVol(e.target.value / 100);
      saveState();
    });
    chkMute.addEventListener("change", (e) => {
      SFX.setMute(e.target.checked);
      saveState();
    });
    document.querySelectorAll('input[name="sfxSet"]').forEach((r) =>
      r.addEventListener("change", (e) => {
        SFX.setSet(e.target.value);
        saveState();
      })
    );

    // 입력 textarea 동작
    autosize(ta);
    ta.addEventListener("compositionstart", () => {
      composing = true;
    });
    ta.addEventListener("compositionend", () => {
      composing = false;
    });
    ta.addEventListener("input", () => autosize(ta));
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !composing) {
        e.preventDefault();
        addFromTextarea();
      }
    });

    // 편집 테이블 위임
    itemTable.addEventListener("input", onEditorInput);
    itemTable.addEventListener("click", onEditorClick);

    // 모달 버튼 및 배경/ESC 닫기
    document.addEventListener("click", (e) => {
      if (e.target && e.target.id === "btnReveal") {
        mA.style.display = mA.textContent.trim() ? "block" : "none";
        SFX.play("popup");
      }
      if (e.target && (e.target.id === "btnClose" || e.target.classList.contains("backdrop"))) {
        closeModal();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("show")) {
        closeModal();
      } else if (
        e.key === " " &&
        !modal.classList.contains("show") &&
        !/^(INPUT|TEXTAREA|BUTTON|SELECT)$/i.test((document.activeElement && document.activeElement.tagName) || "")
      ) {
        e.preventDefault();
        spin();
      }
    });

    // 첫 렌더
    rebuildSegments();
    drawWheel();
  });
})();
