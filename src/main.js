const STORAGE_KEY = "playFundApp.v2";
const SESSION_KEY = "playFundSession.v1";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const CONFIG = window.APP_CONFIG || {};
const FUND_ID = CONFIG.fundId || "quy-an-choi-demo";

const els = {
  loginScreen: document.querySelector("#loginScreen"),
  appShell: document.querySelector("#appShell"),
  loginForm: document.querySelector("#loginForm"),
  loginAccount: document.querySelector("#loginAccount"),
  loginPassword: document.querySelector("#loginPassword"),
  loginMessage: document.querySelector("#loginMessage"),
  currentUserName: document.querySelector("#currentUserName"),
  currentRole: document.querySelector("#currentRole"),
  dbStatus: document.querySelector("#dbStatus"),
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
  depositRequestForm: document.querySelector("#depositRequestForm"),
  requestAmount: document.querySelector("#requestAmount"),
  requestNote: document.querySelector("#requestNote"),
  depositRequestList: document.querySelector("#depositRequestList"),
  eventForm: document.querySelector("#eventForm"),
  eventName: document.querySelector("#eventName"),
  eventAmount: document.querySelector("#eventAmount"),
  guestAmount: document.querySelector("#guestAmount"),
  guestOwner: document.querySelector("#guestOwner"),
  splitMode: document.querySelector("#splitMode"),
  participantList: document.querySelector("#participantList"),
  eventPreview: document.querySelector("#eventPreview"),
  eventHistory: document.querySelector("#eventHistory"),
  ledger: document.querySelector("#ledger"),
  notificationList: document.querySelector("#notificationList"),
  resetDemo: document.querySelector("#resetDemo"),
};

let cloudClient = createCloudClient();
let cloudLoaded = false;
let cloudSaveTimer = null;
let cloudStatus = cloudClient ? "Đang chờ đồng bộ" : "Local demo";
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
    events: [],
    eventParticipants: [],
    depositRequests: [],
    notifications: [],
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  queueCloudSave();
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

async function loadSupabaseAuthSession() {
  if (!cloudClient) return false;
  const authResult = await cloudClient.auth.getSession();
  const authSession = authResult.data?.session;
  if (!authSession?.user) return false;
  return loadCloudProfile(authSession.user);
}

async function loadCloudProfile(user) {
  const { data, error } = await cloudClient
    .from("profiles")
    .select("*")
    .eq("fund_id", FUND_ID)
    .eq("user_id", user.id)
    .single();

  if (error) throw error;
  session = {
    role: data.role,
    name: data.display_name,
    email: data.email || user.email,
    memberId: data.member_id,
    userId: user.id,
    cloud: true,
  };
  return true;
}

