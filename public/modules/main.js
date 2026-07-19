// main.js — Entry point
// Imports all modules, exposes onclick handlers to window, runs init code.

import { currentLang, CLOUD_URL } from './state.js';
import { applyLang, toggleLang, initCookieBanner, acceptCookies, confirmPop, openMine, closeMine, openSupport, closeSupport, switchMineTab, mineApi, loadOverview, loadSettingsTab, loadCalendarFeedUrl, copyCalendarFeedUrl, toggleSection, loadMemoryList, addMemoryManual, deleteMemoryManual, loadGoalList, loadCustomSkillList, addCustomSkill, deleteCustomSkill, addGoalManual, completeGoal, deleteGoal, loadProfileForm, profileFieldInput, saveProfile, syncContactsToCloud, exportMyData, deleteMyAccount, localDateStr, escapeHtml } from './misc.js';
import { getClerkToken, initClerk, wechatLogin, showPhoneLogin, sendSMS, verifySMS, closeAuth, toggleAuth, mountClerkSignIn, mountClerkSignUp, onAuthed, onSignedOut } from './auth.js';
import { removeBridge, enableCloudMode, generateSessionSummary, agentConfig, devinDirect, agentChat, getAgentContext, saveAgentTurn, getCloudDataContext, cloudSearch, cloudListTodos, cloudListContacts, agentSearch, fetchRoutingConfig, shouldUseLive, shouldFallbackToCloud, extractIntent, cloudChat, autoConnectAgent, tryUpgradeToLive, upgradeToLive, loadAgentConfigToUI, toggleAgentConfig, onAgentEngineChange, saveAgentConfig, tryBridgeConnect, onAgentConnected, onBridgeMessage, showScenarioPicker, closeScenarioPicker, startSimulation, loadSimulationToCloud, updateGoalTracker, toggleGoalTracker, checkSimulationGoals, rewardCoupon, showBattleCard, downloadBattleCard, shareBattleCard, exitSimulation } from './agent-bridge.js';
import { saveSessionTurn, loadSessionList, loadSession, startNewSession, deleteSession, renderSessionList, filterSessions, toggleSidebar, closeSidebar, openSidebar, getSystemPrompt, getCurrentDateTimeContext, getUpcomingHolidays, getLunarHolidays, hideWelcome, showWelcome, scrollToBottom, addMsg, addSystemMsg, addTyping, removeTyping, buildUserSuggestions, buildContextAwareSuggestions, addSuggestions, clearChat, handleChatFile, clearChatFile, send, stopChat, quickSend, quickNote, quickDraft, quickDraftTo, loadChatEnhancements, renderDailyDashboard, toggleDashboard, snoozeContact, quickAction, updateTabBadges, showReminderCard, dismissReminder, fetchProactiveSuggestions, renderProactiveSuggestions, proactiveClick, dismissProactive, healthRingSvg, renderDesktopSidebar, toggleRsSection, showTodoDetail, showInteractionDetail, toggleEmptyState, fetchWeather, fetchWeatherFromAPI, weatherEmoji, weatherText, weatherGreeting, showDailyGreeting, showWarmthQuote, showStreakBadge, toggleVoiceInput, addMsgActions, extractPdfPaths, downloadPdfViaAgent, agentReadFile, copyMsgText } from './chat.js';
import { loadContactsTab, renderContactsResults, handleImportFile, changeGroupBy, toggleGroup, renderContactItem, switchContactsSubtab, getContactGroups, renderContactsList, onContactsSearch, openContactDetail, showTimelineForm, hideTimelineForm, saveTimelineEntry, deleteTimelineEntry, closeContactDetail, editContactForm, saveContactEdit, deleteContact, refreshContactsCache, getCooldownInfo, meetingPrepDetail, meetingPrep } from './contacts.js';
import { loadTodosTab, renderTodosTab, switchTodosFilter, showTodoForm, filterTodoContacts, hideTodoForm, saveTodo, toggleTodoDone, postponeTodo, cancelTodo, undoTodoDone, deleteTodo } from './todos.js';
import { loadTimelineTab, renderTimelineTab, filterTimelineSearch, editTimelineEntryFromList, deleteTimelineEntryFromList } from './timeline.js';
import { loadMeetingsTab, openMeetingDetail, closeMeetingDetail, uploadMeetingPhoto, createMeeting, deleteMeeting, reviewMeeting, shareReviewAsImage } from './meetings.js';
import { loadBillingTab, renderBillingTab, applyDiscount, savePricing, paddleCheckout, paddleCancelSub, doGiftCredits, doRedeemCoupon, openPayModal, closePayModal, confirmPayment, doUpgrade, doPurchase, setModelTier, updateCostPreview, showModelTierBar, showCostPreview } from './billing.js';
import { loadWeeklyTab, doShareText, buildShareCard, generateShareImage, canvasToBlob, exportReportPDF, agentPDF, showShareModal, showWeChatShareGuide, shareWeeklyReport, loadSignalsTab, shareSignalsReport, loadMonthlyTab, exportMonthlyPDF, shareMonthlyReport, checkOnboardingNeeded, startOnboarding, closeOnboarding, renderOnboardingChat, submitOnboardingChat, finishOnboarding } from './proactive.js';

