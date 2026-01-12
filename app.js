const STORAGE_KEY = "vet_system_v1";

let state = {
  queue: [],
  schedule: []
};



function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    state = JSON.parse(raw);
  } catch (e) {
    console.warn("Storage corrompido, resetando...", e);
    state = { queue: [], schedule: [] };
    saveState();
  }

  
  if (Array.isArray(state.schedule)) {
    for (const p of state.schedule) {
      if (!p.availability) p.availability = "all"; 
      if (p.availability === "date" && !p.workDate) p.availability = "all";
      if (p.availability === "weekday" && (p.weekday === undefined || p.weekday === null)) p.availability = "all";
    }
  }
}

function uid() {
  return crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}



const PRIORITY_WEIGHT = { "Emergência": 3, "Urgente": 2, "Rotina": 1 };
const SHIFT_WEIGHT = { "Manhã": 1, "Tarde": 2, "Noite": 3 };

function toDateKey(dateStr) {
  if (!dateStr) return Number.MAX_SAFE_INTEGER;
  const t = Date.parse(dateStr);
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}


function compareQueue(a, b) {
  const da = toDateKey(a.date);
  const db = toDateKey(b.date);
  if (da !== db) return da - db;

  const sa = SHIFT_WEIGHT[a.shift] ?? 99;
  const sb = SHIFT_WEIGHT[b.shift] ?? 99;
  if (sa !== sb) return sa - sb;

  const pa = PRIORITY_WEIGHT[a.priority] ?? 0;
  const pb = PRIORITY_WEIGHT[b.priority] ?? 0;
  if (pb !== pa) return pb - pa;

  return new Date(a.createdAt) - new Date(b.createdAt);
}



function getWeekdayFromDateStr(dateStr) {
  
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return null;
  return new Date(t).getDay(); 
}

function isProfessionalAvailableOnDate(prof, dateStr) {
 
  const availability = prof.availability || "all";

  if (availability === "all") return true;

  if (availability === "date") {
    return Boolean(prof.workDate) && prof.workDate === dateStr;
  }

  if (availability === "weekday") {
    const wd = getWeekdayFromDateStr(dateStr);
    if (wd === null) return false;
    return Number(prof.weekday) === wd;
  }

  return true;
}

function getProfessionalLabelById(id) {
  const p = state.schedule.find(x => x.id === id);
  if (!p) return "Não atribuído";
  return `${p.staff} (${p.role} - ${p.shift})`;
}



function getProfessionalsAvailable(dateStr, shift) {
  return state.schedule.filter(p => {
    if (p.shift !== shift) return false;
    return isProfessionalAvailableOnDate(p, dateStr);
  });
}

function populateProfessionalsSelect(dateStr, shift) {
  const select = document.getElementById("intake-professional");
  if (!select) return;

  const pros = getProfessionalsAvailable(dateStr, shift);
  select.innerHTML = "";

  if (!dateStr) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Escolha a data primeiro";
    select.appendChild(opt);
    select.disabled = true;
    return;
  }

  if (pros.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = `Nenhum profissional disponível em ${dateStr} (${shift})`;
    select.appendChild(opt);
    select.disabled = true;
    return;
  }

  select.disabled = false;

  const first = document.createElement("option");
  first.value = "";
  first.textContent = "Selecione";
  select.appendChild(first);

  for (const prof of pros) {
    const opt = document.createElement("option");
    opt.value = prof.id;
    opt.textContent = `${prof.staff} (${prof.role})`;
    select.appendChild(opt);
  }
}



function renderQueue() {
  const grid = document.getElementById("queue-grid");
  if (!grid) return;

  grid.innerHTML = "";

  for (const item of state.queue) {
    const card = document.createElement("div");
    card.className = "queue-card";

    card.innerHTML = `
      <strong>${item.pet}</strong>
      <div>${item.tutor}</div>
      <small>
        ${item.priority} • ${item.service}<br>
        📅 ${item.date || "Sem data"} • 🕒 ${item.shift}<br>
        👨‍⚕️ ${getProfessionalLabelById(item.professionalId)}
      </small>
      <button data-id="${item.id}" class="remove-queue">Remover</button>
    `;

    grid.appendChild(card);
  }

  grid.querySelectorAll(".remove-queue").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      state.queue = state.queue.filter(x => x.id !== id);
      saveState();
      renderQueue();
      renderMetrics();
      renderAiQueue();
    });
  });
}



function formatAvailability(prof) {
  const a = prof.availability || "all";
  if (a === "all") return "Todos os dias";
  if (a === "date") return `Dia: ${prof.workDate || "-"}`;
  if (a === "weekday") {
    const names = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    return `Semanal: ${names[Number(prof.weekday)] ?? "-"}`;
  }
  return "Todos os dias";
}

