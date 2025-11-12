let accounts = [];
let parsedPosts = [];
let currentAccountId = null;

// Error handling utilities
const ErrorTypes = {
    NETWORK: 'network',
    API: 'api',
    VALIDATION: 'validation',
    UNKNOWN: 'unknown'
};

function categorizeError(error) {
    if (!error) return ErrorTypes.UNKNOWN;
    
    // Network errors
    if (error.message?.includes('fetch') || 
        error.message?.includes('network') || 
        error.message?.includes('Failed to fetch') ||
        error.code === 'NETWORK_ERROR') {
        return ErrorTypes.NETWORK;
    }
    
    // API errors (from server)
    if (error.response || error.status || error.error) {
        return ErrorTypes.API;
    }
    
    // Validation errors
    if (error.message?.includes('required') || 
        error.message?.includes('invalid') || 
        error.message?.includes('missing')) {
        return ErrorTypes.VALIDATION;
    }
    
    return ErrorTypes.UNKNOWN;
}

function getErrorMessage(error) {
    if (!error) return 'An unknown error occurred';
    
    // Network errors
    if (error.message?.includes('Failed to fetch')) {
        return 'Network error: Unable to connect to server. Please check your internet connection.';
    }
    
    // API errors
    if (error.response?.data?.error) {
        return error.response.data.error;
    }
    
    if (error.error) {
        return typeof error.error === 'string' ? error.error : JSON.stringify(error.error);
    }
    
    // Default
    return error.message || 'An error occurred';
}

// Loader functions
function showLoader(message = 'Loading') {
    const overlay = document.getElementById('loaderOverlay');
    const loaderText = overlay.querySelector('.loader-text');
    if (loaderText) {
        loaderText.textContent = message;
    }
    overlay.classList.remove('hidden');
}

function hideLoader() {
    const overlay = document.getElementById('loaderOverlay');
    overlay.classList.add('hidden');
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadAccounts();
    setupEventListeners();
});

// Event Listeners
function setupEventListeners() {
    document.getElementById('addAccountBtn').addEventListener('click', openAddAccountModal);
    document.getElementById('closeModalBtn').addEventListener('click', closeAddAccountModal);
    document.getElementById('parseBtn').addEventListener('click', parseFile);
    document.getElementById('postAllBtn').addEventListener('click', postAll);
    document.getElementById('cancelPostAllBtn').addEventListener('click', cancelPostAll);
    document.getElementById('clearErrorLogBtn').addEventListener('click', clearErrorLog);
    
    // Enable parse button when file is selected
    document.getElementById('fileInput').addEventListener('change', (e) => {
        const parseBtn = document.getElementById('parseBtn');
        if (e.target.files.length > 0 && currentAccountId) {
            parseBtn.disabled = false;
        } else if (e.target.files.length > 0) {
            parseBtn.disabled = false; // Enable even without account, will show alert
        } else {
            parseBtn.disabled = true;
        }
    });
    
    // Enable parse button when account is selected
    document.getElementById('accountSelect').addEventListener('change', (e) => {
        currentAccountId = e.target.value;
        const parseBtn = document.getElementById('parseBtn');
        const fileInput = document.getElementById('fileInput');
        if (e.target.value && fileInput.files.length > 0) {
            parseBtn.disabled = false;
        }
    });
    
    // Modal event listeners
    document.querySelectorAll('input[name="credentialsOption"]').forEach(radio => {
        radio.addEventListener('change', handleCredentialsToggle);
    });
    
    document.querySelectorAll('input[name="tokenMethod"]').forEach(radio => {
        radio.addEventListener('change', handleTokenMethodToggle);
    });
    
    document.getElementById('existingAccountSelect').addEventListener('change', handleExistingAccountSelect);
    document.getElementById('generateAuthUrlBtn').addEventListener('click', generateAuthUrl);
    document.getElementById('copyAuthUrlBtn').addEventListener('click', copyAuthUrl);
    document.getElementById('openAuthUrlBtn').addEventListener('click', openAuthUrl);
    document.getElementById('exchangeCodeBtn').addEventListener('click', exchangeCode);
    document.getElementById('copyRefreshTokenBtn').addEventListener('click', copyRefreshToken);
    document.getElementById('saveAccountBtn').addEventListener('click', saveAccount);
    
    // Close modal on outside click
    document.getElementById('addAccountModal').addEventListener('click', (e) => {
        if (e.target.id === 'addAccountModal') {
            closeAddAccountModal();
        }
    });
}

