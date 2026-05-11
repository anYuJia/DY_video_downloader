/**
 * 完整的浏览器环境模拟
 * 用于运行抖音SDK生成x-tt-session-dtrait
 */
const fs = require('fs');

console.log('=== 创建完整浏览器环境 ===\n');

// 配置
const CONFIG = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    platform: 'MacIntel',
    language: 'zh-CN',
    screenWidth: 1280,
    screenHeight: 800,
    colorDepth: 24,
    timezone: 'Asia/Shanghai',
    hardwareConcurrency: 8,
    deviceMemory: 8,
};

// 全局对象
global.window = global;
global.self = global;

// Navigator
global.navigator = {
    userAgent: CONFIG.userAgent,
    platform: CONFIG.platform,
    language: CONFIG.language,
    languages: ['zh-CN', 'zh', 'en'],
    cookieEnabled: true,
    onLine: true,
    hardwareConcurrency: CONFIG.hardwareConcurrency,
    deviceMemory: CONFIG.deviceMemory,
    maxTouchPoints: 0,
    appCodeName: 'Mozilla',
    appName: 'Netscape',
    appVersion: CONFIG.userAgent.substring(8),
    vendor: 'Google Inc.',
    vendorSub: '',
    productSub: '20030107',
    product: 'Gecko',
    webdriver: false,
    getBattery: async () => ({
        charging: true,
        chargingTime: 0,
        dischargingTime: Infinity,
        level: 1,
    }),
    getGamepads: () => [],
    javaEnabled: () => false,
    plugins: {
        length: 0,
        item: () => null,
        namedItem: () => null,
        refresh: () => {},
    },
    mimeTypes: {
        length: 0,
        item: () => null,
        namedItem: () => null,
    },
};

// Screen
global.screen = {
    width: CONFIG.screenWidth,
    height: CONFIG.screenHeight,
    availWidth: CONFIG.screenWidth,
    availHeight: CONFIG.screenHeight,
    colorDepth: CONFIG.colorDepth,
    pixelDepth: CONFIG.colorDepth,
    top: 0,
    left: 0,
    availTop: 0,
    availLeft: 0,
    orientation: {
        type: 'landscape-primary',
        angle: 0,
        onchange: null,
    },
};

// DevicePixelRatio
global.devicePixelRatio = 1;

// Location
global.location = {
    href: 'https://www.douyin.com/',
    origin: 'https://www.douyin.com',
    protocol: 'https:',
    host: 'www.douyin.com',
    hostname: 'www.douyin.com',
    port: '',
    pathname: '/',
    search: '',
    hash: '',
};

// History
global.history = {
    length: 1,
    state: null,
    pushState: () => {},
    replaceState: () => {},
    go: () => {},
    back: () => {},
    forward: () => {},
};

// Performance
global.performance = {
    now: () => Date.now(),
    timeOrigin: Date.now(),
    timing: {
        navigationStart: Date.now() - 1000,
        loadEventEnd: Date.now(),
    },
    navigation: {
        type: 0,
        redirectCount: 0,
    },
    memory: {
        usedJSHeapSize: 50000000,
        totalJSHeapSize: 100000000,
        jsHeapSizeLimit: 2000000000,
    },
    getEntries: () => [],
    getEntriesByType: () => [],
    getEntriesByName: () => [],
};

// Document
class MockDocument {
    constructor() {
        this.documentElement = {
            clientWidth: CONFIG.screenWidth,
            clientHeight: CONFIG.screenHeight,
            style: {},
        };
        this.head = {};
        this.body = {
            clientWidth: CONFIG.screenWidth,
            clientHeight: CONFIG.screenHeight,
        };
        this.cookie = '';
        this.readyState = 'complete';
        this.visibilityState = 'visible';
        this.hidden = false;
        this.title = '抖音';
        this.referrer = '';
        this.characterSet = 'UTF-8';
        this.contentType = 'text/html';
        this.URL = 'https://www.douyin.com/';
    }

    createElement(tag) {
        if (tag === 'canvas') {
            return this._createCanvas();
        } else if (tag === 'div' || tag === 'span') {
            return {
                style: {},
                setAttribute: () => {},
                appendChild: () => {},
            };
        }
        return {
            style: {},
            setAttribute: () => {},
        };
    }

