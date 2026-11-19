/**
 * DIALLER CRM: RELEASE-POLISH 30/70 LEFT-TREE OUTREACH DESK & DAILY TARGET ENGINE
 * Features:
 *  - Daily outreach target tracker driving the 3D rose-gold blossom tree & gold glow
 *  - Native phone dialer (tel:) and pre-populated mail app (mailto:) on EVERY call/email button
 *  - 4-tab extensive Settings desk (Sender & Email, Daily Target & Tree, Dialer & UI, Data)
 *  - Left-and-right 30/70 split across desktop, tablet, and mobile
 */

/* ==========================================================================
   1. KEYS, DEFAULT SETTINGS & DAILY PROGRESS STORAGE
   ========================================================================== */
const TREE_CDN_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
const TREE_SEED = 1847;
const SETTINGS_KEY = 'DiallerCRM_Settings_v0';
const DAILY_KEY = 'DiallerCRM_Daily_v0';
const DB_NAME = 'Dila_DB';
const DB_VERSION = 1;

const DEFAULT_SETTINGS = {
  // Tab 1: Sender & Email
  senderName: 'Christian J.',
  senderCompany: 'Empire Dev Studio',
  senderEmail: 'EmpireDevStudio@gmail.com',
  senderTitle: 'Founder',
  emailProvider: 'mailto',
  emailSubject: '{{senderFirstName}} | Following up with {{company}}',
  emailBody:
`Hi,

It was really great speaking with you earlier.

I'm {{senderFirstName}}, founder of {{senderCompany}}. We help hospitality venues turn their cocktail specs, SOPs, and training videos into a simple, pocket-ready web app, so new hires ramp up faster, pours stay consistent during a rush, and managers stop losing hours updating binders nobody reads.

Instead of sending a pitch deck, I put together an interactive demo so you can feel how it works in 60 seconds:

https://empiredevstudio.github.io/Demo-Home/


When you've had a quick scroll, I'd love your unfiltered take:
1. Where does your team lose the most time with training or spec updates right now?
2. What feels genuinely useful or is missing from the demo?
Looking forward to hearing from you.

Best,

{{senderName}}
{{senderTitle}} | {{senderCompany}}`,

  // Tab 2: Daily Target & Tree
  dailyTarget: 20,
  onboardBonus: 3,
  countCallsTowardTarget: true,
  countEmailsTowardTarget: true,
  glowOnTarget: true,
  treeWidthDesktop: 30,
  treeWidthMobile: 28,
  visibleTreePercent: 65,

  // Tab 3: Dialer & UI
  defaultStage: 'prospects',
  autoStageEmail: true,
  autoAdvance: true,
  defaultEditOpen: false,
  compactQueueCards: false,
  confirmDelete: true
};

let settings = loadSettings();

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(next) {
  settings = { ...DEFAULT_SETTINGS, ...next };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function getTodayDateKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function loadDailyProgress() {
  const today = getTodayDateKey();
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.date === today) {
        return { date: today, count: Math.max(0, Number(parsed.count) || 0) };
      }
    }
  } catch {}
  return { date: today, count: 0 };
}

function saveDailyProgress(daily) {
  localStorage.setItem(DAILY_KEY, JSON.stringify(daily));
}

let dailyProgress = loadDailyProgress();

function incrementDailyTarget(amount = 1) {
  const today = getTodayDateKey();
  if (dailyProgress.date !== today) {
    dailyProgress = { date: today, count: 0 };
  }
  const prev = dailyProgress.count;
  dailyProgress.count = Math.max(0, dailyProgress.count + amount);
  saveDailyProgress(dailyProgress);
  updateTreeFromDailyTarget();

  const target = Math.max(1, Number(settings.dailyTarget) || 20);
  if (prev < target && dailyProgress.count >= target) {
    showToast(`Daily target reached (${dailyProgress.count} / ${target}). Tree in full bloom!`);
  }
}

/* ==========================================================================
   2. INDEXEDDB STORAGE & NORMALIZATION
   ========================================================================== */
let db = null;

function initDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains('contacts')) {
        const store = database.createObjectStore('contacts', { keyPath: 'id' });
        store.createIndex('stage', 'stage', { unique: false });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

const dbAPI = {
  getAll: () => new Promise((res) => {
    db.transaction('contacts', 'readonly').objectStore('contacts').getAll().onsuccess = (e) => {
      res((e.target.result || []).map(normalizeContact));
    };
  }),
  put: (item) => new Promise((res) => {
    db.transaction('contacts', 'readwrite').objectStore('contacts').put(item).onsuccess = () => res(item);
  }),
  delete: (id) => new Promise((res) => {
    db.transaction('contacts', 'readwrite').objectStore('contacts').delete(id).onsuccess = () => res(true);
  }),
  clear: () => new Promise((res) => {
    db.transaction('contacts', 'readwrite').objectStore('contacts').clear().onsuccess = () => res(true);
  })
};

function normalizeStage(stage, raw = {}) {
  const s = String(stage || '').toLowerCase().trim();
  if (s === 'emailed' || s === 'completed' || s === 'contacted') return 'emailed';
  if (s === 'onboarded' || s === 'client') return 'onboarded';
  if (s === 'followup' || s === 'follow-up' || s === 'callback' || s === 'no_answer' || s === 'partial') return 'followup';
  if (raw.attempts > 0 || raw.callback_at) return 'followup';
  return 'prospects';
}

function createEmployeeRecord(roleType = 'employee', seed = {}) {
  return {
    id: seed.id || ('emp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
    roleType: roleType === 'primary' || roleType === 'secondary' ? roleType : 'employee',
    name: seed.name || '',
    title: seed.title || '',
    phone: seed.phone || '',
    email: seed.email || '',
    dob: seed.dob || '',
    preferred_contact: seed.preferred_contact || '',
    availability: seed.availability || '',
    notes: seed.notes || ''
  };
}

function ensureDefaultEmployees(contact) {
  const list = Array.isArray(contact.employees)
    ? contact.employees.map((e) => createEmployeeRecord(e.roleType, e))
    : [];

  let primary = list.find((e) => e.roleType === 'primary');
  if (!primary) {
    primary = createEmployeeRecord('primary', {
      name: contact.name || '',
      title: contact.job_title || '',
      phone: contact.phone || '',
      email: contact.email || ''
    });
    list.unshift(primary);
  }

  let secondary = list.find((e) => e.roleType === 'secondary');
  if (!secondary) {
    secondary = createEmployeeRecord('secondary');
    const pIdx = list.indexOf(primary);
    list.splice(pIdx + 1, 0, secondary);
  }

  const others = list.filter((e) => e !== primary && e !== secondary);
  contact.employees = [primary, secondary, ...others];
  return contact.employees;
}

function normalizeContact(c) {
  const stage = normalizeStage(c.stage, c);
  const contact = {
    ...c,
    stage,
    job_title: c.job_title || c.title || '',
    website: c.website || '',
    app_url: c.app_url || '',
    custom_logo_url: c.custom_logo_url || '',
    business_type: c.business_type || '',
    account_status: c.account_status || 'active',
    onboarded_at: c.onboarded_at || '',
    street_address: c.street_address || '',
    city: c.city || '',
    country: c.country || '',
    postal_code: c.postal_code || '',
    attempts: c.attempts || 0,
    callback_at: c.callback_at || null,
    employees: Array.isArray(c.employees) ? c.employees : null
  };

  if (contact.stage === 'onboarded') {
    if (!contact.onboarded_at) contact.onboarded_at = new Date().toISOString().slice(0, 10);
    ensureDefaultEmployees(contact);
  }
  return contact;
}

/* ==========================================================================
   3. STATE & DOM REFERENCES
   ========================================================================== */
const state = {
  contacts: [],
  filtered: [],
  activeId: null,
  activeOnboardedId: null,
  stageFilter: settings.defaultStage || 'prospects',
  search: '',
  onboardedSearch: '',
  notesTimer: null,
  inlineSaveTimer: null,
  profileSaveTimer: null,
  toastTimer: null,
  logoSeq: 0,
  treeProgressTarget: 0.14,
  treeProgressSmooth: 0.14,
  treeGlowTarget: 0,
  treeGlowSmooth: 0
};

const el = {
  workbench: document.getElementById('workbench'),
  treeStage: document.getElementById('tree-stage'),
  treeStageBadge: document.getElementById('tree-stage-badge'),
  treeStageLabel: document.getElementById('tree-stage-label'),
  treeProgressFill: document.getElementById('tree-progress-fill'),
  headerDailyPill: document.getElementById('headerDailyPill'),
  headerDailyText: document.getElementById('headerDailyText'),

  list: document.getElementById('contactList'),
  inputSearch: document.getElementById('inputSearch'),
  btnClearSearch: document.getElementById('btnClearSearch'),
  cockpitEmpty: document.getElementById('cockpitEmpty'),
  cockpitContent: document.getElementById('cockpitContent'),
  paneCockpit: document.getElementById('paneCockpit'),
  btnBackToList: document.getElementById('btnBackToList'),
  btnPrevLead: document.getElementById('btnPrevLead'),
  btnNextLead: document.getElementById('btnNextLead'),
  mobileNavTitle: document.getElementById('mobileNavTitle'),
  mobileQueueCounter: document.getElementById('mobileQueueCounter'),
  toast: document.getElementById('toast'),

  btnMobileMore: document.getElementById('btnMobileMore'),
  mobileHeaderMenu: document.getElementById('mobileHeaderMenu'),

  countProspects: document.getElementById('countProspects'),
  countFollowup: document.getElementById('countFollowup'),
  countEmailed: document.getElementById('countEmailed'),
  countOnboarded: document.getElementById('countOnboarded'),
  countAll: document.getElementById('countAll'),

  onboardedCockpitBanner: document.getElementById('onboardedCockpitBanner'),
  btnJumpToBusinessProfile: document.getElementById('btnJumpToBusinessProfile'),

  leadStageSelect: document.getElementById('leadStageSelect'),
  leadAttemptsBadge: document.getElementById('leadAttemptsBadge'),
  leadCallbackBadge: document.getElementById('leadCallbackBadge'),
  cockpitSavePill: document.getElementById('cockpitSavePill'),
  btnToggleInlineEdit: document.getElementById('btnToggleInlineEdit'),
  inlineEditPanel: document.getElementById('inlineEditPanel'),

  leadCompanyDisplay: document.getElementById('leadCompanyDisplay'),
  leadSubtitleDisplay: document.getElementById('leadSubtitleDisplay'),
  leadAdminSummary: document.getElementById('leadAdminSummary'),

  btnCallLead: document.getElementById('btnCallLead'),
  leadPhoneDisplay: document.getElementById('leadPhoneDisplay'),
  btnCopyPhone: document.getElementById('btnCopyPhone'),

  btnSendEmail: document.getElementById('btnSendEmail'),
  leadEmailDisplay: document.getElementById('leadEmailDisplay'),
  btnCopyEmail: document.getElementById('btnCopyEmail'),
  btnToggleEmailPreview: document.getElementById('btnToggleEmailPreview'),
  emailPreviewDrawer: document.getElementById('emailPreviewDrawer'),
  emailSubjectPreview: document.getElementById('emailSubjectPreview'),
  emailPreviewBox: document.getElementById('emailPreviewBox'),

  btnVisitWebsite: document.getElementById('btnVisitWebsite'),
  leadWebsiteDisplay: document.getElementById('leadWebsiteDisplay'),
  btnCopyWebsite: document.getElementById('btnCopyWebsite'),

  editCompany: document.getElementById('editCompany'),
  editName: document.getElementById('editName'),
  editTitle: document.getElementById('editTitle'),
  editPhone: document.getElementById('editPhone'),
  editEmail: document.getElementById('editEmail'),
  editWebsite: document.getElementById('editWebsite'),
  editAddress: document.getElementById('editAddress'),
  editCity: document.getElementById('editCity'),
  editPostal: document.getElementById('editPostal'),
  editCountry: document.getElementById('editCountry'),

  leadNotes: document.getElementById('leadNotes'),
  notesSaveIndicator: document.getElementById('notesSaveIndicator'),

  paneOnboarded: document.getElementById('paneOnboarded'),
  onboardedDirectory: document.getElementById('onboardedDirectory'),
  inputOnboardedSearch: document.getElementById('inputOnboardedSearch'),
  btnClearOnboardedSearch: document.getElementById('btnClearOnboardedSearch'),
  onboardedDirCount: document.getElementById('onboardedDirCount'),
  btnNewOnboarded: document.getElementById('btnNewOnboarded'),
  onboardedGrid: document.getElementById('onboardedGrid'),

  onboardedProfileView: document.getElementById('onboardedProfileView'),
  btnBackToOnboardedDir: document.getElementById('btnBackToOnboardedDir'),
  onboardedNavTitle: document.getElementById('onboardedNavTitle'),
  onboardedSaveIndicator: document.getElementById('onboardedSaveIndicator'),
  onboardedStageSelect: document.getElementById('onboardedStageSelect'),
  btnPrevOnboarded: document.getElementById('btnPrevOnboarded'),
  btnNextOnboarded: document.getElementById('btnNextOnboarded'),
  btnDeleteOnboarded: document.getElementById('btnDeleteOnboarded'),
  profileScroll: document.getElementById('profileScroll'),

  profLogoImg: document.getElementById('profLogoImg'),
  profLogoFallback: document.getElementById('profLogoFallback'),
  profLogoUploadInput: document.getElementById('profLogoUploadInput'),
  btnEditLogoUrl: document.getElementById('btnEditLogoUrl'),
  btnRefreshLogo: document.getElementById('btnRefreshLogo'),

  profCompany: document.getElementById('profCompany'),
  profOnboardedDate: document.getElementById('profOnboardedDate'),
  profBusinessType: document.getElementById('profBusinessType'),
  profAccountStatus: document.getElementById('profAccountStatus'),
  profWebsite: document.getElementById('profWebsite'),
  btnOpenProfWebsite: document.getElementById('btnOpenProfWebsite'),
  profAppUrl: document.getElementById('profAppUrl'),
  btnOpenProfAppUrl: document.getElementById('btnOpenProfAppUrl'),
  profEmail: document.getElementById('profEmail'),
  btnEmailProf: document.getElementById('btnEmailProf'),
  profPhone: document.getElementById('profPhone'),
  btnCallProf: document.getElementById('btnCallProf'),
  profAddress: document.getElementById('profAddress'),
  profCity: document.getElementById('profCity'),
  profPostal: document.getElementById('profPostal'),
  profCountry: document.getElementById('profCountry'),
  profNotes: document.getElementById('profNotes'),

  employeeCountBadge: document.getElementById('employeeCountBadge'),
  btnAddEmployee: document.getElementById('btnAddEmployee'),
  employeeCardsList: document.getElementById('employeeCardsList'),

  dialogForm: document.getElementById('dialogLeadForm'),
  leadForm: document.getElementById('leadForm'),
  btnDeleteFromModal: document.getElementById('btnDeleteFromModal'),
  dialogCallback: document.getElementById('dialogCallback'),
  btnClearCallback: document.getElementById('btnClearCallback'),
  dialogSettings: document.getElementById('dialogSettings')
};

/* ==========================================================================
   4. HELPERS, DIALER LINKS & PRE-POPULATED EMAIL BUILDER
   ========================================================================== */
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, x) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.toast.classList.remove('visible'), 2500);
}