// Load accounts from API
async function loadAccounts(retryCount = 0) {
    const maxRetries = 3;
    
    try {
        const response = await fetch('/api/accounts', {
            signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw {
                message: errorData.error || `Server error: ${response.status}`,
                status: response.status,
                response: { data: errorData }
            };
        }
        
        accounts = await response.json();
        updateAccountSelect();
        populateExistingAccounts();
        
        if (retryCount > 0) {
            showToast('Accounts loaded successfully', 'success');
        }
    } catch (error) {
        console.error('Error loading accounts:', error);
        
        const errorType = categorizeError(error);
        const errorMessage = getErrorMessage(error);
        
        // Retry logic for network errors
        if (errorType === ErrorTypes.NETWORK && retryCount < maxRetries) {
            showToast(`Connection failed. Retrying... (${retryCount + 1}/${maxRetries})`, 'warning');
            setTimeout(() => {
                loadAccounts(retryCount + 1);
            }, 2000 * (retryCount + 1)); // Exponential backoff
            return;
        }
        
        addErrorLog('Load Accounts', errorMessage, { 
            error, 
            type: errorType,
            retryCount 
        }, () => loadAccounts(0));
        
        if (retryCount === 0) {
            showToast('Failed to load accounts. Check error log for details.', 'error', 5000);
        }
    }
}

// Update account select dropdown
function updateAccountSelect() {
    const select = document.getElementById('accountSelect');
    const currentValue = select.value; // Save current selection
    select.innerHTML = '<option value="">Select an account...</option>';
    
    accounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account.id;
        option.textContent = account.name;
        select.appendChild(option);
    });
    
    // Restore selection if it exists
    if (currentValue) {
        select.value = currentValue;
        currentAccountId = currentValue;
    }
}

// Parse uploaded file
async function parseFile() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    const parseBtn = document.getElementById('parseBtn');
    
    if (!file) {
        showToast('Please select a file first', 'warning');
        return;
    }
    
    if (!currentAccountId) {
        showToast('Please select an account first', 'warning');
        return;
    }
    
    // Show loading state
    parseBtn.classList.add('loading');
    parseBtn.disabled = true;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/posts/upload', {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(30000) // 30 second timeout
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw {
                message: errorData.error || `Server error: ${response.status}`,
                status: response.status,
                response: { data: errorData }
            };
        }
        
        const data = await response.json();
        parsedPosts = data.posts;
        displayPosts(parsedPosts);
        document.getElementById('postsSection').style.display = 'block';
        showToast(`Successfully parsed ${parsedPosts.length} posts`, 'success');
    } catch (error) {
        console.error('Error parsing file:', error);
        const errorType = categorizeError(error);
        const errorMessage = getErrorMessage(error);
        
        addErrorLog('Parse File', errorMessage, { 
            error, 
            type: errorType,
            fileName: file.name,
            fileSize: file.size
        }, () => parseFile());
        
        showToast('Error parsing file: ' + errorMessage, 'error', 5000);
    } finally {
        parseBtn.classList.remove('loading');
        parseBtn.disabled = false;
    }
}