// ── Expose functions to window for onclick handlers ──
const w = window;

// Auth
w.toggleAuth = toggleAuth;
w.closeAuth = closeAuth;
w.wechatLogin = wechatLogin;
w.showPhoneLogin = showPhoneLogin;
w.sendSMS = sendSMS;
w.verifySMS = verifySMS;
w.mountClerkSignIn = mountClerkSignIn;
w.mountClerkSignUp = mountClerkSignUp;

// Agent bridge
w.toggleAgentConfig = toggleAgentConfig;
w.onAgentEngineChange = onAgentEngineChange;
w.saveAgentConfig = saveAgentConfig;
w.showScenarioPicker = showScenarioPicker;
w.closeScenarioPicker = closeScenarioPicker;
w.startSimulation = startSimulation;
w.toggleGoalTracker = toggleGoalTracker;
w.exitSimulation = exitSimulation;
w.downloadBattleCard = downloadBattleCard;
w.shareBattleCard = shareBattleCard;

// Chat
w.startNewSession = startNewSession;
w.toggleSidebar = toggleSidebar;
w.closeSidebar = closeSidebar;
w.openSidebar = openSidebar;
w.filterSessions = filterSessions;
w.loadSession = loadSession;
w.send = send;
w.stopChat = stopChat;
w.quickAction = quickAction;
w.quickDraftTo = quickDraftTo;
w.toggleDashboard = toggleDashboard;
w.snoozeContact = snoozeContact;
w.dismissReminder = dismissReminder;
w.proactiveClick = proactiveClick;
w.dismissProactive = dismissProactive;
w.toggleRsSection = toggleRsSection;
w.showTodoDetail = showTodoDetail;
w.showInteractionDetail = showInteractionDetail;
w.toggleVoiceInput = toggleVoiceInput;
w.downloadPdfViaAgent = downloadPdfViaAgent;
w.copyMsgText = copyMsgText;
w.handleChatFile = handleChatFile;
w.clearChatFile = clearChatFile;

// Contacts
w.openContactDetail = openContactDetail;
w.closeContactDetail = closeContactDetail;
w.showTimelineForm = showTimelineForm;
w.hideTimelineForm = hideTimelineForm;
w.saveTimelineEntry = saveTimelineEntry;
w.deleteTimelineEntry = deleteTimelineEntry;
w.editContactForm = editContactForm;
w.saveContactEdit = saveContactEdit;
w.deleteContact = deleteContact;
w.changeGroupBy = changeGroupBy;
w.toggleGroup = toggleGroup;
w.switchContactsSubtab = switchContactsSubtab;
w.onContactsSearch = onContactsSearch;
w.handleImportFile = handleImportFile;
w.meetingPrepDetail = meetingPrepDetail;

// Todos
w.switchTodosFilter = switchTodosFilter;
w.showTodoForm = showTodoForm;
w.hideTodoForm = hideTodoForm;
w.saveTodo = saveTodo;
w.toggleTodoDone = toggleTodoDone;
w.postponeTodo = postponeTodo;
w.cancelTodo = cancelTodo;
w.undoTodoDone = undoTodoDone;
w.deleteTodo = deleteTodo;

