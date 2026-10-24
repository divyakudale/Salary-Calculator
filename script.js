var DAY_HOURS = 9.5, DAYS_IN_MONTH = 30, KEY = "salaryApp.v1";
var data = load();
var dlgAction = null;

// In-page message and dialog (browser alert/confirm/prompt are blocked in published pages)
function toast(msg) {
  var t = document.getElementById("toast");
  t.textContent = msg; t.style.display = "block";
  setTimeout(function () { t.style.display = "none"; }, 2500);
}
function openDialog(msg, inputValue, okText, isDanger, onOk) {
  var input = document.getElementById("dlgInput");
  document.getElementById("dlgMsg").textContent = msg;
  input.style.display = inputValue === null ? "none" : "block";
  if (inputValue !== null) input.value = inputValue;
  var ok = document.getElementById("dlgOk");
  ok.textContent = okText;
  ok.className = isDanger ? "danger" : "";
  dlgAction = onOk;
  document.getElementById("overlay").classList.add("show");
  if (inputValue !== null) input.focus();
}
function closeDialog() { document.getElementById("overlay").classList.remove("show"); dlgAction = null; }
document.getElementById("dlgCancel").addEventListener("click", closeDialog);
document.getElementById("dlgOk").addEventListener("click", function () {
  var fn = dlgAction, v = document.getElementById("dlgInput").value;
  closeDialog();
  if (fn) fn(v);
});