function saveSession() {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function createCloudClient() {
  const url = (CONFIG.supabaseUrl || "").trim();
  const anonKey = (CONFIG.supabaseAnonKey || "").trim();
  if (!url || !anonKey || !window.supabase?.createClient) return null;
  return window.supabase.createClient(url, anonKey);
}

async function loadCloudState() {
  if (!cloudClient) {
    cloudStatus = "Local demo";
    return false;
  }

  try {
    cloudStatus = "Đang kết nối";
    renderDbStatus();

    const membersResult = await cloudClient
      .from("fund_members")
      .select("*")
      .eq("fund_id", FUND_ID)
      .order("created_at", { ascending: true });

    if (membersResult.error) throw membersResult.error;

    if (!membersResult.data.length) {
      cloudLoaded = true;
      cloudStatus = "Supabase/PostgreSQL";
      await saveCloudStateNow();
      return true;
    }

    const ledgerResult = await cloudClient
      .from("ledger_entries")
      .select("*")
      .eq("fund_id", FUND_ID)
      .order("created_at", { ascending: true });

    if (ledgerResult.error) throw ledgerResult.error;

    const requestResult = await cloudClient
      .from("deposit_requests")
      .select("*")
      .eq("fund_id", FUND_ID)
      .order("created_at", { ascending: true });

    if (requestResult.error) throw requestResult.error;

    const notificationResult = await cloudClient
      .from("notifications")
      .select("*")
      .eq("fund_id", FUND_ID)
      .order("created_at", { ascending: true });

    if (notificationResult.error) throw notificationResult.error;

    const eventsResult = await cloudClient
      .from("events")
      .select("*")
      .eq("fund_id", FUND_ID)
      .order("created_at", { ascending: true });

    if (eventsResult.error) throw eventsResult.error;

    let eventParticipants = [];
    if (eventsResult.data.length) {
      const participantsResult = await cloudClient
        .from("event_participants")
        .select("*")
        .in(
          "event_id",
          eventsResult.data.map((item) => item.id),
        );

      if (participantsResult.error) throw participantsResult.error;
      eventParticipants = participantsResult.data || [];
    }

    state = {
      members: membersResult.data.map(memberFromRow),
      ledger: ledgerResult.data.map(ledgerFromRow),
      depositRequests: requestResult.data.map(depositRequestFromRow),
      notifications: notificationResult.data.map(notificationFromRow),
      events: eventsResult.data.map(eventFromRow),
      eventParticipants: eventParticipants.map(eventParticipantFromRow),
    };
    if (session?.role === "member" && state.members[0]) {
      session.memberId = state.members[0].id;
      session.name = state.members[0].name;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    cloudLoaded = true;
    cloudStatus = "Supabase/PostgreSQL";
    return true;
  } catch (error) {
    console.error("Không kết nối được Supabase", error);
    cloudLoaded = false;
    cloudStatus = "Local demo (lỗi Supabase)";
    return false;
  }
}

function queueCloudSave() {
  if (!session || !isAdmin() || !cloudClient || !cloudLoaded) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => {
    saveCloudStateNow().catch((error) => {
      console.error("Không lưu được Supabase", error);
      cloudStatus = "Local demo (lỗi lưu)";
      renderDbStatus();
    });
  }, 350);
}

async function saveCloudStateNow() {
  if (!cloudClient) return;

  const fundResult = await cloudClient.from("funds").upsert({
    id: FUND_ID,
    name: "Quỹ Ăn Chơi",
    updated_at: new Date().toISOString(),
  });
  if (fundResult.error) throw fundResult.error;

  if (state.members.length) {
    const { error } = await cloudClient.from("fund_members").upsert(state.members.map(memberToRow));
    if (error) throw error;
  }

  if ((state.events || []).length) {
    const { error } = await cloudClient.from("events").upsert((state.events || []).map(eventToRow));
    if (error) throw error;
  }

  if (state.ledger.length) {
    const { error } = await cloudClient.from("ledger_entries").upsert(state.ledger.map(ledgerToRow));
    if (error) throw error;
  }

  if ((state.depositRequests || []).length) {
    const { error } = await cloudClient
      .from("deposit_requests")
      .upsert((state.depositRequests || []).map(depositRequestToRow));
    if (error) throw error;
  }

  if ((state.notifications || []).length) {
    const { error } = await cloudClient
      .from("notifications")
      .upsert((state.notifications || []).map(notificationToRow));
    if (error) throw error;
  }

  if ((state.eventParticipants || []).length) {
    const { error } = await cloudClient
      .from("event_participants")
      .upsert((state.eventParticipants || []).map(eventParticipantToRow));
    if (error) throw error;
  }

  cloudStatus = "Supabase/PostgreSQL";
  renderDbStatus();
}

function memberToRow(member) {
  return {
    id: member.id,
    fund_id: FUND_ID,
    name: member.name,
    wallet: member.wallet || null,
    code: member.code,
    created_at: new Date(member.createdAt || Date.now()).toISOString(),
  };
}

function memberFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    wallet: row.wallet || "",
    code: row.code,
    createdAt: new Date(row.created_at).getTime(),
  };
}

function ledgerToRow(entry) {
  return {
    id: entry.id,
    fund_id: FUND_ID,
    member_id: entry.memberId || null,
    type: entry.type,
    amount: entry.amount,
    note: entry.note || null,
    event_id: entry.eventId || null,
    event_name: entry.eventName || null,
    created_at: new Date(entry.createdAt || Date.now()).toISOString(),
  };
}