// Display parsed posts
function displayPosts(posts) {
    const postsList = document.getElementById('postsList');
    postsList.innerHTML = '';
    
    posts.forEach((post, index) => {
        const postDiv = document.createElement('div');
        postDiv.className = 'post-item';
        postDiv.style.animationDelay = `${index * 0.05}s`;
        
        // Determine status
        let statusClass = 'valid';
        let statusText = 'Valid';
        let warnings = [];
        
        if (!post.hasSubreddit) {
            statusClass = 'invalid';
            statusText = 'Invalid - Missing Subreddit';
        } else if (!post.hasTitle || !post.title || post.title.trim().length === 0) {
            statusClass = 'invalid';
            statusText = 'Invalid - Missing Title';
            warnings.push('Title is missing or empty');
        } else if (!post.isValid) {
            statusClass = 'invalid';
            statusText = 'Invalid';
        } else if (!post.hasUrl) {
            statusClass = 'warning';
            statusText = 'Valid - No URL';
            warnings.push('URL is missing (will post as text)');
        }
        
        // Add appropriate class (only if not 'valid')
        if (statusClass === 'invalid') {
            postDiv.classList.add('invalid');
        } else if (statusClass === 'warning') {
            postDiv.classList.add('warning');
        }
        
        const warningHTML = warnings.length > 0 
            ? `<div style="color: #856404; font-size: 12px; margin-top: 5px; font-style: italic;">⚠️ ${warnings.join(', ')}</div>`
            : '';
        
        postDiv.innerHTML = `
            <div>
                <span class="status ${statusClass}">${statusText}</span>
                <h3>r/${post.subreddit || 'N/A'}</h3>
                <p><strong>Title:</strong> ${post.title && post.title.trim().length > 0 ? post.title : '<span style="color: #dc3545;">Missing</span>'}</p>
                <p><strong>URL:</strong> ${post.url && post.url.trim().length > 0 ? post.url : '<span style="color: #856404;">Missing (optional)</span>'}</p>
                ${warningHTML}
            </div>
            <button class="btn-primary" onclick="postSingle(${post.id})" ${!post.isValid ? 'disabled' : ''}>
                Post
            </button>
        `;
        
        postsList.appendChild(postDiv);
    });
}

// Post single post
async function postSingle(postId) {
    const post = parsedPosts.find(p => p.id === postId);
    if (!post || !currentAccountId) return;
    
    // Find the post item element by finding the button with the matching onclick
    const postItems = document.querySelectorAll('.post-item');
    let postItem = null;
    let button = null;
    
    for (const item of postItems) {
        const btn = item.querySelector('button');
        if (btn && btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`postSingle(${postId})`)) {
            postItem = item;
            button = btn;
            break;
        }
    }
    
    if (postItem && button) {
        postItem.classList.add('posting');
        button.classList.add('loading');
        button.disabled = true;
    }
    
    try {
        const response = await fetch('/api/posts/single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ post, accountId: currentAccountId })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            if (postItem) {
                postItem.classList.remove('posting');
                postItem.classList.add('posted');
                const button = postItem.querySelector('button');
                if (button) {
                    button.classList.remove('loading');
                    button.textContent = 'Posted ✓';
                    button.disabled = true;
                }
            }
            showToast(`Post submitted successfully!`, 'success');
        } else {
            throw new Error(data.error || 'Failed to post');
        }
    } catch (error) {
        console.error('Error posting:', error);
        if (postItem) {
            postItem.classList.remove('posting');
            postItem.classList.add('error');
            const button = postItem.querySelector('button');
            if (button) {
                button.classList.remove('loading');
                button.disabled = false;
            }
        }
        
        let errorData = {};
        try {
            if (error.response) {
                errorData = await error.response.json().catch(() => ({}));
            }
        } catch (e) {
            // Ignore JSON parse errors
        }
        
        const errorType = categorizeError(error);
        const errorMessage = getErrorMessage(error);
        
        addErrorLog('Post Single', errorMessage, { 
            post, 
            accountId: currentAccountId,
            error: errorData || error,
            type: errorType
        }, () => postSingle(postId));
        
        showToast('Error posting: ' + errorMessage, 'error', 5000);
    }
}

// Post all posts with real-time progress
let postAllInterval = null;
let isPostingAll = false;