function monthOfTime(ts) {
  var d = new Date(ts);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

// Older saved data: give each employee a start month so they don't appear in earlier months
function migrate(s) {
  s.employees.forEach(function (e) {
    if (e.startMonth) return;
    var start = monthOfTime(Number(String(e.id).slice(1)) || Date.now());
    Object.keys(s.records).forEach(function (m) {
      var r = s.records[m] && s.records[m][e.id];
      if (!r || m >= start) return;
      var used = ["absent", "leaves", "extraDays", "hoursGiven", "incentive", "advance"].some(function (k) { return r[k] > 0; });
      if (used) start = m;
    });
    e.startMonth = start;
    e.salaries = {};
    e.salaries[start] = e.salary;
    delete e.salary;
  });
  return s;
}

function salaryFor(e, m) {
  var keys = Object.keys(e.salaries).sort();
  var pick = keys[0];
  keys.forEach(function (k) { if (k <= m) pick = k; });
  return e.salaries[pick];
}

// Employees who belong to the selected month (added on/before it, not removed before it)
function visibleEmployees() {
  var m = monthKey();
  return data.employees
    .filter(function (e) { return e.startMonth <= m && (!e.endMonth || m < e.endMonth); })
    .map(function (e) { return { id: e.id, name: e.name, salary: salaryFor(e, m) }; });
}

function load() {
  try {
    var s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.employees && s.records) return migrate(s);
  } catch (e) {}
  return { employees: [], records: {} };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
function num(v) { var n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : n; }
function whole(n) { return Math.trunc(n); }
function money(n) { return "₹" + n.toLocaleString("en-IN"); }
function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
function monthKey() { return document.getElementById("month").value; }

function calculate(salary, present, leaves, extraDays, hoursGiven, advance, incentive, fine) {
  var perDay = whole(salary / DAYS_IN_MONTH);
  var perHour = whole(perDay / DAY_HOURS);

  // Hours: expected = days present x 9.5, compared with the hours given
  var expectedHours = whole(present * DAY_HOURS);
  var givenHours = hoursGiven === null ? expectedHours : hoursGiven;
  var overtimeHours = givenHours > expectedHours ? givenHours - expectedHours : 0;
  var lessHours = givenHours < expectedHours ? expectedHours - givenHours : 0;

  var leaveCut = whole(perDay * leaves);
  var otDays = whole(perDay * extraDays);
  var otHours = whole(perHour * overtimeHours);
  var overtimeAdd = otDays + otHours;
  var lessCut = whole(perHour * lessHours);
  return {
    perDay: perDay, perHour: perHour,
    present: present, expectedHours: expectedHours, givenHours: givenHours, overtimeHours: overtimeHours, lessHours: lessHours,
    leaveCut: leaveCut, otDays: otDays, otHours: otHours,
    overtimeAdd: overtimeAdd, lessCut: lessCut, incentive: whole(incentive), advance: whole(advance), fine: whole(fine),
    total: whole(salary) - leaveCut + overtimeAdd - lessCut + whole(incentive) - whole(advance) - whole(fine)
  };
}

function monthLabel() {
  var p = monthKey().split("-");
  if (p.length < 2) return "";
  var d = new Date(Number(p[0]), Number(p[1]) - 1, 1);
  return d.toLocaleString("en-US", { month: "short" }) + " " + p[0];
}

function fmt(n) { return Math.trunc(n).toLocaleString("en-IN"); }

function getRecord(id) {
  var m = monthKey();
  if (!data.records[m]) data.records[m] = {};
  var r = data.records[m][id];
  if (!r) r = data.records[m][id] = {};
  ["absent", "leaves", "extraDays", "incentive", "advance"].forEach(function (k) {
    if (typeof r[k] !== "number") r[k] = 0;
  });
  if (typeof r.hoursGiven !== "number") r.hoursGiven = null; // empty until entered
  // Advance and fine are lists of entries; older single advance numbers become one entry
  if (!Array.isArray(r.advances)) r.advances = r.advance > 0 ? [{ id: "x0", amount: r.advance, date: "" }] : [];
  if (!Array.isArray(r.fines)) r.fines = [];
  return r;
}

// Only these two employees get an incentive
var INCENTIVE_NAMES = ["saurabh", "laxman"];
function hasIncentive(emp) {
  return INCENTIVE_NAMES.indexOf(emp.name.trim().toLowerCase()) !== -1;
}

// Days in the selected month (e.g. 30 for Sep, 31 for Oct)
function daysInMonth() {
  var p = monthKey().split("-");
  if (p.length < 2) return 30;
  return new Date(Number(p[0]), Number(p[1]), 0).getDate();
}

// Days present = days in month - total absent leaves
function presentDays(r) {
  return Math.max(daysInMonth() - r.absent, 0);
}

function sumOf(list) {
  return list.reduce(function (t, x) { return t + x.amount; }, 0);
}

function calcFor(emp) {
  var r = getRecord(emp.id);
  return calculate(emp.salary, presentDays(r), r.leaves, r.extraDays, r.hoursGiven, sumOf(r.advances), hasIncentive(emp) ? r.incentive : 0, sumOf(r.fines));
}

function field(id, f, label, hint, val) {
  return '<label>' + label + '<input type="number" min="0" step="0.5" data-id="' + id + '" data-f="' + f + '" value="' + (val === null ? "" : val) + '"><span class="hint">' + hint + '</span></label>';
}

// Date helpers for advance and fine entries
function dateForNew() {
  var now = new Date();
  var key = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  return key === monthKey() ? key + "-" + String(now.getDate()).padStart(2, "0") : monthKey() + "-01";
}
function showDate(d) {
  if (!d) return "No date";
  var p = d.split("-");
  return Number(p[2]) + " " + new Date(2000, Number(p[1]) - 1, 1).toLocaleString("en-US", { month: "short" }) + " " + p[0];
}

var openLists = {}; // remembers which "View list" boxes are open

// One box for advances ("adv") or fines ("fine"): total, add form, and the list
function ledger(kind, emp, r) {
  var id = emp.id, isAdv = kind === "adv";
  var list = (isAdv ? r.advances : r.fines).slice().sort(function (a, b) { return (a.date || "").localeCompare(b.date || ""); });
  var items = list.map(function (x) {
    return '<li><span>' + showDate(x.date) + (x.reason ? " · " + esc(x.reason) : "") + '</span><b>' + money(x.amount) +
      '</b><button class="tiny" data-delentry="' + kind + "|" + id + "|" + x.id + '">✕</button></li>';
  }).join("");
  return '<div class="ledger ' + kind + '"><div class="grid">' +
    '<label>' + (isAdv ? "Total advance given" : "Total fine") + '<div class="readonly" data-out="' + kind + 'total" data-id="' + id + '"></div></label>' +
    '<label>Amount (₹)<input type="number" min="0" class="l-amt"></label>' +
    '<label>Date<input type="date" class="l-date" value="' + dateForNew() + '"></label>' +
    (isAdv ? "" : '<label>Reason (optional)<input type="text" class="l-reason"></label>') +
    '<button class="addbtn" data-addentry="' + kind + "|" + id + '">+ Add</button></div>' +
    '<details data-key="' + kind + id + '"' + (openLists[kind + id] ? " open" : "") + '><summary>View list (' + list.length + ')</summary>' +
    (list.length ? "<ul>" + items + "</ul>" : '<p class="none">No entries yet</p>') + "</details></div>";
}

function render() {
  var cards = document.getElementById("cards");
  if (visibleEmployees().length === 0) {
    cards.innerHTML = '<div class="empty"><div>👥</div><b>No employees yet</b><br>Add your first employee above to get started.</div>';
  } else {
    var html = "";
    visibleEmployees().forEach(function (emp) {
      var r = getRecord(emp.id), id = emp.id;
      html += '<div class="emp">' +
        '<div class="head"><div class="av">' + esc(emp.name.charAt(0).toUpperCase()) + '</div>' +
        '<div class="n"><b>' + esc(emp.name) + '</b><small>Monthly salary ' + money(emp.salary) + '</small></div>' +
        '<button class="tiny" data-edit="' + id + '">Edit</button> <button class="tiny" data-del="' + id + '">Remove</button></div>' +
        '<div class="totalbar"><span>Total Salary of ' + esc(emp.name) + ' of ' + monthLabel() + '</span><strong data-out="total" data-id="' + id + '"></strong><span class="tip" data-out="tiptotal" data-id="' + id + '"></span></div>' +
        '<div class="body"><div class="col"><div class="grid">' +
        field(id, "absent", "Total absent leaves", "All days absent this month", r.absent) +
        '<label>Days present<div class="readonly"><span data-out="pres" data-id="' + id + '"></span> days</div><span class="hint">Days in month − absent leaves</span></label>' +
        field(id, "leaves", "Extra leaves", "Deducted from salary", r.leaves) +
        '<label>Total hours expected<div class="readonly"><span data-out="hrs" data-id="' + id + '"></span> hrs</div><span class="hint">Days present × 9.5</span></label>' +
        field(id, "extraDays", "Extra days present", "Overtime days worked", r.extraDays) +
        field(id, "hoursGiven", "Total hours given", "Hours actually worked", r.hoursGiven) +
        (hasIncentive(emp) ? field(id, "incentive", "Incentive (₹)", "Bonus added", r.incentive) : "") +
        '</div></div><div class="col">' + ledger("adv", emp, r) + ledger("fine", emp, r) + '</div></div>' +
        '<div class="chips">' +
        '<div class="chip m">Leave deduction<b data-out="leave" data-id="' + id + '"></b><span class="tip" data-out="tipleave" data-id="' + id + '"></span></div>' +
        '<div class="chip p">Overtime added<b data-out="ot" data-id="' + id + '"></b><span class="tip" data-out="tipot" data-id="' + id + '"></span></div>' +
        '<div class="chip m">Less-hours deduction<b data-out="less" data-id="' + id + '"></b><span class="tip" data-out="tipless" data-id="' + id + '"></span></div>' +
        '<div class="chip m">Advance payment<b data-out="adv" data-id="' + id + '"></b><span class="tip" data-out="tipadv" data-id="' + id + '"></span></div>' +
        '<div class="chip m">Fine<b data-out="fine" data-id="' + id + '"></b><span class="tip" data-out="tipfine" data-id="' + id + '"></span></div>' +
        (hasIncentive(emp) ? '<div class="chip p">Incentive<b data-out="inc" data-id="' + id + '"></b><span class="tip" data-out="tipinc" data-id="' + id + '"></span></div>' : '') +
        '</div>' +
        '<div class="foot"><span>Overtime hours: <span data-out="othrs" data-id="' + id + '"></span> hrs</span><span>Less hours: <span data-out="lesshrs" data-id="' + id + '"></span> hrs</span></div>' +
        '</div>';
    });
    cards.innerHTML = html;
  }
  update();
}

function setOut(id, name, text, asHtml) {
  var el = document.querySelector('[data-out="' + name + '"][data-id="' + id + '"]');
  if (!el) return;
  if (asHtml) el.innerHTML = text; else el.textContent = text;
}

function tips(emp, r, c) {
  var S = "₹" + fmt(emp.salary);
  var dayText = "(" + S + " ÷ 30) = ₹" + fmt(c.perDay);
  var hrText = "(₹" + fmt(c.perDay) + " ÷ 9.5) = ₹" + fmt(c.perHour);
  return {
    leave: "<strong>Leave deduction</strong><br>Formula: (Monthly salary ÷ 30) × Extra leaves<br>Per day: " + dayText +
      "<br>= ₹" + fmt(c.perDay) + " × " + r.leaves + " = ₹" + fmt(c.perDay * r.leaves) +
      "<br>Whole number used: <strong>" + money(c.leaveCut) + "</strong>",
    ot: "<strong>Overtime added</strong> = Overtime days pay + Overtime hours pay" +
      "<br><br>Days: (Monthly salary ÷ 30) × Extra days<br>= ₹" + fmt(c.perDay) + " × " + r.extraDays + " = ₹" + fmt(c.perDay * r.extraDays) + " → <strong>" + money(c.otDays) + "</strong>" +
      "<br><br>Overtime hours = Hours given − Hours expected<br>= " + c.givenHours + " − " + c.expectedHours + " = " + c.overtimeHours + " hrs" +
      "<br><br>Hours pay: ((Monthly salary ÷ 30) ÷ 9.5) × Overtime hours<br>Per hour: " + hrText +
      "<br>= ₹" + fmt(c.perHour) + " × " + c.overtimeHours + " = ₹" + fmt(c.perHour * c.overtimeHours) + " → <strong>" + money(c.otHours) + "</strong>" +
      "<br><br>Total: " + money(c.otDays) + " + " + money(c.otHours) + " = <strong>" + money(c.overtimeAdd) + "</strong>",
    less: "<strong>Less-hours deduction</strong><br>Less hours = Hours expected − Hours given<br>= " + c.expectedHours + " − " + c.givenHours + " = " + c.lessHours + " hrs" +
      "<br><br>Formula: ((Monthly salary ÷ 30) ÷ 9.5) × Less hours<br>Per hour: " + hrText +
      "<br>= ₹" + fmt(c.perHour) + " × " + c.lessHours + " = ₹" + fmt(c.perHour * c.lessHours) +
      "<br>Whole number used: <strong>" + money(c.lessCut) + "</strong>",
    adv: "<strong>Advance payment</strong><br>" + r.advances.length + " advance entries added up and subtracted from this month's salary.<br>Total: <strong>" + money(c.advance) + "</strong>",
    fine: "<strong>Fine</strong><br>" + r.fines.length + " fine entries added up and subtracted from this month's salary.<br>Total: <strong>" + money(c.fine) + "</strong>",
    inc: "<strong>Incentive</strong><br>Extra amount added to this month's salary.<br>Whole number used: <strong>" + money(c.incentive) + "</strong>",
    total: "<strong>Total salary</strong><br>= Monthly salary − Leave deduction + Overtime − Less hours − Advance − Fine" + (hasIncentive(emp) ? " + Incentive" : "") +
      "<br>= " + money(whole(emp.salary)) + " − " + money(c.leaveCut) + " + " + money(c.overtimeAdd) + " − " + money(c.lessCut) + " − " + money(c.advance) + " − " + money(c.fine) + (hasIncentive(emp) ? " + " + money(c.incentive) : "") +
      "<br>= <strong>" + money(c.total) + "</strong>"
  };
}

// Only updates the numbers, never the input boxes, so typing is not disturbed
function update() {
  var T = { pay: 0, add: 0, cut: 0, leave: 0, less: 0, inc: 0, adv: 0, fine: 0, salary: 0 };
  var rows = "";
  visibleEmployees().forEach(function (emp) {
    var r = getRecord(emp.id);
    var c = calcFor(emp);
    r.result = c;
    T.pay += c.total; T.add += c.overtimeAdd; T.leave += c.leaveCut; T.less += c.lessCut; T.adv += c.advance; T.fine += c.fine; T.inc += c.incentive; T.salary += emp.salary;
    setOut(emp.id, "leave", "-" + money(c.leaveCut));
    setOut(emp.id, "ot", "+" + money(c.overtimeAdd));
    setOut(emp.id, "less", "-" + money(c.lessCut));
    setOut(emp.id, "inc", "+" + money(c.incentive));
    setOut(emp.id, "adv", "-" + money(c.advance));
    setOut(emp.id, "fine", "-" + money(c.fine));
    setOut(emp.id, "advtotal", money(c.advance));
    setOut(emp.id, "finetotal", money(c.fine));
    setOut(emp.id, "total", money(c.total));
    setOut(emp.id, "pres", c.present);
    setOut(emp.id, "hrs", c.expectedHours);
    setOut(emp.id, "othrs", c.overtimeHours);
    setOut(emp.id, "lesshrs", c.lessHours);
    var t = tips(emp, r, c);
    setOut(emp.id, "tipleave", t.leave, true);
    setOut(emp.id, "tipot", t.ot, true);
    setOut(emp.id, "tipless", t.less, true);
    setOut(emp.id, "tipinc", t.inc, true);
    setOut(emp.id, "tipadv", t.adv, true);
    setOut(emp.id, "tipfine", t.fine, true);
    setOut(emp.id, "tiptotal", t.total, true);
    rows += "<tr><td>" + esc(emp.name) + "</td><td>" + money(emp.salary) + "</td>" +
      '<td class="m">' + money(c.leaveCut) + '</td><td class="p">' + money(c.overtimeAdd) + '</td>' +
      '<td class="m">' + money(c.lessCut) + '</td><td class="m">' + money(c.advance) + '</td><td class="m">' + money(c.fine) + '</td><td class="p">' + money(c.incentive) + '</td><td class="t">' + money(c.total) + "</td></tr>";
  });
  T.cut = T.leave + T.less + T.adv + T.fine;

  document.getElementById("sumBody").innerHTML = rows || '<tr><td colspan="9" style="text-align:center;color:var(--muted)">No employees yet</td></tr>';
  document.getElementById("sumFoot").innerHTML = visibleEmployees().length
    ? "<tr><td>Total</td><td>" + money(T.salary) + "</td><td>" + money(T.leave) + "</td><td>" + money(T.add) + "</td><td>" + money(T.less) + "</td><td>" + money(T.adv) + "</td><td>" + money(T.fine) + "</td><td>" + money(T.inc) + "</td><td>" + money(T.pay) + "</td></tr>"
    : "";
  document.getElementById("sumTitle").textContent = "Salary summary for " + monthKey();

  document.getElementById("stats").innerHTML =
    '<div class="stat"><small>Employees</small><b>' + visibleEmployees().length + '</b></div>' +
    '<div class="stat"><small>Total payout</small><b>' + money(T.pay) + '</b></div>' +
    '<div class="stat"><small>Overtime added</small><b style="color:var(--plus)">+' + money(T.add) + '</b></div>' +
    '<div class="stat"><small>Total deductions</small><b style="color:var(--minus)">-' + money(T.cut) + '</b></div>';
  save();
}

document.getElementById("addBtn").addEventListener("click", function () {
  var n = document.getElementById("newName"), s = document.getElementById("newSalary");
  if (!n.value.trim() || num(s.value) <= 0) { toast("Please enter a name and a monthly salary."); return; }
  var start = monthKey(), sal = {};
  sal[start] = num(s.value);
  data.employees.push({ id: "e" + Date.now(), name: n.value.trim(), startMonth: start, salaries: sal });
  n.value = ""; s.value = "";
  render();
});

document.getElementById("cards").addEventListener("input", function (e) {
  var t = e.target;
  if (!t.dataset.id) return;
  getRecord(t.dataset.id)[t.dataset.f] = (t.dataset.f === "hoursGiven" && t.value === "") ? null : num(t.value);
  update();
});

document.getElementById("cards").addEventListener("click", function (e) {
  var del = e.target.dataset.del, edit = e.target.dataset.edit;
  var m = monthKey();
  var add = e.target.dataset.addentry, rem = e.target.dataset.delentry;
  if (add) {
    var a = add.split("|"), box = e.target.closest(".ledger");
    var amount = num(box.querySelector(".l-amt").value);
    if (amount <= 0) { toast("Please enter an amount."); return; }
    var rec = getRecord(a[1]);
    var entry = { id: "x" + Date.now(), amount: amount, date: box.querySelector(".l-date").value };
    if (a[0] === "fine") entry.reason = box.querySelector(".l-reason").value.trim();
    (a[0] === "adv" ? rec.advances : rec.fines).push(entry);
    openLists[a[0] + a[1]] = true;
    render();
    return;
  }
  if (rem) {
    var d = rem.split("|"), rec2 = getRecord(d[1]);
    var key = d[0] === "adv" ? "advances" : "fines";
    rec2[key] = rec2[key].filter(function (x) { return x.id !== d[2]; });
    render();
    return;
  }
  if (del) {
    var who = data.employees.filter(function (x) { return x.id === del; })[0];
    openDialog("Remove " + who.name + " from " + monthLabel() + " onwards? Earlier months keep their records.", null, "Remove", true, function () {
      who.endMonth = m;
      Object.keys(data.records).forEach(function (k) {
        if (k >= m && data.records[k]) delete data.records[k][del];
      });
      render();
    });
  }
  if (edit) {
    var emp = data.employees.filter(function (x) { return x.id === edit; })[0];
    openDialog("New monthly salary for " + emp.name + " from " + monthLabel() + " onwards (₹)", salaryFor(emp, m), "Save", false, function (v) {
      if (num(v) > 0) { emp.salaries[m] = num(v); render(); } else { toast("Please enter a valid salary."); }
    });
  }
});

// Touch screens: tap a box to show its details, tap anywhere else to hide
document.addEventListener("click", function (e) {
  var box = e.target.closest ? e.target.closest(".chip, .totalbar") : null;
  document.querySelectorAll(".chip.open, .totalbar.open, .emp.raise").forEach(function (el) {
    if (el !== box) el.classList.remove("open", "raise");
  });
  if (box) {
    box.classList.toggle("open");
    box.closest(".emp").classList.toggle("raise", box.classList.contains("open"));
  }
});

document.getElementById("cards").addEventListener("toggle", function (e) {
  if (e.target.dataset && e.target.dataset.key) openLists[e.target.dataset.key] = e.target.open;
}, true);

document.getElementById("month").addEventListener("change", render);

// ---------- Excel report (.xlsx) with colours and charts ----------
async function saveFile(name, buffer) {
  try {
    if (window.claude && window.claude.use) {
      var dl = await window.claude.use("downloads");
      if (dl) { await dl.save({ filename: name, data: buffer }); return; }
    }
  } catch (e) { return; }
  var blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  var link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Draws a chart on a hidden canvas and returns it as a PNG picture
function chartImage(config) {
  var canvas = document.createElement("canvas");
  canvas.width = 720; canvas.height = 360;
  config.options = config.options || {};
  config.options.responsive = false;
  config.options.animation = false;
  config.plugins = [{ id: "bg", beforeDraw: function (ch) { var x = ch.ctx; x.save(); x.fillStyle = "#ffffff"; x.fillRect(0, 0, ch.width, ch.height); x.restore(); } }];
  var chart = new Chart(canvas, config);
  var png = canvas.toDataURL("image/png");
  chart.destroy();
  return png;
}

function makeCharts(rows, month) {
  var names = rows.map(function (x) { return x.emp.name; });
  var title = function (t) { return { display: true, text: t + " — " + month, font: { size: 16 } }; };
  var out = [];
  out.push(chartImage({ type: "bar",
    data: { labels: names, datasets: [{ label: "Total salary (₹)", data: rows.map(function (x) { return x.c.total; }), backgroundColor: "#5b4bdb" }] },
    options: { plugins: { title: title("Total salary per employee"), legend: { display: false } } } }));
  out.push(chartImage({ type: "bar",
    data: { labels: names, datasets: [
      { label: "Added (overtime + incentive)", data: rows.map(function (x) { return x.c.overtimeAdd + x.c.incentive; }), backgroundColor: "#0f9d6b" },
      { label: "Deducted (leaves, less hrs, advance, fine)", data: rows.map(function (x) { return x.c.leaveCut + x.c.lessCut + x.c.advance + x.c.fine; }), backgroundColor: "#d23b3b" }] },
    options: { plugins: { title: title("Added vs deducted") } } }));
  var parts = [0, 0, 0, 0];
  rows.forEach(function (x) { parts[0] += x.c.leaveCut; parts[1] += x.c.lessCut; parts[2] += x.c.advance; parts[3] += x.c.fine; });
  if (parts.some(function (v) { return v > 0; })) {
    out.push(chartImage({ type: "doughnut",
      data: { labels: ["Leaves", "Less hours", "Advance", "Fine"], datasets: [{ data: parts, backgroundColor: ["#f59e0b", "#8a5cf6", "#3b82f6", "#d23b3b"] }] },
      options: { plugins: { title: title("Where the deductions come from") } } }));
  }
  return out;
}

async function buildWorkbook(rows, month, charts) {
  var wb = new ExcelJS.Workbook();
  var PURPLE = "FF5B4BDB", DARK = "FF3D2FA8", LIGHT = "FFF1EFFD", RED = "FFC62828", GREEN = "FF0F9D6B", WHITE = "FFFFFFFF";
  var RUPEE = '"₹"#,##0';
  var thin = { style: "thin", color: { argb: "FFD9DEE8" } };
  var border = { top: thin, left: thin, bottom: thin, right: thin };
  var fill = function (argb) { return { type: "pattern", pattern: "solid", fgColor: { argb: argb } }; };

  // Sheet 1: summary table
  var ws = wb.addWorksheet("Salary Summary", { views: [{ state: "frozen", xSplit: 1, ySplit: 3 }] });
  var heads = ["Employee", "Monthly Salary", "Absent Leaves", "Days Present", "Extra Leaves", "Hours Expected", "Hours Given", "Overtime Hrs", "Less Hrs", "Extra Days Present", "Leave Deduction", "Overtime Added", "Less-Hours Deduction", "Advance", "Fine", "Incentive", "Total Salary"];
  ws.mergeCells("A1:Q1");
  var t = ws.getCell("A1");
  t.value = "3M Car Care Studio — Salary Report, " + month;
  t.font = { size: 16, bold: true, color: { argb: WHITE } };
  t.fill = fill(PURPLE);
  t.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 32;
  ws.mergeCells("A2:Q2");
  ws.getCell("A2").value = "Green = added to salary · Red = deducted from salary";
  ws.getCell("A2").font = { italic: true, color: { argb: "FF6B7588" } };
  ws.getCell("A2").alignment = { horizontal: "center" };
  var hr = ws.getRow(3);
  hr.values = heads;
  hr.height = 34;
  hr.eachCell(function (c) {
    c.font = { bold: true, color: { argb: WHITE } };
    c.fill = fill(DARK);
    c.alignment = { wrapText: true, horizontal: "center", vertical: "middle" };
    c.border = border;
  });

  var matrix = rows.map(function (x) {
    var c = x.c, r = x.r;
    return [x.emp.name, x.emp.salary, r.absent, c.present, r.leaves, c.expectedHours, c.givenHours, c.overtimeHours, c.lessHours, r.extraDays, c.leaveCut, c.overtimeAdd, c.lessCut, c.advance, c.fine, c.incentive, c.total];
  });
  matrix.forEach(function (values, i) {
    var row = ws.addRow(values);
    row.eachCell(function (cell, col) {
      cell.border = border;
      if (i % 2 === 1) cell.fill = fill(LIGHT);
      if (col === 1) cell.font = { bold: true }; else cell.alignment = { horizontal: "right" };
      if (col === 2 || col >= 11) cell.numFmt = RUPEE;
      if ([11, 13, 14, 15].indexOf(col) !== -1) cell.font = { color: { argb: RED } };
      if (col === 12 || col === 16) cell.font = { color: { argb: GREEN } };
      if (col === 17) cell.font = { bold: true, color: { argb: PURPLE } };
    });
  });
  var first = 4, last = 3 + matrix.length;
  var totalRow = ws.addRow(["TOTAL"]);
  [2, 11, 12, 13, 14, 15, 16, 17].forEach(function (col) {
    var sum = matrix.reduce(function (n, v) { return n + v[col - 1]; }, 0);
    var L = String.fromCharCode(64 + col);
    totalRow.getCell(col).value = { formula: "SUM(" + L + first + ":" + L + last + ")", result: sum };
    totalRow.getCell(col).numFmt = RUPEE;
  });
  for (var col = 1; col <= 17; col++) {
    var cell = totalRow.getCell(col);
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.fill = fill(PURPLE);
    cell.border = border;
  }
  ws.columns.forEach(function (c, i) { c.width = i === 0 ? 20 : 14; });
  ws.autoFilter = "A3:Q3";

  // Sheet 2: charts as pictures
  var cs = wb.addWorksheet("Charts");
  cs.getCell("A1").value = "Charts — " + month;
  cs.getCell("A1").font = { size: 16, bold: true, color: { argb: PURPLE } };
  charts.forEach(function (png, i) {
    var id = wb.addImage({ base64: png, extension: "png" });
    cs.addImage(id, { tl: { col: 0, row: 2 + i * 20 }, ext: { width: 720, height: 360 } });
  });

  // Sheet 3: every advance and fine with its date
  var ls = wb.addWorksheet("Advances & Fines");
  var lr = ls.addRow(["Employee", "Type", "Date", "Reason", "Amount"]);
  lr.eachCell(function (c) { c.font = { bold: true, color: { argb: WHITE } }; c.fill = fill(DARK); c.border = border; c.alignment = { horizontal: "center" }; });
  var totalAdv = 0, totalFine = 0, count = 0;
  rows.forEach(function (x) {
    var entries = x.r.advances.map(function (e) { return { type: "Advance", e: e }; })
      .concat(x.r.fines.map(function (e) { return { type: "Fine", e: e }; }))
      .sort(function (a, b) { return (a.e.date || "").localeCompare(b.e.date || ""); });
    entries.forEach(function (it) {
      var row = ls.addRow([x.emp.name, it.type, showDate(it.e.date), it.e.reason || "", it.e.amount]);
      var isFine = it.type === "Fine";
      row.getCell(2).fill = fill(isFine ? "FFFDEAEA" : "FFFFF3E0");
      row.getCell(2).font = { bold: true, color: { argb: isFine ? RED : "FFB45309" } };
      row.getCell(5).numFmt = RUPEE;
      row.eachCell(function (c) { c.border = border; });
      if (isFine) totalFine += it.e.amount; else totalAdv += it.e.amount;
      count++;
    });
  });
  if (!count) ls.addRow(["No advances or fines this month"]);
  [["Total advance", totalAdv], ["Total fine", totalFine]].forEach(function (p) {
    var row = ls.addRow(["", "", "", p[0], p[1]]);
    row.getCell(4).font = { bold: true };
    row.getCell(5).font = { bold: true };
    row.getCell(5).numFmt = RUPEE;
  });
  ls.columns.forEach(function (c, i) { c.width = [20, 12, 16, 30, 14][i]; });

  return wb;
}

document.getElementById("csvBtn").addEventListener("click", async function () {
  var emps = visibleEmployees();
  if (!emps.length) { toast("Add an employee first."); return; }
  if (!window.ExcelJS || !window.Chart) { toast("Excel tools did not load. Please check your internet connection."); return; }
  var rows = emps.map(function (emp) { return { emp: emp, r: getRecord(emp.id), c: calcFor(emp) }; });
  try {
    var wb = await buildWorkbook(rows, monthLabel(), makeCharts(rows, monthLabel()));
    var buffer = await wb.xlsx.writeBuffer();
    await saveFile("salary-report-" + monthKey() + ".xlsx", buffer);
  } catch (err) {
    toast("Could not create the Excel file.");
  }
});

var now = new Date();
document.getElementById("month").value = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
render();