function ledgerFromRow(row) {
  return {
    id: row.id,
    type: row.type,
    memberId: row.member_id,
    amount: Number(row.amount) || 0,
    note: row.note || "",
    eventId: row.event_id || null,
    eventName: row.event_name || "",
    createdAt: new Date(row.created_at).getTime(),
  };
}

function depositRequestToRow(request) {
  return {
    id: request.id,
    fund_id: FUND_ID,
    member_id: request.memberId,
    amount: request.amount,
    note: request.note || null,
    status: request.status,
    reviewed_by: request.reviewedBy || null,
    ledger_entry_id: request.ledgerEntryId || null,
    created_at: new Date(request.createdAt || Date.now()).toISOString(),
    reviewed_at: request.reviewedAt ? new Date(request.reviewedAt).toISOString() : null,
  };
}

function depositRequestFromRow(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    amount: Number(row.amount) || 0,
    note: row.note || "",
    status: row.status,
    reviewedBy: row.reviewed_by || "",
    ledgerEntryId: row.ledger_entry_id || "",
    createdAt: new Date(row.created_at).getTime(),
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).getTime() : null,
  };
}

function notificationToRow(notification) {
  return {
    id: notification.id,
    fund_id: FUND_ID,
    member_id: notification.memberId || null,
    title: notification.title,
    body: notification.body,
    type: notification.type || "info",
    read_at: notification.readAt ? new Date(notification.readAt).toISOString() : null,
    created_at: new Date(notification.createdAt || Date.now()).toISOString(),
  };
}

function notificationFromRow(row) {
  return {
    id: row.id,
    memberId: row.member_id || null,
    title: row.title,
    body: row.body,
    type: row.type || "info",
    readAt: row.read_at ? new Date(row.read_at).getTime() : null,
    createdAt: new Date(row.created_at).getTime(),
  };
}

function eventToRow(item) {
  return {
    id: item.id,
    fund_id: FUND_ID,
    name: item.name,
    total_amount: item.totalAmount,
    guest_amount: item.guestAmount || 0,
    guest_owner_member_id: item.guestOwnerMemberId || null,
    split_mode: item.splitMode,
    created_by: item.createdBy || null,
    created_at: new Date(item.createdAt || Date.now()).toISOString(),
  };
}

function eventFromRow(row) {
  return {
    id: row.id,
    name: row.name,
    totalAmount: Number(row.total_amount) || 0,
    guestAmount: Number(row.guest_amount) || 0,
    guestOwnerMemberId: row.guest_owner_member_id || null,
    splitMode: row.split_mode,
    createdBy: row.created_by || "",
    createdAt: new Date(row.created_at).getTime(),
  };
}

function eventParticipantToRow(item) {
  return {
    event_id: item.eventId,
    member_id: item.memberId,
    charged_amount: item.chargedAmount,
    note: item.note || null,
  };
}

function eventParticipantFromRow(row) {
  return {
    eventId: row.event_id,
    memberId: row.member_id,
    chargedAmount: Number(row.charged_amount) || 0,
    note: row.note || "",
  };
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
  renderDbStatus();
  if (!session) return;
  renderStats();
  renderMemberOptions();
  renderMembers();
  renderParticipants();
  renderQrBoard();
  renderDepositRequests();
  renderEventPreview();
  renderEventHistory();
  renderLedger();
  renderNotifications();
}

function renderDbStatus() {
  if (els.dbStatus) {
    els.dbStatus.textContent = cloudStatus;
  }
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

}

