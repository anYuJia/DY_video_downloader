/**
 * 生成x-tt-session-dtrait
 */
require('./browser_env.js');

console.log('=== 尝试生成x-tt-session-dtrait ===\n');

async function generateDtrait() {
    try {
        if (!global.DTraitSDK || !global.DTraitSDK.default) {
            throw new Error('SDK未正确加载');
        }

        console.log('调用getInstance...');
        const instance = global.DTraitSDK.default.getInstance();

        console.log('✓ 获取到实例\n');
        console.log('实例属性:', Object.keys(instance));

        // 尝试不同的方法获取dtrait
        const methods = Object.keys(instance).filter(k => typeof instance[k] === 'function');
        console.log('\n可用方法:', methods);

        // 方法1: 直接getDtrait
        if (instance.getDtrait) {
            const dtrait = instance.getDtrait();
            console.log('\n✓ 通过getDtrait()获取成功!');
            return dtrait;
        }

        // 方法2: get
        if (instance.get) {
            const dtrait = instance.get('x-tt-session-dtrait');
            if (dtrait) {
                console.log('\n✓ 通过get()获取成功!');
                return dtrait;
            }
        }

        // 方法3: 遍历所有get方法
        for (const method of methods) {
            if (method.startsWith('get') && method !== 'getInstance') {
                try {
                    const result = instance[method]();
                    if (typeof result === 'string' && result.length > 100) {
                        console.log(`\n✓ 通过${method}()获取成功!`);
                        return result;
                    }
                } catch (e) {
                    // 忽略错误
                }
            }
        }

        // 方法4: 检查实例属性
        for (const key of Object.keys(instance)) {
            const value = instance[key];
            if (typeof value === 'string' && value.length > 100) {
                console.log(`\n✓ 从属性${key}获取成功!`);
                return value;
            }
        }

        console.log('\n未找到dtrait，输出实例详情:');
        console.log(JSON.stringify(instance, null, 2).substring(0, 500));

        return null;

    } catch (e) {
        console.log('\n错误:', e.message);
        console.log('\n错误堆栈:');
        console.log(e.stack);

        // 分析错误
        if (e.message.includes('sourcePromise')) {
            console.log('\n分析: SDK可能需要异步初始化');
            console.log('尝试异步方式...');

            // 可能需要等待Promise
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 再次尝试
            try {
                const instance = global.DTraitSDK.default.getInstance();
                console.log('重试成功!');
            } catch (e2) {
                console.log('重试失败:', e2.message);
            }
        }

        return null;
    }
}

generateDtrait().then(dtrait => {
    if (dtrait) {
        console.log('\n' + '='.repeat(60));
        console.log('x-tt-session-dtrait:');
        console.log('='.repeat(60));
        console.log(dtrait);
        console.log('='.repeat(60));

        // 保存到文件
        const fs = require('fs');
        const output = {
            'x_tt_session_dtrait': dtrait,
            'generated_at': new Date().toISOString(),
        };
        fs.writeFileSync('data/generated_dtrait.json', JSON.stringify(output, null, 2));
        console.log('\n✓ 已保存到 data/generated_dtrait.json');
    } else {
        console.log('\n✗ 生成失败');
        process.exit(1);
    }
});