async function copyText(text, label = 'Copied', emptyMsg = 'Nothing to copy') {
  if (!text || !String(text).trim()) {
    showToast(emptyMsg);
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${label} copied`);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(`${label} copied`);
    return true;
  }
}

function sanitizeHref(url) {
  if (!url || !url.trim()) return '#';
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function formatTelHref(phone) {
  const clean = (phone || '').replace(/[^\d+]/g, '');
  return /\d/.test(clean) ? `tel:${clean}` : '#';
}

function interpolate(template, contact, activeSettings = settings) {
  const c = contact || {
    company: 'Harbour Lounge',
    name: 'Jordan Taylor',
    job_title: 'General Manager',
    city: 'Toronto'
  };

  const contactName = (c.name || '').trim();
  const firstName = contactName ? contactName.split(/\s+/)[0] : 'there';
  const sName = (activeSettings.senderName || '').trim();
  const sFirstName = sName ? sName.split(/\s+/)[0] : '';

  const vars = {
    company: c.company || c.name || 'your team',
    name: contactName || 'there',
    first_name: firstName,
    title: c.job_title || '',
    city: c.city || 'your area',
    senderName: sName,
    senderFirstName: sFirstName,
    senderCompany: activeSettings.senderCompany || '',
    senderEmail: activeSettings.senderEmail || '',
    senderTitle: activeSettings.senderTitle || ''
  };

  return (template || '').replace(/\{\{(\w+)\}\}/g, (_, key) => (
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : ''
  ));
}

function buildEmailHref(contact, emailOverride = null, recipientNameOverride = null, activeSettings = settings) {
  const rawEmail = (emailOverride !== null ? emailOverride : (contact && contact.email)) || '';
  if (!rawEmail.trim()) return '#';

  const contextContact = recipientNameOverride
    ? { ...(contact || {}), name: recipientNameOverride }
    : contact;

  const to = encodeURIComponent(rawEmail.trim());
  const su = encodeURIComponent(interpolate(activeSettings.emailSubject, contextContact, activeSettings));
  const bodyText = interpolate(activeSettings.emailBody, contextContact, activeSettings)
    .replace(/\r\n|\r|\n/g, '\r\n');
  const body = encodeURIComponent(bodyText);

  switch (activeSettings.emailProvider) {
    case 'gmail':
      return `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${su}&body=${body}`;
    case 'outlook':
      return `https://outlook.live.com/mail/0/deeplink/compose?to=${to}&subject=${su}&body=${body}`;
    case 'office365':
      return `https://outlook.office.com/mail/deeplink/compose?to=${to}&subject=${su}&body=${body}`;
    case 'mailto':
    default:
      return `mailto:${to.replace(/%40/gi, '@')}?subject=${su}&body=${body}`;
  }
}

function configureEmailAnchor(anchorEl, href) {
  if (!anchorEl) return;
  anchorEl.href = href;
  const isDisabled = href === '#';
  const opensWebMail = /^https?:\/\//i.test(href);
  anchorEl.classList.toggle('is-disabled', isDisabled);
  if (!isDisabled && opensWebMail) {
    anchorEl.setAttribute('target', '_blank');
    anchorEl.setAttribute('rel', 'noopener noreferrer');
  } else {
    anchorEl.removeAttribute('target');
    anchorEl.removeAttribute('rel');
  }
}

function formatCallbackShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDisplayDate(isoDate) {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDobPill(dobStr) {
  if (!dobStr) return '';
  const parts = dobStr.split('-');
  if (parts.length !== 3) return '';
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const day = Number(parts[2]);
  if (!y || !m || !day) return '';
  const now = new Date();
  let age = now.getFullYear() - y;
  const mDiff = (now.getMonth() + 1) - m;
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < day)) age--;
  const monthShort = new Date(y, m - 1, day).toLocaleString([], { month: 'short' });
  return age >= 0 && age < 120 ? `${monthShort} ${day} (${age})` : `${monthShort} ${day}`;
}

function getMonogram(name) {
  const clean = (name || '').trim();
  if (!clean) return 'DC';
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

const GENERIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com',
  'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me'
]);

function getDomainFromContact(c) {
  if (c.website && c.website.trim()) {
    try {
      const u = new URL(sanitizeHref(c.website));
      if (u.hostname && u.hostname.includes('.')) return u.hostname.replace(/^www\./i, '');
    } catch {}
  }
  if (c.email && c.email.includes('@')) {
    const domain = c.email.split('@')[1].trim().toLowerCase();
    if (domain && domain.includes('.') && !GENERIC_EMAIL_DOMAINS.has(domain)) return domain;
  }
  return '';
}

