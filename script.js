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

function load() {
  try {
    var s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.employees && s.records) return s;
  } catch (e) {}
  return { employees: [], records: {} };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
function num(v) { var n = parseFloat(v); return isNaN(n) || n < 0 ? 0 : n; }
function whole(n) { return Math.trunc(n); }
function money(n) { return "₹" + n.toLocaleString("en-IN"); }
function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
function monthKey() { return document.getElementById("month").value; }

function calculate(salary, present, leaves, extraDays, hoursGiven, advance, incentive) {
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
    overtimeAdd: overtimeAdd, lessCut: lessCut, incentive: whole(incentive), advance: whole(advance),
    total: whole(salary) - leaveCut + overtimeAdd - lessCut + whole(incentive) - whole(advance)
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

function calcFor(emp) {
  var r = getRecord(emp.id);
  return calculate(emp.salary, presentDays(r), r.leaves, r.extraDays, r.hoursGiven, r.advance, hasIncentive(emp) ? r.incentive : 0);
}

function field(id, f, label, hint, val) {
  return '<label>' + label + '<input type="number" min="0" step="0.5" data-id="' + id + '" data-f="' + f + '" value="' + (val === null ? "" : val) + '"><span class="hint">' + hint + '</span></label>';
}

function render() {
  var cards = document.getElementById("cards");
  if (data.employees.length === 0) {
    cards.innerHTML = '<div class="empty"><div>👥</div><b>No employees yet</b><br>Add your first employee above to get started.</div>';
  } else {
    var html = "";
    data.employees.forEach(function (emp) {
      var r = getRecord(emp.id), id = emp.id;
      html += '<div class="emp">' +
        '<div class="head"><div class="av">' + esc(emp.name.charAt(0).toUpperCase()) + '</div>' +
        '<div class="n"><b>' + esc(emp.name) + '</b><small>Monthly salary ' + money(emp.salary) + '</small></div>' +
        '<button class="tiny" data-edit="' + id + '">Edit</button> <button class="tiny" data-del="' + id + '">Remove</button></div>' +
        '<div class="grid">' +
        field(id, "absent", "Total absent leaves", "All days absent this month", r.absent) +
        '<label>Days present<div class="readonly"><span data-out="pres" data-id="' + id + '"></span> days</div><span class="hint">Days in month − absent leaves</span></label>' +
        field(id, "leaves", "Extra leaves", "Deducted from salary", r.leaves) +
        '<label>Total hours expected<div class="readonly"><span data-out="hrs" data-id="' + id + '"></span> hrs</div><span class="hint">Days present × 9.5</span></label>' +
        field(id, "extraDays", "Extra days present", "Overtime days worked", r.extraDays) +
        field(id, "hoursGiven", "Total hours given", "Hours actually worked", r.hoursGiven) +
        field(id, "advance", "Advance payment (₹)", "Already paid", r.advance) +
        (hasIncentive(emp) ? field(id, "incentive", "Incentive (₹)", "Bonus added", r.incentive) : "") +
        '</div>' +
        '<div class="chips">' +
        '<div class="chip m">Leave deduction<b data-out="leave" data-id="' + id + '"></b><span class="tip" data-out="tipleave" data-id="' + id + '"></span></div>' +
        '<div class="chip p">Overtime added<b data-out="ot" data-id="' + id + '"></b><span class="tip" data-out="tipot" data-id="' + id + '"></span></div>' +
        '<div class="chip m">Less-hours deduction<b data-out="less" data-id="' + id + '"></b><span class="tip" data-out="tipless" data-id="' + id + '"></span></div>' +
        '<div class="chip m">Advance payment<b data-out="adv" data-id="' + id + '"></b><span class="tip" data-out="tipadv" data-id="' + id + '"></span></div>' +
        (hasIncentive(emp) ? '<div class="chip p">Incentive<b data-out="inc" data-id="' + id + '"></b><span class="tip" data-out="tipinc" data-id="' + id + '"></span></div>' : '') +
        '</div>' +
        '<div class="totalbar"><span>Total Salary of ' + esc(emp.name) + ' of ' + monthLabel() + '</span><strong data-out="total" data-id="' + id + '"></strong><span class="tip" data-out="tiptotal" data-id="' + id + '"></span></div>' +
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
    adv: "<strong>Advance payment</strong><br>Amount already given to the employee, subtracted from this month's salary.<br>Whole number used: <strong>" + money(c.advance) + "</strong>",
    inc: "<strong>Incentive</strong><br>Extra amount added to this month's salary.<br>Whole number used: <strong>" + money(c.incentive) + "</strong>",
    total: "<strong>Total salary</strong><br>= Monthly salary − Leave deduction + Overtime − Less hours − Advance" + (hasIncentive(emp) ? " + Incentive" : "") +
      "<br>= " + money(whole(emp.salary)) + " − " + money(c.leaveCut) + " + " + money(c.overtimeAdd) + " − " + money(c.lessCut) + " − " + money(c.advance) + (hasIncentive(emp) ? " + " + money(c.incentive) : "") +
      "<br>= <strong>" + money(c.total) + "</strong>"
  };
}

// Only updates the numbers, never the input boxes, so typing is not disturbed
function update() {
  var T = { pay: 0, add: 0, cut: 0, leave: 0, less: 0, inc: 0, adv: 0, salary: 0 };
  var rows = "";
  data.employees.forEach(function (emp) {
    var r = getRecord(emp.id);
    var c = calcFor(emp);
    r.result = c;
    T.pay += c.total; T.add += c.overtimeAdd; T.leave += c.leaveCut; T.less += c.lessCut; T.adv += c.advance; T.inc += c.incentive; T.salary += emp.salary;
    setOut(emp.id, "leave", "-" + money(c.leaveCut));
    setOut(emp.id, "ot", "+" + money(c.overtimeAdd));
    setOut(emp.id, "less", "-" + money(c.lessCut));
    setOut(emp.id, "inc", "+" + money(c.incentive));
    setOut(emp.id, "adv", "-" + money(c.advance));
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
    setOut(emp.id, "tiptotal", t.total, true);
    rows += "<tr><td>" + esc(emp.name) + "</td><td>" + money(emp.salary) + "</td>" +
      '<td class="m">' + money(c.leaveCut) + '</td><td class="p">' + money(c.overtimeAdd) + '</td>' +
      '<td class="m">' + money(c.lessCut) + '</td><td class="m">' + money(c.advance) + '</td><td class="p">' + money(c.incentive) + '</td><td class="t">' + money(c.total) + "</td></tr>";
  });
  T.cut = T.leave + T.less + T.adv;

  document.getElementById("sumBody").innerHTML = rows || '<tr><td colspan="8" style="text-align:center;color:var(--muted)">No employees yet</td></tr>';
  document.getElementById("sumFoot").innerHTML = data.employees.length
    ? "<tr><td>Total</td><td>" + money(T.salary) + "</td><td>" + money(T.leave) + "</td><td>" + money(T.add) + "</td><td>" + money(T.less) + "</td><td>" + money(T.adv) + "</td><td>" + money(T.inc) + "</td><td>" + money(T.pay) + "</td></tr>"
    : "";
  document.getElementById("sumTitle").textContent = "Salary summary for " + monthKey();

  document.getElementById("stats").innerHTML =
    '<div class="stat"><small>Employees</small><b>' + data.employees.length + '</b></div>' +
    '<div class="stat"><small>Total payout</small><b>' + money(T.pay) + '</b></div>' +
    '<div class="stat"><small>Overtime added</small><b style="color:var(--plus)">+' + money(T.add) + '</b></div>' +
    '<div class="stat"><small>Total deductions</small><b style="color:var(--minus)">-' + money(T.cut) + '</b></div>';
  save();
}

document.getElementById("addBtn").addEventListener("click", function () {
  var n = document.getElementById("newName"), s = document.getElementById("newSalary");
  if (!n.value.trim() || num(s.value) <= 0) { toast("Please enter a name and a monthly salary."); return; }
  data.employees.push({ id: "e" + Date.now(), name: n.value.trim(), salary: num(s.value) });
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
  if (del) {
    var who = data.employees.filter(function (x) { return x.id === del; })[0];
    openDialog("Remove " + who.name + " and all their saved records?", null, "Remove", true, function () {
      data.employees = data.employees.filter(function (x) { return x.id !== del; });
      Object.keys(data.records).forEach(function (m) { delete data.records[m][del]; });
      render();
    });
  }
  if (edit) {
    var emp = data.employees.filter(function (x) { return x.id === edit; })[0];
    openDialog("New monthly salary for " + emp.name + " (₹)", emp.salary, "Save", false, function (v) {
      if (num(v) > 0) { emp.salary = num(v); render(); } else { toast("Please enter a valid salary."); }
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

document.getElementById("month").addEventListener("change", render);

document.getElementById("csvBtn").addEventListener("click", function () {
  if (!data.employees.length) { toast("Add an employee first."); return; }
  var lines = ["Employee,Monthly salary,Total absent leaves,Days present,Extra leaves,Total hrs expected,Total hrs given,Overtime hrs,Less hrs,Extra days present,Deducted for leaves,Added for overtime,Deducted for less hours,Advance payment,Incentive,Total salary"];
  data.employees.forEach(function (emp) {
    var r = getRecord(emp.id), c = calcFor(emp);
    lines.push(['"' + emp.name.replace(/"/g, '""') + '"', emp.salary, r.absent, c.present, r.leaves, c.expectedHours, c.givenHours, c.overtimeHours, c.lessHours, r.extraDays, c.leaveCut, c.overtimeAdd, c.lessCut, c.advance, c.incentive, c.total].join(","));
  });
  var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  var link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "salaries-" + monthKey() + ".csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

var now = new Date();
document.getElementById("month").value = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
render();