// Timeline
w.filterTimelineSearch = filterTimelineSearch;
w.editTimelineEntryFromList = editTimelineEntryFromList;
w.deleteTimelineEntryFromList = deleteTimelineEntryFromList;

// Meetings
w.openMeetingDetail = openMeetingDetail;
w.closeMeetingDetail = closeMeetingDetail;
w.uploadMeetingPhoto = uploadMeetingPhoto;
w.createMeeting = createMeeting;
w.deleteMeeting = deleteMeeting;
w.reviewMeeting = reviewMeeting;
w.shareReviewAsImage = shareReviewAsImage;

// Billing
w.applyDiscount = applyDiscount;
w.savePricing = savePricing;
w.paddleCheckout = paddleCheckout;
w.paddleCancelSub = paddleCancelSub;
w.doGiftCredits = doGiftCredits;
w.doRedeemCoupon = doRedeemCoupon;
w.openPayModal = openPayModal;
w.closePayModal = closePayModal;
w.confirmPayment = confirmPayment;
w.doUpgrade = doUpgrade;
w.doPurchase = doPurchase;
w.setModelTier = setModelTier;

// Proactive / onboarding
w.shareWeeklyReport = shareWeeklyReport;
w.exportReportPDF = exportReportPDF;
w.shareSignalsReport = shareSignalsReport;
w.exportMonthlyPDF = exportMonthlyPDF;
w.shareMonthlyReport = shareMonthlyReport;
w.renderOnboardingChat = renderOnboardingChat;
w.submitOnboardingChat = submitOnboardingChat;
w.finishOnboarding = finishOnboarding;

// Misc
w.applyLang = applyLang;
w.toggleLang = toggleLang;
w.acceptCookies = acceptCookies;
w.openMine = openMine;
w.closeMine = closeMine;
w.openSupport = openSupport;
w.closeSupport = closeSupport;
w.switchMineTab = switchMineTab;
w.copyCalendarFeedUrl = copyCalendarFeedUrl;
w.toggleSection = toggleSection;
w.addMemoryManual = addMemoryManual;
w.deleteMemoryManual = deleteMemoryManual;
w.loadGoalList = loadGoalList;
w.addCustomSkill = addCustomSkill;
w.deleteCustomSkill = deleteCustomSkill;
w.addGoalManual = addGoalManual;
w.completeGoal = completeGoal;
w.deleteGoal = deleteGoal;
w.saveProfile = saveProfile;
w.exportMyData = exportMyData;
w.deleteMyAccount = deleteMyAccount;

// ── Init (lines 8594-8632 of original app.js) ──
applyLang(currentLang);
initClerk();
initCookieBanner();

// Desktop: left sidebar starts collapsed, hover trigger zone expands it
if (window.innerWidth > 768) {
  const sidebarEl = document.getElementById('sidebar');
  const hoverZone = document.getElementById('sidebarHoverZone');
  sidebarEl.classList.add('collapsed');
  hoverZone.addEventListener('mouseenter', () => {
    if (!sidebarEl.classList.contains('collapsed')) return;
    sidebarEl.classList.add('hover-open');
    loadSessionList();
  });
  sidebarEl.addEventListener('mouseleave', () => {
    sidebarEl.classList.remove('hover-open');
  });
} else {
  // Mobile: show hamburger button (sidebar starts hidden, tap to open)
  const openBtn = document.getElementById('sidebarOpenBtn');
  if (openBtn) openBtn.style.display = 'inline-block';
}

// Desktop: right sidebar hover-to-show (mirrors left sidebar)
if (window.innerWidth >= 900) {
  const rightEl = document.getElementById('desktopSidebar');
  const rightZone = document.getElementById('rightHoverZone');
  if (rightEl && rightZone) {
    rightZone.addEventListener('mouseenter', () => {
      rightEl.classList.add('hover-open');
    });
    rightEl.addEventListener('mouseleave', () => {
      rightEl.classList.remove('hover-open');
    });
  }
}

// Fetch pricing for cost preview
fetch(`${CLOUD_URL}/ai/pricing`).then(r => r.json()).then(p => { window._currentPricing = p; }).catch(() => {});

// Preload weather (fills weatherCache with city name for chat context)
fetchWeather().catch(() => {});