function applyLogoToElement(imgEl, fallbackEl, contact) {
  const token = ++state.logoSeq;
  imgEl.dataset.logoToken = String(token);
  fallbackEl.textContent = getMonogram(contact.company || contact.name);

  const candidates = [];
  if (contact.custom_logo_url && contact.custom_logo_url.trim()) {
    candidates.push(contact.custom_logo_url.trim());
  }
  const domain = getDomainFromContact(contact);
  if (domain) {
    candidates.push(`https://logo.clearbit.com/${encodeURIComponent(domain)}`);
    candidates.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`);
  }

  if (!candidates.length) {
    imgEl.classList.add('hidden');
    imgEl.removeAttribute('src');
    fallbackEl.classList.remove('hidden');
    return;
  }

  let idx = 0;
  const tryNext = () => {
    if (imgEl.dataset.logoToken !== String(token)) return;
    if (idx >= candidates.length) {
      imgEl.classList.add('hidden');
      fallbackEl.classList.remove('hidden');
      return;
    }
    const src = candidates[idx++];
    imgEl.classList.remove('hidden');
    fallbackEl.classList.add('hidden');
    imgEl.src = src;
  };

  imgEl.onerror = tryNext;
  imgEl.onload = () => {
    if (imgEl.dataset.logoToken !== String(token)) return;
    if (imgEl.naturalWidth <= 1 || imgEl.naturalHeight <= 1) tryNext();
  };
  tryNext();
}

/* ==========================================================================
   5. DAILY TARGET TRACKING & LAYOUT SETTINGS APPLICATOR
   ========================================================================== */
function updateTreeFromDailyTarget() {
  const today = getTodayDateKey();
  if (dailyProgress.date !== today) {
    dailyProgress = { date: today, count: 0 };
    saveDailyProgress(dailyProgress);
  }

  const target = Math.max(1, Number(settings.dailyTarget) || 20);
  const count = dailyProgress.count;
  const ratio = clamp(count / target, 0, 1);
  const pct = Math.round(ratio * 100);

  state.treeProgressTarget = lerp(0.14, 1.0, ratio);
  state.treeGlowTarget = settings.glowOnTarget && ratio >= 1 ? 1.0 : 0.0;

  if (el.treeStageLabel) {
    el.treeStageLabel.textContent = ratio >= 1
      ? `${count} / ${target} Target Hit!`
      : `${count} / ${target} Today (${pct}%)`;
  }
  if (el.treeProgressFill) el.treeProgressFill.style.width = `${pct}%`;
  if (el.headerDailyText) el.headerDailyText.textContent = `${count} / ${target}`;
  if (el.headerDailyPill) el.headerDailyPill.classList.toggle('is-complete', ratio >= 1);
}

function applySettingsToLayout(threeCtrl = null) {
  const isMobile = window.innerWidth <= 959;
  const widthPct = isMobile
    ? clamp(Number(settings.treeWidthMobile) || 28, 18, 38)
    : clamp(Number(settings.treeWidthDesktop) || 30, 18, 42);

  const visibleRatio = clamp((Number(settings.visibleTreePercent) || 65) / 100, 0.4, 1.0);
  const svgShiftPct = Math.round((visibleRatio - 1) * 62);

  document.documentElement.style.setProperty('--tree-col-width', `${widthPct}vw`);
  document.documentElement.style.setProperty('--svg-shift-x', `${svgShiftPct}%`);
  document.body.classList.toggle('is-compact-cards', Boolean(settings.compactQueueCards));

  updateTreeFromDailyTarget();
  if (threeCtrl) threeCtrl.resize();
}

/* ==========================================================================
   6. RENDERING & FILTERING
   ========================================================================== */
function updateCounts() {
  el.countProspects.textContent = state.contacts.filter((c) => c.stage === 'prospects').length;
  el.countFollowup.textContent = state.contacts.filter((c) => c.stage === 'followup').length;
  el.countEmailed.textContent = state.contacts.filter((c) => c.stage === 'emailed').length;
  el.countOnboarded.textContent = state.contacts.filter((c) => c.stage === 'onboarded').length;
  el.countAll.textContent = state.contacts.length;
}

function applyFilters() {
  updateCounts();

  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.stage === state.stageFilter);
  });

  const isOnboardedMode = state.stageFilter === 'onboarded';
  el.workbench.classList.toggle('is-onboarded-mode', isOnboardedMode);
  el.paneOnboarded.classList.toggle('hidden', !isOnboardedMode);

  if (isOnboardedMode) {
    el.paneCockpit.classList.remove('mobile-visible');
    renderOnboardedWorkspace();
    return;
  }

  const q = state.search.toLowerCase().trim();
  el.btnClearSearch.classList.toggle('hidden', !state.search);

  state.filtered = state.contacts.filter((c) => {
    const matchesQuery = !q ||
      (c.company && c.company.toLowerCase().includes(q)) ||
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.website && c.website.toLowerCase().includes(q)) ||
      (c.city && c.city.toLowerCase().includes(q));

    if (!matchesQuery) return false;
    if (state.stageFilter === 'all') return true;
    return c.stage === state.stageFilter;
  });

  renderList();

  if (state.activeId && !state.filtered.some((c) => c.id === state.activeId)) {
    state.activeId = state.filtered.length > 0 && window.innerWidth > 959 ? state.filtered[0].id : null;
  }
  if (!state.activeId && state.filtered.length > 0 && window.innerWidth > 959) {
    state.activeId = state.filtered[0].id;
  }

  renderActiveCockpit();
}

function renderList() {
  if (state.contacts.length === 0) {
    el.list.innerHTML = `
      <div class="list-empty-onboarding">
        <h3>Queue Empty</h3>
        <p>Import a CSV lead list, add a lead, or load sample leads to start calling.</p>
        <div class="empty-actions">
          <label for="csvFileInput" class="btn btn-primary">Import CSV</label>
          <button id="btnListEmptyAdd" class="btn btn-vellum" type="button">+ Add Lead</button>
          <button id="btnListLoadDemo" class="btn btn-vellum" type="button">Sample Leads</button>
        </div>
      </div>
    `;
    return;
  }

  if (state.filtered.length === 0) {
    const clearHtml = state.search
      ? `<button id="btnEmptyClearSearch" class="btn btn-vellum" type="button" style="margin-top:10px;">Clear Search</button>`
      : '';
    el.list.innerHTML = `<div class="list-empty"><div>No contacts in this view.</div>${clearHtml}</div>`;
    return;
  }

  const stageLabels = {
    prospects: 'Prospect',
    followup: 'Follow-Up',
    emailed: 'Emailed',
    onboarded: 'Onboarded'
  };

  el.list.innerHTML = state.filtered.map((c) => {
    const title = c.company || c.name || 'Unnamed Contact';
    const subParts = [c.company && c.name ? c.name : c.job_title, c.city].filter(Boolean);
    const tags = [];
    if (c.website) tags.push('<span class="mini-tag">Web</span>');
    if (c.email) tags.push('<span class="mini-tag">Email</span>');
    if (c.attempts) tags.push(`<span class="mini-tag">Att:${c.attempts}</span>`);
    if (c.callback_at && c.stage === 'followup') tags.push('<span class="mini-tag mini-tag-cb">CB</span>');

    return `
      <div class="contact-card ${c.id === state.activeId ? 'active' : ''}" data-id="${esc(c.id)}" role="listitem">
        <div class="card-main">
          <div class="card-top">
            <div class="card-title">${esc(title)}</div>
            <span class="card-stage-dot dot-${c.stage}">${stageLabels[c.stage] || 'Prospect'}</span>
          </div>
          <div class="card-sub">${esc(subParts.join(' · ') || 'Lead')}</div>
          <div class="card-meta">
            <span>${esc(c.phone || 'No phone')}</span>
            <span class="card-tags">${tags.join('')}</span>
          </div>
        </div>
        <span class="card-chevron" aria-hidden="true">›</span>
      </div>
    `;
  }).join('');
}

function selectLead(id, openMobile = true) {
  state.activeId = id;

  const cards = el.list.querySelectorAll('.contact-card');
  if (cards.length) {
    cards.forEach((card) => {
      const isMatch = card.dataset.id === id;
      card.classList.toggle('active', isMatch);
      if (isMatch) card.scrollIntoView({ block: 'nearest' });
    });
  } else {
    renderList();
  }

  renderActiveCockpit();

  if (openMobile && window.innerWidth <= 959) {
    el.paneCockpit.classList.add('mobile-visible');
    el.cockpitContent.scrollTop = 0;
  }
}

function stepLead(delta) {
  if (!state.filtered.length) return;
  const idx = state.filtered.findIndex((c) => c.id === state.activeId);
  if (idx === -1) {
    selectLead(state.filtered[0].id);
    return;
  }
  const target = idx + delta;
  if (target >= 0 && target < state.filtered.length) {
    selectLead(state.filtered[target].id, false);
    el.cockpitContent.scrollTop = 0;
  }
}

function renderActiveCockpit() {
  const c = state.contacts.find((x) => x.id === state.activeId);
  const activeIdx = state.filtered.findIndex((x) => x.id === state.activeId);

  el.btnPrevLead.disabled = activeIdx <= 0;
  el.btnNextLead.disabled = activeIdx === -1 || activeIdx >= state.filtered.length - 1;
  el.mobileQueueCounter.textContent = activeIdx !== -1
    ? `${activeIdx + 1} of ${state.filtered.length}`
    : `${state.filtered.length} in queue`;
  el.mobileNavTitle.textContent = c ? (c.company || c.name || 'Contact') : 'Contact';

  if (!c) {
    el.cockpitEmpty.classList.remove('hidden');
    el.cockpitContent.classList.add('hidden');
    return;
  }

  el.cockpitEmpty.classList.add('hidden');
  el.cockpitContent.classList.remove('hidden');

  el.onboardedCockpitBanner.classList.toggle('hidden', c.stage !== 'onboarded');
  el.leadStageSelect.value = c.stage;

  if (c.attempts > 0) {
    el.leadAttemptsBadge.textContent = `${c.attempts} ${c.attempts === 1 ? 'attempt' : 'attempts'}`;
    el.leadAttemptsBadge.classList.remove('hidden');
  } else {
    el.leadAttemptsBadge.classList.add('hidden');
  }

  if (c.callback_at && c.stage === 'followup') {
    el.leadCallbackBadge.textContent = `Call Back: ${formatCallbackShort(c.callback_at)}`;
    el.leadCallbackBadge.classList.remove('hidden');
  } else {
    el.leadCallbackBadge.classList.add('hidden');
  }

  const expandEditor = Boolean(settings.defaultEditOpen);
  el.inlineEditPanel.classList.toggle('hidden', !expandEditor);
  el.btnToggleInlineEdit.setAttribute('aria-expanded', String(expandEditor));
  el.btnToggleInlineEdit.textContent = expandEditor ? 'Done Editing' : 'Edit Details';

  syncHeroDisplayFields(c);
  syncActionTiles(c);
  syncInlineEditorInputs(c);

  el.leadNotes.value = c.notes || '';
}

function syncHeroDisplayFields(c) {
  el.leadCompanyDisplay.textContent = c.company || c.name || 'Unnamed Contact';
  el.leadSubtitleDisplay.textContent = [c.name, c.job_title].filter(Boolean).join(' · ') || 'No contact name added';
  el.leadAdminSummary.textContent = [c.street_address, c.city, c.postal_code, c.country].filter(Boolean).join(', ') || 'No address added';
}

function syncActionTiles(c) {
  const telHref = formatTelHref(c.phone);
  el.leadPhoneDisplay.textContent = c.phone || 'No phone';
  el.btnCallLead.href = telHref;
  el.btnCallLead.classList.toggle('is-disabled', telHref === '#');

  const mailHref = buildEmailHref(c);
  el.leadEmailDisplay.textContent = c.email || 'No email';
  configureEmailAnchor(el.btnSendEmail, mailHref);

  el.emailSubjectPreview.textContent = interpolate(settings.emailSubject, c);
  el.emailPreviewBox.textContent = interpolate(settings.emailBody, c);

  const hasWeb = Boolean(c.website && c.website.trim());
  el.leadWebsiteDisplay.textContent = hasWeb ? c.website.replace(/^https?:\/\/(www\.)?/i, '') : 'No website';
  el.btnVisitWebsite.href = hasWeb ? sanitizeHref(c.website) : '#';
  el.btnVisitWebsite.classList.toggle('is-disabled', !hasWeb);
}

function syncInlineEditorInputs(c) {
  el.editCompany.value = c.company || '';
  el.editName.value = c.name || '';
  el.editTitle.value = c.job_title || '';
  el.editPhone.value = c.phone || '';
  el.editEmail.value = c.email || '';
  el.editWebsite.value = c.website || '';
  el.editAddress.value = c.street_address || '';
  el.editCity.value = c.city || '';
  el.editPostal.value = c.postal_code || '';
  el.editCountry.value = c.country || '';
}

/* ==========================================================================
   7. INLINE ADMIN DETAIL AUTO-SAVE
   ========================================================================== */
function initInlineAdminEditing() {
  el.btnToggleInlineEdit.addEventListener('click', () => {
    const isHidden = el.inlineEditPanel.classList.toggle('hidden');
    el.btnToggleInlineEdit.setAttribute('aria-expanded', String(!isHidden));
    el.btnToggleInlineEdit.textContent = isHidden ? 'Edit Details' : 'Done Editing';
  });

  const bindings = [
    [el.editCompany, 'company'],
    [el.editName, 'name'],
    [el.editTitle, 'job_title'],
    [el.editPhone, 'phone'],
    [el.editEmail, 'email'],
    [el.editWebsite, 'website'],
    [el.editAddress, 'street_address'],
    [el.editCity, 'city'],
    [el.editPostal, 'postal_code'],
    [el.editCountry, 'country']
  ];

  bindings.forEach(([inputEl, field]) => {
    inputEl.addEventListener('input', () => {
      const c = state.contacts.find((x) => x.id === state.activeId);
      if (!c) return;
      c[field] = inputEl.value.trim();
      syncHeroDisplayFields(c);
      syncActionTiles(c);

      clearTimeout(state.inlineSaveTimer);
      state.inlineSaveTimer = setTimeout(async () => {
        await dbAPI.put(c);
        renderList();
        el.cockpitSavePill.classList.add('visible');
        setTimeout(() => el.cockpitSavePill.classList.remove('visible'), 1000);
      }, 280);
    });
  });

  el.leadStageSelect.addEventListener('change', async (e) => {
    const c = state.contacts.find((x) => x.id === state.activeId);
    if (!c) return;
    c.stage = e.target.value;
    if (c.stage === 'onboarded') {
      c.onboarded_at = c.onboarded_at || new Date().toISOString().slice(0, 10);
      ensureDefaultEmployees(c);
    }
    await dbAPI.put(c);
    applyFilters();
    showToast(`Stage updated to ${c.stage}`);
  });

  el.leadNotes.addEventListener('input', () => {
    const c = state.contacts.find((x) => x.id === state.activeId);
    if (!c) return;
    c.notes = el.leadNotes.value;

    clearTimeout(state.notesTimer);
    state.notesTimer = setTimeout(async () => {
      await dbAPI.put(c);
      el.notesSaveIndicator.classList.add('visible');
      setTimeout(() => el.notesSaveIndicator.classList.remove('visible'), 1100);
    }, 300);
  });
}

/* ==========================================================================
   8. ONBOARDED BUSINESS PROFILES & EMPLOYEE DIRECTORY
   ========================================================================== */
function getOnboardedList() {
  const q = state.onboardedSearch.toLowerCase().trim();
  const list = state.contacts.filter((c) => c.stage === 'onboarded');
  if (!q) return list;
  return list.filter((c) => {
    const empMatch = (c.employees || []).some((emp) =>
      (emp.name && emp.name.toLowerCase().includes(q)) ||
      (emp.email && emp.email.toLowerCase().includes(q)) ||
      (emp.phone && emp.phone.toLowerCase().includes(q)) ||
      (emp.title && emp.title.toLowerCase().includes(q))
    );
    return empMatch ||
      (c.company && c.company.toLowerCase().includes(q)) ||
      (c.city && c.city.toLowerCase().includes(q)) ||
      (c.website && c.website.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q));
  });
}

function renderOnboardedWorkspace() {
  const activeProfile = state.activeOnboardedId
    ? state.contacts.find((c) => c.id === state.activeOnboardedId && c.stage === 'onboarded')
    : null;

  if (!activeProfile) {
    state.activeOnboardedId = null;
    el.onboardedDirectory.classList.remove('hidden');
    el.onboardedProfileView.classList.add('hidden');
    renderOnboardedDirectory();
  } else {
    el.onboardedDirectory.classList.add('hidden');
    el.onboardedProfileView.classList.remove('hidden');
    renderOnboardedProfile(activeProfile);
  }
}

function renderOnboardedDirectory() {
  const allOnboarded = state.contacts.filter((c) => c.stage === 'onboarded');
  const filtered = getOnboardedList();
  el.onboardedDirCount.textContent = allOnboarded.length;
  el.btnClearOnboardedSearch.classList.toggle('hidden', !state.onboardedSearch);

  if (!allOnboarded.length) {
    el.onboardedGrid.innerHTML = `
      <div class="paper-card onboarded-empty">
        <h3>No Onboarded Businesses Yet</h3>
        <p>Tap <strong>Onboard</strong> on any lead to create a full client profile with website logo and team cards.</p>
        <button id="btnEmptyAddOnboarded" class="btn btn-gold" type="button">+ New Business Profile</button>
      </div>
    `;
    return;
  }

  if (!filtered.length) {
    el.onboardedGrid.innerHTML = `
      <div class="paper-card onboarded-empty">
        <h3>No Matching Businesses</h3>
        <p>Clear your search to view all ${allOnboarded.length} onboarded accounts.</p>
        <button id="btnClearOnboardedEmpty" class="btn btn-vellum" type="button">Clear Search</button>
      </div>
    `;
    return;
  }

  const statusMap = { active: 'Active', onboarding: 'Onboarding', vip: 'VIP', paused: 'Paused' };

  el.onboardedGrid.innerHTML = filtered.map((c) => {
    ensureDefaultEmployees(c);
    const primary = c.employees.find((e) => e.roleType === 'primary');
    const filledTeam = c.employees.filter((e) => e.name || e.phone || e.email).length;
    const websiteLabel = c.website ? c.website.replace(/^https?:\/\/(www\.)?/i, '') : 'No website';

    return `
      <article class="paper-card profile-card" data-onboarded-id="${esc(c.id)}" tabindex="0" role="button">
        <div class="profile-card-head">
          <div class="profile-card-logo">
            <img class="card-logo-img hidden" data-logo-for="${esc(c.id)}" alt="${esc(c.company)} logo">
            <span class="logo-monogram-sm" data-fallback-for="${esc(c.id)}">${esc(getMonogram(c.company || c.name))}</span>
          </div>
          <div class="profile-card-title-wrap">
            <h3>${esc(c.company || c.name || 'Unnamed Business')}</h3>
            <div class="profile-card-badges">
              <span class="onboarded-date-pill">${esc(formatDisplayDate(c.onboarded_at) || 'Onboarded')}</span>
              <span class="status-mini-pill">${statusMap[c.account_status] || 'Active'}</span>
            </div>
          </div>
        </div>
        <div class="profile-card-details">
          <div>Web: ${esc(websiteLabel)}</div>
          <div>Phone: ${esc(c.phone || 'None')}</div>
          <div>Email: ${esc(c.email || 'None')}</div>
        </div>
        <div class="profile-card-footer">
          <span>${primary && primary.name ? esc(primary.name) : 'Primary pending'} · ${filledTeam} team</span>
          <span class="profile-open-cta">Open ›</span>
        </div>
      </article>
    `;
  }).join('');

  filtered.forEach((c) => {
    const img = el.onboardedGrid.querySelector(`[data-logo-for="${CSS.escape(c.id)}"]`);
    const fb = el.onboardedGrid.querySelector(`[data-fallback-for="${CSS.escape(c.id)}"]`);
    if (img && fb) applyLogoToElement(img, fb, c);
  });
}

function renderOnboardedProfile(c) {
  ensureDefaultEmployees(c);
  const list = getOnboardedList();
  const idx = list.findIndex((x) => x.id === c.id);
  el.btnPrevOnboarded.disabled = idx <= 0;
  el.btnNextOnboarded.disabled = idx === -1 || idx >= list.length - 1;

  el.onboardedNavTitle.textContent = c.company || 'Business Profile';
  el.onboardedStageSelect.value = c.stage;
  applyLogoToElement(el.profLogoImg, el.profLogoFallback, c);

  el.profCompany.value = c.company || '';
  el.profOnboardedDate.value = c.onboarded_at || '';
  el.profBusinessType.value = c.business_type || '';
  el.profAccountStatus.value = c.account_status || 'active';
  el.profWebsite.value = c.website || '';
  el.profAppUrl.value = c.app_url || '';
  el.profEmail.value = c.email || '';
  el.profPhone.value = c.phone || '';
  el.profAddress.value = c.street_address || '';
  el.profCity.value = c.city || '';
  el.profPostal.value = c.postal_code || '';
  el.profCountry.value = c.country || '';
  el.profNotes.value = c.notes || '';

  syncProfileActionLinks(c);
  renderEmployeeCards(c);
}

function syncProfileActionLinks(c) {
  const webHref = c.website && c.website.trim() ? sanitizeHref(c.website) : '#';
  el.btnOpenProfWebsite.href = webHref;
  el.btnOpenProfWebsite.classList.toggle('is-disabled', webHref === '#');

  const appHref = c.app_url && c.app_url.trim() ? sanitizeHref(c.app_url) : '#';
  el.btnOpenProfAppUrl.href = appHref;
  el.btnOpenProfAppUrl.classList.toggle('is-disabled', appHref === '#');

  configureEmailAnchor(el.btnEmailProf, buildEmailHref(c));

  const telHref = formatTelHref(c.phone);
  el.btnCallProf.href = telHref;
  el.btnCallProf.classList.toggle('is-disabled', telHref === '#');
}

function renderEmployeeCards(c) {
  ensureDefaultEmployees(c);
  el.employeeCountBadge.textContent = c.employees.length;

  const roleMeta = {
    primary: { label: 'Primary Contact', cls: 'is-primary' },
    secondary: { label: 'Secondary Contact', cls: 'is-secondary' },
    employee: { label: 'Team Member', cls: 'is-employee' }
  };

  el.employeeCardsList.innerHTML = c.employees.map((emp) => {
    const rm = roleMeta[emp.roleType] || roleMeta.employee;
    const summaryText = [emp.name, emp.title].filter(Boolean).join(' · ');
    const telHref = formatTelHref(emp.phone);
    const mailHref = buildEmailHref(c, emp.email || '', emp.name || '');
    const mailBlank = mailHref !== '#' && settings.emailProvider !== 'mailto';
    const dobText = formatDobPill(emp.dob);

    return `
      <div class="paper-card employee-card ${rm.cls}" data-emp-card="${esc(emp.id)}">
        <div class="employee-card-head">
          <div class="employee-role-left">
            <span class="role-pill">${rm.label}</span>
            <span class="employee-header-summary ${summaryText ? '' : 'is-empty'}" data-emp-summary="${esc(emp.id)}">
              ${summaryText ? esc(summaryText) : `Add ${rm.label.toLowerCase()} details`}
            </span>
          </div>

          <div class="employee-quick-actions">
            <span class="dob-pill ${dobText ? '' : 'hidden'}" data-emp-dob-pill="${esc(emp.id)}">${esc(dobText)}</span>
            <a class="btn-chip ${telHref !== '#' ? '' : 'is-disabled'}" data-emp-call="${esc(emp.id)}" href="${telHref}">Call</a>
            <a class="btn-chip ${mailHref !== '#' ? '' : 'is-disabled'}" data-emp-mail="${esc(emp.id)}" href="${mailHref}" ${mailBlank ? 'target="_blank" rel="noopener noreferrer"' : ''}>Email</a>
            ${emp.roleType === 'employee'
              ? `<button type="button" class="btn-chip btn-chip-danger" data-remove-emp="${esc(emp.id)}">Delete</button>`
              : ''}
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Full Name</label>
            <input type="text" data-emp-id="${esc(emp.id)}" data-emp-field="name" value="${esc(emp.name)}" placeholder="e.g. Jordan Taylor">
          </div>
          <div class="form-group">
            <label>Role / Title</label>
            <input type="text" data-emp-id="${esc(emp.id)}" data-emp-field="title" value="${esc(emp.title)}" placeholder="e.g. General Manager">
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Phone Number</label>
            <input type="tel" data-emp-id="${esc(emp.id)}" data-emp-field="phone" value="${esc(emp.phone)}" placeholder="+1 555 000 0000">
          </div>
          <div class="form-group">
            <label>Email Address</label>
            <input type="email" data-emp-id="${esc(emp.id)}" data-emp-field="email" value="${esc(emp.email)}" placeholder="name@company.com">
          </div>
        </div>

        <div class="form-row form-row-3">
          <div class="form-group">
            <label>Date of Birth</label>
            <input type="date" data-emp-id="${esc(emp.id)}" data-emp-field="dob" value="${esc(emp.dob)}">
          </div>
          <div class="form-group">
            <label>Preferred Contact</label>
            <select data-emp-id="${esc(emp.id)}" data-emp-field="preferred_contact">
              <option value="" ${!emp.preferred_contact ? 'selected' : ''}>Select...</option>
              <option value="phone" ${emp.preferred_contact === 'phone' ? 'selected' : ''}>Phone Call</option>
              <option value="sms" ${emp.preferred_contact === 'sms' ? 'selected' : ''}>SMS / Text</option>
              <option value="email" ${emp.preferred_contact === 'email' ? 'selected' : ''}>Email</option>
            </select>
          </div>
          <div class="form-group">
            <label>Best Time to Reach</label>
            <input type="text" data-emp-id="${esc(emp.id)}" data-emp-field="availability" value="${esc(emp.availability)}" placeholder="e.g. Tue-Sat 1-4 PM">
          </div>
        </div>

        <div class="form-group" style="margin-bottom:0;">
          <label>Notes</label>
          <textarea rows="2" data-emp-id="${esc(emp.id)}" data-emp-field="notes" placeholder="Preferences or key notes...">${esc(emp.notes)}</textarea>
        </div>
      </div>
    `;
  }).join('');
}

function scheduleProfileSave(c) {
  el.onboardedSaveIndicator.textContent = 'Saving...';
  el.onboardedSaveIndicator.classList.add('visible');
  clearTimeout(state.profileSaveTimer);
  state.profileSaveTimer = setTimeout(async () => {
    await dbAPI.put(c);
    updateCounts();
    el.onboardedSaveIndicator.textContent = 'Saved';
    setTimeout(() => el.onboardedSaveIndicator.classList.remove('visible'), 1100);
  }, 280);
}

function openOnboardedProfileById(id) {
  const c = state.contacts.find((x) => x.id === id);
  if (!c) return;
  if (c.stage !== 'onboarded') {
    c.stage = 'onboarded';
    c.onboarded_at = c.onboarded_at || new Date().toISOString().slice(0, 10);
    ensureDefaultEmployees(c);
    dbAPI.put(c);
  }
  state.stageFilter = 'onboarded';
  state.activeOnboardedId = id;
  applyFilters();
  el.profileScroll.scrollTop = 0;
}

function createNewOnboardedBusiness() {
  const name = prompt('Enter the Business Name:');
  if (!name || !name.trim()) return;
  const c = normalizeContact({
    id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    company: name.trim(),
    stage: 'onboarded',
    onboarded_at: new Date().toISOString().slice(0, 10),
    account_status: 'active',
    attempts: 0
  });
  state.contacts.unshift(c);
  dbAPI.put(c).then(() => {
    state.stageFilter = 'onboarded';
    state.activeOnboardedId = c.id;
    applyFilters();
    showToast('Business profile created');
  });
}

/* ==========================================================================
   9. DISPOSITIONS, SAMPLE LEADS & CSV IMPORT/EXPORT
   ========================================================================== */
async function setDisposition(type) {
  const c = state.contacts.find((x) => x.id === state.activeId);
  if (!c) return false;

  const currentIdx = state.filtered.findIndex((x) => x.id === c.id);

  if (type === 'emailed') {
    c.stage = 'emailed';
    c.email_sent_at = new Date().toISOString();
    await dbAPI.put(c);
    if (settings.countEmailsTowardTarget) incrementDailyTarget(1);
    showToast('Moved to Emailed');
  } else if (type === 'no_answer') {
    c.attempts = (c.attempts || 0) + 1;
    c.last_attempt_at = new Date().toISOString();
    c.stage = 'followup';
    await dbAPI.put(c);
    incrementDailyTarget(1);
    showToast(`Attempt #${c.attempts} logged. Moved to Follow-Up.`);
  } else if (type === 'onboarded') {
    c.stage = 'onboarded';
    c.onboarded_at = c.onboarded_at || new Date().toISOString().slice(0, 10);
    ensureDefaultEmployees(c);
    await dbAPI.put(c);
    incrementDailyTarget(Math.max(1, Number(settings.onboardBonus) || 3));
    showToast('Onboarded! Client profile ready.');
  } else if (type === 'delete') {
    if (settings.confirmDelete && !confirm(`Remove "${c.company || c.name}" permanently?`)) return false;
    await dbAPI.delete(c.id);
    state.contacts = state.contacts.filter((x) => x.id !== c.id);
    if (state.activeOnboardedId === c.id) state.activeOnboardedId = null;
    state.activeId = null;
    showToast('Lead removed');
  }

  applyFilters();

  if (type !== 'delete' && settings.autoAdvance && state.filtered.length > 0) {
    const nextIdx = Math.min(Math.max(currentIdx, 0), state.filtered.length - 1);
    if (!state.filtered.some((x) => x.id === state.activeId)) {
      selectLead(state.filtered[nextIdx].id, false);
    }
  } else if (state.filtered.length === 0 && window.innerWidth <= 959) {
    el.paneCockpit.classList.remove('mobile-visible');
  }
  return true;
}

