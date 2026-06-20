const STORAGE_KEY = "playFundApp.v2";
const SESSION_KEY = "playFundSession.v1";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const els = {
  loginScreen: document.querySelector("#loginScreen"),
  appShell: document.querySelector("#appShell"),
  loginForm: document.querySelector("#loginForm"),
  loginAccount: document.querySelector("#loginAccount"),
  loginPassword: document.querySelector("#loginPassword"),
  loginMessage: document.querySelector("#loginMessage"),
  currentUserName: document.querySelector("#currentUserName"),
  currentRole: document.querySelector("#currentRole"),
  logoutButton: document.querySelector("#logoutButton"),
  totalFund: document.querySelector("#totalFund"),
  totalSpent: document.querySelector("#totalSpent"),
  memberCount: document.querySelector("#memberCount"),
  pendingCount: document.querySelector("#pendingCount"),
  memberForm: document.querySelector("#memberForm"),
  memberName: document.querySelector("#memberName"),
  memberWallet: document.querySelector("#memberWallet"),
  memberList: document.querySelector("#memberList"),
  depositForm: document.querySelector("#depositForm"),
  depositMember: document.querySelector("#depositMember"),
  depositAmount: document.querySelector("#depositAmount"),
  depositNote: document.querySelector("#depositNote"),
  bankForm: document.querySelector("#bankForm"),
  bankContent: document.querySelector("#bankContent"),
  bankAmount: document.querySelector("#bankAmount"),
  qrBoard: document.querySelector("#qrBoard"),
  eventForm: document.querySelector("#eventForm"),
  eventName: document.querySelector("#eventName"),
  eventAmount: document.querySelector("#eventAmount"),
  guestAmount: document.querySelector("#guestAmount"),
  guestOwner: document.querySelector("#guestOwner"),
  splitMode: document.querySelector("#splitMode"),
  participantList: document.querySelector("#participantList"),
  eventPreview: document.querySelector("#eventPreview"),
  ledger: document.querySelector("#ledger"),
  resetDemo: document.querySelector("#resetDemo"),
};

