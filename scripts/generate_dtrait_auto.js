/**
 * 全自动生成 x-tt-session-dtrait
 *
 * 特点：
 * - 完全自动，无需手动操作
 * - Puppeteer会自动下载Chromium
 * - 生成后保存到配置文件
 * - 可直接用于纯Python登录
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

console.log('=== 自动生成 x-tt-session-dtrait ===\n');
console.log('说明:');
console.log('- 首次运行会自动下载Chromium（约300MB）');
console.log('- 之后运行秒级完成');
console.log('- 无需任何手动操作\n');

async function generateDtrait() {
    let browser = null;
    let dtrait = null;

    try {
        console.log('启动浏览器...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
            ],
        });

        const page = await browser.newPage();

        // 设置User-Agent
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36');

        console.log('访问抖音...');
        await page.goto('https://www.douyin.com/', {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        console.log('等待SDK初始化...');
        await page.waitForTimeout(2000);

        console.log('提取dtrait...');

        // 方法1: 从请求头拦截
        await page.setRequestInterception(true);

        const dtraitPromise = new Promise((resolve) => {
            page.on('request', (request) => {
                const headers = request.headers();
                if (headers['x-tt-session-dtrait']) {
                    resolve(headers['x-tt-session-dtrait']);
                }
                request.continue();
            });

            // 超时处理
            setTimeout(() => resolve(null), 10000);
        });

        // 触发一些请求
        await page.evaluate(() => {
            // 触发API调用
            fetch('/passport/web/account/info/').catch(() => {});
        });

        dtrait = await dtraitPromise;

        // 方法2: 从performance API
        if (!dtrait) {
            console.log('方法1未找到，尝试方法2...');
            const client = await page.target().createCDPSession();
            await client.send('Network.enable');

            const requests = [];
            client.on('Network.requestWillBeSent', (params) => {
                requests.push(params);
            });

            // 刷新页面
            await page.reload({ waitUntil: 'networkidle0' });

            // 从请求中查找
            for (const req of requests) {
                if (req.request.headers['x-tt-session-dtrait']) {
                    dtrait = req.request.headers['x-tt-session-dtrait'];
                    break;
                }
            }
        }

        // 方法3: 从页面脚本中提取
        if (!dtrait) {
            console.log('方法2未找到，尝试方法3...');
            dtrait = await page.evaluate(() => {
                // 从全局变量查找
                if (window.__DTraitSDK__) {
                    try {
                        return window.__DTraitSDK__;
                    } catch (e) {}
                }

                // 从localStorage查找
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    const value = localStorage.getItem(key);
                    if (value && value.startsWith('d0_') && value.length > 100) {
                        return value;
                    }
                }

                return null;
            });
        }

        // 方法4: 触发登录页面
        if (!dtrait) {
            console.log('尝试访问登录页面...');
            await page.goto('https://www.douyin.com/', { waitUntil: 'networkidle0' });
            await page.waitForTimeout(3000);

            // 等待SDK完全加载
            dtrait = await page.evaluate(() => {
                return new Promise((resolve) => {
                    let attempts = 0;
                    const check = () => {
                        attempts++;

                        // 检查所有可能的来源
                        const sources = [
                            window.__dtrait__,
                            window.localStorage.getItem('dtrait'),
                            window.sessionStorage.getItem('dtrait'),
                        ];

                        for (const src of sources) {
                            if (src && src.startsWith('d0_')) {
                                resolve(src);
                                return;
                            }
                        }

                        if (attempts < 10) {
                            setTimeout(check, 500);
                        } else {
                            resolve(null);
                        }
                    };

                    check();
                });
            });
        }

        await browser.close();

        if (dtrait) {
            console.log('\n✓ 成功获取 dtrait!');
            console.log(`  长度: ${dtrait.length}`);
            console.log(`  预览: ${dtrait.substring(0, 50)}...`);

            // 保存到配置文件
            const configPath = path.join(__dirname, '..', 'data', 'sign_config.json');
            let config = {};

            if (fs.existsSync(configPath)) {
                const content = fs.readFileSync(configPath, 'utf-8');
                try {
                    config = JSON.parse(content);
                } catch (e) {}
            }

            config.x_tt_session_dtrait = dtrait;
            config.dtrait_generated_at = new Date().toISOString();

            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

            console.log(`\n✓ 已保存到: ${configPath}`);

            // 同时提取其他必要的headers
            console.log('\n建议同时提取以下参数:');
            console.log('  - account_sdk_source_info');
            console.log('  - x-tt-passport-csrf-token');
            console.log('\n运行以下命令获取完整配置:');
            console.log('  python3 scripts/extract_headers.py --url "从浏览器复制的URL" --save');

            return dtrait;
        } else {
            console.log('\n✗ 未找到 dtrait');
            console.log('\n可能的原因:');
            console.log('  1. SDK未完全加载');
            console.log('  2. 需要更多等待时间');
            console.log('  3. 页面结构已变化');

            console.log('\n建议: 使用半自动方式');
            console.log('  1. 打开浏览器访问 https://www.douyin.com');
            console.log('  2. F12 -> Network -> 找到任意请求');
            console.log('  3. 复制请求的curl命令');
            console.log('  4. python3 scripts/extract_headers.py --curl "..." --save');

            process.exit(1);
        }

    } catch (error) {
        console.error('\n错误:', error.message);

        if (error.message.includes('Could not find browser')) {
            console.log('\nPuppeteer正在下载Chromium，请稍后重试...');
        }

        if (browser) {
            await browser.close();
        }

        process.exit(1);
    }
}

// 运行
generateDtrait().then(() => {
    console.log('\n完成！');
    process.exit(0);
}).catch((error) => {
    console.error('失败:', error);
    process.exit(1);
});