async function postAll() {
    if (!currentAccountId || parsedPosts.length === 0) return;
    
    if (isPostingAll) {
        showToast('Posting is already in progress', 'warning');
        return;
    }
    
    const delayFrom = parseInt(document.getElementById('delayFrom').value) || 0;
    const delayUpTo = parseInt(document.getElementById('delayUpTo').value) || 0;
    
    // Validate delay values
    if (delayFrom < 0 || delayUpTo < 0) {
        showToast('Delay values must be positive numbers', 'error');
        return;
    }
    
    if (delayFrom > delayUpTo) {
        showToast('Delay "From" must be less than or equal to "Up To"', 'error');
        return;
    }
    
    const validPosts = parsedPosts.filter(p => p.isValid);
    if (validPosts.length === 0) {
        showToast('No valid posts to upload', 'warning');
        return;
    }
    
    const avgDelay = delayFrom + delayUpTo > 0 ? (delayFrom + delayUpTo) / 2 : 0;
    const estimatedTime = Math.ceil((validPosts.length - 1) * avgDelay);
    const estimatedMinutes = Math.floor(estimatedTime / 60);
    const estimatedSeconds = estimatedTime % 60;
    
    let confirmMessage = `Post ${validPosts.length} posts?\n\n`;
    if (delayFrom > 0 || delayUpTo > 0) {
        confirmMessage += `Delay: ${delayFrom}-${delayUpTo} seconds between posts\n`;
        confirmMessage += `Estimated time: ${estimatedMinutes > 0 ? estimatedMinutes + 'm ' : ''}${estimatedSeconds}s\n\n`;
    }
    confirmMessage += 'This will post all valid posts sequentially.';
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    const postAllBtn = document.getElementById('postAllBtn');
    postAllBtn.classList.add('loading');
    postAllBtn.disabled = true;
    postAllBtn.textContent = 'Posting...';
    
    document.getElementById('progressSection').style.display = 'block';
    const progressText = document.getElementById('progressText');
    const progressBar = document.getElementById('progressBar');
    
    isPostingAll = true;
    let completed = 0;
    let failed = 0;
    const total = validPosts.length;
    
    // Show cancel button
    document.getElementById('cancelPostAllBtn').style.display = 'inline-block';
    
    // Mark all post items as pending
    const postItems = document.querySelectorAll('.post-item');
    postItems.forEach(item => {
        if (!item.classList.contains('invalid')) {
            item.classList.add('posting');
        }
    });
    
    try {
        // Post each post sequentially with delays
        for (let i = 0; i < validPosts.length; i++) {
            if (!isPostingAll) {
                // User cancelled
                break;
            }
            
            const post = validPosts[i];
            const postIndex = i + 1;
            
            // Update progress
            progressText.textContent = `Posting ${postIndex}/${total}: ${post.title?.substring(0, 50)}...`;
            const percentage = ((postIndex - 1) / total) * 100;
            progressBar.style.width = `${percentage}%`;
            
            // Find and update the post item
            const postItem = Array.from(postItems).find(item => {
                const button = item.querySelector('button');
                if (button && button.getAttribute('onclick')) {
                    const onclick = button.getAttribute('onclick');
                    const postIdMatch = onclick.match(/postSingle\((\d+)\)/);
                    if (postIdMatch && parseInt(postIdMatch[1]) === post.id) {
                        return true;
                    }
                }
                return false;
            });
            
            try {
                const response = await fetch('/api/posts/single', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ post, accountId: currentAccountId })
                });
                
                const data = await response.json();
                
                if (response.ok && data.success) {
                    completed++;
                    
                    if (postItem) {
                        postItem.classList.remove('posting');
                        postItem.classList.add('posted');
                        const button = postItem.querySelector('button');
                        if (button) {
                            button.classList.remove('loading');
                            button.textContent = 'Posted ✓';
                            button.disabled = true;
                        }
                    }
                    
                    progressText.textContent = `Posted ${postIndex}/${total}: ${post.title?.substring(0, 50)}...`;
                    const successPercentage = (postIndex / total) * 100;
                    progressBar.style.width = `${successPercentage}%`;
                    
                } else {
                    failed++;
                    throw new Error(data.error || 'Failed to post');
                }
            } catch (error) {
                failed++;
                console.error(`Error posting post ${postIndex}:`, error);
                
                if (postItem) {
                    postItem.classList.remove('posting');
                    postItem.classList.add('error');
                    const button = postItem.querySelector('button');
                    if (button) {
                        button.classList.remove('loading');
                        button.disabled = false;
                    }
                }
                
                addErrorLog(`Post All - Post ${postIndex}`, error.message || 'Failed to post', {
                    post,
                    accountId: currentAccountId,
                    postIndex,
                    error
                });
            }
            
            // Add delay before next post (except for last one)
            if (i < validPosts.length - 1 && isPostingAll) {
                const delay = delayFrom + delayUpTo > 0 
                    ? Math.floor(Math.random() * (delayUpTo - delayFrom + 1)) + delayFrom 
                    : 0;
                
                if (delay > 0) {
                    progressText.textContent = `Waiting ${delay}s before next post... (${postIndex}/${total} completed)`;
                    
                    // Show countdown
                    for (let countdown = delay; countdown > 0 && isPostingAll; countdown--) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        if (isPostingAll) {
                            progressText.textContent = `Waiting ${countdown}s before next post... (${postIndex}/${total} completed)`;
                        }
                    }
                }
            }
        }
        
        // Final update
        if (isPostingAll) {
            progressText.textContent = `Completed! Posted ${completed}/${total} posts${failed > 0 ? ` (${failed} failed)` : ''}`;
            progressBar.style.width = '100%';
            
            if (completed === total) {
                showToast(`Successfully posted all ${total} posts!`, 'success');
            } else if (completed > 0) {
                showToast(`Posted ${completed}/${total} posts. ${failed} failed.`, 'warning');
            } else {
                showToast(`Failed to post all ${total} posts. Check error log.`, 'error');
            }
        } else {
            progressText.textContent = `Cancelled. Posted ${completed}/${total} posts before cancellation.`;
            showToast('Posting cancelled', 'info');
        }
        
    } catch (error) {
        console.error('Error in postAll:', error);
        const errorType = categorizeError(error);
        const errorMessage = getErrorMessage(error);
        
        addErrorLog('Post All', errorMessage, {
            posts: parsedPosts,
            accountId: currentAccountId,
            error,
            type: errorType
        }, () => postAll());
        
        showToast('Error posting: ' + errorMessage, 'error', 5000);
    } finally {
        isPostingAll = false;
        postAllBtn.classList.remove('loading');
        postAllBtn.disabled = false;
        postAllBtn.textContent = 'Post All';
        
        // Hide cancel button
        document.getElementById('cancelPostAllBtn').style.display = 'none';
        
        // Remove posting class from remaining items
        postItems.forEach(item => {
            if (item.classList.contains('posting') && !item.classList.contains('posted')) {
                item.classList.remove('posting');
            }
        });
    }
}