let state = loadState();
let session = loadSession();

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  const now = Date.now();
  const members = [
    makeMember("Minh", "MB Bank"),
    makeMember("Hiếu", "MoMo"),
    makeMember("Trang", "Techcombank"),
  ];

  return {
    members,
    ledger: [
      makeLedger("deposit", members[0].id, 500000, "Nộp quỹ ban đầu", now - 900000),
      makeLedger("deposit", members[1].id, 400000, "Nộp quỹ ban đầu", now - 800000),
      makeLedger("deposit", members[2].id, 300000, "Nộp quỹ ban đầu", now - 700000),
    ],
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function saveSession() {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function demoAccounts() {
  return {
    admin: {
      password: "admin123",
      role: "admin",
      name: "Quản trị quỹ",
      email: "admin@quy.local",
      memberId: null,
    },
    member: {
      password: "minh123",
      role: "member",
      name: "Minh",
      email: "minh@quy.local",
      memberId: state.members[0]?.id || null,
    },
  };
}

function makeId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function normalizeCode(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 12);
}

function makeMember(name, wallet) {
  const base = normalizeCode(name) || "TV";
  const suffix = String(Math.floor(10 + Math.random() * 89));
  return {
    id: makeId("member"),
    name: name.trim(),
    wallet: (wallet || "").trim(),
    code: `QAC${base}${suffix}`,
    createdAt: Date.now(),
  };
}

function makeLedger(type, memberId, amount, note, createdAt = Date.now(), extra = {}) {
  return {
    id: makeId("ledger"),
    type,
    memberId,
    amount: Number(amount) || 0,
    note: note || "",
    createdAt,
    ...extra,
  };
}

function money(value) {
  return currency.format(Math.round(Number(value) || 0)).replace(/\s?₫/, " đ");
}

function isAdmin() {
  return session?.role === "admin";
}

function isMember() {
  return session?.role === "member";
}

function visibleMembers() {
  if (isAdmin()) return state.members;
  return state.members.filter((member) => member.id === session?.memberId);
}

function visibleLedgerEntries() {
  if (isAdmin()) return state.ledger;
  return state.ledger.filter((entry) => entry.memberId === session?.memberId);
}

function memberById(id) {
  return state.members.find((member) => member.id === id);
}

function getMemberTotals(memberId) {
  return state.ledger.reduce(
    (totals, entry) => {
      if (entry.memberId !== memberId) return totals;
      if (entry.type === "deposit") totals.deposited += entry.amount;
      if (entry.type === "event-share") totals.spent += entry.amount;
      return totals;
    },
    { deposited: 0, spent: 0 },
  );
}

function allTotals() {
  return state.members.reduce(
    (totals, member) => {
      const memberTotals = getMemberTotals(member.id);
      totals.deposited += memberTotals.deposited;
      totals.spent += memberTotals.spent;
      return totals;
    },
    { deposited: 0, spent: 0 },
  );
}

function render() {
  saveState();
  saveSession();
  renderAuth();
  if (!session) return;
  renderStats();
  renderMemberOptions();
  renderMembers();
  renderParticipants();
  renderQrBoard();
  renderEventPreview();
  renderLedger();
}

function renderAuth() {
  const loggedIn = Boolean(session);
  els.loginScreen.hidden = loggedIn;
  els.appShell.hidden = !loggedIn;
  document.body.classList.toggle("is-admin", isAdmin());
  document.body.classList.toggle("is-member", isMember());

  if (!loggedIn) return;
  const roleText = isAdmin() ? "Admin" : "Thành viên";
  els.currentUserName.textContent = `${session.name} (${session.email})`;
  els.currentRole.textContent = roleText;

  if (isMember() && document.querySelector("#events.active")) {
    activateTab("members");
  }
}

function renderStats() {
  const totals = allTotals();
  const pending = state.ledger.filter((entry) => entry.type === "pending").length;
  els.totalFund.textContent = money(totals.deposited - totals.spent);
  els.totalSpent.textContent = money(totals.spent);
  els.memberCount.textContent = state.members.length;
  els.pendingCount.textContent = isAdmin() ? pending : "Ẩn";
}

function renderMemberOptions() {
  const optionHtml = state.members
    .map((member) => `<option value="${member.id}">${escapeHtml(member.name)}</option>`)
    .join("");

  els.depositMember.innerHTML = optionHtml;
  els.guestOwner.innerHTML = `<option value="">Không gán</option>${optionHtml}`;
}

function renderMembers() {
  const members = visibleMembers();
  if (!members.length) {
    els.memberList.innerHTML = `<div class="empty">Chưa có thành viên nào.</div>`;
    return;
  }

  els.memberList.innerHTML = members
    .map((member) => {
      const totals = getMemberTotals(member.id);
      const balance = totals.deposited - totals.spent;
      const balanceClass = balance < 0 ? "negative" : "positive";
      const removeButton = isAdmin()
        ? `<button class="ghost danger" type="button" data-remove-member="${member.id}">Xóa</button>`
        : "";
      return `
        <article class="member-card">
          <div class="member-top">
            <div>
              <p class="member-name">${escapeHtml(member.name)}</p>
              <div class="member-code">${escapeHtml(member.code)}</div>
            </div>
            ${removeButton}
          </div>
          <div class="balance ${balanceClass}">${money(balance)}</div>
          <div class="mini-stats">
            <span>Đã nộp <strong>${money(totals.deposited)}</strong></span>
            <span>Đã dùng <strong>${money(totals.spent)}</strong></span>
          </div>
          <div class="muted">${escapeHtml(member.wallet || "Chưa khai báo ví/ngân hàng")}</div>
        </article>
      `;
    })
    .join("");
}

function renderParticipants() {
  if (!state.members.length) {
    els.participantList.innerHTML = `<div class="empty">Thêm thành viên trước khi tạo buổi.</div>`;
    return;
  }

  els.participantList.innerHTML = state.members
    .map(
      (member) => `
        <label class="check-row">
          <input type="checkbox" name="participant" value="${member.id}" checked />
          <span>${escapeHtml(member.name)}</span>
        </label>
      `,
    )
    .join("");
}

function renderQrBoard() {
  const members = visibleMembers();
  if (!members.length) {
    els.qrBoard.innerHTML = `<div class="empty">Chưa có mã nạp để hiển thị.</div>`;
    return;
  }

  els.qrBoard.innerHTML = members
    .map(
      (member) => `
        <article class="qr-card">
          ${fakeQrSvg(member.code)}
          <div>
            <strong>${escapeHtml(member.name)}</strong>
            <div class="member-code">${escapeHtml(member.code)}</div>
          </div>
          <p class="hint">Nội dung chuyển khoản: ${escapeHtml(member.code)}</p>
          <button class="ghost copy-code" type="button" data-copy-code="${member.code}">Sao chép mã</button>
        </article>
      `,
    )
    .join("");
}

function fakeQrSvg(code) {
  const bits = Array.from(code).map((char) => char.charCodeAt(0));
  const cells = [];
  for (let y = 0; y < 9; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      const value = bits[(x + y * 3) % bits.length] + x * 11 + y * 17;
      if (value % 3 !== 0) {
        cells.push(`<rect x="${x * 10 + 14}" y="${y * 10 + 14}" width="8" height="8" rx="1" />`);
      }
    }
  }
  const finder = `
    <rect x="10" y="10" width="26" height="26" rx="3" fill="none" stroke="currentColor" stroke-width="5" />
    <rect x="82" y="10" width="26" height="26" rx="3" fill="none" stroke="currentColor" stroke-width="5" />
    <rect x="10" y="82" width="26" height="26" rx="3" fill="none" stroke="currentColor" stroke-width="5" />
  `;
  return `<svg class="qr-code" viewBox="0 0 118 118" role="img" aria-label="Mã nạp ${escapeHtml(code)}">${finder}<g fill="currentColor">${cells.join("")}</g></svg>`;
}

