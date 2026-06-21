const STORAGE_KEY = "playFundApp.v2";
const SESSION_KEY = "playFundSession.v1";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const CONFIG = window.APP_CONFIG || {};
const DEFAULT_FUND_ID = CONFIG.fundId || "quy-an-choi-demo";

const els = {
  loginScreen: document.querySelector("#loginScreen"),
  appShell: document.querySelector("#appShell"),
  loginForm: document.querySelector("#loginForm"),
  loginEmail: document.querySelector("#loginEmail"),
  loginPassword: document.querySelector("#loginPassword"),
  loginMessage: document.querySelector("#loginMessage"),
  ownerSignupForm: document.querySelector("#ownerSignupForm"),
  ownerName: document.querySelector("#ownerName"),
  ownerEmail: document.querySelector("#ownerEmail"),
  ownerPassword: document.querySelector("#ownerPassword"),
  ownerFundName: document.querySelector("#ownerFundName"),
  ownerSignupMessage: document.querySelector("#ownerSignupMessage"),
  inviteSignupForm: document.querySelector("#inviteSignupForm"),
  inviteCode: document.querySelector("#inviteCode"),
  inviteName: document.querySelector("#inviteName"),
  inviteEmail: document.querySelector("#inviteEmail"),
  invitePassword: document.querySelector("#invitePassword"),
  inviteSignupMessage: document.querySelector("#inviteSignupMessage"),
  fundSelect: document.querySelector("#fundSelect"),
  quickActionButton: document.querySelector("#quickActionButton"),
  currentUserName: document.querySelector("#currentUserName"),
  currentRole: document.querySelector("#currentRole"),
  logoutButton: document.querySelector("#logoutButton"),
  totalFund: document.querySelector("#totalFund"),
  totalSpent: document.querySelector("#totalSpent"),
  memberCount: document.querySelector("#memberCount"),
  pendingCount: document.querySelector("#pendingCount"),
  memberForm: document.querySelector("#memberForm"),
  memberName: document.querySelector("#memberName"),
  memberEmail: document.querySelector("#memberEmail"),
  memberInviteMessage: document.querySelector("#memberInviteMessage"),
  memberList: document.querySelector("#memberList"),
  inviteList: document.querySelector("#inviteList"),
  depositForm: document.querySelector("#depositForm"),
  depositMember: document.querySelector("#depositMember"),
  depositAmount: document.querySelector("#depositAmount"),
  depositNote: document.querySelector("#depositNote"),
  fundBankForm: document.querySelector("#fundBankForm"),
  fundBankCode: document.querySelector("#fundBankCode"),
  fundBankAccount: document.querySelector("#fundBankAccount"),
  fundBankName: document.querySelector("#fundBankName"),
  fundTransferTemplate: document.querySelector("#fundTransferTemplate"),
  fundBankMessage: document.querySelector("#fundBankMessage"),
  bankForm: document.querySelector("#bankForm"),
  bankContent: document.querySelector("#bankContent"),
  bankAmount: document.querySelector("#bankAmount"),
  qrBoard: document.querySelector("#qrBoard"),
  depositRequestForm: document.querySelector("#depositRequestForm"),
  requestAmount: document.querySelector("#requestAmount"),
  requestNote: document.querySelector("#requestNote"),
  depositRequestList: document.querySelector("#depositRequestList"),
  eventForm: document.querySelector("#eventForm"),
  expenseForm: document.querySelector("#expenseForm"),
  expenseName: document.querySelector("#expenseName"),
  expenseAmount: document.querySelector("#expenseAmount"),
  eventName: document.querySelector("#eventName"),
  eventAmount: document.querySelector("#eventAmount"),
  guestAmount: document.querySelector("#guestAmount"),
  guestOwner: document.querySelector("#guestOwner"),
  splitMode: document.querySelector("#splitMode"),
  participantList: document.querySelector("#participantList"),
  eventPreview: document.querySelector("#eventPreview"),
  sharedHistory: document.querySelector("#sharedHistory"),
  eventHistory: document.querySelector("#eventHistory"),
  ledger: document.querySelector("#ledger"),
  notificationList: document.querySelector("#notificationList"),
};

let cloudClient = createCloudClient();
let cloudLoaded = false;
let cloudSaveTimer = null;
let cloudStatus = cloudClient ? "Đang chờ đồng bộ" : "Chưa cấu hình máy chủ";
let state = loadState();
let session = loadSession();

function activeFundId() {
  return session?.fundId || DEFAULT_FUND_ID;
}

function emptyState() {
  return {
    fund: emptyFund(),
    members: [],
    ledger: [],
    events: [],
    eventParticipants: [],
    depositRequests: [],
    notifications: [],
    invites: [],
  };
}

function emptyFund() {
  return {
    id: DEFAULT_FUND_ID,
    name: "",
    bankCode: "",
    bankAccountNumber: "",
    bankAccountName: "",
    transferTemplate: "QAC-{MA_THANH_VIEN}",
  };
}

