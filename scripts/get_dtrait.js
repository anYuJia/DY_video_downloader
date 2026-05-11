const fs = require('fs');

console.log('=== 获取x-tt-session-dtrait ===\n');

// 读取SDK代码
const sdkCode = fs.readFileSync('data/passport_sdk/uc-secure-dtrait-core.js', 'utf-8');

// 创建虚拟浏览器环境
global.window = global;
global.navigator = {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    platform: 'MacIntel',
    language: 'zh-CN',
    languages: ['zh-CN', 'zh'],
    cookieEnabled: true,
    onLine: true,
    hardwareConcurrency: 8,
    deviceMemory: 8,
    maxTouchPoints: 0,
};

global.screen = {
    width: 1280,
    height: 800,
    availWidth: 1280,
    availHeight: 800,
    colorDepth: 24,
    pixelDepth: 24,
};

global.document = {
    createElement: (tag) => {
        if (tag === 'canvas') {
            return {
                width: 300,
                height: 150,
                getContext: (type) => {
                    if (type === '2d') {
                        return {
                            fillStyle: '',
                            fillRect: () => {},
                            getImageData: () => ({ data: new Uint8Array(180000) }),
                            measureText: () => ({ width: 10 }),
                            fillText: () => {},
                        };
                    }
                    return null;
                },
                toDataURL: () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            };
        }
        return {};
    },
    querySelector: () => null,
    addEventListener: () => {},
    documentElement: {
        clientWidth: 1280,
        clientHeight: 800,
    },
};

global.localStorage = {
    getItem: () => null,
    setItem: () => {},
};

global.crypto = {
    getRandomValues: (arr) => {
        for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
    },
};

global.Intl = {
    DateTimeFormat: function() {
        return {
            resolvedOptions: () => ({ timeZone: 'Asia/Shanghai' })
        };
    }
};

// 执行SDK
try {
    eval(sdkCode);
} catch (e) {
    // 忽略
}

// 获取实例
if (typeof DTraitSDK !== 'undefined' && DTraitSDK.default) {
    try {
        const instance = DTraitSDK.default.getInstance();

        if (instance) {
            console.log('✓ 获取到实例\n');
            console.log('实例方法:', Object.keys(instance).filter(k => typeof instance[k] === 'function'));

            // 尝试获取dtrait
            if (instance.getDtrait) {
                const dtrait = instance.getDtrait();
                console.log('\n✓ x-tt-session-dtrait:');
                console.log(dtrait);
            } else if (instance.get) {
                const dtrait = instance.get('x-tt-session-dtrait');
                console.log('\n✓ x-tt-session-dtrait:');
                console.log(dtrait);
            } else {
                console.log('\n可用方法:', Object.keys(instance));

                // 尝试调用所有可能的方法
                for (const key of Object.keys(instance)) {
                    if (typeof instance[key] === 'function' && key.toLowerCase().includes('get')) {
                        try {
                            const result = instance[key]();
                            if (typeof result === 'string' && result.length > 100) {
                                console.log(`\n${key}() 返回长字符串:`);
                                console.log(result.substring(0, 100) + '...');
                            }
                        } catch (e) {
                            // 忽略
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.log('获取实例失败:', e.message);
        console.log('\n错误堆栈:', e.stack);
    }
} else {
    console.log('SDK未正确加载');
}
