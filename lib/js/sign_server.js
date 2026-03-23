#!/usr/bin/env node
/**
 * a_bogus signing server using Node.js vm module
 * Reads JSON lines from stdin, writes signed results to stdout
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const bdmsCode = fs.readFileSync(path.join(__dirname, 'bdms.js'), 'utf8');

// Build a minimal browser-like sandbox
const sandbox = {};

// Window/self/global
sandbox.window = sandbox;
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
sandbox.global = sandbox;

// Console
sandbox.console = console;

// Timers
sandbox.setTimeout = setTimeout;
sandbox.setInterval = setInterval;
sandbox.clearTimeout = clearTimeout;
sandbox.clearInterval = clearInterval;
sandbox.requestAnimationFrame = (cb) => setTimeout(cb, 16);
sandbox.cancelAnimationFrame = clearTimeout;
sandbox.queueMicrotask = queueMicrotask;

// Promise
sandbox.Promise = Promise;

// Types
sandbox.Uint8Array = Uint8Array;
sandbox.Uint16Array = Uint16Array;
sandbox.Uint32Array = Uint32Array;
sandbox.Int8Array = Int8Array;
sandbox.Int16Array = Int16Array;
sandbox.Int32Array = Int32Array;
sandbox.Float32Array = Float32Array;
sandbox.Float64Array = Float64Array;
sandbox.ArrayBuffer = ArrayBuffer;
sandbox.DataView = DataView;
sandbox.Map = Map;
sandbox.Set = Set;
sandbox.WeakMap = WeakMap;
sandbox.WeakSet = WeakSet;
sandbox.Symbol = Symbol;
sandbox.Proxy = Proxy;
sandbox.Reflect = Reflect;
sandbox.JSON = JSON;
sandbox.Math = Math;
sandbox.Date = Date;
sandbox.RegExp = RegExp;
sandbox.Error = Error;
sandbox.TypeError = TypeError;
sandbox.RangeError = RangeError;
sandbox.SyntaxError = SyntaxError;
sandbox.URIError = URIError;
sandbox.EvalError = EvalError;
sandbox.ReferenceError = ReferenceError;
sandbox.Object = Object;
sandbox.Array = Array;
sandbox.String = String;
sandbox.Number = Number;
sandbox.Boolean = Boolean;
sandbox.Function = Function;
sandbox.parseInt = parseInt;
sandbox.parseFloat = parseFloat;
sandbox.isNaN = isNaN;
sandbox.isFinite = isFinite;
sandbox.encodeURIComponent = encodeURIComponent;
sandbox.decodeURIComponent = decodeURIComponent;
sandbox.encodeURI = encodeURI;
sandbox.decodeURI = decodeURI;
sandbox.atob = (s) => Buffer.from(s, 'base64').toString('binary');
sandbox.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
sandbox.TextEncoder = require('util').TextEncoder;
sandbox.TextDecoder = require('util').TextDecoder;
sandbox.URL = URL;
sandbox.URLSearchParams = URLSearchParams;
sandbox.undefined = undefined;
sandbox.NaN = NaN;
sandbox.Infinity = Infinity;
sandbox.eval = (code) => vm.runInContext(code, context);

// Crypto
sandbox.crypto = {
    getRandomValues: (arr) => {
        const bytes = require('crypto').randomBytes(arr.length);
        for (let i = 0; i < arr.length; i++) arr[i] = bytes[i];
        return arr;
    },
    subtle: {}
};

// Navigator
sandbox.navigator = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0',
    platform: 'MacIntel',
    language: 'zh-CN',
    languages: ['zh-CN', 'zh', 'en'],
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
    plugins: { length: 0 },
    mimeTypes: { length: 0 },
    webdriver: false,
    cookieEnabled: true,
    onLine: true,
    connection: { effectiveType: '4g', downlink: 10, rtt: 50 },
    mediaDevices: { enumerateDevices: () => Promise.resolve([]) },
    getBattery: () => Promise.resolve({ charging: true, level: 1 }),
    vendor: 'Google Inc.',
    appVersion: '5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    appName: 'Netscape',
    product: 'Gecko',
    productSub: '20030107',
};

// Screen
sandbox.screen = {
    width: 1680, height: 1050,
    availWidth: 1680, availHeight: 1050,
    colorDepth: 24, pixelDepth: 24,
    orientation: { type: 'landscape-primary', angle: 0 }
};
sandbox.innerWidth = 1680;
sandbox.innerHeight = 1050;
sandbox.outerWidth = 1680;
sandbox.outerHeight = 1050;
sandbox.devicePixelRatio = 2;
sandbox.screenX = 0;
sandbox.screenY = 0;

// Location
sandbox.location = {
    href: 'https://www.douyin.com/',
    protocol: 'https:',
    hostname: 'www.douyin.com',
    host: 'www.douyin.com',
    pathname: '/',
    search: '',
    hash: '',
    origin: 'https://www.douyin.com',
    port: '',
    ancestorOrigins: { length: 0 },
};

// Performance
const startTime = Date.now();
sandbox.performance = {
    now: () => Date.now() - startTime,
    timing: {
        navigationStart: startTime,
        loadEventEnd: startTime + 500,
        domContentLoadedEventEnd: startTime + 300,
    },
    getEntriesByType: () => [],
    memory: { jsHeapSizeLimit: 4294705152, totalJSHeapSize: 50000000, usedJSHeapSize: 40000000 },
};

// Document
const canvasCtx = {
    fillText: () => {}, measureText: () => ({ width: 10 }),
    arc: () => {}, fill: () => {}, stroke: () => {},
    closePath: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
    rect: () => {}, fillRect: () => {}, clearRect: () => {}, strokeRect: () => {},
    getImageData: () => ({ data: new Uint8Array(4) }),
    putImageData: () => {},
    createImageData: () => ({ data: new Uint8Array(4) }),
    setTransform: () => {}, resetTransform: () => {}, transform: () => {},
    translate: () => {}, rotate: () => {}, scale: () => {},
    save: () => {}, restore: () => {},
    drawImage: () => {},
    canvas: { width: 300, height: 150 },
    fillStyle: '', strokeStyle: '', font: '', textBaseline: '', textAlign: '',
    globalCompositeOperation: 'source-over',
    isPointInPath: () => false,
};
const glCtx = {
    getParameter: (p) => p === 7937 ? 'WebKit WebGL' : p === 7936 ? 'WebKit' : null,
    getExtension: (name) => name === 'WEBGL_debug_renderer_info' ? { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 } : null,
    getSupportedExtensions: () => [],
    createBuffer: () => ({}), bindBuffer: () => {}, bufferData: () => {},
    createProgram: () => ({}), createShader: () => ({}),
    shaderSource: () => {}, compileShader: () => {}, attachShader: () => {},
    linkProgram: () => {}, useProgram: () => {},
    getShaderParameter: () => true, getProgramParameter: () => true,
    getUniformLocation: () => ({}), getAttribLocation: () => 0,
    enableVertexAttribArray: () => {}, vertexAttribPointer: () => {},
    drawArrays: () => {}, viewport: () => {},
    clearColor: () => {}, clear: () => {},
    uniform2f: () => {},
    readPixels: () => {},
};

function createElement(tag) {
    if (tag === 'canvas') {
        return {
            width: 300, height: 150, style: {},
            getContext: (type) => type === '2d' ? canvasCtx : type === 'webgl' || type === 'experimental-webgl' ? glCtx : null,
            toDataURL: () => 'data:image/png;base64,',
            addEventListener: () => {},
        };
    }
    return {
        style: {}, children: [], childNodes: [],
        appendChild: function(c) { this.children.push(c); return c; },
        removeChild: () => {},
        setAttribute: () => {}, getAttribute: () => null,
        getElementsByTagName: () => [],
        addEventListener: () => {}, removeEventListener: () => {},
        innerHTML: '', innerText: '', textContent: '',
        offsetWidth: 100, offsetHeight: 100,
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    };
}

sandbox.document = {
    createElement,
    createElementNS: (ns, tag) => createElement(tag),
    createTextNode: () => ({}),
    createDocumentFragment: () => ({ appendChild: () => {} }),
    createEvent: () => ({ initEvent: () => {} }),
    getElementById: () => null,
    getElementsByTagName: (tag) => tag === 'head' ? [{ appendChild: () => {} }] : [],
    getElementsByClassName: () => [],
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    cookie: '',
    referrer: '',
    title: '',
    domain: 'www.douyin.com',
    documentElement: { style: {}, clientWidth: 1680, clientHeight: 1050, getAttribute: () => null },
    head: { appendChild: () => {} },
    body: { appendChild: () => {}, style: {}, clientWidth: 1680, clientHeight: 1050 },
    readyState: 'complete',
    hidden: false,
    visibilityState: 'visible',
    characterSet: 'UTF-8',
    hasFocus: () => true,
    compatMode: 'CSS1Compat',
};

// Events & DOM APIs
sandbox.Event = function(type) { this.type = type; };
sandbox.CustomEvent = function(type, opts) { this.type = type; this.detail = opts && opts.detail; };
sandbox.MutationObserver = function() { this.observe = () => {}; this.disconnect = () => {}; };
sandbox.ResizeObserver = function() { this.observe = () => {}; this.disconnect = () => {}; };
sandbox.IntersectionObserver = function() { this.observe = () => {}; this.disconnect = () => {}; };
sandbox.XMLHttpRequest = function() {
    this.open = () => {}; this.send = () => {}; this.setRequestHeader = () => {};
    this.addEventListener = () => {}; this.readyState = 4; this.status = 200; this.response = '';
};
sandbox.fetch = () => Promise.resolve({ json: () => Promise.resolve({}), text: () => Promise.resolve('') });
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.dispatchEvent = () => {};
sandbox.getComputedStyle = () => new Proxy({}, { get: () => '' });
sandbox.matchMedia = () => ({ matches: false, addListener: () => {}, addEventListener: () => {} });
sandbox.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
sandbox.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} };
sandbox.Image = function() { this.src = ''; this.onload = null; };
sandbox.Blob = class { constructor() {} };
sandbox.File = class { constructor() {} };
sandbox.FileReader = class { readAsDataURL() {} readAsText() {} };
sandbox.Worker = class { constructor() {} postMessage() {} terminate() {} };
sandbox.MessageChannel = class { constructor() { this.port1 = { onmessage: null }; this.port2 = { onmessage: null }; } };
sandbox.postMessage = () => {};
sandbox.history = { pushState: () => {}, replaceState: () => {}, length: 1 };
sandbox.parent = sandbox;
sandbox.top = sandbox;
sandbox.frames = sandbox;
sandbox.opener = null;
sandbox.closed = false;
sandbox.name = '';
sandbox.length = 0;
sandbox.focus = () => {};
sandbox.blur = () => {};
sandbox.close = () => {};
sandbox.alert = () => {};
sandbox.confirm = () => true;
sandbox.prompt = () => '';
sandbox.print = () => {};
sandbox.open = () => null;
sandbox.scroll = () => {};
sandbox.scrollTo = () => {};
sandbox.scrollBy = () => {};
sandbox.getSelection = () => ({ toString: () => '' });
sandbox.visualViewport = { width: 1680, height: 1050 };

// Create VM context
const context = vm.createContext(sandbox);

// Load bdms
try {
    vm.runInContext(bdmsCode, context, { filename: 'bdms.js' });
} catch (e) {
    console.error('[sign_server] load error:', e.message);
}

// Init
try {
    vm.runInContext(`
        if (window.bdms && window.bdms.init) {
            window.bdms.init({ models: [{ modelKey: 'kPUpBf' }] });
        }
    `, context);
} catch (e) {
    console.error('[sign_server] init error:', e.message);
}

// Wait then start
setTimeout(() => {
    // Check available APIs
    try {
        const keys = vm.runInContext('Object.keys(window.bdms || {})', context);
        console.error('[sign_server] bdms keys:', keys);

        // Try to find signing function
        const info = vm.runInContext(`
            let result = {};
            if (window.bdms) {
                for (let k of Object.keys(window.bdms)) {
                    result[k] = typeof window.bdms[k];
                    if (typeof window.bdms[k] === 'object' && window.bdms[k] !== null) {
                        result[k + '_keys'] = Object.keys(window.bdms[k]);
                    }
                }
            }
            if (window.byted_acrawler) result._byted = Object.keys(window.byted_acrawler);
            JSON.stringify(result);
        `, context);
        console.error('[sign_server] api info:', info);
    } catch (e) {
        console.error('[sign_server] inspect error:', e.message);
    }

    // Start reading stdin
    const rl = readline.createInterface({ input: process.stdin });
    rl.on('line', (line) => {
        try {
            const req = JSON.parse(line);
            const result = vm.runInContext(`
                (function() {
                    try {
                        if (window.bdms && window.bdms.sign) return window.bdms.sign("${req.params.replace(/"/g, '\\"')}", "${req.user_agent.replace(/"/g, '\\"')}");
                        if (window.byted_acrawler && window.byted_acrawler.sign) return JSON.stringify(window.byted_acrawler.sign({url: "${req.params.replace(/"/g, '\\"')}"}));
                        return null;
                    } catch(e) { return 'ERROR:' + e.message; }
                })()
            `, context);
            console.log(JSON.stringify({ a_bogus: result }));
        } catch (e) {
            console.log(JSON.stringify({ error: e.message }));
        }
    });

    rl.on('close', () => process.exit(0));
    console.error('[sign_server] ready');
}, 1000);