async function loadSampleLeads() {
  const samples = [
    {
      company: 'Harbour Social House',
      name: 'Maya Chen',
      job_title: 'General Manager',
      phone: '+1 (416) 555-0142',
      email: 'maya@harboursocial.example.com',
      website: 'https://harboursocial.example.com',
      street_address: '142 Harbourfront Way',
      city: 'Toronto',
      postal_code: 'M5J 2Z4',
      country: 'Canada',
      notes: 'Call between 1 PM and 3 PM before evening service.',
      stage: 'prospects'
    },
    {
      company: 'Velvet Oak Bistro',
      name: 'Liam Carter',
      job_title: 'Operations Director',
      phone: '+1 (416) 555-0198',
      email: 'liam@velvetoak.example.com',
      website: 'https://velvetoak.example.com',
      street_address: '88 King St W',
      city: 'Toronto',
      postal_code: 'M5H 1A1',
      country: 'Canada',
      notes: 'Requested follow up email with overview.',
      stage: 'followup',
      attempts: 1
    },
    {
      company: 'Cedar & Copper Lounge',
      name: 'Elena Brooks',
      job_title: 'Owner',
      phone: '+1 (604) 555-0174',
      email: 'elena@cedarcopper.example.com',
      website: 'https://cedarcopper.example.com',
      street_address: '310 Water St',
      city: 'Vancouver',
      postal_code: 'V6B 1B6',
      country: 'Canada',
      notes: 'Active team using central training hub.',
      stage: 'onboarded'
    }
  ];

  for (const raw of samples) {
    const c = normalizeContact({
      ...raw,
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
    });
    await dbAPI.put(c);
    state.contacts.push(c);
  }
  applyFilters();
  showToast('Sample leads loaded');
}

