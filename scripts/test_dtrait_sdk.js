const fs = require('fs');

console.log('=== 测试DTraitSDK ===\n');

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
    createElement: () => ({
        getContext: () => null,
        toDataURL: () => '',
    }),
    querySelector: () => null,
    addEventListener: () => {},
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
    // 忽略某些错误
    console.log('SDK执行警告:', e.message);
}

// 检查是否加载成功
if (typeof DTraitSDK !== 'undefined') {
    console.log('✓ DTraitSDK 已加载\n');

    console.log('DTraitSDK对象:', Object.keys(DTraitSDK));

    if (DTraitSDK.default) {
        console.log('\ndefault对象:', Object.keys(DTraitSDK.default));

        // 尝试获取实例
        if (DTraitSDK.default.getInstance) {
            console.log('\n✓ getInstance 方法存在');
            console.log('可以尝试调用 DTraitSDK.default.getInstance() 获取实例');
        }
    }
} else {
    console.log('✗ DTraitSDK 未定义');
    console.log('\n尝试查找其他导出...');

    // 列出所有全局变量
    const globals = Object.keys(global).filter(k => !k.startsWith('_') && k.length < 50);
    console.log('\n可用的全局变量:', globals.filter(g =>
        g.toLowerCase().includes('dtrait') ||
        g.toLowerCase().includes('sdk') ||
        g.toLowerCase().includes('passport')
    ));
}
