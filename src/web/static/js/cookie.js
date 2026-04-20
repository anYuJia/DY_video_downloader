// ═══════════════════════════════════════════════
// DY Downloader — Cookie Validation & Setup
// ═══════════════════════════════════════════════

let _cookieSetupModal = null;
let _browserLoginActive = false;
let _browserLoginTimer = null;

// 检查Cookie状态（启动时调用）
function checkCookieStatusOnStartup() {
    const cookieValue = localStorage.getItem('cookie') || '';
    const validation = validateCookie(cookieValue);

    const banner = document.getElementById('cookieStatusBanner');

    if (!validation.isValid) {
        // Cookie无效，显示横幅
        if (banner) {
            banner.style.display = 'flex';
        }
        console.log('[cookie] Cookie无效或未设置，显示提示横幅');
    } else {
        // Cookie有效，隐藏横幅
        if (banner) {
            banner.style.display = 'none';
        }
        console.log('[cookie] Cookie有效');
    }
}

// 关闭Cookie提示横幅
function closeCookieBanner() {
    const banner = document.getElementById('cookieStatusBanner');
    if (banner) {
        banner.style.display = 'none';
    }
}

function validateCookie(cookieString) {
    if (!cookieString || cookieString.trim() === '') {
        return { isValid: false, status: 'empty', message: '请输入Cookie', missingParams: [], loginType: 'none' };
    }

    const requiredParams = ['sessionid'];
    const recommendedParams = ['ttwid', 's_v_web_id'];

    const cookiePairs = cookieString.split(';').reduce((acc, pair) => {
        const [key, ...valueParts] = pair.trim().split('=');
        if (key) acc[key.trim()] = valueParts.join('=');
        return acc;
    }, {});

    // 检查是否已登录（有 sessionid）
    const hasLoginCookie = requiredParams.some(param => cookiePairs[param]);

    if (hasLoginCookie) {
        // 已登录状态
        return {
            isValid: true,
            status: 'logged_in',
            message: '已登录，可使用所有功能',
            missingParams: [],
            loginType: 'full'
        };
    } else {
        // 无效 cookie
        return {
            isValid: false,
            status: 'invalid',
            message: '请登录抖音账号',
            missingParams: requiredParams,
            loginType: 'none'
        };
    }
}

function setupCookieValidation() {
    const cookieInput = document.getElementById('cookie-input');
    if (!cookieInput) return;

    cookieInput.addEventListener('input', function () {
        const validation = validateCookie(this.value);
        updateCookieValidationUI(validation);
    });
}

function updateCookieValidationUI(validation) {
    const statusContainer = document.getElementById('cookie-validation-status');
    const statusIcon = document.getElementById('cookie-status-icon');
    const statusText = document.getElementById('cookie-status-text');
    const missingContainer = document.getElementById('cookie-missing-params');
    const missingList = document.getElementById('missing-params-list');

    if (!statusContainer) return;

    if (validation.status === 'empty') {
        statusContainer.style.display = 'none';
        return;
    }

    statusContainer.style.display = 'block';

    switch (validation.status) {
        case 'logged_in':
            statusIcon.className = 'bi bi-check-circle-fill text-success me-1';
            statusText.className = 'text-success';
            statusText.textContent = validation.message;
            missingContainer.style.display = 'none';
            // 启用所有功能
            updateFeatureAvailability(true);
            break;
        case 'invalid':
            statusIcon.className = 'bi bi-x-circle-fill text-danger me-1';
            statusText.className = 'text-danger';
            statusText.textContent = validation.message;
            missingContainer.style.display = 'block';
            missingList.textContent = '请登录抖音账号';
            // 禁用所有功能
            updateFeatureAvailability(false);
            break;
    }
}