function renderEventPreview() {
  const shares = calculateEventShares();
  if (!shares.length) {
    els.eventPreview.innerHTML = `<div class="empty">Chọn thành viên và nhập tổng bill để xem trước phân bổ.</div>`;
    return;
  }

  els.eventPreview.innerHTML = shares
    .map(
      (share) => `
        <div class="split-row">
          <div>
            <strong>${escapeHtml(share.member.name)}</strong>
            <div class="ledger-meta">${escapeHtml(share.reason)}</div>
          </div>
          <strong>${money(share.amount)}</strong>
        </div>
      `,
    )
    .join("");
}

function renderLedger() {
  const entries = visibleLedgerEntries();
  if (!entries.length) {
    els.ledger.innerHTML = `<div class="empty">Chưa có lịch sử giao dịch.</div>`;
    return;
  }

  els.ledger.innerHTML = [...entries]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((entry) => {
      const member = memberById(entry.memberId);
      const sign = entry.type === "deposit" ? "+" : entry.type === "event-share" ? "-" : "";
      const amountClass = entry.type === "deposit" ? "in" : entry.type === "pending" ? "pending" : "out";
      const title =
        entry.type === "deposit"
          ? "Nộp quỹ"
          : entry.type === "event-share"
            ? `Chi phí: ${entry.eventName || "Buổi ăn/nhậu"}`
            : "Chưa nhận diện";
      return `
        <article class="ledger-row">
          <div>
            <strong>${title}</strong>
            <div class="ledger-meta">
              ${member ? escapeHtml(member.name) : "Không rõ thành viên"} - ${new Date(entry.createdAt).toLocaleString("vi-VN")}
            </div>
            <div class="muted">${escapeHtml(entry.note || "")}</div>
          </div>
          <div class="ledger-amount ${amountClass}">${sign}${money(entry.amount)}</div>
        </article>
      `;
    })
    .join("");
}

function selectedParticipantIds() {
  return Array.from(document.querySelectorAll('input[name="participant"]:checked')).map((input) => input.value);
}

function calculateEventShares() {
  const total = Number(els.eventAmount.value) || 0;
  const guestAmount = Number(els.guestAmount.value) || 0;
  const participantIds = selectedParticipantIds();
  if (!total || !participantIds.length) return [];

  const participants = participantIds.map(memberById).filter(Boolean);
  const guestOwner = memberById(els.guestOwner.value);
  const mode = els.splitMode.value;
  let baseTotal = total;
  const shares = [];

  if (mode === "equal" && guestAmount > 0) {
    baseTotal = Math.max(0, total - guestAmount);
  }

  const baseShare = Math.floor(baseTotal / participants.length);
  let remainder = baseTotal - baseShare * participants.length;

  for (const member of participants) {
    let amount = baseShare;
    if (remainder > 0) {
      amount += 1;
      remainder -= 1;
    }
    shares.push({
      member,
      amount,
      reason: mode === "equal" ? "Chia đều sau khi trừ tiền khách lạ" : "Chia đều tổng bill",
    });
  }

  if (mode === "owner-pays-guest" && guestOwner && guestAmount > 0) {
    const ownerShare = shares.find((share) => share.member.id === guestOwner.id);
    if (ownerShare) {
      ownerShare.amount += guestAmount;
      ownerShare.reason = `${ownerShare.reason}, cộng phần khách lạ ${money(guestAmount)}`;
    } else {
      shares.push({
        member: guestOwner,
        amount: guestAmount,
        reason: "Trả riêng phần khách lạ được gán",
      });
    }
  }

  return shares;
}

