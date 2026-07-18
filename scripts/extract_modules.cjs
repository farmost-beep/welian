#!/usr/bin/env node
/**
 * Extract functions from app.js into ES module files.
 * This script reads app.js, identifies function boundaries,
 * and writes each function to the appropriate module file.
 */

const fs = require('fs');
const path = require('path');

const APP_JS = '/Users/cyingfang/devin/welian/public/app.js';
const MODULES_DIR = '/Users/cyingfang/devin/welian/public/modules';

const src = fs.readFileSync(APP_JS, 'utf8');
const lines = src.split('\n');

// ── Parse all function declarations ──
// Match: function name( or async function name(
const funcRegex = /^(async\s+)?function\s+(\w+)\s*\(/;
const functions = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(funcRegex);
  if (m) {
    const isAsync = !!m[1];
    const name = m[2];
    // Find the end of the function by counting braces
    let depth = 0;
    let endLine = i;
    let started = false;
    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') { depth--; }
      }
      if (started && depth === 0) {
        endLine = j;
        break;
      }
    }
    functions.push({ name, isAsync, startLine: i, endLine, body: lines.slice(i, endLine + 1).join('\n') });
  }
}

console.log(`Found ${functions.length} functions`);

// ── Module assignments ──
// Map each function name to its module
const moduleMap = {
  'auth.js': [
    'getClerkToken', 'initClerk', 'wechatLogin', 'showPhoneLogin', 'sendSMS',
    'verifySMS', 'closeAuth', 'toggleAuth', 'mountClerkSignIn', 'mountClerkSignUp',
    'onAuthed', 'onSignedOut'
  ],
  'agent-bridge.js': [
    'removeBridge', 'enableCloudMode', 'generateSessionSummary', 'agentConfig',
    'devinDirect', 'agentChat', 'getAgentContext', 'saveAgentTurn',
    'getCloudDataContext', 'cloudSearch', 'cloudListTodos', 'cloudListContacts',
    'agentSearch', 'fetchRoutingConfig', 'shouldUseLive', 'shouldFallbackToCloud',
    'extractIntent', 'cloudChat',
    'autoConnectAgent', 'tryUpgradeToLive', 'upgradeToLive',
    'loadAgentConfigToUI', 'toggleAgentConfig', 'onAgentEngineChange',
    'saveAgentConfig', 'tryBridgeConnect', 'onAgentConnected', 'onBridgeMessage',
    // Simulation functions
    'showScenarioPicker', 'closeScenarioPicker', 'startSimulation',
    'loadSimulationToCloud', 'updateGoalTracker', 'toggleGoalTracker',
    'checkSimulationGoals', 'rewardCoupon', 'showBattleCard',
    'downloadBattleCard', 'shareBattleCard', 'exitSimulation',
  ],
  'chat.js': [
    'saveSessionTurn', 'loadSessionList', 'loadSession', 'startNewSession',
    'deleteSession', 'renderSessionList', 'filterSessions',
    'toggleSidebar', 'closeSidebar', 'openSidebar',
    'getSystemPrompt', 'getCurrentDateTimeContext',
    'getUpcomingHolidays', 'getLunarHolidays',
    'hideWelcome', 'showWelcome', 'scrollToBottom',
    'addMsg', 'addSystemMsg', 'addTyping', 'removeTyping',
    'buildUserSuggestions', 'buildContextAwareSuggestions', 'addSuggestions',
    'clearChat', 'handleChatFile', 'clearChatFile',
    'send', 'stopChat', 'quickSend', 'quickNote', 'quickDraft', 'quickDraftTo',
    // Note: escapeHtml removed — it's in misc.js (second definition shadows first)
    'loadChatEnhancements', 'renderDailyDashboard', 'toggleDashboard',
    'snoozeContact', 'quickAction', 'updateTabBadges',
    'showReminderCard', 'dismissReminder',
    'fetchProactiveSuggestions', 'renderProactiveSuggestions',
    'proactiveClick', 'dismissProactive',
    'healthRingSvg', 'renderDesktopSidebar',
    'toggleRsSection', 'showTodoDetail', 'showInteractionDetail', 'toggleEmptyState',
    'fetchWeather', 'fetchWeatherFromAPI', 'weatherEmoji', 'weatherText',
    'weatherGreeting', 'showDailyGreeting', 'showWarmthQuote', 'showStreakBadge',
    'toggleVoiceInput', 'addMsgActions', 'extractPdfPaths',
    'downloadPdfViaAgent', 'agentReadFile', 'copyMsgText',
  ],
  'contacts.js': [
    'loadContactsTab', 'renderContactsResults', 'handleImportFile',
    'changeGroupBy', 'toggleGroup', 'renderContactItem', 'switchContactsSubtab',
    'getContactGroups', 'renderContactsList', 'onContactsSearch',
    'openContactDetail', 'showTimelineForm', 'hideTimelineForm',
    'saveTimelineEntry', 'deleteTimelineEntry', 'closeContactDetail',
    'editContactForm', 'saveContactEdit', 'deleteContact', 'refreshContactsCache',
    'getCooldownInfo', 'meetingPrepDetail', 'meetingPrep',
  ],
  'todos.js': [
    'loadTodosTab', 'renderTodosTab', 'switchTodosFilter',
    'showTodoForm', 'filterTodoContacts', 'hideTodoForm',
    'saveTodo', 'toggleTodoDone', 'postponeTodo', 'cancelTodo',
    'undoTodoDone', 'deleteTodo',
  ],
  'timeline.js': [
    'loadTimelineTab', 'renderTimelineTab', 'filterTimelineSearch',
    'editTimelineEntryFromList', 'deleteTimelineEntryFromList',
  ],
  'billing.js': [
    'loadBillingTab', 'renderBillingTab', 'applyDiscount', 'savePricing',
    'paddleCheckout', 'paddleCancelSub', 'doGiftCredits', 'doRedeemCoupon',
    'openPayModal', 'closePayModal', 'confirmPayment',
    'doUpgrade', 'doPurchase',
    'setModelTier', 'updateCostPreview', 'showModelTierBar', 'showCostPreview',
  ],
  'proactive.js': [
    'loadWeeklyTab', 'doShareText', 'buildShareCard', 'generateShareImage',
    'canvasToBlob', 'exportReportPDF', 'agentPDF', 'showShareModal',
    'showWeChatShareGuide', 'shareWeeklyReport',
    'loadSignalsTab', 'shareSignalsReport',
    'loadMonthlyTab', 'exportMonthlyPDF', 'shareMonthlyReport',
    'checkOnboardingNeeded', 'startOnboarding', 'closeOnboarding',
    'renderOnboardingChat', 'submitOnboardingChat', 'finishOnboarding',
  ],
  'misc.js': [
    'applyLang', 'toggleLang', 'localDateStr', 'escapeHtml',
    'openMine', 'closeMine', 'openSupport', 'closeSupport',
    'switchMineTab', 'mineApi', 'loadOverview',
    'loadSettingsTab', 'loadCalendarFeedUrl', 'copyCalendarFeedUrl',
    'toggleSection', 'loadMemoryList', 'addMemoryManual', 'deleteMemoryManual',
    'loadGoalList', 'loadCustomSkillList', 'addCustomSkill', 'deleteCustomSkill',
    'addGoalManual', 'completeGoal', 'deleteGoal',
    'loadProfileForm', 'profileFieldInput', 'saveProfile',
    'syncContactsToCloud', 'exportMyData', 'deleteMyAccount',
    'confirmPop', 'initCookieBanner', 'acceptCookies',
  ],
};