function updateFeatureAvailability(isLoggedIn) {
    // 获取需要登录的功能按钮
    const likedBtn = document.getElementById('download-liked-btn');
    const authorsBtn = document.getElementById('download-liked-authors-btn');

    if (likedBtn) {
        likedBtn.disabled = !isLoggedIn;
        if (!isLoggedIn) {
            likedBtn.title = '需要登录后才能使用此功能';
            likedBtn.setAttribute('data-requires-login', 'true');
        } else {
            likedBtn.title = '';
            likedBtn.removeAttribute('data-requires-login');
        }
    }

    if (authorsBtn) {
        authorsBtn.disabled = !isLoggedIn;
        if (!isLoggedIn) {
            authorsBtn.title = '需要登录后才能使用此功能';
            authorsBtn.setAttribute('data-requires-login', 'true');
        } else {
            authorsBtn.title = '';
            authorsBtn.removeAttribute('data-requires-login');
        }
    }

    // 更新快捷卡片
    const shortcutCards = document.querySelectorAll('.shortcut-card');
    shortcutCards.forEach(card => {
        const onclickAttr = card.getAttribute('onclick');
        if (onclickAttr && (onclickAttr.includes('download-liked-btn') || onclickAttr.includes('download-liked-authors-btn'))) {
            if (!isLoggedIn) {
                card.style.opacity = '0.5';
                card.style.cursor = 'not-allowed';
                card.setAttribute('data-requires-login', 'true');
            } else {
                card.style.opacity = '1';
                card.style.cursor = 'pointer';
                card.removeAttribute('data-requires-login');
            }
        }
    });
}

// 直接在设置面板中启动浏览器登录
function startBrowserLoginDirect() {
    if (_browserLoginActive) return;
    _browserLoginActive = true;

    const statusContainer = document.getElementById('cookie-validation-status');
    const statusIcon = document.getElementById('cookie-status-icon');
    const statusText = document.getElementById('cookie-status-text');

    statusContainer.style.display = 'block';
    statusIcon.className = 'bi bi-hourglass-split text-primary me-1';
    statusText.className = 'text-primary';
    statusText.textContent = '正在启动浏览器...';

    fetch('/api/cookie/browser_login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            timeout: 300,
            browser: 'chrome'
        })
    }).then(function(response) { return response.json(); }).then(function(data) {
        if (!data.success) {
            statusIcon.className = 'bi bi-x-circle-fill text-danger me-1';
            statusText.className = 'text-danger';
            statusText.textContent = data.message || '启动失败';
            _browserLoginActive = false;
        }
    }).catch(function(error) {
        statusIcon.className = 'bi bi-x-circle-fill text-danger me-1';
        statusText.className = 'text-danger';
        statusText.textContent = '启动失败: ' + error.message;
        _browserLoginActive = false;
    });
}

function showCookieSetupModal() {
    const modalEl = document.getElementById('cookieSetupModal');
    if (!modalEl) return;
    if (!_cookieSetupModal) {
        _cookieSetupModal = new bootstrap.Modal(modalEl);
    }
    const mainCookie = document.getElementById('cookie-input');
    const modalCookie = document.getElementById('cookie-modal-input');
    if (mainCookie && modalCookie) {
        modalCookie.value = mainCookie.value;
    }
    _cookieSetupModal.show();
}

function switchCookieTab(tab) {
    document.querySelectorAll('.cookie-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.cookie-tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    const targetPanel = document.getElementById('cookie-tab-' + tab);
    if (targetPanel) targetPanel.classList.add('active');
}

function saveCookieFromModal() {
    const cookieValue = document.getElementById('cookie-modal-input').value.trim();
    const validation = validateCookie(cookieValue);

    const statusContainer = document.getElementById('cookie-modal-validation');
    const statusIcon = document.getElementById('cookie-modal-status-icon');
    const statusText = document.getElementById('cookie-modal-status-text');

    if (!validation.isValid && validation.status !== 'empty') {
        statusContainer.style.display = 'block';
        statusIcon.className = 'bi bi-exclamation-triangle-fill text-danger me-1';
        statusText.className = 'text-danger';
        statusText.textContent = validation.message;
        return;
    }

    if (validation.status === 'empty') {
        statusContainer.style.display = 'block';
        statusIcon.className = 'bi bi-exclamation-triangle-fill text-warning me-1';
        statusText.className = 'text-warning';
        statusText.textContent = '请输入 Cookie';
        return;
    }

    fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            cookie: cookieValue,
            download_dir: document.getElementById('download-dir-input').value
        })
    }).then(function(response) { return response.json(); }).then(function(data) {
        if (data.success) {
            showToast('Cookie 保存成功！', 'success');
            updateStatus('ready', '已配置');
            document.getElementById('cookie-input').value = cookieValue;

            // 同步到localStorage，供启动检查使用
            localStorage.setItem('cookie', cookieValue);

            // 隐藏Cookie提示横幅
            const banner = document.getElementById('cookieStatusBanner');
            if (banner) banner.style.display = 'none';

            if (_cookieSetupModal) _cookieSetupModal.hide();
        } else {
            showToast('保存失败: ' + (data.message || ''), 'error');
        }
    }).catch(function(error) {
        showToast('保存失败: ' + error.message, 'error');
    });
}

