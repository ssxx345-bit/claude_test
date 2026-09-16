(() => {
  "use strict";

  const STORAGE_KEY = "todo-reminder:tasks";
  const THEME_KEY = "todo-reminder:theme";
  const NOTIFIED_KEY = "todo-reminder:notified";

  const CATEGORY_LABEL = { work: "工作", life: "生活", daily: "日常" };
  const CATEGORY_COLOR = { work: "#0095E9", life: "#2fb344", daily: "#f5a623" };
  const PRIORITY_LABEL = { high: "高", medium: "中", low: "低" };
  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

  /** @type {Array<Object>} */
  let tasks = loadTasks();
  let notifiedIds = loadNotified();
  let currentFilter = "all";
  let currentSort = "due";
  let searchTerm = "";
  let editingId = null;

  // ---------- Storage ----------
  function loadTasks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  function saveTasks() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }
  function loadNotified() {
    try {
      const raw = localStorage.getItem(NOTIFIED_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  }
  function saveNotified() {
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...notifiedIds]));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- Due date helpers ----------
  function getDueTimestamp(task) {
    if (!task.dueDate) return null;
    const time = task.dueTime || "23:59";
    const iso = `${task.dueDate}T${time}:00`;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  function isOverdue(task) {
    if (task.done) return false;
    const ts = getDueTimestamp(task);
    return ts !== null && ts < Date.now();
  }

  function isDueToday(task) {
    if (!task.dueDate) return false;
    const today = new Date();
    const [y, m, d] = task.dueDate.split("-").map(Number);
    return y === today.getFullYear() && m === today.getMonth() + 1 && d === today.getDate();
  }

  function formatDue(task) {
    if (!task.dueDate) return "";
    const [y, m, d] = task.dueDate.split("-").map(Number);
    let str = `${m}/${d}`;
    if (task.dueTime) str += ` ${task.dueTime}`;
    return str;
  }

  // ---------- Rendering ----------
  const listEl = document.getElementById("todoList");
  const emptyStateEl = document.getElementById("emptyState");
  const statsBarEl = document.getElementById("statsBar");

  function getFilteredSortedTasks() {
    let list = tasks.slice();

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (t) => t.title.toLowerCase().includes(q) || (t.notes || "").toLowerCase().includes(q)
      );
    }

    switch (currentFilter) {
      case "today":
        list = list.filter((t) => !t.done && isDueToday(t));
        break;
      case "overdue":
        list = list.filter((t) => isOverdue(t));
        break;
      case "done":
        list = list.filter((t) => t.done);
        break;
      case "work":
      case "life":
      case "daily":
        list = list.filter((t) => t.category === currentFilter && !t.done);
        break;
      case "all":
      default:
        list = list.filter((t) => !t.done);
        break;
    }

    list.sort((a, b) => {
      if (currentSort === "priority") {
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      }
      if (currentSort === "created") {
        return b.createdAt - a.createdAt;
      }
      // due
      const da = getDueTimestamp(a);
      const db = getDueTimestamp(b);
      if (da === null && db === null) return b.createdAt - a.createdAt;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });

    return list;
  }

  function render() {
    const list = getFilteredSortedTasks();
    listEl.innerHTML = "";

    emptyStateEl.hidden = list.length !== 0;

    for (const task of list) {
      listEl.appendChild(renderItem(task));
    }

    renderStats();
  }

  function renderItem(task) {
    const li = document.createElement("li");
    li.className = "todo-item" + (task.done ? " done" : "") + (isOverdue(task) ? " overdue" : "");
    li.style.setProperty("--cat-color", CATEGORY_COLOR[task.category] || "#0095E9");
    li.dataset.id = task.id;

    const checkBtn = document.createElement("button");
    checkBtn.className = "check-btn";
    checkBtn.type = "button";
    checkBtn.textContent = "✓";
    checkBtn.setAttribute("aria-label", task.done ? "標記為未完成" : "標記為完成");
    checkBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleDone(task.id);
    });

    const main = document.createElement("div");
    main.className = "todo-main";

    const title = document.createElement("div");
    title.className = "todo-title";
    title.textContent = task.title;

    const meta = document.createElement("div");
    meta.className = "todo-meta";

    const catBadge = document.createElement("span");
    catBadge.className = "badge";
    catBadge.textContent = CATEGORY_LABEL[task.category] || task.category;
    meta.appendChild(catBadge);

    const prioBadge = document.createElement("span");
    prioBadge.className = `badge priority-${task.priority}`;
    prioBadge.textContent = `優先度：${PRIORITY_LABEL[task.priority]}`;
    meta.appendChild(prioBadge);

    if (task.dueDate) {
      const dueBadge = document.createElement("span");
      dueBadge.className = "badge" + (isOverdue(task) ? " due-overdue" : "");
      dueBadge.textContent = (isOverdue(task) ? "⏰ 已逾期 " : "📅 ") + formatDue(task);
      meta.appendChild(dueBadge);
    }

    if (task.repeat && task.repeat !== "none") {
      const repeatBadge = document.createElement("span");
      repeatBadge.className = "badge";
      const repeatLabel = { daily: "每天", weekly: "每週", monthly: "每月" }[task.repeat];
      repeatBadge.textContent = "🔁 " + repeatLabel;
      meta.appendChild(repeatBadge);
    }

    main.appendChild(title);
    main.appendChild(meta);

    li.appendChild(checkBtn);
    li.appendChild(main);

    li.addEventListener("click", () => openEditModal(task.id));

    return li;
  }

  function renderStats() {
    const pending = tasks.filter((t) => !t.done).length;
    const overdue = tasks.filter((t) => isOverdue(t)).length;
    const today = tasks.filter((t) => !t.done && isDueToday(t)).length;
    const done = tasks.filter((t) => t.done).length;

    statsBarEl.innerHTML = "";
    const items = [
      ["待辦中", pending],
      ["今天到期", today],
      ["已逾期", overdue],
      ["已完成", done],
    ];
    for (const [label, count] of items) {
      const chip = document.createElement("div");
      chip.className = "stat-chip";
      chip.innerHTML = `<b>${count}</b>${label}`;
      statsBarEl.appendChild(chip);
    }
  }

  // ---------- Actions ----------
  function toggleDone(id) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    task.done = !task.done;

    if (task.done && task.repeat && task.repeat !== "none" && task.dueDate) {
      // spawn next occurrence
      const next = computeNextOccurrence(task);
      if (next) {
        tasks.push(next);
      }
    }

    saveTasks();
    render();
  }

  function computeNextOccurrence(task) {
    const [y, m, d] = task.dueDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    if (task.repeat === "daily") date.setDate(date.getDate() + 1);
    else if (task.repeat === "weekly") date.setDate(date.getDate() + 7);
    else if (task.repeat === "monthly") date.setMonth(date.getMonth() + 1);
    else return null;

    const pad = (n) => String(n).padStart(2, "0");
    const newDueDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

    return {
      ...task,
      id: uid(),
      dueDate: newDueDate,
      done: false,
      createdAt: Date.now(),
    };
  }

  function deleteTask(id) {
    tasks = tasks.filter((t) => t.id !== id);
    notifiedIds.delete(id);
    saveTasks();
    saveNotified();
    render();
  }

  function upsertTaskFromForm() {
    const title = titleInput.value.trim();
    if (!title) return;

    const data = {
      title,
      notes: notesInput.value.trim(),
      category: categoryInput.value,
      priority: priorityInput.value,
      dueDate: dueDateInput.value || null,
      dueTime: dueTimeInput.value || null,
      repeat: repeatInput.value,
      remind: remindInput.checked,
    };

    if (editingId) {
      const task = tasks.find((t) => t.id === editingId);
      if (task) {
        Object.assign(task, data);
        notifiedIds.delete(task.id); // allow re-notify if due date changed
      }
    } else {
      tasks.push({
        id: uid(),
        done: false,
        createdAt: Date.now(),
        ...data,
      });
    }

    saveTasks();
    saveNotified();
    render();
    closeModal();
  }

  // ---------- Modal ----------
  const modalOverlay = document.getElementById("modalOverlay");
  const modalTitle = document.getElementById("modalTitle");
  const todoForm = document.getElementById("todoForm");
  const titleInput = document.getElementById("titleInput");
  const notesInput = document.getElementById("notesInput");
  const categoryInput = document.getElementById("categoryInput");
  const priorityInput = document.getElementById("priorityInput");
  const dueDateInput = document.getElementById("dueDateInput");
  const dueTimeInput = document.getElementById("dueTimeInput");
  const repeatInput = document.getElementById("repeatInput");
  const remindInput = document.getElementById("remindInput");
  const deleteBtn = document.getElementById("deleteBtn");

  function openAddModal() {
    editingId = null;
    modalTitle.textContent = "新增待辦";
    todoForm.reset();
    priorityInput.value = "medium";
    categoryInput.value = "work";
    remindInput.checked = true;
    deleteBtn.hidden = true;
    modalOverlay.hidden = false;
    setTimeout(() => titleInput.focus(), 50);
  }

  function openEditModal(id) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    editingId = id;
    modalTitle.textContent = "編輯待辦";
    titleInput.value = task.title;
    notesInput.value = task.notes || "";
    categoryInput.value = task.category;
    priorityInput.value = task.priority;
    dueDateInput.value = task.dueDate || "";
    dueTimeInput.value = task.dueTime || "";
    repeatInput.value = task.repeat || "none";
    remindInput.checked = task.remind !== false;
    deleteBtn.hidden = false;
    modalOverlay.hidden = false;
    setTimeout(() => titleInput.focus(), 50);
  }

  function closeModal() {
    modalOverlay.hidden = true;
    editingId = null;
  }

  document.getElementById("fab").addEventListener("click", openAddModal);
  document.getElementById("modalClose").addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeModal();
  });
  todoForm.addEventListener("submit", (e) => {
    e.preventDefault();
    upsertTaskFromForm();
  });
  deleteBtn.addEventListener("click", () => {
    if (editingId && confirm("確定要刪除這筆待辦事項嗎？")) {
      deleteTask(editingId);
      closeModal();
    }
  });

  // ---------- Filters / search / sort ----------
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentFilter = tab.dataset.filter;
      render();
    });
  });

  document.getElementById("searchInput").addEventListener("input", (e) => {
    searchTerm = e.target.value.trim();
    render();
  });

  document.getElementById("sortSelect").addEventListener("change", (e) => {
    currentSort = e.target.value;
    render();
  });

  // ---------- Theme ----------
  const themeToggle = document.getElementById("themeToggle");
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) {
      applyTheme(saved);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      applyTheme("dark");
    }
  }
  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(current);
  });

  // ---------- Notifications ----------
  const toastEl = document.getElementById("toast");
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (toastEl.hidden = true), 3500);
  }

  function requestNotifyPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  function checkDueReminders() {
    const now = Date.now();
    for (const task of tasks) {
      if (task.done || !task.remind || task.remind === false) continue;
      const ts = getDueTimestamp(task);
      if (ts === null) continue;
      if (ts <= now && !notifiedIds.has(task.id)) {
        notifiedIds.add(task.id);
        fireNotification(task);
      }
    }
    saveNotified();
  }

  function fireNotification(task) {
    const body = `${CATEGORY_LABEL[task.category]} · 優先度 ${PRIORITY_LABEL[task.priority]}${
      task.notes ? "\n" + task.notes : ""
    }`;
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("⏰ 待辦到期：" + task.title, { body });
      } catch {
        showToast("⏰ 待辦到期：" + task.title);
      }
    } else {
      showToast("⏰ 待辦到期：" + task.title);
    }
  }

  // ---------- Init ----------
  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  function init() {
    initTheme();
    render();
    requestNotifyPermission();
    checkDueReminders();
    setInterval(checkDueReminders, 30 * 1000);
    registerServiceWorker();
  }

  init();
})();
