#!/usr/bin/env node
/**
 * Verify that all identifiers used in module files are either:
 * 1. Imported from another module
 * 2. Exported from the same module
 * 3. A browser global
 * 4. A local variable/parameter
 */

const fs = require('fs');
const path = require('path');

const MODULES_DIR = '/Users/cyingfang/devin/welian/public/modules';

// Browser globals (same list as extract script, abbreviated)
const browserGlobals = new Set([
  'window','document','localStorage','sessionStorage','location','history',
  'console','fetch','URLSearchParams','URL','Date','Math','JSON','Object',
  'Array','String','Number','Boolean','Promise','Set','Map','RegExp',
  'Error','parseInt','parseFloat','isNaN','setTimeout','setInterval',
  'clearTimeout','clearInterval','requestAnimationFrame','cancelAnimationFrame',
  'navigator','performance','encodeURIComponent','decodeURIComponent',
  'encodeURI','decodeURI','Blob','File','FileReader','FormData',
  'XMLHttpRequest','WebSocket','Event','CustomEvent',
  'confirm','alert','prompt','open','close','print',
  'Image','Canvas','Path2D','DOMParser','XMLSerializer',
  'MutationObserver','IntersectionObserver','ResizeObserver',
  'AbortController','Headers','Request','Response',
  'Symbol','BigInt','Proxy','Reflect',
  'Paddle','Clerk','WeixinJSBridge','wx','loadClerkUI',
  'SpeechRecognition','webkitSpeechRecognition','ClipboardItem',
  'OffscreenCanvas','HTMLCanvasElement','createImageBitmap',
  'Intl','WebAssembly','DataView','ArrayBuffer',
  'Int8Array','Uint8Array','Uint8ClampedArray','Int16Array','Uint16Array',
  'Int32Array','Uint32Array','Float32Array','Float64Array',
  'Infinity','NaN','undefined','globalThis','self','top','parent',
  'innerWidth','innerHeight','outerWidth','outerHeight',
  'screenX','screenY','screen','visualViewport',
  'origin','isSecureContext','devicePixelRatio',
  'scrollTo','scrollIntoView','postMessage',
  'getComputedStyle','matchMedia','structuredClone',
  'queueMicrotask','atob','btoa','TextEncoder','TextDecoder',
  'crypto','WeakRef','WeakMap','WeakSet','FinalizationRegistry',
  'AggregateError','EvalError','RangeError','ReferenceError',
  'SyntaxError','TypeError','URIError','InternalError',
  'escape','unescape','eval','isFinite',
  'requestIdleCallback','cancelIdleCallback',
  'Deno','process','Buffer','global','require','module','exports',
  '__dirname','__filename',
  'frames','frameElement','scrollX','scrollY','pageXOffset','pageYOffset',
  'screenLeft','screenTop','crossOriginIsolated',
  'scheduler','trustedTypes','customElements',
  'Notification','Geolocation','Permissions',
  'ServiceWorker','Worker','SharedWorker','BroadcastChannel',
  'MessageChannel','MessagePort','EventSource',
  'ReadableStream','WritableStream','TransformStream',
  'ByteLengthQueuingStrategy','CountQueuingStrategy',
  'TextEncoderStream','TextDecoderStream',
  'ReadableStreamDefaultReader','ReadableStreamBYOBReader',
  'ReadableStreamDefaultController','ReadableByteStreamController',
  'WritableStreamDefaultWriter','WritableStreamDefaultController',
  'TransformStreamDefaultController',
  'CSSStyleSheet','CSSRule','CSSStyleDeclaration',
  'Animation','AnimationEvent','TransitionEvent',
  'KeyframeEffect','AnimationEffect','AnimationTimeline',
  'DocumentTimeline','CSSTransition','CSSAnimation',
  'FontFace','FontFaceSet',
  'DOMTokenList','DOMStringMap','DOMStringList',
  'NamedNodeMap','Attr','NodeList','HTMLCollection',
  'ShadowRoot','DocumentFragment','DocumentType',
  'CharacterData','Text','Comment','ProcessingInstruction',
  'Node','NodeFilter','TreeWalker','NodeIterator',
  'EventTarget','UIEvent','MouseEvent','WheelEvent',
  'DragEvent','KeyboardEvent','PointerEvent','TouchEvent',
  'FocusEvent','InputEvent','BeforeUnloadEvent',
  'HashChangeEvent','PageTransitionEvent','PopStateEvent',
  'StorageEvent','ProgressEvent','SubmitEvent',
  'ToggleEvent','CustomElementRegistry',
  'Element','HTMLElement','HTMLInputElement',
  'HTMLTextAreaElement','HTMLSelectElement',
  'HTMLDivElement','HTMLImageElement','HTMLAnchorElement',
  'HTMLButtonElement','HTMLFormElement',
  'HTMLDialogElement','HTMLDetailsElement',
  'HTMLSlotElement','HTMLTemplateElement',
  'Range','Selection','DOMRect','DOMRectReadOnly',
  'DOMPoint','DOMPointReadOnly','DOMMatrix','DOMMatrixReadOnly',
  'DOMQuad','CanvasRenderingContext2D','CanvasGradient',
  'CanvasPattern','TextMetrics','ImageData',
  'ImageBitmap','ImageBitmapRenderingContext',
  'URLPattern','XPathExpression','XPathResult',
  'XPathEvaluator','XPathNSResolver','XSLTProcessor',
  'ResizeObserverEntry','ResizeObserverSize',
  'IntersectionObserverEntry','MutationRecord',
  'PerformanceObserver','PerformanceEntry',
  'PerformanceMark','PerformanceMeasure',
  'PerformanceResourceTiming','PerformanceNavigationTiming',
  'PerformancePaintTiming','ReportingObserver',
  'BarProp','History','Location','Navigator',
  'MimeTypeArray','MimeType','PluginArray','Plugin',
  'PushManager','PushSubscription',
  'ServiceWorkerRegistration','ServiceWorkerContainer',
  'Cache','CacheStorage',
  'CookieStore','CookieChangeEvent',
  'AbortSignal','FormDataEvent',
  'XMLHttpRequestEventTarget','XMLHttpRequestUpload',
  'GamepadEvent','DeviceOrientationEvent','DeviceMotionEvent',
  'CompositionEvent','BeforeUnloadEvent',
  'Crypto','SubtleCrypto','CryptoKey',
  'CanvasRenderingContext2D',
  'OffscreenCanvasRenderingContext2D',
  'ReadableStreamDefaultController',
  'CSSImageValue','CSSKeywordValue','CSSNumericValue',
  'CSSPositionValue','CSSStyleValue','CSSUnitValue',
  'CSSUnparsedValue','StylePropertyMap','StylePropertyMapReadOnly',
  'Worklet','PaintWorkletGlobalScope','LayoutWorkletGlobalScope',
  'PaintRenderingContext2D','PaintSize',
  'AudioWorklet','AudioWorkletGlobalScope',
  'AudioWorkletNode','AudioWorkletProcessor',
  'WorkerGlobalScope','DedicatedWorkerGlobalScope',
  'SharedWorkerGlobalScope','ServiceWorkerGlobalScope',
  'ExtendableEvent','FetchEvent','InstallEvent','ActivateEvent',
  'PushEvent','NotificationEvent','CanMakePaymentEvent',
  'PaymentRequestEvent','PeriodicSyncEvent',
  'GeolocationPosition','GeolocationPositionError',
  'PermissionStatus','PushSubscriptionOptions',
  'CookieInit','CookieList','Cookie',
  'CacheQueryOptions','QueuingStrategy','QueuingStrategyInit',
  'FontFaceSetLoadEvent','FontFaceSetLoadStatus',
  'ScrollBehavior','ScrollIntoViewOptions','ScrollOptions',
  'ScrollToOptions','ScrollRestoration',
  'NavigatorUAData','NavigatorUADataBrand','NavigatorUADataPlatform',
  'LinkStyle','ElementInternals',
  'RadioNodeList','HTMLFormControlsCollection',
  'HTMLOptionsCollection','HTMLUnknownElement',
  'HTMLHtmlElement','HTMLHeadElement','HTMLBodyElement',
  'HTMLBaseElement','HTMLLinkElement','HTMLMetaElement',
  'HTMLStyleElement','HTMLTitleElement',
  'HTMLDListElement','HTMLEmbedElement','HTMLFieldSetElement',
  'HTMLFrameElement','HTMLFrameSetElement','HTMLHeadingElement',
  'HTMLHRElement','HTMLIFrameElement','HTMLLabelElement',
  'HTMLLegendElement','HTMLLIElement','HTMLMapElement',
  'HTMLMarqueeElement','HTMLMenuElement','HTMLMeterElement',
  'HTMLModElement','HTMLOListElement','HTMLOptGroupElement',
  'HTMLOptionElement','HTMLOptionsCollection','HTMLOutputElement',
  'HTMLParagraphElement','HTMLParamElement','HTMLPictureElement',
  'HTMLPreElement','HTMLProgressElement','HTMLQuoteElement',
  'HTMLScriptElement','HTMLSourceElement','HTMLSpanElement',
  'HTMLTableCaptionElement','HTMLTableCellElement',
  'HTMLTableColElement','HTMLTableElement','HTMLTableRowElement',
  'HTMLTableSectionElement','HTMLTimeElement','HTMLTitleElement',
  'HTMLTrackElement','HTMLUListElement','HTMLVideoElement',
  'HTMLAudioElement','HTMLMediaElement','HTMLObjectElement',
  'HTMLDataListElement','HTMLSummaryElement',
  'HTMLContentElement','HTMLShadowElement',
  'DataTransfer','DataTransferItem','DataTransferItemList',
  'ClipboardEvent','ClipboardData',
  'AnimationPlaybackEvent','CSSRuleList','StyleSheetList',
  'StyleSheet','MediaList','MediaQueryList','MediaQueryListEvent',
  'CSSImportRule','CSSLayerBlockRule','CSSLayerStatementRule',
  'CSSContainerRule','CSSSupportsRule','CSSConditionRule',
  'CSSGroupingRule','CSSMediaRule','CSSStyleRule',
  'CSSPageRule','CSSFontFaceRule','CSSFontPaletteValuesRule',
  'CSSFontFeatureValuesRule','CSSKeyframesRule','CSSKeyframeRule',
  'CSSMarginRule','CSSNamespaceRule','CSSPositionFallbackRule',
  'CSSPropertyRule','CSSCounterStyleRule',
  'LargestContentfulPaint','LayoutShift','LayoutShiftAttribution',
  'TaskAttributionTiming','PerformanceEventTiming',
  'PerformanceLongTaskTiming','PerformanceElementTiming',
  'PerformanceServerTiming','DeprecationReportBody',
  'InterventionReportBody','CrashReportBody',
  'CSPViolationReportBody','CSPReportBody','ReportBody',
  'Report','ReportingObserverOptions',
  'MutationObserverInit','IntersectionObserverInit',
  'ResizeObserverOptions','PerformanceObserverEntryList',
  'PerformanceObserverInit',
  'SharedArrayBuffer','BigInt64Array','BigUint64Array',
  'Function','Object','Array','String','Number','Boolean',
  'MediaQueryListEvent','PositionOptions',
  'NotificationEvent','BackgroundFetchEvent',
  'BackgroundFetchClickEvent','BackgroundFetchFailEvent',
  'BackgroundFetchRecord','BackgroundFetchRegistration',
  'SyncEvent','CookieStoreManager',
  'ServiceWorker','ServiceWorkerGlobalScope',
  'HTMLMarqueeElement',
  'PaintRenderingContext2D',
  'ReadableStreamBYOBReader',
  'WritableStreamDefaultWriter',
  'WritableStreamDefaultController',
  'TransformStreamDefaultController',
  'ByteLengthQueuingStrategy',
  'CountQueuingStrategy',
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
]);