function testCookieValidity() {
    const cookieValue = document.getElementById('cookie-modal-input').value.trim() ||
                        document.getElementById('cookie-input').value.trim();

    if (!cookieValue) {
        showToast('请先输入 Cookie', 'warning');
        return;
    }

    const testBtn = document.getElementById('cookie-test-btn');
    if (testBtn) {
        testBtn.disabled = true;
        testBtn.textContent = '测试中...';
    }

    fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookie: cookieValue, download_dir: document.getElementById('download-dir-input').value })
    })
    .then(function() {
        return fetch('/api/search_user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword: '抖音' })
        });
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success) {
            showToast('Cookie 验证通过，可正常使用！', 'success');
        } else if (data.need_verify) {
            showToast('Cookie 可能已过期，需要验证', 'warning');
        } else {
            showToast('Cookie 验证失败: ' + (data.message || ''), 'error');
        }
    })
    .catch(function(error) {
        showToast('测试失败: ' + error.message, 'error');
    })
    .finally(function() {
        if (testBtn) {
            testBtn.disabled = false;
            testBtn.textContent = '测试有效性';
        }
    });
}

function startBrowserLogin() {
    if (_browserLoginActive) return;
    _browserLoginActive = true;

    const startBtn = document.getElementById('cookie-browser-start-btn');
    const cancelBtn = document.getElementById('cookie-browser-cancel-btn');
    const statusEl = document.getElementById('cookie-browser-status');
    const statusText = document.getElementById('cookie-browser-status-text');
    const spinner = document.getElementById('cookie-browser-spinner');
    const resultIcon = document.getElementById('cookie-browser-result-icon');

    startBtn.disabled = true;
    // Build loading button with DOM methods
    startBtn.textContent = '';
    var spinnerEl = document.createElement('div');
    spinnerEl.className = 'spinner-border spinner-border-sm me-2';
    spinnerEl.setAttribute('role', 'status');
    startBtn.appendChild(spinnerEl);
    startBtn.appendChild(document.createTextNode(' 正在启动浏览器...'));

    cancelBtn.style.display = 'block';
    statusEl.style.display = 'flex';
    statusEl.className = 'cookie-browser-status';
    spinner.style.display = 'block';
    resultIcon.style.display = 'none';
    statusText.textContent = '正在启动浏览器...';

    // Start countdown timer (5 minutes)
    var remaining = 300;
    _browserLoginTimer = setInterval(function() {
        remaining--;
        if (remaining <= 0) {
            clearInterval(_browserLoginTimer);
            _browserLoginTimer = null;
            statusText.textContent = '登录超时，请重试';
            resetBrowserLoginUI();
            return;
        }
        var min = Math.floor(remaining / 60);
        var sec = remaining % 60;
        if (_browserLoginActive) {
            var currentText = statusText.textContent.replace(/\s*\(\d+:\d+\)$/, '');
            statusText.textContent = currentText + ' (' + min + ':' + sec.toString().padStart(2, '0') + ')';
        }
    }, 1000);

    fetch('/api/cookie/browser_login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            timeout: 300,
            browser: document.getElementById('cookie-browser-type').value || 'chrome'
        })
    }).then(function(response) { return response.json(); }).then(function(data) {
        if (!data.success) {
            resetBrowserLoginUI();
            showToast(data.message || '启动失败', 'error');
        }
    }).catch(function(error) {
        resetBrowserLoginUI();
        showToast('启动失败: ' + error.message, 'error');
    });
}

function cancelBrowserLogin() {
    fetch('/api/cookie/browser_login/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }).then(function(response) { return response.json(); }).then(function(data) {
        resetBrowserLoginUI();
        showToast(data.message || '已取消', 'info');
    }).catch(function() {
        resetBrowserLoginUI();
    });
}