// Cancel post all
function cancelPostAll() {
    if (isPostingAll) {
        if (confirm('Are you sure you want to cancel posting? Posts already submitted will remain posted.')) {
            isPostingAll = false;
            showToast('Cancelling posting...', 'info');
        }
    }
}

// Add Account Modal Functions
function openAddAccountModal() {
    document.getElementById('addAccountModal').classList.remove('hidden');
    resetModal();
}

function closeAddAccountModal() {
    document.getElementById('addAccountModal').classList.add('hidden');
    resetModal();
}

function resetModal() {
    document.getElementById('accountName').value = '';
    document.getElementById('clientId').value = '';
    document.getElementById('clientSecret').value = '';
    
    // Auto-detect redirect URI based on current hostname
    const currentUrl = window.location.origin;
    const redirectUri = currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1')
        ? 'http://localhost:8080'  // Local development
        : `${currentUrl}/oauth/callback`;  // Production (Render)
    
    document.getElementById('redirectUri').value = redirectUri;
    document.getElementById('authCode').value = '';
    document.getElementById('refreshToken').value = '';
    document.getElementById('manualRefreshToken').value = '';
    document.getElementById('authUrlContainer').classList.add('hidden');
    document.getElementById('refreshTokenContainer').classList.add('hidden');
    document.getElementById('accountStatus').classList.add('hidden');
    document.querySelector('input[name="credentialsOption"][value="existing"]').checked = true;
    document.querySelector('input[name="tokenMethod"][value="oauth"]').checked = true;
    handleCredentialsToggle();
    handleTokenMethodToggle();
}