// Build reverse map: function name -> module file
const funcToModule = {};
for (const [modFile, funcNames] of Object.entries(moduleMap)) {
  for (const fn of funcNames) {
    funcToModule[fn] = modFile;
  }
}

// Check all functions are assigned
const allFuncNames = functions.map(f => f.name);
const assignedFuncs = Object.keys(funcToModule);
const unassigned = allFuncNames.filter(n => !funcToModule[n]);
const extraAssigned = assignedFuncs.filter(n => !allFuncNames.includes(n));

if (unassigned.length > 0) {
  console.error('UNASSIGNED functions:', unassigned);
}
if (extraAssigned.length > 0) {
  console.error('EXTRA assigned (not found in app.js):', extraAssigned);
}

// Build function lookup
const funcLookup = {};
for (const f of functions) {
  funcLookup[f.name] = f;
}

// ── Identify all global identifiers used ──
// We need to find all bare identifiers that are either:
// 1. State variables (from state.js)
// 2. Other functions (from other modules)
// 3. Global APIs (window, document, localStorage, etc.) - no import needed

// Collect all state variable names from state.js
const stateContent = fs.readFileSync(path.join(MODULES_DIR, 'state.js'), 'utf8');
const stateExports = [];
const stateSetters = [];
const stateExportRegex = /^export (?:let|const|var)\s+(\w+)/gm;
const stateSetterRegex = /^export function\s+(set\w+)\s*\(/gm;
let m;
while ((m = stateExportRegex.exec(stateContent)) !== null) {
  stateExports.push(m[1]);
}
while ((m = stateSetterRegex.exec(stateContent)) !== null) {
  stateSetters.push(m[1]);
}
console.log(`State exports: ${stateExports.length}, setters: ${stateSetters.length}`);

// All function names
const allFuncs = new Set(allFuncNames);

// Global identifiers that don't need imports
const globalIdentifiers = new Set([
  'window', 'document', 'localStorage', 'sessionStorage', 'location', 'history',
  'console', 'fetch', 'URLSearchParams', 'URL', 'Date', 'Math', 'JSON', 'Object',
  'Array', 'String', 'Number', 'Boolean', 'Promise', 'Set', 'Map', 'RegExp',
  'Error', 'parseInt', 'parseFloat', 'isNaN', 'setTimeout', 'setInterval',
  'clearTimeout', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame',
  'navigator', 'performance', 'encodeURIComponent', 'decodeURIComponent',
  'encodeURI', 'decodeURI', 'Blob', 'File', 'FileReader', 'FormData',
  'XMLHttpRequest', 'WebSocket', 'Event', 'CustomEvent', 'HTMLElement',
  'confirm', 'alert', 'prompt', 'open', 'close', 'print',
  'Image', 'Canvas', 'CanvasRenderingContext2D', 'Path2D',
  'requestIdleCallback', 'structuredClone', 'queueMicrotask',
  'crypto', 'atob', 'btoa', 'TextEncoder', 'TextDecoder',
  'DOMParser', 'XMLSerializer', 'XSLTProcessor',
  'MutationObserver', 'IntersectionObserver', 'ResizeObserver',
  'AbortController', 'Headers', 'Request', 'Response',
  'Symbol', 'BigInt', 'Proxy', 'Reflect',
  'Paddle', 'Clerk', 'WeixinJSBridge', 'wx',
  'SpeechRecognition', 'webkitSpeechRecognition',
  'ClipboardItem',
  'OffscreenCanvas',
  'HTMLCanvasElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'HTMLSelectElement',
  'HTMLDivElement',
  'HTMLImageElement',
  'HTMLAnchorElement',
  'HTMLButtonElement',
  'HTMLFormElement',
  'Node',
  'Element',
  'NodeList',
  'HTMLCollection',
  'EventTarget',
  'Range',
  'Selection',
  'getComputedStyle',
  'matchMedia',
  'scrollTo',
  'scrollIntoView',
  'postMessage',
  'importScripts',
  'createImageBitmap',
  'createObjectURL',
  'revokeObjectURL',
  'URLSearchParams',
  'URLPattern',
  'indexedDB',
  'localStorage',
  'sessionStorage',
  'Notification',
  'ServiceWorker',
  'Worker',
  'SharedWorker',
  'BroadcastChannel',
  'MessageChannel',
  'MessagePort',
  'WebSocket',
  'EventSource',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
  'ByteLengthQueuingStrategy',
  'CountQueuingStrategy',
  'Intl',
  'WebAssembly',
  'DataView',
  'ArrayBuffer',
  'SharedArrayBuffer',
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array',
  'finalizationRegistry',
  'WeakRef',
  'WeakMap',
  'WeakSet',
  'AggregateError',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
  'InternalError',
  'Infinity',
  'NaN',
  'undefined',
  'globalThis',
  'self',
  'top',
  'parent',
  'frames',
  'frameElement',
  'innerWidth',
  'innerHeight',
  'outerWidth',
  'outerHeight',
  'screenX',
  'screenY',
  'screenLeft',
  'screenTop',
  'scrollX',
  'scrollY',
  'pageXOffset',
  'pageYOffset',
  'devicePixelRatio',
  'screen',
  'visualViewport',
  'origin',
  'isSecureContext',
  'crossOriginIsolated',
  'performance',
  'scheduler',
  'trustedTypes',
  'customElements',
  'customElementRegistry',
  'HTMLElement',
  'HTMLUnknownElement',
  'HTMLHtmlElement',
  'HTMLHeadElement',
  'HTMLBodyElement',
  'HTMLBaseElement',
  'HTMLLinkElement',
  'HTMLMetaElement',
  'HTMLStyleElement',
  'HTMLTitleElement',
  'HTMLDListElement',
  'HTMLDivElement',
  'HTMLEmbedElement',
  'HTMLFieldSetElement',
  'HTMLFormControlsCollection',
  'HTMLFormElement',
  'HTMLFrameElement',
  'HTMLFrameSetElement',
  'HTMLHeadingElement',
  'HTMLHRElement',
  'HTMLIFrameElement',
  'HTMLImageElement',
  'HTMLInputElement',
  'HTMLLabelElement',
  'HTMLLegendElement',
  'HTMLLIElement',
  'HTMLMapElement',
  'HTMLMarqueeElement',
  'HTMLMenuElement',
  'HTMLMeterElement',
  'HTMLModElement',
  'HTMLOListElement',
  'HTMLOptGroupElement',
  'HTMLOptionElement',
  'HTMLOptionsCollection',
  'HTMLOutputElement',
  'HTMLParagraphElement',
  'HTMLParamElement',
  'HTMLPictureElement',
  'HTMLPreElement',
  'HTMLProgressElement',
  'HTMLQuoteElement',
  'HTMLScriptElement',
  'HTMLSelectElement',
  'HTMLSlotElement',
  'HTMLSourceElement',
  'HTMLSpanElement',
  'HTMLTableCaptionElement',
  'HTMLTableCellElement',
  'HTMLTableColElement',
  'HTMLTableElement',
  'HTMLTableRowElement',
  'HTMLTableSectionElement',
  'HTMLTemplateElement',
  'HTMLTextAreaElement',
  'HTMLTimeElement',
  'HTMLTitleElement',
  'HTMLTrackElement',
  'HTMLUListElement',
  'HTMLVideoElement',
  'HTMLAudioElement',
  'HTMLMediaElement',
  'HTMLObjectElement',
  'Text',
  'Comment',
  'DocumentFragment',
  'ShadowRoot',
  'DocumentType',
  'CharacterData',
  'ProcessingInstruction',
  'NodeFilter',
  'TreeWalker',
  'NodeIterator',
  'DOMTokenList',
  'NamedNodeMap',
  'Attr',
  'UIEvent',
  'MouseEvent',
  'WheelEvent',
  'DragEvent',
  'KeyboardEvent',
  'PointerEvent',
  'TouchEvent',
  'GamepadEvent',
  'DeviceOrientationEvent',
  'DeviceMotionEvent',
  'CompositionEvent',
  'FocusEvent',
  'InputEvent',
  'BeforeUnloadEvent',
  'HashChangeEvent',
  'PageTransitionEvent',
  'PopStateEvent',
  'StorageEvent',
  'TransitionEvent',
  'AnimationEvent',
  'Animation',
  'KeyframeEffect',
  'AnimationEffect',
  'AnimationTimeline',
  'DocumentTimeline',
  'ScrollTimeline',
  'CSSTransition',
  'CSSAnimation',
  'CSSStyleDeclaration',
  'CSSStyleSheet',
  'CSSRule',
  'CSSRuleList',
  'CSSMediaRule',
  'CSSStyleRule',
  'CSSImportRule',
  'CSSPageRule',
  'CSSFontFaceRule',
  'CSSNamespaceRule',
  'CSSKeyframesRule',
  'CSSKeyframeRule',
  'CSSSupportsRule',
  'CSSConditionRule',
  'CSSGroupingRule',
  'CSSMarginRule',
  'CSSPositionFallbackRule',
  'CSSPropertyRule',
  'CSSLayerBlockRule',
  'CSSLayerStatementRule',
  'CSSContainerRule',
  'CSSCounterStyleRule',
  'CSSFontPaletteValuesRule',
  'CSSFontFeatureValuesRule',
  'CSSFontFeatureValuesMap',
  'CSSImportRule',
  'StyleSheetList',
  'StyleSheet',
  'MediaList',
  'MediaQueryList',
  'MediaQueryListEvent',
  'Screen',
  'ScreenOrientation',
  'VisualViewport',
  'CanvasRenderingContext2D',
  'CanvasGradient',
  'CanvasPattern',
  'TextMetrics',
  'ImageData',
  'Path2D',
  'DOMMatrix',
  'DOMMatrixReadOnly',
  'DOMPoint',
  'DOMPointReadOnly',
  'DOMRect',
  'DOMRectReadOnly',
  'DOMQuad',
  'DOMRectList',
  'DOMStringList',
  'DOMStringMap',
  'DOMTokenList',
  'NamedNodeMap',
  'HTMLCollection',
  'HTMLFormControlsCollection',
  'HTMLOptionsCollection',
  'RadioNodeList',
  'DataTransfer',
  'DataTransferItem',
  'DataTransferItemList',
  'DragEvent',
  'ClipboardEvent',
  'ClipboardData',
  'ClipboardItem',
  'Permissions',
  'PermissionStatus',
  'Geolocation',
  'GeolocationPosition',
  'GeolocationPositionError',
  'PositionOptions',
  'PushManager',
  'PushSubscription',
  'PushSubscriptionOptions',
  'Notification',
  'NotificationEvent',
  'ServiceWorkerRegistration',
  'ServiceWorkerContainer',
  'ServiceWorkerGlobalScope',
  'Cache',
  'CacheStorage',
  'CacheQueryOptions',
  'ExtendableEvent',
  'FetchEvent',
  'InstallEvent',
  'ActivateEvent',
  'SyncEvent',
  'BackgroundFetchEvent',
  'BackgroundFetchClickEvent',
  'BackgroundFetchFailEvent',
  'BackgroundFetchRecord',
  'BackgroundFetchRegistration',
  'CanMakePaymentEvent',
  'PaymentRequestEvent',
  'PeriodicSyncEvent',
  'PushEvent',
  'NotificationEvent',
  'CookieStore',
  'CookieChangeEvent',
  'CookieStoreManager',
  'CookieInit',
  'CookieList',
  'Cookie',
  'XSLTProcessor',
  'XPathExpression',
  'XPathResult',
  'XPathEvaluator',
  'XPathNSResolver',
  'CustomElementRegistry',
  'ElementInternals',
  'HTMLDataListElement',
  'HTMLDetailsElement',
  'HTMLDialogElement',
  'HTMLSummaryElement',
  'HTMLContentElement',
  'HTMLShadowElement',
  'HTMLTemplateElement',
  'HTMLSlotElement',
  'MutationObserver',
  'MutationObserverInit',
  'MutationRecord',
  'IntersectionObserver',
  'IntersectionObserverEntry',
  'IntersectionObserverInit',
  'ResizeObserver',
  'ResizeObserverEntry',
  'ResizeObserverSize',
  'ResizeObserverOptions',
  'PerformanceObserver',
  'PerformanceObserverEntryList',
  'PerformanceObserverInit',
  'PerformanceEntry',
  'PerformanceMark',
  'PerformanceMeasure',
  'PerformanceResourceTiming',
  'PerformanceNavigationTiming',
  'PerformancePaintTiming',
  'PerformanceEventTiming',
  'PerformanceLongTaskTiming',
  'PerformanceElementTiming',
  'PerformanceServerTiming',
  'TaskAttributionTiming',
  'LargestContentfulPaint',
  'LayoutShift',
  'LayoutShiftAttribution',
  'ReportingObserver',
  'ReportingObserverOptions',
  'Report',
  'DeprecationReportBody',
  'InterventionReportBody',
  'CrashReportBody',
  'CSPViolationReportBody',
  'CSPReportBody',
  'ReportBody',
  'FontFace',
  'FontFaceSet',
  'FontFaceSetLoadEvent',
  'FontFaceSetLoadStatus',
  'BarProp',
  'ScrollBehavior',
  'ScrollIntoViewOptions',
  'ScrollOptions',
  'ScrollToOptions',
  'ScrollRestoration',
  'History',
  'Location',
  'Navigator',
  'NavigatorUAData',
  'NavigatorUADataBrand',
  'NavigatorUADataPlatform',
  'MimeTypeArray',
  'MimeType',
  'PluginArray',
  'Plugin',
  'Permissions',
  'PermissionStatus',
  'PushManager',
  'PushSubscription',
  'PushSubscriptionOptions',
  'ServiceWorkerRegistration',
  'ServiceWorkerContainer',
  'ServiceWorker',
  'ServiceWorkerGlobalScope',
  'Cache',
  'CacheStorage',
  'CacheQueryOptions',
  'ExtendableEvent',
  'FetchEvent',
  'InstallEvent',
  'ActivateEvent',
  'SyncEvent',
  'PushEvent',
  'NotificationEvent',
  'CanMakePaymentEvent',
  'PaymentRequestEvent',
  'PeriodicSyncEvent',
  'CookieStore',
  'CookieChangeEvent',
  'CookieStoreManager',
  'CookieInit',
  'CookieList',
  'Cookie',
  'AbortController',
  'AbortSignal',
  'Headers',
  'Request',
  'Response',
  'FormData',
  'Blob',
  'File',
  'FileReader',
  'URLSearchParams',
  'URL',
  'URLPattern',
  'TextEncoder',
  'TextDecoder',
  'TextEncoderStream',
  'TextDecoderStream',
  'ReadableStream',
  'ReadableStreamDefaultReader',
  'ReadableStreamBYOBReader',
  'ReadableStreamDefaultController',
  'ReadableByteStreamController',
  'WritableStream',
  'WritableStreamDefaultWriter',
  'WritableStreamDefaultController',
  'TransformStream',
  'TransformStreamDefaultController',
  'ByteLengthQueuingStrategy',
  'CountQueuingStrategy',
  'QueuingStrategy',
  'QueuingStrategyInit',
  'ReadableStreamDefaultController',
  'EventSource',
  'MessageChannel',
  'MessagePort',
  'MessageEvent',
  'BroadcastChannel',
  'Worker',
  'SharedWorker',
  'WorkerGlobalScope',
  'DedicatedWorkerGlobalScope',
  'SharedWorkerGlobalScope',
  'ServiceWorkerGlobalScope',
  'AudioWorklet',
  'AudioWorkletGlobalScope',
  'AudioWorkletNode',
  'AudioWorkletProcessor',
  'CSSImageValue',
  'CSSKeywordValue',
  'CSSNumericValue',
  'CSSPositionValue',
  'CSSStyleValue',
  'CSSUnitValue',
  'CSSUnparsedValue',
  'StylePropertyMap',
  'StylePropertyMapReadOnly',
  'Worklet',
  'PaintWorkletGlobalScope',
  'LayoutWorkletGlobalScope',
  'PaintRenderingContext2D',
  'PaintSize',
  'CSSStyleDeclaration',
  'CSSStyleSheet',
  'CSSRule',
  'CSSRuleList',
  'StyleSheetList',
  'StyleSheet',
  'MediaList',
  'MediaQueryList',
  'MediaQueryListEvent',
  'LinkStyle',
  'CSSImportRule',
  'CSSLayerBlockRule',
  'CSSLayerStatementRule',
  'CSSContainerRule',
  'CSSSupportsRule',
  'CSSConditionRule',
  'CSSGroupingRule',
  'CSSMediaRule',
  'CSSStyleRule',
  'CSSPageRule',
  'CSSFontFaceRule',
  'CSSFontPaletteValuesRule',
  'CSSFontFeatureValuesRule',
  'CSSKeyframesRule',
  'CSSKeyframeRule',
  'CSSMarginRule',
  'CSSNamespaceRule',
  'CSSPositionFallbackRule',
  'CSSPropertyRule',
  'CSSCounterStyleRule',
  'CSSRule',
  'Animation',
  'AnimationEffect',
  'AnimationEvent',
  'AnimationPlaybackEvent',
  'AnimationTimeline',
  'DocumentTimeline',
  'KeyframeEffect',
  'CSSTransition',
  'CSSAnimation',
  'TransitionEvent',
  'CustomElementRegistry',
  'ElementInternals',
  'HTMLElement',
  'HTMLUnknownElement',
  'NamedNodeMap',
  'Attr',
  'NodeList',
  'HTMLCollection',
  'DOMTokenList',
  'DOMStringMap',
  'DOMStringList',
  'ShadowRoot',
  'DocumentFragment',
  'DocumentType',
  'CharacterData',
  'Text',
  'Comment',
  'ProcessingInstruction',
  'Node',
  'NodeFilter',
  'TreeWalker',
  'NodeIterator',
  'Event',
  'EventTarget',
  'CustomEvent',
  'UIEvent',
  'MouseEvent',
  'WheelEvent',
  'DragEvent',
  'KeyboardEvent',
  'PointerEvent',
  'TouchEvent',
  'GamepadEvent',
  'DeviceOrientationEvent',
  'DeviceMotionEvent',
  'CompositionEvent',
  'FocusEvent',
  'InputEvent',
  'BeforeUnloadEvent',
  'HashChangeEvent',
  'PageTransitionEvent',
  'PopStateEvent',
  'StorageEvent',
  'ProgressEvent',
  'XMLHttpRequestEventTarget',
  'XMLHttpRequest',
  'XMLHttpRequestUpload',
  'FormDataEvent',
  'SubmitEvent',
  'ToggleEvent',
  'HTMLDialogElement',
  'HTMLDetailsElement',
  'HTMLSummaryElement',
  'HTMLDataListElement',
  'HTMLContentElement',
  'HTMLShadowElement',
  'HTMLTemplateElement',
  'HTMLSlotElement',
  'MutationObserver',
  'MutationObserverInit',
  'MutationRecord',
  'IntersectionObserver',
  'IntersectionObserverEntry',
  'IntersectionObserverInit',
  'ResizeObserver',
  'ResizeObserverEntry',
  'ResizeObserverSize',
  'ResizeObserverOptions',
  'PerformanceObserver',
  'PerformanceObserverEntryList',
  'PerformanceObserverInit',
  'PerformanceEntry',
  'PerformanceMark',
  'PerformanceMeasure',
  'PerformanceResourceTiming',
  'PerformanceNavigationTiming',
  'PerformancePaintTiming',
  'PerformanceEventTiming',
  'PerformanceLongTaskTiming',
  'PerformanceElementTiming',
  'PerformanceServerTiming',
  'TaskAttributionTiming',
  'LargestContentfulPaint',
  'LayoutShift',
  'LayoutShiftAttribution',
  'ReportingObserver',
  'ReportingObserverOptions',
  'Report',
  'DeprecationReportBody',
  'InterventionReportBody',
  'CrashReportBody',
  'CSPViolationReportBody',
  'CSPReportBody',
  'ReportBody',
  'FontFace',
  'FontFaceSet',
  'FontFaceSetLoadEvent',
  'FontFaceSetLoadStatus',
  'BarProp',
  'ScrollBehavior',
  'ScrollIntoViewOptions',
  'ScrollOptions',
  'ScrollToOptions',
  'ScrollRestoration',
  'History',
  'Location',
  'Navigator',
  'NavigatorUAData',
  'NavigatorUADataBrand',
  'NavigatorUADataPlatform',
  'MimeTypeArray',
  'MimeType',
  'PluginArray',
  'Plugin',
  'Permissions',
  'PermissionStatus',
  'PushManager',
  'PushSubscription',
  'PushSubscriptionOptions',
  'ServiceWorkerRegistration',
  'ServiceWorkerContainer',
  'ServiceWorker',
  'Cache',
  'CacheStorage',
  'CacheQueryOptions',
  'ExtendableEvent',
  'FetchEvent',
  'InstallEvent',
  'ActivateEvent',
  'SyncEvent',
  'PushEvent',
  'NotificationEvent',
  'CanMakePaymentEvent',
  'PaymentRequestEvent',
  'PeriodicSyncEvent',
  'CookieStore',
  'CookieChangeEvent',
  'CookieStoreManager',
  'CookieInit',
  'CookieList',
  'Cookie',
  'AbortController',
  'AbortSignal',
  'Headers',
  'Request',
  'Response',
  'FormData',
  'Blob',
  'File',
  'FileReader',
  'URLSearchParams',
  'URL',
  'URLPattern',
  'TextEncoder',
  'TextDecoder',
  'TextEncoderStream',
  'TextDecoderStream',
  'ReadableStream',
  'ReadableStreamDefaultReader',
  'ReadableStreamBYOBReader',
  'ReadableStreamDefaultController',
  'ReadableByteStreamController',
  'WritableStream',
  'WritableStreamDefaultWriter',
  'WritableStreamDefaultController',
  'TransformStream',
  'TransformStreamDefaultController',
  'ByteLengthQueuingStrategy',
  'CountQueuingStrategy',
  'QueuingStrategy',
  'QueuingStrategyInit',
  'EventSource',
  'MessageChannel',
  'MessagePort',
  'MessageEvent',
  'BroadcastChannel',
  'Worker',
  'SharedWorker',
  'AudioWorklet',
  'AudioWorkletGlobalScope',
  'AudioWorkletNode',
  'AudioWorkletProcessor',
  'CSSImageValue',
  'CSSKeywordValue',
  'CSSNumericValue',
  'CSSPositionValue',
  'CSSStyleValue',
  'CSSUnitValue',
  'CSSUnparsedValue',
  'StylePropertyMap',
  'StylePropertyMapReadOnly',
  'Worklet',
  'PaintWorkletGlobalScope',
  'LayoutWorkletGlobalScope',
  'PaintRenderingContext2D',
  'PaintSize',
  'DOMParser',
  'XMLSerializer',
  'XPathExpression',
  'XPathResult',
  'XPathEvaluator',
  'XPathNSResolver',
  'XSLTProcessor',
  'createImageBitmap',
  'OffscreenCanvas',
  'ImageBitmap',
  'ImageBitmapRenderingContext',
  'ImageData',
  'Path2D',
  'CanvasGradient',
  'CanvasPattern',
  'TextMetrics',
  'CanvasRenderingContext2D',
  'DOMMatrix',
  'DOMMatrixReadOnly',
  'DOMPoint',
  'DOMPointReadOnly',
  'DOMRect',
  'DOMRectReadOnly',
  'DOMQuad',
  'DOMRectList',
  'DataView',
  'ArrayBuffer',
  'SharedArrayBuffer',
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array',
  'Symbol',
  'BigInt',
  'Number',
  'String',
  'Boolean',
  'Array',
  'Object',
  'Function',
  'RegExp',
  'Date',
  'Math',
  'JSON',
  'Intl',
  'WebAssembly',
  'Error',
  'AggregateError',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TypeError',
  'URIError',
  'InternalError',
  'Promise',
  'Proxy',
  'Reflect',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'WeakRef',
  'FinalizationRegistry',
  'Infinity',
  'NaN',
  'undefined',
  'globalThis',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'decodeURI',
  'decodeURIComponent',
  'encodeURI',
  'encodeURIComponent',
  'escape',
  'unescape',
  'eval',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'queueMicrotask',
  'structuredClone',
  'atob',
  'btoa',
  'crypto',
  'Crypto',
  'SubtleCrypto',
  'CryptoKey',
  'navigator',
  'location',
  'history',
  'window',
  'self',
  'document',
  'localStorage',
  'sessionStorage',
  'console',
  'fetch',
  'confirm',
  'alert',
  'prompt',
  'print',
  'open',
  'close',
  'getComputedStyle',
  'matchMedia',
  'scrollTo',
  'scrollIntoView',
  'postMessage',
  'top',
  'parent',
  'frames',
  'origin',
  'isSecureContext',
  'crossOriginIsolated',
  'devicePixelRatio',
  'innerWidth',
  'innerHeight',
  'outerWidth',
  'outerHeight',
  'screenX',
  'screenY',
  'screenLeft',
  'screenTop',
  'scrollX',
  'scrollY',
  'pageXOffset',
  'pageYOffset',
  'screen',
  'visualViewport',
  'performance',
  'scheduler',
  'trustedTypes',
  'customElements',
  'Notification',
  'PushManager',
  'Geolocation',
  'Permissions',
  'ClipboardItem',
  'SpeechRecognition',
  'webkitSpeechRecognition',
  'Paddle',
  'Clerk',
  'WeixinJSBridge',
  'wx',
  'Deno',
  'process',
  'Buffer',
  'global',
  'require',
  'module',
  'exports',
  '__dirname',
  '__filename',
  'exports',
  'module',
  'require',
  'Paddle',
  'Clerk',
  'WeixinJSBridge',
  'wx',
  'loadClerkUI',
]);

// ── For each module, find all identifiers used that need importing ──
// We'll scan each function body for identifier usage

function extractIdentifiers(code) {
  // Remove strings, comments, and regex
  // For template literals, keep the ${...} expressions (they may contain identifiers)
  let cleaned = code
    .replace(/\/\/.*$/gm, '')          // line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')  // block comments
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")  // single-quoted strings
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')  // double-quoted strings
    // For template literals: replace backtick content but keep ${...} expressions
    .replace(/`/g, '\n')               // turn backticks into newlines (preserve ${...} content)
    // Remove remaining string-like content that's not inside ${...}
    ;

  // Find all identifiers
  const idents = new Set();
  const identRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
  let m2;
  while ((m2 = identRegex.exec(cleaned)) !== null) {
    idents.add(m2[1]);
  }
  return idents;
}

// For each module, collect needed imports
for (const [modFile, funcNames] of Object.entries(moduleMap)) {
  const modFuncs = funcNames.map(n => funcLookup[n]).filter(Boolean);
  if (modFuncs.length === 0) {
    console.log(`No functions for ${modFile}`);
    continue;
  }

  // Collect all identifiers used across all functions in this module
  const allIdents = new Set();
  for (const f of modFuncs) {
    const idents = extractIdentifiers(f.body);
    idents.forEach(i => allIdents.add(i));
  }

  // Classify identifiers
  const neededState = [];   // state variables to import
  const neededSetters = []; // setter functions to import
  const neededFuncs = [];   // functions from other modules to import

  for (const ident of allIdents) {
    // Skip if it's a global API
    if (globalIdentifiers.has(ident)) continue;
    // Skip if it's a local function in this module
    if (funcNames.includes(ident)) continue;
    // Skip if it's a parameter or local variable (we can't easily detect these, but skip common ones)
    // Check if it's a state variable
    if (stateExports.includes(ident)) {
      neededState.push(ident);
      continue;
    }
    // Check if it's a setter
    if (stateSetters.includes(ident)) {
      neededSetters.push(ident);
      continue;
    }
    // Check if it's a function from another module
    if (allFuncs.has(ident)) {
      const targetMod = funcToModule[ident];
      if (targetMod !== modFile) {
        neededFuncs.push({ name: ident, module: targetMod });
      }
      continue;
    }
    // Unknown identifier - could be a local variable, parameter, or something we missed
    // We'll skip these - they're likely local variables/parameters
  }

  // Sort for deterministic output
  neededState.sort();
  neededSetters.sort();
  neededFuncs.sort((a, b) => a.name.localeCompare(b.name));

  // Group neededFuncs by module
  const funcsByModule = {};
  for (const f of neededFuncs) {
    if (!funcsByModule[f.module]) funcsByModule[f.module] = [];
    funcsByModule[f.module].push(f.name);
  }

  // Build import lines
  const importLines = [];

  // Import state variables and setters
  const stateImports = [...neededState, ...neededSetters];
  if (stateImports.length > 0) {
    // Split into chunks to avoid overly long lines
    const chunks = [];
    for (let i = 0; i < stateImports.length; i += 20) {
      chunks.push(stateImports.slice(i, i + 20));
    }
    for (const chunk of chunks) {
      importLines.push(`import { ${chunk.join(', ')} } from './state.js';`);
    }
  }

  // Import functions from other modules
  for (const [targetMod, funcNames2] of Object.entries(funcsByModule)) {
    funcNames2.sort();
    const chunks = [];
    for (let i = 0; i < funcNames2.length; i += 20) {
      chunks.push(funcNames2.slice(i, i + 20));
    }
    for (const chunk of chunks) {
      importLines.push(`import { ${chunk.join(', ')} } from './${targetMod}';`);
    }
  }

  // Build function bodies with export keyword
  const funcBodies = modFuncs.map(f => {
    const prefix = f.isAsync ? 'export async function' : 'export function';
    // Replace the first line to add 'export'
    const body = f.body.replace(/^(async\s+)?function\s+/, prefix + ' ');
    return body;
  });

  // Write the module file
  const header = `// Auto-generated from app.js — do not edit manually\n`;
  const content = header + '\n' + importLines.join('\n') + '\n\n' + funcBodies.join('\n\n') + '\n';

  const outPath = path.join(MODULES_DIR, modFile);
  fs.writeFileSync(outPath, content);
  console.log(`Wrote ${modFile}: ${modFuncs.length} functions, ${stateImports.length} state imports, ${neededFuncs.length} func imports`);
}

console.log('\nDone!');