function resetBrowserLoginUI() {
    _browserLoginActive = false;
    if (_browserLoginTimer) {
        clearInterval(_browserLoginTimer);
        _browserLoginTimer = null;
    }
    var startBtn = document.getElementById('cookie-browser-start-btn');
    var cancelBtn = document.getElementById('cookie-browser-cancel-btn');

    if (startBtn) {
        startBtn.disabled = false;
        startBtn.textContent = '';
        var icon = document.createElement('i');
        icon.className = 'bi bi-box-arrow-up-right';
        startBtn.appendChild(icon);
        startBtn.appendChild(document.createTextNode(' 打开浏览器登录'));
    }
    if (cancelBtn) cancelBtn.style.display = 'none';
}

function handleCookieLoginStatus(data) {
    var statusEl = document.getElementById('cookie-browser-status');
    var statusText = document.getElementById('cookie-browser-status-text');
    var spinner = document.getElementById('cookie-browser-spinner');
    var resultIcon = document.getElementById('cookie-browser-result-icon');

    // 同时更新设置面板的状态
    var settingsStatusContainer = document.getElementById('cookie-validation-status');
    var settingsStatusIcon = document.getElementById('cookie-status-icon');
    var settingsStatusText = document.getElementById('cookie-status-text');

    if (statusEl) {
        statusEl.style.display = 'flex';
        statusText.textContent = data.message || '';
    }

    switch (data.event) {
        case 'success':
            if (statusEl) {
                statusEl.className = 'cookie-browser-status status-success';
                spinner.style.display = 'none';
                resultIcon.style.display = 'block';
                resultIcon.className = 'bi bi-check-circle-fill text-success';
            }
            resetBrowserLoginUI();
            if (data.cookie) {
                document.getElementById('cookie-input').value = data.cookie;

                // 同步到localStorage，供启动检查使用
                localStorage.setItem('cookie', data.cookie);

                // 更新设置面板状态
                if (settingsStatusContainer) {
                    settingsStatusContainer.style.display = 'block';
                    settingsStatusIcon.className = 'bi bi-check-circle-fill text-success me-1';
                    settingsStatusText.className = 'text-success';
                    settingsStatusText.textContent = '登录成功，Cookie 已保存！';
                }

                // 隐藏Cookie提示横幅
                const banner = document.getElementById('cookieStatusBanner');
                if (banner) banner.style.display = 'none';
            }
            updateStatus('ready', '已配置');
            showToast('Cookie 获取成功！', 'success');
            setTimeout(function() {
                if (_cookieSetupModal) _cookieSetupModal.hide();
            }, 1500);
            break;

        case 'failed':
        case 'error':
            if (statusEl) {
                statusEl.className = 'cookie-browser-status status-error';
                spinner.style.display = 'none';
                resultIcon.style.display = 'block';
                resultIcon.className = 'bi bi-x-circle-fill text-danger';
            }
            if (settingsStatusContainer) {
                settingsStatusContainer.style.display = 'block';
                settingsStatusIcon.className = 'bi bi-x-circle-fill text-danger me-1';
                settingsStatusText.className = 'text-danger';
                settingsStatusText.textContent = data.message || '登录失败';
            }
            resetBrowserLoginUI();
            break;

        case 'cancelled':
            if (statusEl) {
                statusEl.className = 'cookie-browser-status status-error';
                spinner.style.display = 'none';
                resultIcon.style.display = 'block';
                resultIcon.className = 'bi bi-dash-circle-fill text-warning';
            }
            if (settingsStatusContainer) {
                settingsStatusContainer.style.display = 'block';
                settingsStatusIcon.className = 'bi bi-dash-circle-fill text-warning me-1';
                settingsStatusText.className = 'text-warning';
                settingsStatusText.textContent = '已取消';
            }
            resetBrowserLoginUI();
            break;

        case 'timeout':
            if (statusEl) {
                statusEl.className = 'cookie-browser-status status-error';
                spinner.style.display = 'none';
                resultIcon.style.display = 'block';
                resultIcon.className = 'bi bi-clock-fill text-warning';
            }
            if (settingsStatusContainer) {
                settingsStatusContainer.style.display = 'block';
                settingsStatusIcon.className = 'bi bi-clock-fill text-warning me-1';
                settingsStatusText.className = 'text-warning';
                settingsStatusText.textContent = '登录超时';
            }
            resetBrowserLoginUI();
            break;

        default:
            if (statusEl) {
                statusEl.className = 'cookie-browser-status';
                spinner.style.display = 'block';
                resultIcon.style.display = 'none';
            }
            if (settingsStatusContainer && settingsStatusText) {
                settingsStatusText.textContent = data.message || '等待中...';
            }
            break;
    }
}