function isLegacyDemoSeedState(value) {
  const members = value.members || [];
  const ledger = value.ledger || [];
  const memberNames = members.map((member) => member.name).sort().join("|");
  const amounts = ledger.map((entry) => entry.amount).sort((a, b) => a - b).join("|");
  return (
    members.length === 3 &&
    ledger.length === 3 &&
    !(value.events || []).length &&
    !(value.eventParticipants || []).length &&
    !(value.depositRequests || []).length &&
    !(value.notifications || []).length &&
    !(value.invites || []).length &&
    memberNames === "Hiếu|Minh|Trang" &&
    amounts === "300000|400000|500000" &&
    ledger.every((entry) => entry.type === "deposit" && entry.note === "Nộp quỹ ban đầu")
  );
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (isLegacyDemoSeedState(parsed)) return emptyState();
      return {
        ...emptyState(),
        ...parsed,
        fund: { ...emptyFund(), ...(parsed.fund || {}) },
      };
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return emptyState();
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
  return loadCloudProfile(authSession.user, session?.fundId);
}

function profileFromRow(row, user) {
  const relatedFund = Array.isArray(row.funds) ? row.funds[0] : row.funds;
  return {
    role: row.role,
    name: row.display_name,
    email: row.email || user?.email || "",
    memberId: row.member_id,
    fundId: row.fund_id,
    fundName: relatedFund?.name || row.fund_name || row.fund_id,
    userId: row.user_id || user?.id,
  };
}