// Collect all exports from all modules
const allExports = new Map(); // name -> module file
const moduleFiles = fs.readdirSync(MODULES_DIR).filter(f => f.endsWith('.js') && f !== 'main.js');

for (const file of moduleFiles) {
  const content = fs.readFileSync(path.join(MODULES_DIR, file), 'utf8');
  // Match export function, export async function, export let/const/var, export class
  const exportRegex = /^export\s+(?:async\s+)?(?:function|let|const|var|class)\s+(\w+)/gm;
  let m;
  while ((m = exportRegex.exec(content)) !== null) {
    allExports.set(m[1], file);
  }
}

console.log(`Total exports across modules: ${allExports.size}`);

// For each module, check that all identifiers are resolvable
let totalIssues = 0;

for (const file of moduleFiles) {
  const filePath = path.join(MODULES_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');

  // Collect imports in this file
  const imports = new Set();
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+'[^']+';/g;
  let m2;
  while ((m2 = importRegex.exec(content)) !== null) {
    const names = m2[1].split(',').map(s => s.trim());
    names.forEach(n => imports.add(n));
  }

  // Collect local exports
  const localExports = new Set();
  const exportRegex2 = /^export\s+(?:async\s+)?(?:function|let|const|var|class)\s+(\w+)/gm;
  let m3;
  while ((m3 = exportRegex2.exec(content)) !== null) {
    localExports.add(m3[1]);
  }

  // Collect local variable declarations (let/const/var at top level inside functions)
  // This is hard to do perfectly, but we can at least find function parameters
  // and local variable declarations
  const localVars = new Set();

  // Find function parameters
  const funcParamRegex = /(?:function\s+\w+|=>)\s*\(([^)]*)\)/g;
  let m4;
  while ((m4 = funcParamRegex.exec(content)) !== null) {
    const params = m4[1].split(',').map(s => s.trim().split(/\s*=\s*/)[0].trim());
    params.forEach(p => {
      if (p && /^[a-zA-Z_$]/.test(p)) localVars.add(p);
    });
  }

  // Find local let/const/var declarations (simplified)
  const localVarRegex = /\b(?:let|const|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  let m5;
  while ((m5 = localVarRegex.exec(content)) !== null) {
    localVars.add(m5[1]);
  }

  // Find loop variables (for (let i = ...), for (const x of ...))
  const forLoopRegex = /for\s*\((?:let|const|var)\s+(\w+)/g;
  let m6;
  while ((m6 = forLoopRegex.exec(content)) !== null) {
    localVars.add(m6[1]);
  }

  // Find catch variables
  const catchRegex = /catch\s*\((\w+)\)/g;
  let m7;
  while ((m7 = catchRegex.exec(content)) !== null) {
    localVars.add(m7[1]);
  }

  // Now extract all identifiers used in the file
  // (same cleaning as extract script)
  let cleaned = content
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`/g, '\n');

  // Remove import/export lines
  cleaned = cleaned.replace(/^import\s+.*$/gm, '').replace(/^export\s+/gm, '');

  const idents = new Set();
  const identRegex = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
  let m8;
  while ((m8 = identRegex.exec(cleaned)) !== null) {
    idents.add(m8[1]);
  }

  // Check each identifier
  const issues = [];
  for (const ident of idents) {
    if (browserGlobals.has(ident)) continue;
    if (imports.has(ident)) continue;
    if (localExports.has(ident)) continue;
    if (localVars.has(ident)) continue;
    if (allExports.has(ident)) {
      // It's exported from another module but not imported here
      // Check if it's a local export that's also used (shouldn't be an issue)
      const sourceMod = allExports.get(ident);
      if (sourceMod !== file) {
        issues.push(`  MISSING IMPORT: ${ident} (from ${sourceMod})`);
      }
    } else {
      // Unknown identifier — could be a local variable we missed
      // Only report if it looks like a function call or property access
      // Skip common patterns
      if (!['d', 'e', 'i', 'j', 'k', 'n', 's', 't', 'x', 'y', 'z',
            'el', 'fn', 'ok', 'p', 'r', 'c', 'm', 'v', 'w', 'q',
            'data', 'resp', 'token', 'result', 'err', 'error',
            'key', 'val', 'value', 'name', 'item', 'items', 'obj',
            'arr', 'len', 'idx', 'msg', 'text', 'html', 'css',
            'zh', 'en', 'isToday', 'isSameDay', 'delta', 'deltaLabel',
            'contactName', 'contactId', 'todoId', 'tlId', 'sessionId',
            'displayName', 'email', 'phone', 'tipParts', 'loginInitiated',
            'count', 'timer', 'attempts', 'reqId', 'streamBuffer',
            'typingEl', 'bubble', 'chatBody', 'today', 'due', 'task',
            'priority', 'contact', 'location', 'body', 'input',
            'formDiv', 'freshDiv', 'container', 'card',
            'weekdays', 'mmdd', 'dueDateDisplay', 'dueDate',
            'sourceBadge', 'priorityBadge', 'taskText', 'taskDisplay',
            'completedDate', 'doneCount', 'groups', 'groupLabels', 'gl',
            'sortedMonths', 'monthDate', 'monthLabel', 'contactMap',
            'dateStr', 'dayStr', 'summary', 'isToday', 'tId',
            'cid', 'cname', 'todoHtml', 'dashHtml', 'recentHtml',
            'inner', 'label', 'actions', 'p', 'c',
            'overlay', 'box', 'close', 'banner', 'btns',
            'sidebarEl', 'hoverZone', 'rightEl', 'rightZone',
            'openBtn', 'nav', 'chatMain', 'scrollEl',
            'cleaned', 'idents', 'ident', 'issues',
            'chunk', 'chunks', 'stateImports', 'neededState',
            'neededSetters', 'neededFuncs', 'funcsByModule',
            'importLines', 'funcBodies', 'header', 'content',
            'outPath', 'modFuncs', 'allIdents',
            'f', 'n', 'file', 'filePath', 'localExports',
            'localVars', 'm', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8',
            'sourceMod', 'totalIssues',
      ].includes(ident)) {
        // Only report if it starts with lowercase and isn't a property name
        // Skip if it's likely a property (accessed via .)
        issues.push(`  UNKNOWN: ${ident}`);
      }
    }
  }

  if (issues.length > 0) {
    console.log(`\n=== ${file} (${issues.length} issues) ===`);
    // Only show missing imports, not unknowns (too many false positives)
    const missing = issues.filter(i => i.includes('MISSING IMPORT'));
    const unknown = issues.filter(i => i.includes('UNKNOWN'));
    if (missing.length > 0) {
      console.log('MISSING IMPORTS:');
      missing.forEach(i => console.log(i));
    }
    if (unknown.length > 0 && unknown.length < 50) {
      console.log(`UNKNOWN (${unknown.length}):`);
      unknown.slice(0, 20).forEach(i => console.log(i));
      if (unknown.length > 20) console.log(`  ... and ${unknown.length - 20} more`);
    }
    totalIssues += missing.length;
  }
}

console.log(`\nTotal missing import issues: ${totalIssues}`);