function addDeposit(memberId, amount, note) {
  state.ledger.push(makeLedger("deposit", memberId, amount, note));
}

function activateTab(tabId) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabId));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
}

function requireAdmin() {
  if (isAdmin()) return true;
  alert("Chức năng này chỉ dành cho tài khoản quản trị.");
  return false;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function bindEvents() {
  els.loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const account = demoAccounts()[els.loginAccount.value];
    if (!account || els.loginPassword.value !== account.password) {
      els.loginMessage.textContent = "Sai tài khoản hoặc mật khẩu demo.";
      return;
    }
    session = {
      role: account.role,
      name: account.name,
      email: account.email,
      memberId: account.memberId,
    };
    els.loginPassword.value = "";
    els.loginMessage.textContent = "";
    activateTab("members");
    render();
  });

  els.logoutButton.addEventListener("click", () => {
    session = null;
    render();
  });

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.tab === "events" && !requireAdmin()) return;
      activateTab(button.dataset.tab);
      renderEventPreview();
    });
  });

  els.memberForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!requireAdmin()) return;
    const name = els.memberName.value.trim();
    if (!name) return;
    state.members.push(makeMember(name, els.memberWallet.value));
    els.memberForm.reset();
    render();
  });

  els.memberList.addEventListener("click", (event) => {
    const id = event.target.dataset.removeMember;
    if (!id || !requireAdmin()) return;
    const hasLedger = state.ledger.some((entry) => entry.memberId === id);
    if (hasLedger) {
      alert("Thành viên đã có giao dịch, không nên xóa để giữ lịch sử. Bản thật nên dùng trạng thái 'ngừng tham gia'.");
      return;
    }
    state.members = state.members.filter((member) => member.id !== id);
    render();
  });

  els.depositForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!requireAdmin()) return;
    addDeposit(els.depositMember.value, Number(els.depositAmount.value), els.depositNote.value || "Nộp quỹ thủ công");
    els.depositForm.reset();
    render();
  });

  els.bankForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!requireAdmin()) return;
    const content = els.bankContent.value.toUpperCase();
    const amount = Number(els.bankAmount.value) || 0;
    const member = state.members.find((item) => content.includes(item.code));
    if (member) {
      addDeposit(member.id, amount, `Tự nhận diện sao kê: ${els.bankContent.value}`);
    } else {
      state.ledger.push(makeLedger("pending", null, amount, `Không tìm thấy mã nạp trong: ${els.bankContent.value}`));
    }
    els.bankForm.reset();
    render();
  });

  els.qrBoard.addEventListener("click", async (event) => {
    const code = event.target.dataset.copyCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      event.target.textContent = "Đã sao chép";
      setTimeout(() => {
        event.target.textContent = "Sao chép mã";
      }, 1000);
    } catch {
      alert(code);
    }
  });

  ["input", "change"].forEach((eventName) => {
    els.eventForm.addEventListener(eventName, renderEventPreview);
  });

  els.eventForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!requireAdmin()) return;
    const shares = calculateEventShares();
    if (!shares.length) {
      alert("Cần nhập tổng bill và chọn ít nhất một thành viên.");
      return;
    }
    const eventName = els.eventName.value.trim() || "Buổi ăn/nhậu";
    for (const share of shares) {
      state.ledger.push(
        makeLedger("event-share", share.member.id, share.amount, share.reason, Date.now(), {
          eventName,
        }),
      );
    }
    els.eventForm.reset();
    render();
  });

  els.resetDemo.addEventListener("click", () => {
    if (!requireAdmin()) return;
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    if (session?.role === "member") {
      session.memberId = state.members[0]?.id || null;
    }
    render();
  });
}

bindEvents();
render();