    _createCanvas() {
        return {
            width: 300,
            height: 150,
            style: {},
            getContext: (type) => {
                if (type === '2d') {
                    return this._get2DContext();
                } else if (type === 'webgl' || type === 'experimental-webgl') {
                    return this._getWebGLContext();
                } else if (type === 'webgl2') {
                    return this._getWebGL2Context();
                }
                return null;
            },
            toDataURL: () => {
                // 返回一个固定的canvas指纹
                return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
            },
            toBlob: (callback) => {
                callback(Buffer.from('fake-png-data'));
            },
            getBoundingClientRect: () => ({
                top: 0,
                left: 0,
                width: 300,
                height: 150,
            }),
        };
    }

    _get2DContext() {
        return {
            fillStyle: '#000000',
            strokeStyle: '#000000',
            lineWidth: 1,
            font: '10px sans-serif',
            textAlign: 'start',
            textBaseline: 'alphabetic',
            globalAlpha: 1,
            globalCompositeOperation: 'source-over',

            fillRect: () => {},
            strokeRect: () => {},
            clearRect: () => {},
            fillText: () => {},
            strokeText: () => {},
            measureText: (text) => ({ width: text.length * 10 }),
            getImageData: () => ({
                data: new Uint8ClampedArray(300 * 150 * 4),
                width: 300,
                height: 150,
            }),
            putImageData: () => {},
            createImageData: (w, h) => ({
                data: new Uint8ClampedArray(w * h * 4),
                width: w,
                height: h,
            }),
            save: () => {},
            restore: () => {},
            beginPath: () => {},
            closePath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            arc: () => {},
            arcTo: () => {},
            rect: () => {},
            fill: () => {},
            stroke: () => {},
            clip: () => {},
            isPointInPath: () => false,
            scale: () => {},
            rotate: () => {},
            translate: () => {},
            transform: () => {},
            setTransform: () => {},
            createLinearGradient: () => ({
                addColorStop: () => {},
            }),
            createRadialGradient: () => ({
                addColorStop: () => {},
            }),
            createPattern: () => null,
            drawImage: () => {},
        };
    }

    _getWebGLContext() {
        return {
            getParameter: (param) => {
                const params = {
                    37445: 'Intel Inc.',  // UNMASKED_VENDOR_WEBGL
                    37446: 'Intel Iris OpenGL Engine',  // UNMASKED_RENDERER_WEBGL
                    7936: 'WebKit',  // VENDOR
                    7937: 'WebKit WebGL',  // RENDERER
                    7938: 'WebGL 1.0',  // VERSION
                    35724: 'WebGL GLSL ES 1.0',  // SHADING_LANGUAGE_VERSION
                };
                return params[param] || null;
            },
            getExtension: (name) => {
                if (name === 'WEBGL_debug_renderer_info') {
                    return {
                        UNMASKED_VENDOR_WEBGL: 37445,
                        UNMASKED_RENDERER_WEBGL: 37446,
                    };
                }
                return null;
            },
            getSupportedExtensions: () => [
                'OES_texture_float',
                'OES_texture_float_linear',
                'OES_standard_derivatives',
            ],
            createShader: () => ({}),
            shaderSource: () => {},
            compileShader: () => {},
            getShaderParameter: () => true,
            createProgram: () => ({}),
            attachShader: () => {},
            linkProgram: () => {},
            getProgramParameter: () => true,
            useProgram: () => {},
            getAttribLocation: () => 0,
            getUniformLocation: () => ({}),
            enableVertexAttribArray: () => {},
            vertexAttribPointer: () => {},
            bindBuffer: () => {},
            bufferData: () => {},
            drawArrays: () => {},
        };
    }

    _getWebGL2Context() {
        return this._getWebGLContext();
    }

    getElementById() { return null; }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    getElementsByTagName() { return []; }
    getElementsByClassName() { return []; }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
    hasFocus() { return true; }
    createEvent() {
        return {
            initEvent: () => {},
        };
    }
}

global.document = new MockDocument();

// LocalStorage & SessionStorage
class MockStorage {
    constructor() {
        this.data = {};
    }
    getItem(key) {
        return this.data[key] || null;
    }
    setItem(key, value) {
        this.data[key] = String(value);
    }
    removeItem(key) {
        delete this.data[key];
    }
    clear() {
        this.data = {};
    }
    get length() {
        return Object.keys(this.data).length;
    }
    key(index) {
        return Object.keys(this.data)[index] || null;
    }
}

global.localStorage = new MockStorage();
global.sessionStorage = new MockStorage();