function renderStats() {
  const totals = allTotals();
  const pendingLedger = state.ledger.filter((entry) => entry.type === "pending").length;
  const pendingRequests = (state.depositRequests || []).filter((request) => request.status === "pending").length;
  const pending = pendingLedger + pendingRequests;
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

function visibleDepositRequests() {
  const requests = state.depositRequests || [];
  if (isAdmin()) return requests;
  return requests.filter((request) => request.memberId === session?.memberId);
}

function renderDepositRequests() {
  if (!els.depositRequestList) return;
  const requests = visibleDepositRequests().sort((a, b) => b.createdAt - a.createdAt);
  if (!requests.length) {
    els.depositRequestList.innerHTML = `<div class="empty">Chưa có yêu cầu nộp quỹ nào.</div>`;
    return;
  }

  els.depositRequestList.innerHTML = requests
    .map((request) => {
      const member = memberById(request.memberId);
      const statusText =
        request.status === "approved" ? "Đã xác nhận" : request.status === "rejected" ? "Đã từ chối" : "Chờ xác nhận";
      const actions =
        isAdmin() && request.status === "pending"
          ? `
            <div class="pending-actions">
              <button type="button" data-approve-request="${request.id}">Xác nhận</button>
              <button class="ghost danger" type="button" data-reject-request="${request.id}">Từ chối</button>
            </div>
          `
          : "";
      return `
        <article class="ledger-row">
          <div>
            <strong>${escapeHtml(member?.name || "Không rõ thành viên")} báo đã chuyển ${money(request.amount)}</strong>
            <div class="ledger-meta">${statusText} - ${new Date(request.createdAt).toLocaleString("vi-VN")}</div>
            <div class="muted">${escapeHtml(request.note || "")}</div>
          </div>
          ${actions}
        </article>
      `;
    })
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

function eventParticipantsFor(eventId) {
  return (state.eventParticipants || []).filter((participant) => participant.eventId === eventId);
}

function visibleEvents() {
  const events = state.events || [];
  if (isAdmin()) return events;
  const memberId = session?.memberId;
  const eventIds = new Set(
    (state.eventParticipants || [])
      .filter((participant) => participant.memberId === memberId)
      .map((participant) => participant.eventId),
  );
  return events.filter((event) => eventIds.has(event.id));
}

function renderEventHistory() {
  if (!els.eventHistory) return;
  const events = visibleEvents().sort((a, b) => b.createdAt - a.createdAt);
  if (!events.length) {
    els.eventHistory.innerHTML = `<div class="empty">Chưa có buổi ăn/nhậu nào.</div>`;
    return;
  }

  els.eventHistory.innerHTML = events
    .map((event) => {
      const participants = eventParticipantsFor(event.id);
      const total = participants.reduce((sum, item) => sum + item.chargedAmount, 0);
      const detailRows = participants
        .map((participant) => {
          const member = memberById(participant.memberId);
          return `
            <div class="split-row">
              <div>
                <strong>${escapeHtml(member?.name || "Không rõ thành viên")}</strong>
                <div class="ledger-meta">${escapeHtml(participant.note || "Phần được phân bổ")}</div>
              </div>
              <strong>${money(participant.chargedAmount)}</strong>
            </div>
          `;
        })
        .join("");
      const adminActions = isAdmin()
        ? `
          <div class="pending-actions">
            <button class="ghost" type="button" data-rename-event="${event.id}">Sửa tên</button>
            <button class="ghost" type="button" data-adjust-event="${event.id}">Điều chỉnh tiền</button>
            <button class="ghost danger" type="button" data-delete-event="${event.id}">Xóa buổi</button>
          </div>
        `
        : "";
      return `
        <article class="event-card">
          <div class="ledger-row">
            <div>
              <strong>${escapeHtml(event.name)}</strong>
              <div class="ledger-meta">${new Date(event.createdAt).toLocaleString("vi-VN")} - ${participants.length} người - ${money(total)}</div>
            </div>
            ${adminActions}
          </div>
          <details>
            <summary>Xem chi tiết phân bổ</summary>
            <div class="event-detail">${detailRows}</div>
          </details>
        </article>
      `;
    })
    .join("");
}

function visibleNotifications() {
  const notifications = state.notifications || [];
  if (isAdmin()) return notifications;
  return notifications.filter((item) => !item.memberId || item.memberId === session?.memberId);
}

function renderNotifications() {
  if (!els.notificationList) return;
  const notifications = visibleNotifications().sort((a, b) => b.createdAt - a.createdAt);
  if (!notifications.length) {
    els.notificationList.innerHTML = `<div class="empty">Chưa có thông báo nào.</div>`;
    return;
  }

  els.notificationList.innerHTML = notifications
    .map(
      (notification) => `
        <article class="ledger-row">
          <div>
            <strong>${escapeHtml(notification.title)}</strong>
            <div class="ledger-meta">${new Date(notification.createdAt).toLocaleString("vi-VN")}</div>
            <div class="muted">${escapeHtml(notification.body)}</div>
          </div>
        </article>
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

function makeNotification(memberId, title, body, type = "event") {
  return {
    id: makeId("notification"),
    memberId,
    title,
    body,
    type,
    readAt: null,
    createdAt: Date.now(),
  };
}

async function addNotifications(notifications) {
  if (!notifications.length) return;
  state.notifications = state.notifications || [];
  state.notifications.push(...notifications);
  if (cloudClient && session?.cloud) {
    const { error } = await cloudClient.from("notifications").insert(notifications.map(notificationToRow));
    if (error) throw error;
  }
}

async function createDepositRequest(amount, note) {
  const request = {
    id: makeId("deposit_request"),
    memberId: session.memberId,
    amount: Number(amount) || 0,
    note: note || "",
    status: "pending",
    reviewedBy: "",
    ledgerEntryId: "",
    createdAt: Date.now(),
    reviewedAt: null,
  };

  state.depositRequests = state.depositRequests || [];
  state.depositRequests.push(request);

  if (cloudClient && session?.cloud) {
    const { error } = await cloudClient.from("deposit_requests").insert(depositRequestToRow(request));
    if (error) throw error;
  } else {
    saveState();
  }

  return request;
}

async function reviewDepositRequest(requestId, status) {
  if (!requireAdmin()) return;
  const request = (state.depositRequests || []).find((item) => item.id === requestId);
  if (!request || request.status !== "pending") return;

  request.status = status;
  request.reviewedBy = session.email;
  request.reviewedAt = Date.now();

  if (status === "approved") {
    const ledger = makeLedger(
      "deposit",
      request.memberId,
      request.amount,
      `Admin xác nhận yêu cầu nộp quỹ: ${request.note || "không ghi chú"}`,
    );
    request.ledgerEntryId = ledger.id;
    state.ledger.push(ledger);
  }

  if (cloudClient && session?.cloud) {
    if (status === "approved") {
      const ledger = state.ledger.find((entry) => entry.id === request.ledgerEntryId);
      const { error: ledgerError } = await cloudClient.from("ledger_entries").insert(ledgerToRow(ledger));
      if (ledgerError) throw ledgerError;
    }

    const { error: requestError } = await cloudClient
      .from("deposit_requests")
      .update(depositRequestToRow(request))
      .eq("id", request.id);
    if (requestError) throw requestError;
  } else {
    saveState();
  }

  render();
}

function recalculatedEventShares(eventId, newTotal) {
  const participants = eventParticipantsFor(eventId);
  if (!participants.length) return [];
  const baseShare = Math.floor(newTotal / participants.length);
  let remainder = newTotal - baseShare * participants.length;
  return participants.map((participant) => {
    let amount = baseShare;
    if (remainder > 0) {
      amount += 1;
      remainder -= 1;
    }
    return {
      ...participant,
      chargedAmount: amount,
      note: "Điều chỉnh lại sau khi admin sửa tổng tiền",
    };
  });
}

async function renameEvent(eventId) {
  if (!requireAdmin()) return;
  const event = (state.events || []).find((item) => item.id === eventId);
  if (!event) return;
  const newName = prompt("Tên buổi mới:", event.name);
  if (!newName || newName.trim() === event.name) return;

  const oldName = event.name;
  event.name = newName.trim();
  state.ledger
    .filter((entry) => entry.eventId === eventId)
    .forEach((entry) => {
      entry.eventName = event.name;
    });

  const participants = eventParticipantsFor(eventId);
  const notifications = participants.map((participant) =>
    makeNotification(
      participant.memberId,
      "Buổi ăn/nhậu được đổi tên",
      `Admin đổi "${oldName}" thành "${event.name}". Phần tiền của bạn không thay đổi.`,
    ),
  );

  if (cloudClient && session?.cloud) {
    const { error: eventError } = await cloudClient.from("events").update(eventToRow(event)).eq("id", eventId);
    if (eventError) throw eventError;
    const ledgerRows = state.ledger.filter((entry) => entry.eventId === eventId);
    if (ledgerRows.length) {
      const { error: ledgerError } = await cloudClient.from("ledger_entries").upsert(ledgerRows.map(ledgerToRow));
      if (ledgerError) throw ledgerError;
    }
  }

  await addNotifications(notifications);
  saveState();
  render();
}

async function adjustEventTotal(eventId) {
  if (!requireAdmin()) return;
  const event = (state.events || []).find((item) => item.id === eventId);
  if (!event) return;
  const currentTotal = eventParticipantsFor(eventId).reduce((sum, item) => sum + item.chargedAmount, 0);
  const raw = prompt("Nhập tổng tiền mới:", String(currentTotal || event.totalAmount || 0));
  if (!raw) return;
  const newTotal = Number(raw);
  if (!Number.isFinite(newTotal) || newTotal < 0) {
    alert("Số tiền không hợp lệ.");
    return;
  }

  const newShares = recalculatedEventShares(eventId, Math.round(newTotal));
  if (!newShares.length) return;

  event.totalAmount = Math.round(newTotal);
  event.guestAmount = 0;
  event.splitMode = "equal";

  state.eventParticipants = (state.eventParticipants || []).map((participant) => {
    const updated = newShares.find((share) => share.memberId === participant.memberId && share.eventId === eventId);
    return updated || participant;
  });

  state.ledger = state.ledger.map((entry) => {
    if (entry.eventId !== eventId || entry.type !== "event-share") return entry;
    const updated = newShares.find((share) => share.memberId === entry.memberId);
    if (!updated) return entry;
    return {
      ...entry,
      amount: updated.chargedAmount,
      note: updated.note,
      eventName: event.name,
    };
  });

  const notifications = newShares.map((share) =>
    makeNotification(
      share.memberId,
      "Buổi ăn/nhậu được điều chỉnh tiền",
      `Admin điều chỉnh "${event.name}". Phần mới của bạn là ${money(share.chargedAmount)}.`,
    ),
  );

  if (cloudClient && session?.cloud) {
    const { error: eventError } = await cloudClient.from("events").update(eventToRow(event)).eq("id", eventId);
    if (eventError) throw eventError;
    const { error: participantError } = await cloudClient
      .from("event_participants")
      .upsert(newShares.map(eventParticipantToRow));
    if (participantError) throw participantError;
    const ledgerRows = state.ledger.filter((entry) => entry.eventId === eventId);
    const { error: ledgerError } = await cloudClient.from("ledger_entries").upsert(ledgerRows.map(ledgerToRow));
    if (ledgerError) throw ledgerError;
  }

  await addNotifications(notifications);
  saveState();
  render();
}

async function deleteEvent(eventId) {
  if (!requireAdmin()) return;
  const event = (state.events || []).find((item) => item.id === eventId);
  if (!event) return;
  if (!confirm(`Xóa buổi "${event.name}" và hoàn lại phần tiền đã trừ?`)) return;

  const participants = eventParticipantsFor(eventId);
  const notifications = participants.map((participant) =>
    makeNotification(
      participant.memberId,
      "Buổi ăn/nhậu đã bị xóa",
      `Admin đã xóa "${event.name}". Phần tiền đã trừ của buổi này được gỡ khỏi số dư của bạn.`,
    ),
  );

  state.ledger = state.ledger.filter((entry) => entry.eventId !== eventId);
  state.eventParticipants = (state.eventParticipants || []).filter((participant) => participant.eventId !== eventId);
  state.events = (state.events || []).filter((item) => item.id !== eventId);

  if (cloudClient && session?.cloud) {
    const { error: ledgerError } = await cloudClient.from("ledger_entries").delete().eq("event_id", eventId);
    if (ledgerError) throw ledgerError;
    const { error: participantError } = await cloudClient.from("event_participants").delete().eq("event_id", eventId);
    if (participantError) throw participantError;
    const { error: eventError } = await cloudClient.from("events").delete().eq("id", eventId);
    if (eventError) throw eventError;
  }

  await addNotifications(notifications);
  saveState();
  render();
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
  els.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const account = demoAccounts()[els.loginAccount.value];
    if (!account) return;

    try {
      els.loginMessage.textContent = cloudClient ? "Đang đăng nhập Supabase..." : "";
      if (cloudClient) {
        const authResult = await cloudClient.auth.signInWithPassword({
          email: account.email,
          password: els.loginPassword.value,
        });
        if (authResult.error) throw authResult.error;
        await loadCloudProfile(authResult.data.user);
        await loadCloudState();
      } else {
        if (els.loginPassword.value !== account.password) {
          throw new Error("Sai tài khoản hoặc mật khẩu demo.");
        }
        session = {
          role: account.role,
          name: account.name,
          email: account.email,
          memberId: account.memberId,
          cloud: false,
        };
      }

      els.loginPassword.value = "";
      els.loginMessage.textContent = "";
      activateTab("members");
      render();
    } catch (error) {
      console.error(error);
      els.loginMessage.textContent = error.message || "Không đăng nhập được.";
    }
  });

  els.logoutButton.addEventListener("click", async () => {
    if (cloudClient) {
      await cloudClient.auth.signOut();
    }
    session = null;
    render();
  });

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
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

  els.bankForm?.addEventListener("submit", (event) => {
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

  els.depositRequestForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!isMember() || !session.memberId) {
      alert("Chức năng này chỉ dành cho tài khoản thành viên.");
      return;
    }
    try {
      await createDepositRequest(Number(els.requestAmount.value), els.requestNote.value);
      els.depositRequestForm.reset();
      await loadCloudState();
      render();
    } catch (error) {
      console.error(error);
      alert(error.message || "Không tạo được yêu cầu nộp quỹ.");
    }
  });

  els.depositRequestList?.addEventListener("click", async (event) => {
    const approveId = event.target.dataset.approveRequest;
    const rejectId = event.target.dataset.rejectRequest;
    try {
      if (approveId) await reviewDepositRequest(approveId, "approved");
      if (rejectId) await reviewDepositRequest(rejectId, "rejected");
    } catch (error) {
      console.error(error);
      alert(error.message || "Không xử lý được yêu cầu nộp quỹ.");
    }
  });

  els.eventHistory?.addEventListener("click", async (event) => {
    const renameId = event.target.dataset.renameEvent;
    const adjustId = event.target.dataset.adjustEvent;
    const deleteId = event.target.dataset.deleteEvent;
    try {
      if (renameId) await renameEvent(renameId);
      if (adjustId) await adjustEventTotal(adjustId);
      if (deleteId) await deleteEvent(deleteId);
    } catch (error) {
      console.error(error);
      alert(error.message || "Không xử lý được buổi ăn/nhậu.");
    }
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

  els.eventForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireAdmin()) return;
    const shares = calculateEventShares();
    if (!shares.length) {
      alert("Cần nhập tổng bill và chọn ít nhất một thành viên.");
      return;
    }
    const eventName = els.eventName.value.trim() || "Buổi ăn/nhậu";
    const eventId = makeId("event");
    state.events = state.events || [];
    state.eventParticipants = state.eventParticipants || [];
    state.events.push({
      id: eventId,
      name: eventName,
      totalAmount: Number(els.eventAmount.value) || 0,
      guestAmount: Number(els.guestAmount.value) || 0,
      guestOwnerMemberId: els.guestOwner.value || null,
      splitMode: els.splitMode.value,
      createdBy: session?.email || "",
      createdAt: Date.now(),
    });
    for (const share of shares) {
      state.eventParticipants.push({
        eventId,
        memberId: share.member.id,
        chargedAmount: share.amount,
        note: share.reason,
      });
      state.ledger.push(
        makeLedger("event-share", share.member.id, share.amount, share.reason, Date.now(), {
          eventId,
          eventName,
        }),
      );
    }
    await addNotifications(
      shares.map((share) =>
        makeNotification(
          share.member.id,
          "Bạn được phân bổ chi phí buổi ăn/nhậu",
          `Buổi "${eventName}" đã được tạo. Phần của bạn là ${money(share.amount)}.`,
        ),
      ),
    );
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

async function init() {
  if (cloudClient) {
    try {
      const restored = await loadSupabaseAuthSession();
      if (restored) {
        await loadCloudState();
      } else {
        session = null;
      }
    } catch (error) {
      console.error(error);
      session = null;
      cloudStatus = "Chưa đăng nhập Supabase";
    }
  } else if (session) {
    await loadCloudState();
  }
  render();
}

bindEvents();
init();