function handleCredentialsToggle() {
    const option = document.querySelector('input[name="credentialsOption"]:checked').value;
    const existingContainer = document.getElementById('existingCredentialsContainer');
    const newContainer = document.getElementById('newCredentialsContainer');
    
    if (option === 'existing') {
        existingContainer.classList.remove('hidden');
        newContainer.classList.add('hidden');
    } else {
        existingContainer.classList.add('hidden');
        newContainer.classList.remove('hidden');
    }
}

function handleTokenMethodToggle() {
    const method = document.querySelector('input[name="tokenMethod"]:checked').value;
    const oauthContainer = document.getElementById('oauthFlowContainer');
    const manualContainer = document.getElementById('manualTokenContainer');
    
    if (method === 'oauth') {
        oauthContainer.classList.remove('hidden');
        manualContainer.classList.add('hidden');
    } else {
        oauthContainer.classList.add('hidden');
        manualContainer.classList.remove('hidden');
    }
}

function populateExistingAccounts() {
    const select = document.getElementById('existingAccountSelect');
    select.innerHTML = '<option value="">Select an account...</option>';
    
    accounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account.id;
        option.textContent = `${account.name} (${account.client_id.substring(0, 10)}...)`;
        option.dataset.clientId = account.client_id;
        option.dataset.clientSecret = account.client_secret;
        select.appendChild(option);
    });
}

function handleExistingAccountSelect() {
    const select = document.getElementById('existingAccountSelect');
    const selectedOption = select.options[select.selectedIndex];
    
    if (selectedOption.value) {
        document.getElementById('clientId').value = selectedOption.dataset.clientId;
        document.getElementById('clientSecret').value = selectedOption.dataset.clientSecret;
    }
}

async function generateAuthUrl() {
    const credentialsOption = document.querySelector('input[name="credentialsOption"]:checked').value;
    let clientId, clientSecret;
    const generateBtn = document.getElementById('generateAuthUrlBtn');
    
    if (credentialsOption === 'existing') {
        const selectedId = document.getElementById('existingAccountSelect').value;
        if (!selectedId) {
            showToast('Please select an account first', 'warning');
            return;
        }
        const account = accounts.find(a => a.id == selectedId);
        clientId = account.client_id;
        clientSecret = account.client_secret;
    } else {
        clientId = document.getElementById('clientId').value;
        clientSecret = document.getElementById('clientSecret').value;
    }
    
    const redirectUri = document.getElementById('redirectUri').value;
    
    if (!clientId || !redirectUri) {
        showToast('Please enter Client ID and Redirect URI', 'warning');
        return;
    }
    
    generateBtn.classList.add('loading');
    generateBtn.disabled = true;
    
    try {
        const response = await fetch('/api/auth/generate-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri })
        });
        
        const data = await response.json();
        
        if (response.ok && data.auth_url) {
            document.getElementById('authUrl').value = data.auth_url;
            document.getElementById('authUrlContainer').classList.remove('hidden');
            showToast('Auth URL generated successfully', 'success');
        } else {
            throw new Error(data.error || 'Failed to generate auth URL');
        }
    } catch (error) {
        console.error('Error generating auth URL:', error);
        showToast('Error: ' + error.message, 'error');
    } finally {
        generateBtn.classList.remove('loading');
        generateBtn.disabled = false;
    }
}