function parseCSV(text) {
  const cleanText = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [''];
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    const next = cleanText[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') { row[row.length - 1] += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      row.push('');
    } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
      if (ch === '\r' && next === '\n') i++;
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [''];
    } else {
      row[row.length - 1] += ch;
    }
  }
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

function exportCsvLeads() {
  if (!state.contacts.length) return showToast('No leads to export');
  const cols = [
    'name', 'phone', 'email', 'country', 'city', 'street_address',
    'postal_code', 'company', 'job_title', 'website', 'notes',
    'stage', 'attempts', 'callback_at', 'onboarded_at', 'business_type', 'account_status'
  ];
  const lines = [cols.join(',')];
  state.contacts.forEach((c) => {
    lines.push(cols.map((k) => `"${String(c[k] ?? '').replace(/"/g, '""')}"`).join(','));
  });
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `dialler_crm_leads_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ==========================================================================
   10. 3D ROSE-GOLD BLOSSOM TREE (ALWAYS LEFT 30%, DRIVEN BY DAILY TARGET)
   ========================================================================== */
function createSeededRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fallbackTree = {
  paths: [],
  blooms: [],
  init() {
    const svg = document.getElementById('tree-fallback-svg');
    if (!svg) return;
    this.paths = Array.from(svg.querySelectorAll('.svg-grow-path')).map((p) => {
      const length = typeof p.getTotalLength === 'function' ? p.getTotalLength() : 200;
      p.style.strokeDasharray = `${length}`;
      p.style.strokeDashoffset = `${length}`;
      return { el: p, length, start: Number(p.dataset.start || 0), end: Number(p.dataset.end || 1) };
    });
    this.blooms = Array.from(svg.querySelectorAll('.svg-bloom-node')).map((n) => ({
      el: n,
      start: Number(n.dataset.start || 0.6),
      end: Number(n.dataset.end || 1)
    }));
  },
  update(progress) {
    this.paths.forEach((item) => {
      const local = smoothstep(item.start, item.end, progress);
      item.el.style.strokeDashoffset = `${item.length * (1 - local)}`;
      item.el.style.opacity = local > 0.01 ? '1' : '0';
    });
    this.blooms.forEach((item) => {
      item.el.style.opacity = `${smoothstep(item.start, item.end, progress)}`;
    });
  }
};

async function initThreeTree() {
  const treeStage = el.treeStage;
  const canvas = document.getElementById('tree-canvas');
  if (!treeStage || !canvas) return null;

  const activateFallback = () => {
    treeStage.classList.add('is-fallback');
    fallbackTree.init();
    fallbackTree.update(state.treeProgressSmooth);
    return null;
  };

  let testCtx = null;
  try { testCtx = canvas.getContext('webgl2') || canvas.getContext('webgl'); } catch { return activateFallback(); }
  if (!testCtx) return activateFallback();

  let THREE;
  try { THREE = await import(TREE_CDN_URL); } catch { return activateFallback(); }

  try {
    const isMobile = window.innerWidth <= 959;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 0.5, 0.1, 60);

    const rng = createSeededRng(TREE_SEED);
    const barkCanvas = document.createElement('canvas');
    barkCanvas.width = 256;
    barkCanvas.height = 256;
    const bCtx = barkCanvas.getContext('2d');
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 360; i++) {
      const shade = Math.floor(75 + rng() * 130);
      bCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
      bCtx.fillRect(rng() * 256, rng() * 256, 1 + rng() * 3, 18 + rng() * 58);
    }
    const barkTex = new THREE.CanvasTexture(barkCanvas);
    barkTex.wrapS = THREE.RepeatWrapping;
    barkTex.wrapT = THREE.RepeatWrapping;
    barkTex.repeat.set(3, 6);

    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = 256;
    haloCanvas.height = 256;
    const hCtx = haloCanvas.getContext('2d');
    const hGrad = hCtx.createRadialGradient(128, 128, 6, 128, 128, 128);
    hGrad.addColorStop(0.0, 'rgba(255, 240, 178, 0.95)');
    hGrad.addColorStop(0.35, 'rgba(255, 206, 108, 0.50)');
    hGrad.addColorStop(1.0, 'rgba(229, 175, 110, 0.0)');
    hCtx.fillStyle = hGrad;
    hCtx.fillRect(0, 0, 256, 256);
    const haloTex = new THREE.CanvasTexture(haloCanvas);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0xf7f3eb);
    const pGeom = new THREE.PlaneGeometry(14, 14);
    const topP = new THREE.Mesh(pGeom, new THREE.MeshBasicMaterial({ color: 0xfff8ee }));
    topP.position.set(0, 9, 0); topP.rotation.x = Math.PI / 2;
    const keyP = new THREE.Mesh(pGeom, new THREE.MeshBasicMaterial({ color: 0xf6d5c0 }));
    keyP.position.set(8, 4, 6); keyP.lookAt(0, 2, 0);
    envScene.add(topP, keyP);
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    pGeom.dispose(); topP.material.dispose(); keyP.material.dispose(); pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0xfffaf2, 0xd4b69e, 1.15));
    const keyLight = new THREE.DirectionalLight(0xffe9d6, 2.2);
    keyLight.position.set(5, 8, 6);
    scene.add(keyLight);

    const bloomGoldLight = new THREE.PointLight(0xffd275, 0, 14, 1.6);
    bloomGoldLight.position.set(0.2, 2.4, 1.2);
    scene.add(bloomGoldLight);

    const barkMat = new THREE.MeshStandardMaterial({ color: 0xc89076, metalness: 0.72, roughness: 0.42, bumpMap: barkTex, bumpScale: 0.04, envMapIntensity: 1.3 });
    const branchMat = new THREE.MeshStandardMaterial({ color: 0xd9a890, metalness: 0.78, roughness: 0.34, bumpMap: barkTex, bumpScale: 0.02, envMapIntensity: 1.35 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.56, roughness: 0.30, emissive: 0x6e5420, emissiveIntensity: 0.05, side: THREE.DoubleSide, envMapIntensity: 1.2 });
    const blossomMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.48, roughness: 0.22, emissive: 0xffc663, emissiveIntensity: 0.08, side: THREE.DoubleSide, envMapIntensity: 1.4 });

    const treeGroup = new THREE.Group();
    treeGroup.position.set(0, -1.9, 0);
    scene.add(treeGroup);

    const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const haloPlane = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 7.0), haloMat);
    haloPlane.position.set(0.1, 3.2, -1.3);
    treeGroup.add(haloPlane);

    function createTaperedTube(curve, tubularSegs, rStart, rEnd, radialSegs, flute = 0) {
      const frames = curve.computeFrenetFrames(tubularSegs, false);
      const pos = []; const uv = []; const idx = [];
      for (let i = 0; i <= tubularSegs; i++) {
        const t = i / tubularSegs;
        const pt = curve.getPointAt(t);
        const N = frames.normals[i]; const B = frames.binormals[i];
        const baseR = lerp(rStart, rEnd, Math.pow(t, 0.8));
        for (let j = 0; j <= radialSegs; j++) {
          const ang = (j / radialSegs) * Math.PI * 2;
          const r = baseR * (flute > 0 ? 1 + flute * Math.sin(ang * 5 + t * 10) : 1);
          const nx = -Math.cos(ang) * N.x + Math.sin(ang) * B.x;
          const ny = -Math.cos(ang) * N.y + Math.sin(ang) * B.y;
          const nz = -Math.cos(ang) * N.z + Math.sin(ang) * B.z;
          pos.push(pt.x + r * nx, pt.y + r * ny, pt.z + r * nz);
          uv.push(t * 2.5, j / radialSegs);
        }
      }
      const stride = radialSegs + 1;
      for (let i = 0; i < tubularSegs; i++) {
        for (let j = 0; j < radialSegs; j++) {
          const a = i * stride + j; const b = (i + 1) * stride + j;
          const c = (i + 1) * stride + (j + 1); const d = i * stride + (j + 1);
          idx.push(a, b, d, b, c, d);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    }

    const branchRecords = []; const leafNodes = []; const blossomNodes = [];
    const addSeg = (pts, rS, rE, tSeg, rSeg, mat, sP, eP, flute = 0) => {
      const curve = new THREE.CatmullRomCurve3(pts);
      const geom = createTaperedTube(curve, tSeg, rS, rE, rSeg, flute);
      treeGroup.add(new THREE.Mesh(geom, mat));
      geom.setDrawRange(0, 0);
      branchRecords.push({ geom, tSeg, idxPerRing: rSeg * 6, sP, eP, lastRings: -1 });
      return curve;
    };

    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * Math.PI * 2 + (rng() - 0.5) * 0.4;
      const reach = 1.2 + rng() * 0.85;
      addSeg([
        new THREE.Vector3(Math.cos(ang) * 0.08, 0.14, Math.sin(ang) * 0.08),
        new THREE.Vector3(Math.cos(ang) * reach * 0.45, -0.05, Math.sin(ang) * reach * 0.45),
        new THREE.Vector3(Math.cos(ang + 0.2) * reach, -0.32, Math.sin(ang + 0.2) * reach)
      ], 0.11, 0.015, 24, 7, barkMat, 0.0, 0.28, 0.08);
    }

    const trunkCurve = addSeg([
      new THREE.Vector3(0, -0.05, 0),
      new THREE.Vector3(-0.08, 1.0, 0.04),
      new THREE.Vector3(0.12, 2.15, -0.05),
      new THREE.Vector3(-0.04, 3.25, 0.03),
      new THREE.Vector3(0.06, 4.05, 0)
    ], 0.25, 0.085, 44, 11, barkMat, 0.0, 0.42, 0.07);

    const limbs = [
      { angle: 0.22, t: 0.54, len: 1.75, elev: 0.65 },
      { angle: 1.38, t: 0.60, len: 1.82, elev: 0.85 },
      { angle: 2.55, t: 0.66, len: 1.65, elev: 0.78 },
      { angle: 3.72, t: 0.72, len: 1.60, elev: 0.88 },
      { angle: 4.88, t: 0.78, len: 1.75, elev: 0.92 },
      { angle: 5.78, t: 0.84, len: 1.68, elev: 1.02 },
      { angle: 0.82, t: 0.94, len: 1.42, elev: 1.38 },
      { angle: 3.95, t: 0.98, len: 1.35, elev: 1.46 }
    ];

    limbs.forEach((spec, idx) => {
      const origin = trunkCurve.getPointAt(spec.t);
      const ang = spec.angle + (rng() - 0.5) * 0.2;
      const tip = origin.clone().add(new THREE.Vector3(Math.cos(ang) * spec.len, spec.elev * 1.15, Math.sin(ang) * spec.len));
      const mid = origin.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.22, 0));
      const limbCurve = addSeg([origin, mid, tip], 0.072, 0.02, 30, 8, barkMat, 0.18 + idx * 0.026, 0.50 + idx * 0.02, 0.03);

      for (let s = 0; s < 3; s++) {
        const sOrig = limbCurve.getPointAt(0.30 + s * 0.28);
        const sAng = ang + (s % 2 === 0 ? 0.58 : -0.62);
        const sTip = sOrig.clone().add(new THREE.Vector3(Math.cos(sAng) * (0.7 + rng() * 0.35), 0.3 + rng() * 0.4, Math.sin(sAng) * (0.7 + rng() * 0.35)));
        const secCurve = addSeg([sOrig, sOrig.clone().lerp(sTip, 0.5).add(new THREE.Vector3(0, 0.1, 0)), sTip], 0.028, 0.008, 22, 6, branchMat, 0.34 + idx * 0.02, 0.68 + idx * 0.02);

        for (let tw = 0; tw < 2; tw++) {
          const twOrig = secCurve.getPointAt(0.42 + tw * 0.38);
          const twAng = sAng + (tw === 0 ? -0.5 : 0.5);
          const twTip = twOrig.clone().add(new THREE.Vector3(Math.cos(twAng) * 0.42, 0.22 + rng() * 0.2, Math.sin(twAng) * 0.42));
          addSeg([twOrig, twTip], 0.011, 0.0035, 14, 5, branchMat, 0.46 + rng() * 0.15, 0.78);

          for (let l = 0; l < 3; l++) {
            leafNodes.push({
              pos: twTip.clone().add(new THREE.Vector3((rng() - 0.5) * 0.16, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.16)),
              rot: new THREE.Euler((rng() - 0.5) * 1.0, rng() * Math.PI * 2, (rng() - 0.5) * 1.0),
              scale: 0.74 + rng() * 0.58,
              start: 0.44 + rng() * 0.18,
              end: 0.78 + rng() * 0.14,
              phase: rng() * Math.PI * 2
            });
          }

          blossomNodes.push({
            pos: twTip.clone(),
            rot: new THREE.Euler((rng() - 0.5) * 0.8, rng() * Math.PI * 2, (rng() - 0.5) * 0.8),
            scale: 0.8 + rng() * 0.58,
            start: 0.58 + rng() * 0.16,
            end: 0.94 + rng() * 0.06,
            phase: rng() * Math.PI * 2
          });
        }
      }

      blossomNodes.push({
        pos: tip.clone(),
        rot: new THREE.Euler((rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.5),
        scale: 1.08 + rng() * 0.28,
        start: 0.62 + idx * 0.02,
        end: 0.96,
        phase: rng() * Math.PI * 2
      });
    });

    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0);
    leafShape.bezierCurveTo(0.058, 0.048, 0.064, 0.145, 0, 0.22);
    leafShape.bezierCurveTo(-0.064, 0.145, -0.058, 0.048, 0, 0);
    const leafInst = new THREE.InstancedMesh(new THREE.ShapeGeometry(leafShape, 6), leafMat, leafNodes.length);
    leafInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const leafColors = [new THREE.Color(0xd9bd98), new THREE.Color(0xc5bea0), new THREE.Color(0xe3c8ad)];
    for (let i = 0; i < leafNodes.length; i++) leafInst.setColorAt(i, leafColors[i % 3]);
    if (leafInst.instanceColor) leafInst.instanceColor.needsUpdate = true;
    treeGroup.add(leafInst);

    const petalShape = new THREE.Shape();
    petalShape.moveTo(0, 0);
    petalShape.bezierCurveTo(0.048, 0.032, 0.058, 0.11, 0, 0.145);
    petalShape.bezierCurveTo(-0.058, 0.11, -0.048, 0.032, 0, 0);
    const singlePetal = new THREE.ShapeGeometry(petalShape, 5);
    const mPos = []; const mNorm = [];
    const bPos = singlePetal.attributes.position; const bNorm = singlePetal.attributes.normal; const bIdx = singlePetal.index;
    const tv = new THREE.Vector3(); const tn = new THREE.Vector3();
    const pm4 = new THREE.Matrix4(); const ry = new THREE.Matrix4(); const tx = new THREE.Matrix4();
    for (let p = 0; p < 5; p++) {
      ry.makeRotationY((p / 5) * Math.PI * 2); tx.makeRotationX(0.92);
      pm4.multiplyMatrices(ry, tx);
      for (let idx = 0; idx < bIdx.count; idx++) {
        const vi = bIdx.getX(idx);
        tv.fromBufferAttribute(bPos, vi).applyMatrix4(pm4);
        tn.fromBufferAttribute(bNorm, vi).transformDirection(pm4);
        mPos.push(tv.x, tv.y, tv.z); mNorm.push(tn.x, tn.y, tn.z);
      }
    }
    singlePetal.dispose();
    const blossomGeom = new THREE.BufferGeometry();
    blossomGeom.setAttribute('position', new THREE.Float32BufferAttribute(mPos, 3));
    blossomGeom.setAttribute('normal', new THREE.Float32BufferAttribute(mNorm, 3));
    const blossomInst = new THREE.InstancedMesh(blossomGeom, blossomMat, blossomNodes.length);
    blossomInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const bColors = [new THREE.Color(0xf7ddd0), new THREE.Color(0xf2cbb8), new THREE.Color(0xfff1de)];
    for (let i = 0; i < blossomNodes.length; i++) blossomInst.setColorAt(i, bColors[i % 3]);
    if (blossomInst.instanceColor) blossomInst.instanceColor.needsUpdate = true;
    treeGroup.add(blossomInst);

    const dummyM = new THREE.Matrix4(); const dummyS = new THREE.Vector3(); const dummyQ = new THREE.Quaternion(); const swayE = new THREE.Euler();

    const resize = () => {
      const rect = treeStage.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      const mobile = window.innerWidth <= 959;
      camera.aspect = w / h;
      camera.fov = mobile ? 44 : 40;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
      renderer.setSize(w, h, false);
    };
    resize();

    const update = (progress, elapsedSec, glowFactor) => {
      for (let i = 0; i < branchRecords.length; i++) {
        const rec = branchRecords[i];
        const local = smoothstep(rec.sP, rec.eP, progress);
        const rings = Math.round(local * rec.tSeg);
        if (rings !== rec.lastRings) {
          rec.lastRings = rings;
          rec.geom.setDrawRange(0, rings * rec.idxPerRing);
        }
      }

      for (let i = 0; i < leafNodes.length; i++) {
        const n = leafNodes[i];
        const t = smoothstep(n.start, n.end, progress);
        const s = t * n.scale;
        swayE.set(n.rot.x + (1 - t) * 0.4 + Math.sin(elapsedSec * 1.1 + n.phase) * 0.05, n.rot.y, n.rot.z);
        dummyQ.setFromEuler(swayE);
        dummyS.set(s, s, s);
        dummyM.compose(n.pos, dummyQ, dummyS);
        leafInst.setMatrixAt(i, dummyM);
      }
      leafInst.instanceMatrix.needsUpdate = true;

      for (let i = 0; i < blossomNodes.length; i++) {
        const n = blossomNodes[i];
        const t = smoothstep(n.start, n.end, progress);
        const s = t * n.scale;
        swayE.set(n.rot.x + (1 - t) * 0.5 + Math.sin(elapsedSec * 0.8 + n.phase) * 0.04, n.rot.y, n.rot.z);
        dummyQ.setFromEuler(swayE);
        dummyS.set(s, s, s);
        dummyM.compose(n.pos, dummyQ, dummyS);
        blossomInst.setMatrixAt(i, dummyM);
      }
      blossomInst.instanceMatrix.needsUpdate = true;

      const visibleRatio = clamp((Number(settings.visibleTreePercent) || 65) / 100, 0.4, 1.0);
      const canopySpan = 4.8;
      const xCenterShift = (canopySpan * (1 - visibleRatio)) * 0.5;
      const halfFovRad = (camera.fov * Math.PI) / 360;
      const aspect = Math.max(0.22, camera.aspect || 0.5);
      const idealZ = (canopySpan * visibleRatio) / (2 * Math.tan(halfFovRad) * aspect);
      const targetZ = clamp(lerp(7.0, idealZ, 0.35 + progress * 0.65), 7.0, 14.5);
      const targetY = lerp(0.25, 1.1, progress);

      camera.position.set(xCenterShift, targetY, targetZ);
      camera.lookAt(xCenterShift, targetY * 0.68, 0);
      treeGroup.rotation.y = lerp(-0.14, 0.22, progress) + Math.sin(elapsedSec * 0.25) * 0.035;

      const pulse = 0.86 + 0.14 * Math.sin(elapsedSec * 1.5);
      const glow = glowFactor * pulse;
      blossomMat.emissiveIntensity = lerp(0.08, 0.72, glow);
      leafMat.emissiveIntensity = lerp(0.04, 0.30, glow);
      bloomGoldLight.intensity = glow * 4.8;
      haloMat.opacity = glow * 0.76;

      renderer.render(scene, camera);
    };

    return { update, resize };
  } catch {
    return activateFallback();
  }
}

/* ==========================================================================
   11. EVENT BINDINGS, MODALS & BOOTSTRAP
   ========================================================================== */
function initModalAndNavBindings(threeCtrlGetter) {
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.stageFilter = btn.dataset.stage;
      if (state.stageFilter === 'onboarded') state.activeOnboardedId = null;
      applyFilters();
    });
  });

  el.inputSearch.addEventListener('input', (e) => {
    state.search = e.target.value;
    applyFilters();
  });
  el.btnClearSearch.addEventListener('click', () => {
    state.search = '';
    el.inputSearch.value = '';
    applyFilters();
    el.inputSearch.focus();
  });

  const openLeadModal = () => {
    el.leadForm.reset();
    document.getElementById('formTitle').textContent = 'Add New Lead';
    document.getElementById('formId').value = '';
    document.getElementById('formStage').value = state.stageFilter === 'onboarded' ? 'onboarded' : 'prospects';
    el.btnDeleteFromModal.classList.add('hidden');
    el.dialogForm.showModal();
  };

  el.list.addEventListener('click', (e) => {
    if (e.target.closest('#btnListEmptyAdd')) return openLeadModal();
    if (e.target.closest('#btnListLoadDemo')) return loadSampleLeads();
    if (e.target.closest('#btnEmptyClearSearch')) {
      state.search = '';
      el.inputSearch.value = '';
      applyFilters();
      return;
    }
    const card = e.target.closest('.contact-card');
    if (card) selectLead(card.dataset.id, true);
  });

  document.getElementById('btnEmptyNewLead').addEventListener('click', openLeadModal);
  document.getElementById('btnLoadDemoLeads').addEventListener('click', loadSampleLeads);

  // Mobile Header Popover
  const setMobileMoreOpen = (open) => {
    el.mobileHeaderMenu.classList.toggle('hidden', !open);
    el.btnMobileMore.setAttribute('aria-expanded', String(open));
  };
  el.btnMobileMore.addEventListener('click', (e) => {
    e.stopPropagation();
    setMobileMoreOpen(el.mobileHeaderMenu.classList.contains('hidden'));
  });
  document.getElementById('btnMenuImportCsv').addEventListener('click', () => {
    setMobileMoreOpen(false);
    document.getElementById('csvFileInput').click();
  });
  document.getElementById('btnMenuExportCsv').addEventListener('click', () => {
    setMobileMoreOpen(false);
    exportCsvLeads();
  });
  document.getElementById('btnMenuSampleLeads').addEventListener('click', () => {
    setMobileMoreOpen(false);
    loadSampleLeads();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.mobile-more-wrap')) setMobileMoreOpen(false);
  });

  // Mobile Cockpit Navigation & Edge Swipe
  el.btnBackToList.addEventListener('click', () => el.paneCockpit.classList.remove('mobile-visible'));
  el.btnPrevLead.addEventListener('click', () => stepLead(-1));
  el.btnNextLead.addEventListener('click', () => stepLead(1));

  let touchStartX = 0; let touchStartY = 0;
  el.paneCockpit.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].clientX;
    touchStartY = e.changedTouches[0].clientY;
  }, { passive: true });
  el.paneCockpit.addEventListener('touchend', (e) => {
    if (window.innerWidth > 959) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
    if (touchStartX <= 36 && dx > 72 && dy < 48) el.paneCockpit.classList.remove('mobile-visible');
  }, { passive: true });

  el.cockpitContent.addEventListener('focusin', (e) => {
    if (window.innerWidth <= 959 && ['TEXTAREA', 'INPUT'].includes(e.target.tagName)) {
      el.paneCockpit.classList.add('keyboard-open');
    }
  });
  el.cockpitContent.addEventListener('focusout', () => {
    setTimeout(() => {
      const a = document.activeElement;
      if (!a || !el.cockpitContent.contains(a) || !['TEXTAREA', 'INPUT'].includes(a.tagName)) {
        el.paneCockpit.classList.remove('keyboard-open');
      }
    }, 120);
  });

  // Track Daily Progress on Call & Email Taps
  el.btnCallLead.addEventListener('click', () => {
    if (!el.btnCallLead.classList.contains('is-disabled') && settings.countCallsTowardTarget) {
      incrementDailyTarget(1);
    }
  });

  el.btnSendEmail.addEventListener('click', async (e) => {
    const c = state.contacts.find((x) => x.id === state.activeId);
    if (!c || !c.email) { e.preventDefault(); return; }
    c.email_sent_at = new Date().toISOString();
    if (settings.countEmailsTowardTarget) incrementDailyTarget(1);

    if (settings.autoStageEmail && c.stage !== 'onboarded') {
      c.stage = 'emailed';
      await dbAPI.put(c);
      setTimeout(() => { applyFilters(); showToast('Mail opened. Moved to Emailed.'); }, 150);
    } else {
      await dbAPI.put(c);
    }
  });

  el.btnCallProf.addEventListener('click', () => {
    if (!el.btnCallProf.classList.contains('is-disabled') && settings.countCallsTowardTarget) {
      incrementDailyTarget(1);
    }
  });

  el.btnEmailProf.addEventListener('click', () => {
    if (!el.btnEmailProf.classList.contains('is-disabled') && settings.countEmailsTowardTarget) {
      incrementDailyTarget(1);
    }
  });

  el.btnToggleEmailPreview.addEventListener('click', () => {
    const hidden = el.emailPreviewDrawer.classList.toggle('hidden');
    el.btnToggleEmailPreview.setAttribute('aria-expanded', String(!hidden));
    el.btnToggleEmailPreview.textContent = hidden ? 'Preview' : 'Hide';
  });

  el.btnCopyPhone.addEventListener('click', () => {
    const c = state.contacts.find((x) => x.id === state.activeId);
    copyText(c && c.phone, 'Phone number', 'No phone number on file');
  });
  el.btnCopyEmail.addEventListener('click', () => {
    const c = state.contacts.find((x) => x.id === state.activeId);
    copyText(c && c.email, 'Email address', 'No email address on file');
  });
  el.btnCopyWebsite.addEventListener('click', () => {
    const c = state.contacts.find((x) => x.id === state.activeId);
    copyText(c && c.website, 'Website URL', 'No website on file');
  });
  document.getElementById('btnCopyEmailSubj').addEventListener('click', () => {
    const c = state.contacts.find((x) => x.id === state.activeId);
    if (c) copyText(interpolate(settings.emailSubject, c), 'Email subject');
  });
  document.getElementById('btnCopyEmailBody').addEventListener('click', () => {
    const c = state.contacts.find((x) => x.id === state.activeId);
    if (c) copyText(interpolate(settings.emailBody, c), 'Email body');
  });

  document.getElementById('btnDispEmailed').addEventListener('click', () => setDisposition('emailed'));
  document.getElementById('btnDispNA').addEventListener('click', () => setDisposition('no_answer'));
  document.getElementById('btnDispOnboard').addEventListener('click', () => setDisposition('onboarded'));
  document.getElementById('btnDispDelete').addEventListener('click', () => setDisposition('delete'));
  el.btnJumpToBusinessProfile.addEventListener('click', () => {
    if (state.activeId) openOnboardedProfileById(state.activeId);
  });

  document.getElementById('btnDispCB').addEventListener('click', () => {
    const c = state.contacts.find((x) => x.id === state.activeId);
    document.getElementById('inputCustomCallback').value = '';
    el.btnClearCallback.classList.toggle('hidden', !(c && c.callback_at));
    el.dialogCallback.showModal();
  });
  document.getElementById('btnCancelCallback').addEventListener('click', () => el.dialogCallback.close());
  document.getElementById('btnCloseCallbackX').addEventListener('click', () => el.dialogCallback.close());
  el.btnClearCallback.addEventListener('click', async () => {
    const c = state.contacts.find((x) => x.id === state.activeId);
    if (!c) return;
    c.callback_at = null;
    await dbAPI.put(c);
    el.dialogCallback.close();
    applyFilters();
    showToast('Call back reminder cleared');
  });

  const scheduleCallback = async (hours, customIso = null) => {
    const c = state.contacts.find((x) => x.id === state.activeId);
    if (!c) return;
    const d = customIso ? new Date(customIso) : new Date(Date.now() + hours * 3600000);
    c.stage = 'followup';
    c.callback_at = d.toISOString();
    await dbAPI.put(c);
    incrementDailyTarget(1);
    el.dialogCallback.close();
    applyFilters();
    showToast('Call back scheduled. Moved to Follow-Up.');
  };
  document.querySelectorAll('[data-cb-hours]').forEach((b) => {
    b.addEventListener('click', () => scheduleCallback(parseInt(b.dataset.cbHours, 10)));
  });
  document.getElementById('btnConfirmCustomCallback').addEventListener('click', () => {
    const val = document.getElementById('inputCustomCallback').value;
    if (!val) return alert('Please select a date and time.');
    scheduleCallback(0, val);
  });

  document.getElementById('btnNewLead').addEventListener('click', openLeadModal);
  document.getElementById('btnCancelForm').addEventListener('click', () => el.dialogForm.close());
  document.getElementById('btnCloseLeadX').addEventListener('click', () => el.dialogForm.close());

  el.leadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const c = normalizeContact({
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      company: document.getElementById('formCompany').value.trim(),
      stage: document.getElementById('formStage').value,
      name: document.getElementById('formName').value.trim(),
      job_title: document.getElementById('formTitleField').value.trim(),
      phone: document.getElementById('formPhone').value.trim(),
      email: document.getElementById('formEmail').value.trim(),
      website: document.getElementById('formWebsite').value.trim(),
      street_address: document.getElementById('formAddress').value.trim(),
      city: document.getElementById('formCity').value.trim(),
      postal_code: document.getElementById('formPostal').value.trim(),
      country: document.getElementById('formCountry').value.trim(),
      notes: document.getElementById('formLeadNotes').value.trim()
    });
    state.contacts.unshift(c);
    await dbAPI.put(c);
    el.dialogForm.close();
    if (c.stage === 'onboarded' && state.stageFilter === 'onboarded') state.activeOnboardedId = c.id;
    applyFilters();
    if (state.stageFilter !== 'onboarded') selectLead(c.id);
    showToast('Lead saved');
  });

  document.getElementById('btnExportCsv').addEventListener('click', exportCsvLeads);
  document.getElementById('csvFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const rows = parseCSV(await file.text());
    if (rows.length < 2) { e.target.value = ''; return alert('CSV is empty or missing headers.'); }
    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const col = (aliases) => headers.findIndex((h) => aliases.includes(h));
    const idx = {
      name: col(['name', 'contact', 'contact_name', 'full name', 'full_name']),
      firstName: col(['first name', 'first_name', 'firstname']),
      lastName: col(['last name', 'last_name', 'lastname']),
      phone: col(['phone', 'phone number', 'phone_number', 'mobile', 'tel', 'telephone']),
      email: col(['email', 'email address', 'email_address', 'e-mail', 'mail']),
      country: col(['country']),
      city: col(['city', 'town']),
      address: col(['street_address', 'address', 'street', 'street address']),
      postal: col(['postal_code', 'postal', 'zip', 'zip code', 'postcode']),
      company: col(['company', 'company name', 'business', 'business name', 'organization', 'venue']),
      title: col(['job_title', 'job title', 'title', 'role']),
      website: col(['website', 'website url', 'web', 'url', 'site', 'domain', 'homepage', 'contact_form_url']),
      notes: col(['notes', 'comments', 'memo']),
      stage: col(['stage', 'status']),
      onboardedAt: col(['onboarded_at', 'onboarded_date'])
    };

    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const get = (k) => (idx[k] !== -1 ? (r[idx[k]] || '').trim() : '');
      const company = get('company');
      const fullName = get('name') || [get('firstName'), get('lastName')].filter(Boolean).join(' ');
      const phone = get('phone');
      const email = get('email');
      if (!company && !fullName && !phone && !email) continue;
      const c = normalizeContact({
        id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        company, name: fullName, phone, email,
        country: get('country'), city: get('city'), street_address: get('address'),
        postal_code: get('postal'), job_title: get('title'), website: get('website'),
        notes: get('notes'), stage: get('stage') || 'prospects', onboarded_at: get('onboardedAt')
      });
      await dbAPI.put(c);
      state.contacts.push(c);
      imported++;
    }
    e.target.value = '';
    if (imported > 0 && state.stageFilter === 'onboarded') {
      state.stageFilter = 'prospects';
    }
    applyFilters();
    showToast(`Imported ${imported} contacts`);
  });

  // Onboarded Workspace Bindings
  el.inputOnboardedSearch.addEventListener('input', (e) => { state.onboardedSearch = e.target.value; renderOnboardedDirectory(); });
  el.btnClearOnboardedSearch.addEventListener('click', () => { state.onboardedSearch = ''; el.inputOnboardedSearch.value = ''; renderOnboardedDirectory(); });
  el.btnNewOnboarded.addEventListener('click', createNewOnboardedBusiness);
  el.onboardedGrid.addEventListener('click', (e) => {
    if (e.target.closest('#btnEmptyAddOnboarded')) return createNewOnboardedBusiness();
    if (e.target.closest('#btnClearOnboardedEmpty')) { state.onboardedSearch = ''; el.inputOnboardedSearch.value = ''; renderOnboardedDirectory(); return; }
    const card = e.target.closest('.profile-card');
    if (card) openOnboardedProfileById(card.dataset.onboardedId);
  });
  el.btnBackToOnboardedDir.addEventListener('click', () => { state.activeOnboardedId = null; renderOnboardedWorkspace(); });
  el.btnPrevOnboarded.addEventListener('click', () => {
    const list = getOnboardedList(); const idx = list.findIndex((x) => x.id === state.activeOnboardedId);
    if (idx > 0) openOnboardedProfileById(list[idx - 1].id);
  });
  el.btnNextOnboarded.addEventListener('click', () => {
    const list = getOnboardedList(); const idx = list.findIndex((x) => x.id === state.activeOnboardedId);
    if (idx !== -1 && idx < list.length - 1) openOnboardedProfileById(list[idx + 1].id);
  });
  el.onboardedStageSelect.addEventListener('change', async (e) => {
    const c = state.contacts.find((x) => x.id === state.activeOnboardedId);
    if (!c) return;
    c.stage = e.target.value;
    await dbAPI.put(c);
    if (c.stage !== 'onboarded') {
      state.activeOnboardedId = null; state.stageFilter = c.stage; state.activeId = c.id;
      applyFilters(); showToast(`Moved to ${c.stage}`);
    }
  });
  el.btnDeleteOnboarded.addEventListener('click', async () => {
    const c = state.contacts.find((x) => x.id === state.activeOnboardedId);
    if (!c) return;
    if (settings.confirmDelete && !confirm(`Delete "${c.company || c.name}" permanently?`)) return;
    await dbAPI.delete(c.id);
    state.contacts = state.contacts.filter((x) => x.id !== c.id);
    state.activeOnboardedId = null;
    applyFilters();
    showToast('Business removed');
  });

  el.profLogoUploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    const c = state.contacts.find((x) => x.id === state.activeOnboardedId);
    if (!file || !c) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const maxSide = 256;
        const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
        const cvs = document.createElement('canvas');
        cvs.width = Math.max(1, Math.round(img.width * scale));
        cvs.height = Math.max(1, Math.round(img.height * scale));
        cvs.getContext('2d').drawImage(img, 0, 0, cvs.width, cvs.height);
        c.custom_logo_url = cvs.toDataURL('image/png');
        await dbAPI.put(c);
        applyLogoToElement(el.profLogoImg, el.profLogoFallback, c);
        showToast('Logo saved');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
  el.btnEditLogoUrl.addEventListener('click', async () => {
    const c = state.contacts.find((x) => x.id === state.activeOnboardedId);
    if (!c) return;
    const next = prompt('Paste a direct logo image URL (or leave blank to use website logo):', '');
    if (next === null) return;
    c.custom_logo_url = next.trim();
    await dbAPI.put(c);
    applyLogoToElement(el.profLogoImg, el.profLogoFallback, c);
  });
  el.btnRefreshLogo.addEventListener('click', async () => {
    const c = state.contacts.find((x) => x.id === state.activeOnboardedId);
    if (!c) return;
    c.custom_logo_url = '';
    await dbAPI.put(c);
    applyLogoToElement(el.profLogoImg, el.profLogoFallback, c);
  });

  const profBindings = [
    [el.profCompany, 'company'], [el.profOnboardedDate, 'onboarded_at'],
    [el.profBusinessType, 'business_type'], [el.profAccountStatus, 'account_status'],
    [el.profWebsite, 'website'], [el.profAppUrl, 'app_url'],
    [el.profEmail, 'email'], [el.profPhone, 'phone'],
    [el.profAddress, 'street_address'], [el.profCity, 'city'],
    [el.profPostal, 'postal_code'], [el.profCountry, 'country'],
    [el.profNotes, 'notes']
  ];
  profBindings.forEach(([inputEl, field]) => {
    const ev = inputEl.tagName === 'SELECT' || inputEl.type === 'date' ? 'change' : 'input';
    inputEl.addEventListener(ev, () => {
      const c = state.contacts.find((x) => x.id === state.activeOnboardedId);
      if (!c) return;
      c[field] = inputEl.value;
      if (field === 'company') el.onboardedNavTitle.textContent = c.company || 'Business Profile';
      if (['website', 'app_url', 'email', 'phone'].includes(field)) syncProfileActionLinks(c);
      if (field === 'website') applyLogoToElement(el.profLogoImg, el.profLogoFallback, c);
      scheduleProfileSave(c);
    });
  });

  el.btnAddEmployee.addEventListener('click', async () => {
    const c = state.contacts.find((x) => x.id === state.activeOnboardedId);
    if (!c) return;
    ensureDefaultEmployees(c);
    const emp = createEmployeeRecord('employee');
    c.employees.push(emp);
    await dbAPI.put(c);
    renderEmployeeCards(c);
    showToast('Team member added');
  });

  const handleEmpEdit = (e) => {
    const empId = e.target.dataset.empId; const field = e.target.dataset.empField;
    if (!empId || !field) return;
    const c = state.contacts.find((x) => x.id === state.activeOnboardedId);
    const emp = c && c.employees ? c.employees.find((x) => x.id === empId) : null;
    if (!emp) return;
    emp[field] = e.target.value;
    if (emp.roleType === 'primary') {
      if (field === 'name') c.name = emp.name;
      if (field === 'title') c.job_title = emp.title;
    }
    if (field === 'name' || field === 'title') {
      const sum = el.employeeCardsList.querySelector(`[data-emp-summary="${CSS.escape(empId)}"]`);
      if (sum) {
        const txt = [emp.name, emp.title].filter(Boolean).join(' · ');
        sum.textContent = txt || 'Add details';
        sum.classList.toggle('is-empty', !txt);
      }
    }
    if (field === 'phone') {
      const callLink = el.employeeCardsList.querySelector(`[data-emp-call="${CSS.escape(empId)}"]`);
      if (callLink) {
        const href = formatTelHref(emp.phone);
        callLink.href = href;
        callLink.classList.toggle('is-disabled', href === '#');
      }
    }
    if (field === 'email' || field === 'name') {
      const mailLink = el.employeeCardsList.querySelector(`[data-emp-mail="${CSS.escape(empId)}"]`);
      if (mailLink) {
        configureEmailAnchor(mailLink, buildEmailHref(c, emp.email || '', emp.name || ''));
      }
    }
    if (field === 'dob') {
      const dobPill = el.employeeCardsList.querySelector(`[data-emp-dob-pill="${CSS.escape(empId)}"]`);
      if (dobPill) {
        const dobTxt = formatDobPill(emp.dob);
        dobPill.textContent = dobTxt;
        dobPill.classList.toggle('hidden', !dobTxt);
      }
    }
    scheduleProfileSave(c);
  };
  el.employeeCardsList.addEventListener('input', handleEmpEdit);
  el.employeeCardsList.addEventListener('change', handleEmpEdit);
  el.employeeCardsList.addEventListener('click', async (e) => {
    const callLink = e.target.closest('[data-emp-call]');
    if (callLink && !callLink.classList.contains('is-disabled') && settings.countCallsTowardTarget) {
      incrementDailyTarget(1);
    }
    const mailLink = e.target.closest('[data-emp-mail]');
    if (mailLink && !mailLink.classList.contains('is-disabled') && settings.countEmailsTowardTarget) {
      incrementDailyTarget(1);
    }
    const btn = e.target.closest('[data-remove-emp]');
    if (!btn) return;
    const c = state.contacts.find((x) => x.id === state.activeOnboardedId);
    if (!c) return;
    c.employees = c.employees.filter((x) => x.id !== btn.dataset.removeEmp);
    await dbAPI.put(c);
    renderEmployeeCards(c);
  });

  // Expanded 4-Tab Settings Desk
  const setInputs = {
    senderName: document.getElementById('setSenderName'),
    senderCompany: document.getElementById('setSenderCompany'),
    senderEmail: document.getElementById('setSenderEmail'),
    senderTitle: document.getElementById('setSenderTitle'),
    emailProvider: document.getElementById('setEmailProvider'),
    emailSubject: document.getElementById('setEmailSubject'),
    emailBody: document.getElementById('setEmailBody'),

    dailyTarget: document.getElementById('setDailyTarget'),
    onboardBonus: document.getElementById('setOnboardBonus'),
    countCallsTowardTarget: document.getElementById('setCountCalls'),
    countEmailsTowardTarget: document.getElementById('setCountEmails'),
    glowOnTarget: document.getElementById('setGlowOnTarget'),
    treeWidthDesktop: document.getElementById('setTreeWidthDesktop'),
    treeWidthMobile: document.getElementById('setTreeWidthMobile'),
    visibleTreePercent: document.getElementById('setTreeVisibleCrop'),

    defaultStage: document.getElementById('setDefaultStage'),
    autoStageEmail: document.getElementById('setAutoStageEmail'),
    autoAdvance: document.getElementById('setAutoAdvance'),
    defaultEditOpen: document.getElementById('setDefaultEditOpen'),
    compactQueueCards: document.getElementById('setCompactCards'),
    confirmDelete: document.getElementById('setConfirmDelete')
  };

  const collectDraft = () => ({
    senderName: setInputs.senderName.value,
    senderCompany: setInputs.senderCompany.value,
    senderEmail: setInputs.senderEmail.value,
    senderTitle: setInputs.senderTitle.value,
    emailProvider: setInputs.emailProvider.value,
    emailSubject: setInputs.emailSubject.value,
    emailBody: setInputs.emailBody.value,

    dailyTarget: clamp(parseInt(setInputs.dailyTarget.value, 10) || 20, 1, 500),
    onboardBonus: clamp(parseInt(setInputs.onboardBonus.value, 10) || 3, 1, 20),
    countCallsTowardTarget: setInputs.countCallsTowardTarget.checked,
    countEmailsTowardTarget: setInputs.countEmailsTowardTarget.checked,
    glowOnTarget: setInputs.glowOnTarget.checked,
    treeWidthDesktop: clamp(parseInt(setInputs.treeWidthDesktop.value, 10) || 30, 18, 42),
    treeWidthMobile: clamp(parseInt(setInputs.treeWidthMobile.value, 10) || 28, 18, 38),
    visibleTreePercent: clamp(parseInt(setInputs.visibleTreePercent.value, 10) || 65, 40, 100),

    defaultStage: setInputs.defaultStage.value,
    autoStageEmail: setInputs.autoStageEmail.checked,
    autoAdvance: setInputs.autoAdvance.checked,
    defaultEditOpen: setInputs.defaultEditOpen.checked,
    compactQueueCards: setInputs.compactQueueCards.checked,
    confirmDelete: setInputs.confirmDelete.checked
  });

  const refreshEmailPreview = () => {
    const draft = collectDraft();
    const previewContact = state.contacts.find((x) => x.id === state.activeId);
    document.getElementById('settingsEmailSubjPreview').textContent = interpolate(draft.emailSubject, previewContact, draft);
    document.getElementById('settingsEmailBodyPreview').textContent = interpolate(draft.emailBody, previewContact, draft);
    const todaySum = document.getElementById('settingsTodaySummary');
    if (todaySum) todaySum.textContent = `${dailyProgress.count} / ${draft.dailyTarget}`;
  };

  const openSettings = (source = settings) => {
    Object.keys(setInputs).forEach((k) => {
      if (setInputs[k].type === 'checkbox') setInputs[k].checked = Boolean(source[k]);
      else setInputs[k].value = source[k] ?? '';
    });
    refreshEmailPreview();
    el.dialogSettings.showModal();
  };

  document.getElementById('btnOpenSettings').addEventListener('click', () => openSettings(settings));
  document.getElementById('btnCancelSettings').addEventListener('click', () => el.dialogSettings.close());
  document.getElementById('btnCloseSettingsX').addEventListener('click', () => el.dialogSettings.close());
  document.getElementById('btnSaveSettings').addEventListener('click', () => {
    saveSettings(collectDraft());
    applySettingsToLayout(threeCtrlGetter());
    renderActiveCockpit();
    if (state.stageFilter === 'onboarded') renderOnboardedWorkspace();
    el.dialogSettings.close();
    showToast('Settings saved');
  });

  document.getElementById('btnResetDailyCount').addEventListener('click', () => {
    dailyProgress = { date: getTodayDateKey(), count: 0 };
    saveDailyProgress(dailyProgress);
    updateTreeFromDailyTarget();
    refreshEmailPreview();
    showToast("Today's count reset");
  });

  document.getElementById('btnSettingsExportCsv').addEventListener('click', exportCsvLeads);
  document.getElementById('btnSettingsLoadSamples').addEventListener('click', async () => {
    el.dialogSettings.close();
    await loadSampleLeads();
  });

  document.getElementById('btnResetSettings').addEventListener('click', () => {
    if (confirm('Reset all CRM settings and templates to defaults?')) openSettings(DEFAULT_SETTINGS);
  });
  document.getElementById('btnClearAllLeads').addEventListener('click', async () => {
    if (!confirm('Delete ALL stored leads from this browser?')) return;
    await dbAPI.clear();
    state.contacts = [];
    state.activeId = null;
    state.activeOnboardedId = null;
    applyFilters();
    el.dialogSettings.close();
    el.paneCockpit.classList.remove('mobile-visible');
    showToast('All leads cleared');
  });

  Object.values(setInputs).forEach((n) => {
    n.addEventListener('input', refreshEmailPreview);
    n.addEventListener('change', refreshEmailPreview);
  });

  document.querySelectorAll('.settings-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.settings-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.settings-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`stab-${tab.dataset.stab}`).classList.add('active');
    });
  });

  document.querySelectorAll('.var-chip').forEach((chip) => {
    chip.addEventListener('click', () => copyText(chip.dataset.var, chip.dataset.var));
  });

  [el.dialogForm, el.dialogCallback, el.dialogSettings].forEach((dlg) => {
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setMobileMoreOpen(false);
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (el.dialogForm.open || el.dialogCallback.open || el.dialogSettings.open) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

    if (e.key === '/') {
      e.preventDefault();
      if (state.stageFilter === 'onboarded' && !state.activeOnboardedId) el.inputOnboardedSearch.focus();
      else el.inputSearch.focus();
      return;
    }
    if (e.key === ',') { e.preventDefault(); openSettings(settings); return; }
    if (state.stageFilter === 'onboarded') return;

    if (e.key === 'j' || e.key === 'ArrowDown') {
      e.preventDefault();
      stepLead(1);
    } else if (e.key === 'k' || e.key === 'ArrowUp') {
      e.preventDefault();
      stepLead(-1);
    } else if (e.key === 'c' || e.key === 'C') {
      const c = state.contacts.find((x) => x.id === state.activeId);
      const telHref = c ? formatTelHref(c.phone) : '#';
      if (telHref !== '#') {
        if (settings.countCallsTowardTarget) incrementDailyTarget(1);
        window.location.href = telHref;
      }
    } else if (e.key === 'e' || e.key === 'E') {
      setDisposition('emailed');
    } else if (e.key === 'n' || e.key === 'N') {
      setDisposition('no_answer');
    } else if (e.key === 'o' || e.key === 'O') {
      setDisposition('onboarded');
    }
  });
}

async function bootstrap() {
  let threeCtrl = null;
  initInlineAdminEditing();
  initModalAndNavBindings(() => threeCtrl);

  await initDB();
  state.contacts = await dbAPI.getAll();
  applySettingsToLayout(null);
  applyFilters();

  threeCtrl = await initThreeTree();
  const isFallback = !threeCtrl;

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => applySettingsToLayout(threeCtrl), 90);
  });

  const startTime = performance.now();
  let pageVisible = !document.hidden;
  document.addEventListener('visibilitychange', () => { pageVisible = !document.hidden; });

  function frame(now) {
    window.requestAnimationFrame(frame);
    if (!pageVisible) return;

    const elapsedSec = (now - startTime) * 0.001;
    state.treeProgressSmooth = lerp(state.treeProgressSmooth, state.treeProgressTarget, 0.08);
    state.treeGlowSmooth = lerp(state.treeGlowSmooth, state.treeGlowTarget, 0.06);
    document.documentElement.style.setProperty('--bloom-glow', state.treeGlowSmooth.toFixed(3));

    if (isFallback) {
      fallbackTree.update(state.treeProgressSmooth);
    } else {
      threeCtrl.update(state.treeProgressSmooth, elapsedSec, state.treeGlowSmooth);
    }
  }

  window.requestAnimationFrame(frame);
}

bootstrap();