// 检查功能是否需要登录
function checkLoginRequired(element) {
    if (element.hasAttribute('data-requires-login')) {
        const isLoggedIn = !element.disabled;
        if (!isLoggedIn) {
            showToast('此功能需要登录后才能使用，请在 Cookie 设置中登录账号', 'warning');
            // 打开 cookie 设置 modal
            showCookieSetupModal();
            return false;
        }
    }
    return true;
}

// 从浏览器读取 Cookie
function loadCookieFromBrowser() {
    const statusContainer = document.getElementById('cookie-modal-validation');
    const statusIcon = document.getElementById('cookie-modal-status-icon');
    const statusText = document.getElementById('cookie-modal-status-text');

    if (statusContainer) {
        statusContainer.style.display = 'block';
        statusIcon.className = 'bi bi-hourglass-split text-primary me-1';
        statusText.className = 'text-primary';
        statusText.textContent = '正在从浏览器读取 Cookie...';
    }

    fetch('/api/cookie/from_browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const cookieInput = document.getElementById('cookie-modal-input');
            if (cookieInput) {
                cookieInput.value = data.cookie;
            }

            if (statusContainer) {
                statusIcon.className = 'bi bi-check-circle-fill text-success me-1';
                statusText.className = 'text-success';
                statusText.textContent = `成功从 ${data.browser} 读取 ${data.count} 个 Cookie`;
            }

            showToast(`已从 ${data.browser} 浏览器读取 Cookie`, 'success');
        } else {
            if (statusContainer) {
                statusIcon.className = 'bi bi-x-circle-fill text-danger me-1';
                statusText.className = 'text-danger';
                statusText.textContent = data.message || '读取失败';
            }
            showToast(data.message || '读取失败', 'error');
        }
    })
    .catch(error => {
        if (statusContainer) {
            statusIcon.className = 'bi bi-x-circle-fill text-danger me-1';
            statusText.className = 'text-danger';
            statusText.textContent = '读取失败: ' + error.message;
        }
        showToast('读取失败: ' + error.message, 'error');
    });
}

// 生成临时 Cookie
function generateTempCookie() {
    const statusContainer = document.getElementById('cookie-modal-validation');
    const statusIcon = document.getElementById('cookie-modal-status-icon');
    const statusText = document.getElementById('cookie-modal-status-text');

    if (statusContainer) {
        statusContainer.style.display = 'block';
        statusIcon.className = 'bi bi-hourglass-split text-primary me-1';
        statusText.className = 'text-primary';
        statusText.textContent = '正在生成临时 Cookie...';
    }

    fetch('/api/cookie/generate_temp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const cookieInput = document.getElementById('cookie-modal-input');
            if (cookieInput) {
                cookieInput.value = data.cookie;
            }

            if (statusContainer) {
                statusIcon.className = 'bi bi-check-circle-fill text-success me-1';
                statusText.className = 'text-success';
                statusText.textContent = data.message || '临时 Cookie 生成成功';
            }

            showToast(data.message || '临时 Cookie 生成成功', 'success');
        } else {
            if (statusContainer) {
                statusIcon.className = 'bi bi-x-circle-fill text-danger me-1';
                statusText.className = 'text-danger';
                statusText.textContent = data.message || '生成失败';
            }
            showToast(data.message || '生成失败', 'error');
        }
    })
    .catch(error => {
        if (statusContainer) {
            statusIcon.className = 'bi bi-x-circle-fill text-danger me-1';
            statusText.className = 'text-danger';
            statusText.textContent = '生成失败: ' + error.message;
        }
        showToast('生成失败: ' + error.message, 'error');
    });
}