// Crypto
global.crypto = {
    getRandomValues: (arr) => {
        for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
    },
    subtle: {
        digest: async (algorithm, data) => {
            const crypto = require('crypto');
            const hash = crypto.createHash('sha-256');
            hash.update(Buffer.from(data));
            return hash.digest();
        },
    },
};

// Intl
global.Intl = {
    DateTimeFormat: function(locales, options) {
        return {
            resolvedOptions: () => ({
                timeZone: CONFIG.timezone,
                locale: locales || 'zh-CN',
            }),
            format: (date) => String(date),
        };
    },
    NumberFormat: function() {
        return {
            format: (num) => String(num),
        };
    },
    Collator: function() {
        return {
            compare: (a, b) => a.localeCompare(b),
        };
    },
};

// AudioContext
global.AudioContext = function() {
    return {
        createOscillator: () => ({
            type: 'sine',
            frequency: { value: 440 },
            connect: () => {},
            start: () => {},
            stop: () => {},
        }),
        createDynamicsCompressor: () => ({
            threshold: { value: -24 },
            knee: { value: 30 },
            ratio: { value: 12 },
            attack: { value: 0.003 },
            release: { value: 0.25 },
            connect: () => {},
        }),
        createAnalyser: () => ({
            fftSize: 2048,
            frequencyBinCount: 1024,
            getFloatFrequencyData: (arr) => {
                for (let i = 0; i < arr.length; i++) {
                    arr[i] = -100 + Math.random() * 50;
                }
            },
        }),
        destination: {},
        close: async () => {},
        sampleRate: 48000,
    };
};

global.webkitAudioContext = global.AudioContext;
global.OfflineAudioContext = function(channels, length, sampleRate) {
    return {
        startRendering: async () => ({
            getChannelData: () => new Float32Array(length),
        }),
    };
};

// 其他Web API
global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');

global.Blob = function(parts, options) {
    this.parts = parts;
    this.type = options?.type || '';
    this.size = parts.reduce((sum, p) => sum + (p.length || 0), 0);
};

global.File = function(parts, name, options) {
    Blob.call(this, parts, options);
    this.name = name;
    this.lastModified = Date.now();
};

global.URL = {
    createObjectURL: () => 'blob:fake-url',
    revokeObjectURL: () => {},
};

global.FileReader = function() {
    this.readAsArrayBuffer = () => {};
    this.readAsDataURL = () => {};
    this.readAsText = () => {};
};

global.XMLHttpRequest = function() {
    this.open = () => {};
    this.send = () => {};
    this.setRequestHeader = () => {};
    this.getResponseHeader = () => null;
    this.getAllResponseHeaders = () => '';
    this.abort = () => {};
    this.readyState = 0;
    this.status = 0;
    this.statusText = '';
    this.responseText = '';
    this.response = null;
};

global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => '',
    arrayBuffer: async () => new ArrayBuffer(0),
});

global.Request = function(url, options) {
    this.url = url;
    this.method = options?.method || 'GET';
    this.headers = options?.headers || {};
};

global.Response = function(body, options) {
    this.body = body;
    this.status = options?.status || 200;
    this.ok = this.status >= 200 && this.status < 300;
};

global.Headers = function(init) {
    this.headers = init || {};
    this.get = (key) => this.headers[key];
    this.set = (key, value) => { this.headers[key] = value; };
};

global.RTCPeerConnection = function() {};
global.webkitRTCPeerConnection = global.RTCPeerConnection;

console.log('✓ 浏览器环境已创建\n');

// 加载SDK
console.log('加载DTraitSDK...\n');
const sdkCode = fs.readFileSync('data/passport_sdk/uc-secure-dtrait-core.js', 'utf-8');

try {
    eval(sdkCode);
    console.log('✓ SDK已加载\n');
} catch (e) {
    console.log('⚠ SDK加载警告:', e.message);
}

// 测试SDK
if (typeof DTraitSDK !== 'undefined') {
    console.log('✓ DTraitSDK可用\n');
    console.log('导出的对象:', Object.keys(DTraitSDK));

    if (DTraitSDK.default) {
        console.log('\ndefault对象:', Object.keys(DTraitSDK.default));
    }

    // 保存到全局供后续使用
    global.DTraitSDK = DTraitSDK;
} else {
    console.log('✗ DTraitSDK未定义');
}

module.exports = {
    DTraitSDK: global.DTraitSDK,
    CONFIG,
};