function copyAuthUrl() {
    const authUrl = document.getElementById('authUrl');
    authUrl.select();
    document.execCommand('copy');
    showToast('Auth URL copied to clipboard!', 'success');
}

function openAuthUrl() {
    const authUrl = document.getElementById('authUrl').value;
    if (authUrl) {
        window.open(authUrl, '_blank');
    }
}

async function exchangeCode() {
    const credentialsOption = document.querySelector('input[name="credentialsOption"]:checked').value;
    let clientId, clientSecret;
    const exchangeBtn = document.getElementById('exchangeCodeBtn');
    
    if (credentialsOption === 'existing') {
        const selectedId = document.getElementById('existingAccountSelect').value;
        const account = accounts.find(a => a.id == selectedId);
        clientId = account.client_id;
        clientSecret = account.client_secret;
    } else {
        clientId = document.getElementById('clientId').value;
        clientSecret = document.getElementById('clientSecret').value;
    }
    
    const redirectUri = document.getElementById('redirectUri').value;
    const code = document.getElementById('authCode').value;
    
    if (!clientId || !clientSecret || !redirectUri || !code) {
        showToast('Please fill in all required fields', 'warning');
        return;
    }
    
    exchangeBtn.classList.add('loading');
    exchangeBtn.disabled = true;
    
    try {
        const response = await fetch('/api/auth/exchange-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, code })
        });
        
        const data = await response.json();
        
        if (response.ok && data.refresh_token) {
            document.getElementById('refreshToken').value = data.refresh_token;
            document.getElementById('refreshTokenContainer').classList.remove('hidden');
            showToast('Refresh token obtained successfully!', 'success');
        } else {
            throw new Error(data.error || 'Failed to exchange code');
        }
    } catch (error) {
        console.error('Error exchanging code:', error);
        showToast('Error: ' + error.message, 'error');
    } finally {
        exchangeBtn.classList.remove('loading');
        exchangeBtn.disabled = false;
    }
}

function copyRefreshToken() {
    const refreshToken = document.getElementById('refreshToken');
    refreshToken.select();
    document.execCommand('copy');
    showToast('Refresh token copied to clipboard!', 'success');
}

async function saveAccount() {
    const name = document.getElementById('accountName').value;
    const credentialsOption = document.querySelector('input[name="credentialsOption"]:checked').value;
    const tokenMethod = document.querySelector('input[name="tokenMethod"]:checked').value;
    const saveBtn = document.getElementById('saveAccountBtn');
    
    let clientId, clientSecret, refreshToken;
    
    if (credentialsOption === 'existing') {
        const selectedId = document.getElementById('existingAccountSelect').value;
        if (!selectedId) {
            showAccountStatus('Please select an account', 'error');
            return;
        }
        const account = accounts.find(a => a.id == selectedId);
        clientId = account.client_id;
        clientSecret = account.client_secret;
    } else {
        clientId = document.getElementById('clientId').value;
        clientSecret = document.getElementById('clientSecret').value;
    }
    
    if (tokenMethod === 'oauth') {
        refreshToken = document.getElementById('refreshToken').value;
    } else {
        refreshToken = document.getElementById('manualRefreshToken').value;
    }
    
    if (!name || !clientId || !clientSecret || !refreshToken) {
        showAccountStatus('Please fill in all required fields', 'error');
        return;
    }
    
    saveBtn.classList.add('loading');
    saveBtn.disabled = true;
    
    try {
        const response = await fetch('/api/accounts/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showAccountStatus('Account saved successfully!', 'success');
            showToast('Account saved successfully!', 'success');
            await loadAccounts();
            setTimeout(() => {
                closeAddAccountModal();
            }, 1500);
        } else {
            throw new Error(data.error || 'Failed to save account');
        }
    } catch (error) {
        console.error('Error saving account:', error);
        showAccountStatus('Error: ' + error.message, 'error');
        showToast('Error saving account: ' + error.message, 'error');
    } finally {
        saveBtn.classList.remove('loading');
        saveBtn.disabled = false;
    }
}