async function loadCloudProfiles(user) {
  const { data, error } = await cloudClient
    .from("profiles")
    .select("*, funds(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).map((row) => profileFromRow(row, user));
}

async function loadCloudProfile(user, preferredFundId = null) {
  const profiles = await loadCloudProfiles(user);
  if (!profiles.length) return false;

  const selected =
    profiles.find((profile) => profile.fundId === preferredFundId) ||
    profiles.find((profile) => profile.fundId === session?.fundId) ||
    profiles[0];

  session = {
    role: selected.role,
    name: selected.name,
    email: selected.email || user.email,
    memberId: selected.memberId,
    fundId: selected.fundId,
    fundName: selected.fundName,
    userId: user.id,
    profiles,
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

function extractInviteCode(value) {
  const raw = (value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.searchParams.get("invite") || raw;
  } catch {
    return raw;
  }
}

function friendlyAuthError(error) {
  const message = error?.message || "";
  if (/email not confirmed/i.test(message)) {
    return new Error("Email này đã tạo tài khoản nhưng chưa được xác nhận. Với tài khoản cũ, hãy xóa/tạo lại trong Supabase hoặc xác nhận thủ công trong Auth.");
  }
  if (/user already registered|already registered/i.test(message)) {
    return new Error("Email này đã được đăng ký. Hãy đăng nhập, hoặc dùng email khác để tạo tài khoản mới.");
  }
  if (/invalid login credentials/i.test(message)) {
    return new Error("Email hoặc mật khẩu không đúng.");
  }
  return error;
}

async function signInAndGetUser(email, password) {
  const signInResult = await cloudClient.auth.signInWithPassword({ email, password });
  if (signInResult.error) throw friendlyAuthError(signInResult.error);
  if (!signInResult.data.user || !signInResult.data.session) {
    throw new Error("Khong dang nhap duoc tai khoan.");
  }
  return signInResult.data.user;
}

async function signUpAndGetUser(email, password, displayName, options = {}) {
  const signUpResult = await cloudClient.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (signUpResult.error) {
    if (options.signInExisting && /user already registered|already registered/i.test(signUpResult.error.message || "")) {
      return signInAndGetUser(email, password);
    }
    throw friendlyAuthError(signUpResult.error);
  }

  let user = signUpResult.data.user;
  let authSession = signUpResult.data.session;
  if (!authSession) {
    user = await signInAndGetUser(email, password);
    authSession = (await cloudClient.auth.getSession()).data?.session;
  }

  if (!user || !authSession) {
    throw new Error("Tài khoản đã tạo nhưng cần xác nhận email trước khi tiếp tục.");
  }
  return user;
}

async function registerOwnerAccount() {
  if (!cloudClient) throw new Error("Chưa cấu hình Supabase.");
  const name = els.ownerName.value.trim();
  const email = els.ownerEmail.value.trim();
  const password = els.ownerPassword.value;
  const fundName = els.ownerFundName.value.trim();
  if (!name || !email || !password || !fundName) throw new Error("Vui lòng nhập đủ thông tin.");

  const user = await signUpAndGetUser(email, password, name);
  const { data, error } = await cloudClient.rpc("create_fund_for_current_user", {
    fund_name: fundName,
    display_name: name,
  });
  if (error) throw error;
  await loadCloudProfile(user, data?.[0]?.fund_id);
  await loadCloudState();
}

async function registerWithInvite() {
  if (!cloudClient) throw new Error("Chưa cấu hình Supabase.");
  const code = extractInviteCode(els.inviteCode.value);
  const name = els.inviteName.value.trim();
  const email = els.inviteEmail.value.trim();
  const password = els.invitePassword.value;
  if (!code || !name || !email || !password) throw new Error("Vui lòng nhập đủ thông tin.");

  const user = await signUpAndGetUser(email, password, name, { signInExisting: true });
  const { data, error } = await cloudClient.rpc("accept_fund_invite", {
    invite_code_input: code,
    display_name: name,
  });
  if (error) throw error;
  await loadCloudProfile(user, data?.[0]?.fund_id);
  await loadCloudState();
}

async function loadCloudState() {
  if (!cloudClient) {
    cloudStatus = "Chưa cấu hình máy chủ";
    return false;
  }

  try {
    cloudStatus = "Đang kết nối";

    const fundResult = await cloudClient.from("funds").select("*").eq("id", activeFundId()).single();
    if (fundResult.error) throw fundResult.error;

    const membersResult = await cloudClient
      .from("fund_members")
      .select("*")
      .eq("fund_id", activeFundId())
      .order("created_at", { ascending: true });

    if (membersResult.error) throw membersResult.error;

    if (!membersResult.data.length) {
      state = emptyState();
      state.fund = fundFromRow(fundResult.data);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      cloudLoaded = true;
      cloudStatus = "Supabase/PostgreSQL";
      return true;
    }

    const ledgerResult = await cloudClient
      .from("ledger_entries")
      .select("*")
      .eq("fund_id", activeFundId())
      .order("created_at", { ascending: true });

    if (ledgerResult.error) throw ledgerResult.error;

    const requestResult = await cloudClient
      .from("deposit_requests")
      .select("*, fund_members(name)")
      .eq("fund_id", activeFundId())
      .order("created_at", { ascending: true });

    if (requestResult.error) throw requestResult.error;

    const notificationResult = await cloudClient
      .from("notifications")
      .select("*")
      .eq("fund_id", activeFundId())
      .order("created_at", { ascending: true });

    if (notificationResult.error) throw notificationResult.error;

    let inviteRows = [];
    if (isAdmin()) {
      const inviteResult = await cloudClient
        .from("fund_invites")
        .select("*, fund_members(name)")
        .eq("fund_id", activeFundId())
        .order("created_at", { ascending: false });
      if (inviteResult.error) throw inviteResult.error;
      inviteRows = inviteResult.data || [];
    }

    const eventsResult = await cloudClient
      .from("events")
      .select("*")
      .eq("fund_id", activeFundId())
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

    const loadedState = {
      fund: fundFromRow(fundResult.data),
      members: membersResult.data.map(memberFromRow),
      ledger: ledgerResult.data.map(ledgerFromRow),
      depositRequests: requestResult.data.map(depositRequestFromRow),
      notifications: notificationResult.data.map(notificationFromRow),
      invites: inviteRows.map(inviteFromRow),
      events: eventsResult.data.map(eventFromRow),
      eventParticipants: eventParticipants.map(eventParticipantFromRow),
    };

    if (isAdmin() && isLegacyDemoSeedState(loadedState)) {
      state = emptyState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      await deleteLegacyDemoSeedFromCloud();
      cloudLoaded = true;
      cloudStatus = "Supabase/PostgreSQL";
      return true;
    }

    state = loadedState;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    cloudLoaded = true;
    cloudStatus = "Supabase/PostgreSQL";
    return true;
  } catch (error) {
    console.error("Không kết nối được Supabase", error);
    cloudLoaded = false;
    cloudStatus = "Mất kết nối máy chủ";
    return false;
  }
}

function queueCloudSave() {
  if (!session || !isAdmin() || !cloudClient || !cloudLoaded) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => {
    saveCloudStateNow().catch((error) => {
      console.error("Không lưu được Supabase", error);
      cloudStatus = "Không lưu được dữ liệu";
    });
  }, 350);
}

async function saveCloudStateNow() {
  if (!cloudClient) return;

  if (state.fund) {
    const { error } = await cloudClient.from("funds").update(fundToRow(state.fund)).eq("id", activeFundId());
    if (error) throw error;
  }

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
}

async function deleteLegacyDemoSeedFromCloud() {
  const fundId = activeFundId();
  const tables = ["ledger_entries", "deposit_requests", "notifications", "fund_invites", "events", "fund_members"];
  for (const table of tables) {
    const { error } = await cloudClient.from(table).delete().eq("fund_id", fundId);
    if (error) throw error;
  }
}

function fundToRow(fund) {
  return {
    name: fund.name || state.fund?.name || "Quỹ Ăn Chơi",
    bank_code: (fund.bankCode || "").trim().toUpperCase() || null,
    bank_account_number: (fund.bankAccountNumber || "").trim() || null,
    bank_account_name: (fund.bankAccountName || "").trim().toUpperCase() || null,
    transfer_template: (fund.transferTemplate || "QAC-{MA_THANH_VIEN}").trim() || "QAC-{MA_THANH_VIEN}",
    updated_at: new Date().toISOString(),
  };
}

function fundFromRow(row) {
  return {
    id: row.id,
    name: row.name || "",
    bankCode: row.bank_code || "",
    bankAccountNumber: row.bank_account_number || "",
    bankAccountName: row.bank_account_name || "",
    transferTemplate: row.transfer_template || "QAC-{MA_THANH_VIEN}",
  };
}

function memberToRow(member) {
  return {
    id: member.id,
    fund_id: activeFundId(),
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
    fund_id: activeFundId(),
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
    fund_id: activeFundId(),
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
    memberName: row.fund_members?.name || "",
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
    fund_id: activeFundId(),
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

function inviteToRow(invite) {
  return {
    id: invite.id,
    fund_id: activeFundId(),
    invite_code: invite.code,
    member_id: invite.memberId || null,
    email: invite.email || null,
    status: invite.status || "pending",
    created_by: invite.createdBy || session?.email || null,
    expires_at: invite.expiresAt ? new Date(invite.expiresAt).toISOString() : null,
    used_by: invite.usedBy || null,
    created_at: new Date(invite.createdAt || Date.now()).toISOString(),
    used_at: invite.usedAt ? new Date(invite.usedAt).toISOString() : null,
  };
}

function inviteFromRow(row) {
  return {
    id: row.id,
    code: row.invite_code,
    memberId: row.member_id || "",
    memberName: row.fund_members?.name || "",
    email: row.email || "",
    status: row.status || "pending",
    createdBy: row.created_by || "",
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : null,
    usedBy: row.used_by || "",
    createdAt: new Date(row.created_at).getTime(),
    usedAt: row.used_at ? new Date(row.used_at).getTime() : null,
  };
}

function eventToRow(item) {
  return {
    id: item.id,
    fund_id: activeFundId(),
    name: item.name,
    total_amount: item.totalAmount,
    guest_amount: item.guestAmount || 0,
    guest_owner_member_id: item.guestOwnerMemberId || null,
    split_mode: item.splitMode,
    expense_type: item.expenseType || "event",
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
    expenseType: row.expense_type || "event",
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

function makeId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function makeInviteCode() {
  return `QAC-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
}

function inviteLink(code) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("invite", code);
  return url.toString();
}

async function copyTextToClipboard(text) {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.warn("Trình duyệt không cho phép copy tự động", error);
    return false;
  }
}

function normalizeCode(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 12);
}

function makeMember(name) {
  const base = normalizeCode(name) || "TV";
  const suffix = String(Math.floor(10 + Math.random() * 89));
  return {
    id: makeId("member"),
    name: name.trim(),
    wallet: "",
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
  renderInvites();
  renderFundBankForm();
  renderParticipants();
  renderQrBoard();
  renderDepositRequests();
  renderEventPreview();
  renderSharedHistory();
  renderEventHistory();
  renderLedger();
  renderNotifications();
}

function renderFundBankForm() {
  if (!els.fundBankForm || !isAdmin()) return;
  const fund = state.fund || emptyFund();
  els.fundBankCode.value = fund.bankCode || "";
  els.fundBankAccount.value = fund.bankAccountNumber || "";
  els.fundBankName.value = fund.bankAccountName || "";
  els.fundTransferTemplate.value = fund.transferTemplate || "QAC-{MA_THANH_VIEN}";
}

function renderAuth() {
  const loggedIn = Boolean(session);
  els.loginScreen.hidden = loggedIn;
  els.appShell.hidden = !loggedIn;
  document.body.classList.toggle("is-logged-in", loggedIn);
  document.body.classList.toggle("is-admin", isAdmin());
  document.body.classList.toggle("is-member", isMember());

  if (!loggedIn) return;
  const roleText = isAdmin() ? "Admin" : "Thành viên";
  els.currentUserName.textContent = `${session.name} (${session.email})`;
  els.currentRole.textContent = roleText;
  if (els.fundSelect) {
    const profiles = session.profiles || [];
    els.fundSelect.disabled = profiles.length <= 1;
    els.fundSelect.innerHTML = profiles
      .map(
        (profile) =>
          `<option value="${escapeHtml(profile.fundId)}">${escapeHtml(profile.fundName || profile.fundId)}</option>`,
      )
      .join("");
    els.fundSelect.value = session.fundId;
  }

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

async function switchActiveFund(fundId) {
  if (!session?.cloud || !fundId || fundId === session.fundId) return;
  const selected = (session.profiles || []).find((profile) => profile.fundId === fundId);
  if (!selected) return;
  session = {
    ...session,
    role: selected.role,
    name: selected.name,
    email: selected.email || session.email,
    memberId: selected.memberId,
    fundId: selected.fundId,
    fundName: selected.fundName,
  };
  state = emptyState();
  cloudLoaded = false;
  saveSession();
  await loadCloudState();
  activateTab("members");
  render();
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
        ? `<button class="ghost danger icon-button" type="button" data-remove-member="${member.id}">${icon("trash")}<span>Xóa</span></button>`
        : "";
      return `
        <article class="member-card">
          <div class="member-top">
            <div class="card-avatar">${icon("users")}</div>
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
        </article>
      `;
    })
    .join("");
}

function renderInvites() {
  if (!els.inviteList) return;
  if (!isAdmin()) {
    els.inviteList.innerHTML = "";
    return;
  }
  const invites = state.invites || [];
  if (!invites.length) {
    els.inviteList.innerHTML = `<div class="empty">Chưa có link mời nào.</div>`;
    return;
  }

  els.inviteList.innerHTML = invites
    .map((invite) => {
      const statusText = invite.status === "used" ? "Đã dùng" : invite.status === "revoked" ? "Đã hủy" : "Đang chờ";
      const link = inviteLink(invite.code);
      const actions =
        invite.status === "pending"
          ? `
            <div class="pending-actions">
              <button type="button" data-copy-invite="${escapeHtml(link)}">Copy link</button>
              <button class="ghost danger icon-button" type="button" data-revoke-invite="${invite.id}">${icon("trash")}<span>Hủy</span></button>
            </div>
          `
          : "";
      return `
        <article class="ledger-row app-list-row">
          <div class="row-icon">${icon("users")}</div>
          <div>
            <strong>${escapeHtml(invite.memberName || invite.email || invite.code)}</strong>
            <div class="ledger-meta"><span class="status-pill ${invite.status}">${statusText}</span> ${escapeHtml(invite.code)}</div>
            <div class="muted">${escapeHtml(link)}</div>
          </div>
          ${actions}
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

  const fund = state.fund || emptyFund();
  const hasBankAccount = fund.bankCode && fund.bankAccountNumber && fund.bankAccountName;
  els.qrBoard.innerHTML = members
    .map(
      (member) => {
        const content = transferContentForMember(member);
        const qr = hasBankAccount
          ? `<img class="qr-code qr-image" src="${escapeHtml(vietQrUrl(fund, content))}" alt="QR chuyển khoản cho ${escapeHtml(member.name)}" />`
          : fakeQrSvg(member.code);
        const bankInfo = hasBankAccount
          ? `
            <div class="transfer-info">
              <div><span>Ngân hàng</span><strong>${escapeHtml(fund.bankCode)}</strong></div>
              <div><span>Số tài khoản</span><strong>${escapeHtml(fund.bankAccountNumber)}</strong></div>
              <div><span>Chủ tài khoản</span><strong>${escapeHtml(fund.bankAccountName)}</strong></div>
            </div>
          `
          : `<p class="hint">Admin cần nhập tài khoản nhận quỹ để tạo QR chuyển khoản ngân hàng.</p>`;
        return `
        <article class="qr-card">
          <div class="qr-card-head">
            ${qr}
            <div>
              <span class="status-pill pending">Mã nạp riêng</span>
              <strong>${escapeHtml(member.name)}</strong>
              <div class="member-code">${escapeHtml(member.code)}</div>
            </div>
          </div>
          ${bankInfo}
          <p class="hint">Nội dung chuyển khoản: <strong>${escapeHtml(content)}</strong></p>
          <button class="ghost copy-code icon-button" type="button" data-copy-code="${escapeHtml(content)}">${icon("qr")}<span>Sao chép nội dung</span></button>
        </article>
      `;
      },
    )
    .join("");
}

function transferContentForMember(member) {
  const template = state.fund?.transferTemplate || "QAC-{MA_THANH_VIEN}";
  return template
    .replaceAll("{MA_THANH_VIEN}", member.code)
    .replaceAll("{TEN_THANH_VIEN}", member.name)
    .trim();
}

function vietQrUrl(fund, content) {
  const bankCode = encodeURIComponent((fund.bankCode || "").trim());
  const accountNumber = encodeURIComponent((fund.bankAccountNumber || "").trim());
  const query = new URLSearchParams({
    addInfo: content,
    accountName: fund.bankAccountName || "",
  });
  return `https://img.vietqr.io/image/${bankCode}-${accountNumber}-compact2.png?${query.toString()}`;
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
      const memberName = member?.name || request.memberName || "Không rõ thành viên";
      const statusText =
        request.status === "approved" ? "Đã xác nhận" : request.status === "rejected" ? "Đã từ chối" : "Chờ xác nhận";
      const statusClass = request.status === "approved" ? "approved" : request.status === "rejected" ? "rejected" : "pending";
      const actions =
        isAdmin() && request.status === "pending"
          ? `
            <div class="pending-actions">
              <button class="icon-button" type="button" data-approve-request="${request.id}">${icon("check")}<span>Xác nhận</span></button>
              <button class="ghost danger icon-button" type="button" data-reject-request="${request.id}">${icon("trash")}<span>Từ chối</span></button>
            </div>
          `
          : "";
      return `
        <article class="ledger-row app-list-row deposit-request-row">
          <div class="row-icon">${icon("qr")}</div>
          <div>
            <strong>${escapeHtml(memberName)} báo đã chuyển ${money(request.amount)}</strong>
            <div class="ledger-meta"><span class="status-pill ${statusClass}">${statusText}</span> ${new Date(request.createdAt).toLocaleString("vi-VN")}</div>
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

function eventExpenseType(event) {
  return event.expenseType || "event";
}

function renderExpenseHistory(target, expenseType, emptyText) {
  if (!target) return;
  const events = visibleEvents()
    .filter((event) => eventExpenseType(event) === expenseType)
    .sort((a, b) => b.createdAt - a.createdAt);
  if (!events.length) {
    target.innerHTML = `<div class="empty">${emptyText}</div>`;
    return;
  }

  target.innerHTML = events
    .map((event) => {
      const participants = eventParticipantsFor(event.id);
      const total = participants.reduce((sum, item) => sum + item.chargedAmount, 0);
      const eventIcon = expenseType === "shared-expense" ? "receipt" : "sparkle";
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
            <button class="ghost icon-button" type="button" data-rename-event="${event.id}">${icon("receipt")}<span>Sửa tên</span></button>
            <button class="ghost icon-button" type="button" data-adjust-event="${event.id}">${icon("wallet")}<span>Điều chỉnh</span></button>
            <button class="ghost danger icon-button" type="button" data-delete-event="${event.id}">${icon("trash")}<span>Xóa</span></button>
          </div>
        `
        : "";
      return `
        <article class="event-card">
          <div class="ledger-row app-list-row">
            <div class="row-icon">${icon(eventIcon)}</div>
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

function renderSharedHistory() {
  renderExpenseHistory(els.sharedHistory, "shared-expense", "Chưa có khoản chi chung nào.");
}

function renderEventHistory() {
  renderExpenseHistory(els.eventHistory, "event", "Chưa có buổi nhậu nào.");
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
        <article class="ledger-row app-list-row">
          <div class="row-icon">${icon("bell")}</div>
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
      const rowIcon = entry.type === "deposit" ? "wallet" : entry.type === "pending" ? "bell" : "receipt";
      const title =
        entry.type === "deposit"
          ? "Nộp quỹ"
          : entry.type === "event-share"
            ? `Chi phí: ${entry.eventName || "Buổi ăn/nhậu"}`
            : "Chưa nhận diện";
      return `
        <article class="ledger-row app-list-row transaction-row ${amountClass}">
          <div class="row-icon">${icon(rowIcon)}</div>
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

function splitAmountAcrossMembers(total, members, reason) {
  if (!total || !members.length) return [];
  const baseShare = Math.floor(total / members.length);
  let remainder = total - baseShare * members.length;
  return members.map((member) => {
    let amount = baseShare;
    if (remainder > 0) {
      amount += 1;
      remainder -= 1;
    }
    return { member, amount, reason };
  });
}

async function createAllocatedExpense({ name, totalAmount, shares, type = "event", guestAmount = 0, guestOwnerMemberId = null }) {
  const eventId = makeId("event");
  const createdAt = Date.now();
  const splitMode = type === "shared-expense" ? "equal" : els.splitMode.value;
  state.events = state.events || [];
  state.eventParticipants = state.eventParticipants || [];
  state.events.push({
    id: eventId,
    name,
    totalAmount,
    guestAmount,
    guestOwnerMemberId,
    splitMode,
    expenseType: type,
    createdBy: session?.email || "",
    createdAt,
  });

  for (const share of shares) {
    state.eventParticipants.push({
      eventId,
      memberId: share.member.id,
      chargedAmount: share.amount,
      note: share.reason,
    });
    state.ledger.push(
      makeLedger("event-share", share.member.id, share.amount, share.reason, createdAt, {
        eventId,
        eventName: name,
      }),
    );
  }

  const title = type === "shared-expense" ? "Bạn được phân bổ khoản chi chung" : "Bạn được phân bổ chi phí buổi ăn/nhậu";
  await addNotifications(
    shares.map((share) =>
      makeNotification(
        share.member.id,
        title,
        `"${name}" đã được tạo. Phần của bạn là ${money(share.amount)}.`,
      ),
    ),
  );
}

function addDeposit(memberId, amount, note) {
  state.ledger.push(makeLedger("deposit", memberId, amount, note));
}

async function createMemberInvite(name, email) {
  if (!requireAdmin()) return null;
  const member = makeMember(name);
  const invite = {
    id: makeId("invite"),
    code: makeInviteCode(),
    memberId: member.id,
    memberName: member.name,
    email: email || "",
    status: "pending",
    createdBy: session.email,
    expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
    usedBy: "",
    usedAt: null,
    createdAt: Date.now(),
  };

  state.members.push(member);
  state.invites = state.invites || [];
  state.invites.unshift(invite);

  if (cloudClient && session?.cloud) {
    const { error: memberError } = await cloudClient.from("fund_members").insert(memberToRow(member));
    if (memberError) throw memberError;
    const { error: inviteError } = await cloudClient.from("fund_invites").insert(inviteToRow(invite));
    if (inviteError) throw inviteError;
  } else {
    saveState();
  }
  return invite;
}

async function revokeInvite(inviteId) {
  if (!requireAdmin()) return;
  const invite = (state.invites || []).find((item) => item.id === inviteId);
  if (!invite || invite.status !== "pending") return;
  invite.status = "revoked";
  if (cloudClient && session?.cloud) {
    const { error } = await cloudClient.from("fund_invites").update({ status: "revoked" }).eq("id", invite.id);
    if (error) throw error;
  } else {
    saveState();
  }
  render();
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
      "Khoản phân bổ được đổi tên",
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
      "Khoản phân bổ được điều chỉnh tiền",
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
  if (!confirm(`Xóa "${event.name}" và hoàn lại phần tiền đã trừ?`)) return;

  const participants = eventParticipantsFor(eventId);
  const notifications = participants.map((participant) =>
    makeNotification(
      participant.memberId,
      "Khoản phân bổ đã bị xóa",
      `Admin đã xóa "${event.name}". Phần tiền đã trừ được gỡ khỏi số dư của bạn.`,
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

function focusPrimaryAction(tabId) {
  const targets = {
    members: els.memberName,
    deposit: isMember() ? els.requestAmount : els.depositAmount,
    shared: els.expenseName,
    events: els.eventName,
    history: els.ledger,
    notifications: els.notificationList,
  };
  const target = targets[tabId];
  target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  if (target?.focus && !target.disabled) {
    setTimeout(() => target.focus(), 220);
  }
}

function activateQuickTab(tabId) {
  activateTab(tabId);
  renderEventPreview();
  focusPrimaryAction(tabId);
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

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
}

function bindEvents() {
  const initialInvite = new URLSearchParams(window.location.search).get("invite");
  if (initialInvite && els.inviteCode) {
    els.inviteCode.value = initialInvite;
  }

  els.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = els.loginEmail.value.trim();
    const password = els.loginPassword.value;

    try {
      if (!email || !password) throw new Error("Vui lòng nhập email và mật khẩu.");
      if (!cloudClient) throw new Error("Chưa cấu hình Supabase nên chưa thể đăng nhập tài khoản thật.");

      els.loginMessage.textContent = "Đang đăng nhập...";
      const authResult = await cloudClient.auth.signInWithPassword({ email, password });
      if (authResult.error) throw authResult.error;
      await loadCloudProfile(authResult.data.user);
      await loadCloudState();

      els.loginPassword.value = "";
      els.loginMessage.textContent = "";
      activateTab("members");
      render();
    } catch (error) {
      console.error(error);
      const friendlyError = friendlyAuthError(error);
      els.loginMessage.textContent = friendlyError.message || "Không đăng nhập được.";
    }
  });

  els.ownerSignupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      els.ownerSignupMessage.textContent = "Đang tạo tài khoản chủ quỹ...";
      await registerOwnerAccount();
      els.ownerSignupForm.reset();
      els.ownerSignupMessage.textContent = "";
      activateTab("members");
      render();
    } catch (error) {
      console.error(error);
      els.ownerSignupMessage.textContent = error.message || "Không tạo được tài khoản chủ quỹ.";
    }
  });

  els.inviteSignupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      els.inviteSignupMessage.textContent = "Đang đăng ký tham gia quỹ...";
      await registerWithInvite();
      els.inviteSignupForm.reset();
      els.inviteSignupMessage.textContent = "";
      activateTab("members");
      render();
    } catch (error) {
      console.error(error);
      els.inviteSignupMessage.textContent = error.message || "Không đăng ký được bằng mã mời.";
    }
  });

  els.logoutButton.addEventListener("click", async () => {
    if (cloudClient) {
      await cloudClient.auth.signOut();
    }
    session = null;
    render();
  });

  els.fundSelect?.addEventListener("change", async (event) => {
    try {
      await switchActiveFund(event.target.value);
    } catch (error) {
      console.error(error);
      alert(error.message || "Khong chuyen duoc quy.");
      renderAuth();
    }
  });

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.tab);
      renderEventPreview();
    });
  });

  document.querySelectorAll("[data-quick-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!session) return;
      activateQuickTab(button.dataset.quickTab);
    });
  });

  els.quickActionButton?.addEventListener("click", () => {
    if (!session) return;
    activateQuickTab(isAdmin() ? "events" : "deposit");
  });

  els.memberForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireAdmin()) return;
    const name = els.memberName.value.trim();
    if (!name) return;
    try {
      els.memberInviteMessage.textContent = "Đang tạo link mời...";
      const invite = await createMemberInvite(name, els.memberEmail.value.trim());
      els.memberForm.reset();
      render();
      if (invite) {
        const link = inviteLink(invite.code);
        const copied = await copyTextToClipboard(link);
        els.memberInviteMessage.textContent = copied
          ? "Đã tạo link mời và copy link."
          : "Đã tạo link mời. Trình duyệt không cho copy tự động, hãy bấm Copy link hoặc bấm giữ vào link bên dưới để sao chép.";
      }
    } catch (error) {
      console.error(error);
      els.memberInviteMessage.textContent = error.message || "Không tạo được link mời.";
    }
  });

  els.inviteList?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-invite], [data-revoke-invite]");
    if (!button) return;
    const link = button.dataset.copyInvite;
    const revokeId = button.dataset.revokeInvite;
    try {
      if (link) {
        const copied = await copyTextToClipboard(link);
        button.textContent = copied ? "Đã copy" : "Không copy được";
        if (!copied && els.memberInviteMessage) {
          els.memberInviteMessage.textContent = "Trình duyệt đang chặn copy tự động. Hãy bấm giữ vào link mời rồi chọn Sao chép.";
        }
        setTimeout(() => {
          button.textContent = "Copy link";
        }, 1000);
      }
      if (revokeId) await revokeInvite(revokeId);
    } catch (error) {
      console.error(error);
      if (els.memberInviteMessage) {
        els.memberInviteMessage.textContent = error.message || "Không xử lý được link mời.";
      }
    }
  });

  els.memberList.addEventListener("click", (event) => {
    const id = event.target.closest("[data-remove-member]")?.dataset.removeMember;
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

  els.fundBankForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireAdmin()) return;
    try {
      state.fund = {
        ...(state.fund || emptyFund()),
        bankCode: els.fundBankCode.value.trim().toUpperCase(),
        bankAccountNumber: els.fundBankAccount.value.trim(),
        bankAccountName: els.fundBankName.value.trim().toUpperCase(),
        transferTemplate: els.fundTransferTemplate.value.trim() || "QAC-{MA_THANH_VIEN}",
      };
      if (!state.fund.transferTemplate.includes("{MA_THANH_VIEN}")) {
        state.fund.transferTemplate = `${state.fund.transferTemplate} {MA_THANH_VIEN}`.trim();
      }
      if (cloudClient && session?.cloud) {
        const { error } = await cloudClient.from("funds").update(fundToRow(state.fund)).eq("id", activeFundId());
        if (error) throw error;
      } else {
        saveState();
      }
      await addNotifications(
        state.members.map((member) =>
          makeNotification(
            member.id,
            "Tài khoản nhận quỹ đã được cập nhật",
            "Admin vừa cập nhật thông tin chuyển khoản. Hãy kiểm tra QR/nội dung chuyển khoản trước khi nộp quỹ.",
            "deposit",
          ),
        ),
      );
      els.fundBankMessage.textContent = "Đã lưu tài khoản nhận quỹ.";
      render();
    } catch (error) {
      console.error(error);
      els.fundBankMessage.textContent = error.message || "Không lưu được tài khoản nhận quỹ.";
    }
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
    const button = event.target.closest("[data-approve-request], [data-reject-request]");
    if (!button) return;
    const approveId = button.dataset.approveRequest;
    const rejectId = button.dataset.rejectRequest;
    try {
      if (approveId) await reviewDepositRequest(approveId, "approved");
      if (rejectId) await reviewDepositRequest(rejectId, "rejected");
    } catch (error) {
      console.error(error);
      alert(error.message || "Không xử lý được yêu cầu nộp quỹ.");
    }
  });

  els.eventHistory?.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-rename-event], [data-adjust-event], [data-delete-event]");
    if (!action) return;
    const renameId = action.dataset.renameEvent;
    const adjustId = action.dataset.adjustEvent;
    const deleteId = action.dataset.deleteEvent;
    try {
      if (renameId) await renameEvent(renameId);
      if (adjustId) await adjustEventTotal(adjustId);
      if (deleteId) await deleteEvent(deleteId);
    } catch (error) {
      console.error(error);
      alert(error.message || "Không xử lý được buổi ăn/nhậu.");
    }
  });

  els.sharedHistory?.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-rename-event], [data-adjust-event], [data-delete-event]");
    if (!action) return;
    const renameId = action.dataset.renameEvent;
    const adjustId = action.dataset.adjustEvent;
    const deleteId = action.dataset.deleteEvent;
    try {
      if (renameId) await renameEvent(renameId);
      if (adjustId) await adjustEventTotal(adjustId);
      if (deleteId) await deleteEvent(deleteId);
    } catch (error) {
      console.error(error);
      alert(error.message || "Khong xu ly duoc khoan chi.");
    }
  });

  els.qrBoard.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-code]");
    const code = button?.dataset.copyCode;
    if (!code) return;
    const copied = await copyTextToClipboard(code);
    button.textContent = copied ? "Đã sao chép" : "Không copy được";
    if (!copied) alert(`Không copy tự động được. Nội dung chuyển khoản là: ${code}`);
    setTimeout(() => {
      button.textContent = "Sao chép nội dung";
    }, 1000);
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
    await createAllocatedExpense({
      name: eventName,
      totalAmount: Number(els.eventAmount.value) || 0,
      guestAmount: Number(els.guestAmount.value) || 0,
      guestOwnerMemberId: els.guestOwner.value || null,
      shares,
      type: "event",
    });
    els.eventForm.reset();
    render();
  });

  els.expenseForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireAdmin()) return;
    const name = els.expenseName.value.trim();
    const amount = Math.round(Number(els.expenseAmount.value) || 0);
    const members = state.members || [];
    if (!name || !amount) {
      alert("Vui lòng nhập tên khoản chi và số tiền.");
      return;
    }
    if (!members.length) {
      alert("Cần có thành viên trước khi tạo khoản chi.");
      return;
    }
    const shares = splitAmountAcrossMembers(amount, members, "Khoản chi chung chia đều cho tất cả thành viên");
    await createAllocatedExpense({
      name,
      totalAmount: amount,
      shares,
      type: "shared-expense",
    });
    els.expenseForm.reset();
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