function renderSchedule() {
  const list = document.getElementById("schedule-list");
  if (!list) return;

  list.innerHTML = "";

  for (const item of state.schedule) {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${item.staff}</strong> — ${item.role} (${item.shift})
      <small style="display:block;opacity:.8;">${formatAvailability(item)}</small>
      <button data-id="${item.id}" class="remove-schedule">Remover</button>
    `;
    list.appendChild(li);
  }

  list.querySelectorAll(".remove-schedule").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      state.schedule = state.schedule.filter(x => x.id !== id);
      saveState();
      renderSchedule();
      renderMetrics();
      refreshProfessionalsFromIntake();
    });
  });
}



function renderMetrics() {
  const attend = document.getElementById("metric-attendances");
  const surgeries = document.getElementById("metric-surgeries");
  const staff = document.getElementById("metric-staff");

  if (attend) attend.textContent = state.queue.length;
  if (surgeries) surgeries.textContent = state.queue.filter(x => x.service === "Cirurgia").length;
  if (staff) staff.textContent = state.schedule.length;
}



function renderAiQueue() {
  const list = document.getElementById("ai-queue");
  if (!list) return;

  const ordered = [...state.queue].sort(compareQueue);
  list.innerHTML = "";

  for (const item of ordered) {
    const li = document.createElement("li");
    li.textContent = `📅 ${item.date || "Sem data"} • 🕒 ${item.shift} • ${item.priority} — ${item.pet} • ${item.service} • ${getProfessionalLabelById(item.professionalId)}`;
    list.appendChild(li);
  }
}

function handleAiSortClick() {
  state.queue.sort(compareQueue);
  saveState();
  renderQueue();
  renderMetrics();
  renderAiQueue();
}



function setDefaultIntakeDateToday() {
  const dateInput = document.getElementById("intake-date");
  if (!dateInput) return;
  if (dateInput.value) return;

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  dateInput.value = `${yyyy}-${mm}-${dd}`;
}

function refreshProfessionalsFromIntake() {
  const dateInput = document.getElementById("intake-date");
  const shiftSelect = document.getElementById("intake-shift");
  if (!dateInput || !shiftSelect) return;
  populateProfessionalsSelect(dateInput.value, shiftSelect.value);
}

function updateScheduleAvailabilityUI() {
  const sel = document.getElementById("schedule-availability");
  const dateWrap = document.getElementById("schedule-date-wrap");
  const weekWrap = document.getElementById("schedule-weekday-wrap");
  if (!sel || !dateWrap || !weekWrap) return;

  const v = sel.value;
  dateWrap.style.display = (v === "date") ? "" : "none";
  weekWrap.style.display = (v === "weekday") ? "" : "none";
}

function setupForms() {
  const intakeForm = document.getElementById("intake-form");
  const scheduleForm = document.getElementById("schedule-form");

  if (intakeForm) {
    intakeForm.addEventListener("submit", e => {
      e.preventDefault();
      const fd = new FormData(intakeForm);

      const date = String(fd.get("date") || "").trim();
      const shift = String(fd.get("shift") || "").trim();
      const professionalId = String(fd.get("professional") || "").trim();

      const valid = getProfessionalsAvailable(date, shift).some(p => p.id === professionalId);
      if (!valid) {
        alert("Nenhum profissional válido para esta data e turno (ou você selecionou um profissional fora da disponibilidade).");
        return;
      }

      const item = {
        id: uid(),
        tutor: String(fd.get("tutor")).trim(),
        pet: String(fd.get("pet")).trim(),
        priority: String(fd.get("priority")),
        service: String(fd.get("service")),
        date,
        shift,
        professionalId,
        createdAt: new Date().toISOString()
      };

      state.queue.push(item);
      saveState();

      renderQueue();
      renderMetrics();
      renderAiQueue();

      intakeForm.reset();
      setDefaultIntakeDateToday();
      refreshProfessionalsFromIntake();
    });
  }

  if (scheduleForm) {
    scheduleForm.addEventListener("submit", e => {
      e.preventDefault();
      const fd = new FormData(scheduleForm);

      const availability = String(fd.get("availability") || "all");
      const workDate = String(fd.get("workDate") || "").trim();
      const weekdayRaw = fd.get("weekday");
      const weekday = (weekdayRaw === null || weekdayRaw === undefined) ? "" : String(weekdayRaw);

      
      if (availability === "date" && !workDate) {
        alert("Selecione a data para 'Dia específico'.");
        return;
      }
      if (availability === "weekday" && (weekday === "")) {
        alert("Selecione o dia da semana.");
        return;
      }

      const item = {
        id: uid(),
        staff: String(fd.get("staff")).trim(),
        role: String(fd.get("role")).trim(),
        shift: String(fd.get("shift")),
        availability,        
        workDate: availability === "date" ? workDate : "",
        weekday: availability === "weekday" ? Number(weekday) : null,
        createdAt: new Date().toISOString()
      };

      state.schedule.push(item);
      saveState();

      renderSchedule();
      renderMetrics();
      refreshProfessionalsFromIntake();

      scheduleForm.reset();
      updateScheduleAvailabilityUI();
    });
  }
}



document.addEventListener("DOMContentLoaded", () => {
  loadState();
  setupForms();

  renderQueue();
  renderSchedule();
  renderMetrics();
  renderAiQueue();


  setDefaultIntakeDateToday();

  
  const dateInput = document.getElementById("intake-date");
  const shiftSelect = document.getElementById("intake-shift");
  if (dateInput) dateInput.addEventListener("change", refreshProfessionalsFromIntake);
  if (shiftSelect) shiftSelect.addEventListener("change", refreshProfessionalsFromIntake);


  refreshProfessionalsFromIntake();

  
  const sortBtn = document.getElementById("ai-sort");
  if (sortBtn) sortBtn.addEventListener("click", handleAiSortClick);

  // pergunta pro léo
  const availabilitySel = document.getElementById("schedule-availability");
  if (availabilitySel) {
    availabilitySel.addEventListener("change", updateScheduleAvailabilityUI);
    updateScheduleAvailabilityUI();
  }
});