function showAccountStatus(message, type) {
    const statusDiv = document.getElementById('accountStatus');
    statusDiv.textContent = message;
    statusDiv.className = type;
    statusDiv.classList.remove('hidden');
}

// Enhanced Error Logging
function addErrorLog(title, message, details = {}, retryCallback = null) {
    const errorLogContainer = document.getElementById('errorLogContainer');
    const errorLog = document.getElementById('errorLog');
    
    errorLogContainer.classList.remove('hidden');
    
    const errorItem = document.createElement('div');
    errorItem.className = 'error-log-item';
    
    const time = new Date().toLocaleTimeString();
    const errorType = details.type || categorizeError(details.error);
    const detailsStr = JSON.stringify(details, null, 2);
    
    let actionsHTML = '';
    const errorId = `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    if (retryCallback) {
        // Store retry callback globally
        window[`retry_${errorId}`] = retryCallback;
        
        actionsHTML = `
            <div class="error-actions">
                <button class="error-action-btn retry" onclick="window['retry_${errorId}'](); this.closest('.error-log-item').remove();">Retry</button>
                <button class="error-action-btn dismiss" onclick="this.closest('.error-log-item').remove()">Dismiss</button>
            </div>
        `;
    } else {
        actionsHTML = `
            <div class="error-actions">
                <button class="error-action-btn dismiss" onclick="this.closest('.error-log-item').remove()">Dismiss</button>
            </div>
        `;
    }
    
    errorItem.innerHTML = `
        <div class="error-header">
            <div>
                <span class="error-time">[${time}] ${title}</span>
                <span class="error-type ${errorType}">${errorType}</span>
            </div>
        </div>
        <div class="error-message">${message}</div>
        <details>
            <summary style="cursor: pointer; color: #667eea; font-size: 12px; margin-top: 8px;">Show Details</summary>
            <div class="error-details">${detailsStr}</div>
        </details>
        ${actionsHTML}
    `;
    
    errorLog.insertBefore(errorItem, errorLog.firstChild);
    errorLog.scrollTop = 0;
    
    // Show error modal for critical errors
    if (errorType === ErrorTypes.NETWORK || errorType === ErrorTypes.API) {
        showErrorModal(title, message, details);
    }
}

// Error Modal
function showErrorModal(title, message, details = {}) {
    // Remove existing modal if any
    const existingModal = document.getElementById('errorModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.id = 'errorModal';
    modal.className = 'error-modal';
    
    const detailsStr = JSON.stringify(details, null, 2);
    
    modal.innerHTML = `
        <div class="error-modal-content">
            <div class="error-modal-header">
                <h3>⚠️ ${title}</h3>
                <button class="error-modal-close" onclick="this.closest('.error-modal').remove()">×</button>
            </div>
            <div class="error-modal-body">
                <div class="error-message" style="margin-bottom: 15px; font-size: 16px;">${message}</div>
                <details>
                    <summary style="cursor: pointer; color: #667eea; font-weight: 500; margin-bottom: 10px;">Technical Details</summary>
                    <div class="error-details" style="max-height: 300px;">${detailsStr}</div>
                </details>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    // Auto close after 10 seconds
    setTimeout(() => {
        if (modal.parentElement) {
            modal.classList.add('hidden');
            setTimeout(() => modal.remove(), 300);
        }
    }, 10000);
}

function clearErrorLog() {
    const errorLog = document.getElementById('errorLog');
    errorLog.innerHTML = '';
    document.getElementById('errorLogContainer').classList.add('hidden');
    showToast('Error log cleared', 'info');
}

// Toast Notification System
function showToast(message, type = 'info', duration = 3000) {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto remove after duration
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 300);
    }, duration);
}
