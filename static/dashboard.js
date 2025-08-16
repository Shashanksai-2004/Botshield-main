const socket = io();

console.log('[Dashboard] Socket.IO client initialized');
socket.on('connect', function() {
    console.log('[Dashboard] Connected to backend via Socket.IO');
});

const activityFeed = [];
const FEED_LIMIT = 20;

socket.on('activity_update', function(data) {
    console.log('[Dashboard] Received activity_update:', data);
    let userAction = 'Typing';
    if (data.scroll_speed > 0 && data.typing_speed === 0) userAction = 'Scrolling';
    else if (data.scroll_speed > 0 && data.typing_speed > 0) userAction = 'Typing & Scrolling';
    else if (data.scroll_speed === 0 && data.typing_speed === 0) userAction = 'Idle';
    activityFeed.unshift({
        ...data,
        userAction,
        probability: data.probability !== undefined ? data.probability : 0,
        explanation: data.explanation || ''
    });
    if (activityFeed.length > FEED_LIMIT) activityFeed.pop();
    renderActivityFeed();
});

function renderActivityFeed() {
    const container = document.getElementById('recentActivity');
    if (!container) return;
    if (activityFeed.length === 0) {
        container.innerHTML = '<div class="text-secondary">No recent activity yet.</div>';
        return;
    }
    // Deduplicate by timestamp (or change to a combination if needed)
    const seenTimestamps = new Set();
    const dedupedFeed = activityFeed.filter(entry => {
        if (seenTimestamps.has(entry.timestamp)) return false;
        seenTimestamps.add(entry.timestamp);
        return true;
    });

    container.innerHTML = dedupedFeed.map(entry => `
        <div class="d-flex align-items-baseline mb-3 recent-activity-item">
            <div class="me-3"><i data-lucide="${entry.status === 'Bot' ? 'cpu' : 'user'}"></i></div>
            <div style="width:100%" class="recent-activity-item">
                <div class="d-flex justify-content-between align-items-baseline">
                    <span class="fw-bold">${entry.userAction}</span>
                    <span class="badge ${entry.status === 'Bot' ? 'text-bg-danger' : 'text-bg-success'} botStatus">${entry.status} <span class="prob-score">(${(entry.probability * 100).toFixed(1)}%)</span></span>
                </div>
                <div class="d-flex justify-content-around gap-3 align-items-baseline details mt-1">
                    <div class="d-flex flex-column gap-1"><span class="badge text-bg-warning">Typing Speed</span><span>${entry.typing_speed} ms/keystroke</span></div>
                    <div class="d-flex flex-column gap-1"><span class="badge text-bg-warning">Scroll Speed</span><span>${entry.scroll_speed} px/s</span></div>
                    <div class="d-flex flex-column gap-1"><span class="badge text-bg-warning">Timestamp</span><span>${entry.timestamp}</span></div>
                    <div class="d-flex flex-column gap-1"><span class="badge text-bg-info">AI Reason</span><span><i class="info-icon" title="${entry.explanation && entry.explanation.trim() ? entry.explanation : (entry.status === 'Bot' ? 'Detected as bot by AI model.' : 'Detected as human by AI model.')}">ℹ️</i></span></div>
                </div>
            </div>
        </div>
        <hr/>
    `).join('');
    if (window.lucide) lucide.createIcons();
}

function renderBotHumanLineChart(data) {
    const ctx = document.getElementById('botHumanLineChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.dates,
            datasets: [
                {
                    label: 'Bots',
                    data: data.bots,
                    borderColor: '#ff4d4f',
                    backgroundColor: 'rgba(255,77,79,0.1)',
                    fill: false,
                    tension: 0.3
                },
                {
                    label: 'Humans',
                    data: data.humans,
                    borderColor: '#36a2eb',
                    backgroundColor: 'rgba(54,162,235,0.1)',
                    fill: false,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                tooltip: {
                    enabled: true,
                    backgroundColor: '#222',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: '#fff',
                    borderWidth: 2,
                    padding: 16,
                    caretSize: 8,
                    callbacks: {
                        title: function(context) {
                            // Show the date
                            return context[0].label;
                        },
                        label: function(context) {
                            if (context.dataset.label === 'Bots') {
                                return `Detected : ${context.formattedValue}`;
                            } else if (context.dataset.label === 'Humans') {
                                return `Blocked : ${context.formattedValue}`;
                            }
                        }
                    }
                },
                legend: {
                    labels: { color: getComputedStyle(document.body).color }
                }
            },
            scales: {
                x: {
                    ticks: { color: getComputedStyle(document.body).color }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: getComputedStyle(document.body).color }
                }
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', function () {
    fetch('/api/bot_human_sessions')
        .then(res => res.json())
        .then(data => {
            renderBotHumanLineChart(data);
        });
    fetch('/api/dashboard')
        .then(res => {
            if (!res.ok) throw new Error('Failed to fetch dashboard data');
            return res.json();
        })
        .then(data => {
            document.getElementById('totalSessions').textContent = (data.total_sessions !== undefined) ? data.total_sessions : '0';
            document.getElementById('flaggedSessions').textContent = (data.flagged_sessions !== undefined) ? data.flagged_sessions : '0';
            document.getElementById('typingSpeed').textContent = (typeof data.avg_typing_speed === 'number') ? `${data.avg_typing_speed.toFixed(1)} ms/keystroke` : '0 ms/keystroke';
            document.getElementById('scrollSpeed').textContent = (typeof data.avg_scroll_speed === 'number') ? `${data.avg_scroll_speed.toFixed(1)} px/s` : '0 px/s';
            // Update bot status badge
            const botStatus = document.getElementById('botStatus');
            if (data.latest_session_status === 'Bot') {
                botStatus.textContent = 'Bot';
                botStatus.classList.remove('text-bg-success');
                botStatus.classList.add('text-bg-danger');
            } else if (data.latest_session_status === 'Human') {
                botStatus.textContent = 'Human';
                botStatus.classList.remove('text-bg-danger');
                botStatus.classList.add('text-bg-success');
            } else {
                botStatus.textContent = data.latest_session_status || 'Unknown';
                botStatus.classList.remove('text-bg-success', 'text-bg-danger');
                botStatus.classList.add('text-bg-secondary');
            }
            if (Array.isArray(data.recent_activities)) {
                activityFeed.length = 0;
                data.recent_activities.forEach(entry => {
                    activityFeed.push({
                        typing_speed: entry.typing_speed,
                        scroll_speed: entry.scroll_speed,
                        timestamp: entry.timestamp,
                        status: entry.status,
                        probability: entry.probability || 0,
                        explanation: entry.explanation || '',
                        userAction: entry.status === 'Bot' ? 'Bot Activity' : 'Human Activity'
                    });
                });
                renderActivityFeed();
            }
        })
        .catch(err => {
            document.getElementById('totalSessions').textContent = 'Err';
            document.getElementById('flaggedSessions').textContent = 'Err';
            document.getElementById('typingSpeed').textContent = 'Err';
            document.getElementById('scrollSpeed').textContent = 'Err';
            const botStatus = document.getElementById('botStatus');
            botStatus.textContent = 'Error';
            botStatus.classList.remove('text-bg-success', 'text-bg-danger');
            botStatus.classList.add('text-bg-secondary');
            const container = document.getElementById('recentActivity');
            if (container) container.innerHTML = '<div class="text-danger">Failed to load dashboard data.</div>';
        });
    fetch('/api/bot_human_sessions')
    .then(data => {
        renderBotHumanLineChart(data);
    });
const body = document.body;

const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
    body.classList.add('dark-theme');
}
const savedDetect = localStorage.getItem('lastDetectStatus');
if (savedDetect) updateStatusCard(savedDetect);

});
   

let totalSessions = 0;
let flaggedSessions = 0;

socket.on('new_behavior', (data) => {
    totalSessions++;
    if (data.status === 'Bot') flaggedSessions++;

    document.getElementById('totalSessions').textContent = totalSessions;
    document.getElementById('flaggedSessions').textContent = flaggedSessions;

    const tableBody = document.getElementById('activityTable');
    const row = document.createElement('tr');
    row.className = data.status.toLowerCase() === 'bot' ? 'activity-row-bot' : 'activity-row-human';
    row.innerHTML = `
        <td>${data.username}</td>
        <td>${data.typing_speed.toFixed(2)} ms/keystroke</td>
        <td>${data.scroll_speed ? data.scroll_speed.toFixed(2) : '0'} px/s</td>
        <td class="status-${data.status.toLowerCase()}">${data.status}</td>
        <td>${data.timestamp}</td>
    `;
    tableBody.insertBefore(row, tableBody.firstChild);
    if (tableBody.children.length > 10) tableBody.removeChild(tableBody.lastChild);
    console.log("Status:", data.status);
    updateStatusCard(data.status);
    document.getElementById('lastUpdate').textContent = `Last updated: ${new Date().toLocaleString()}`;
});

function updateStatusCard(status) {
    localStorage.setItem('lastDetectStatus', status);
    const botStatus = document.getElementById('botStatus');
    console.log('Status:', status);
    if (status.toLowerCase() === 'bot') {
        botStatus.textContent = 'Bot';
        botStatus.className = 'badge fs-6 text-bg-danger';
    } else {
        botStatus.textContent = 'Human';
        botStatus.className = 'badge fs-6 text-bg-success';
    }
}

fetch('/api/dashboard')
    .then(response => response.json())
    .then(data => {
        totalSessions = data.total_sessions;

        const probabilities = data.probability_distribution || [];
        if (probabilities.length > 0) {
            function kernelDensityEstimator(kernel, X) {
                return function(V) {
                    return X.map(function(x) {
                        return [x, d3.mean(V, function(v) { return kernel(x - v); })];
                    });
                };
            }
            function kernelGaussian(k) {
                return function(v) {
                    return Math.exp(-0.5 * (v / k) * (v / k)) / (Math.sqrt(2 * Math.PI) * k);
                };
            }
            // Use d3-array for mean (or fallback if not available)
            window.d3 = window.d3 || {};
            if (!window.d3.mean) window.d3.mean = arr => arr.length ? arr.reduce((a,b) => a+b,0)/arr.length : 0;
            const xVals = Array.from({length: 51}, (_, i) => i/50); // 0.00 to 1.00
            const kde = kernelDensityEstimator(kernelGaussian(0.06), xVals);
            const density = kde(probabilities);
            // Chart.js plot
            const ctx = document.getElementById('probabilityDensityChart').getContext('2d');
            if (window.probDensityChart) window.probDensityChart.destroy();
            window.probDensityChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: density.map(d => d[0].toFixed(2)),
                    datasets: [{
                        label: 'Probability Density',
                        data: density.map(d => d[1]),
                        fill: true,
                        borderColor: 'rgba(54,162,235,0.9)',
                        backgroundColor: 'rgba(54,162,235,0.2)',
                        tension: 0.4,
                        pointRadius: 0
                    }]
                },
                options: {
                    plugins: {
                        legend: { display: false },
                        title: { display: true, text: 'Bot Detection Probability Density', color: getComputedStyle(document.body).color }
                    },
                    scales: {
                        x: {
                            title: { display: true, text: 'Probability', color: getComputedStyle(document.body).color },
                            ticks: { color: getComputedStyle(document.body).color }
                        },
                        y: {
                            title: { display: true, text: 'Density', color: getComputedStyle(document.body).color },
                            ticks: { color: getComputedStyle(document.body).color }
                        }
                    },
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        } else {
            const ctx = document.getElementById('probabilityDensityChart').getContext('2d');
            ctx.font = '16px sans-serif';
            ctx.fillStyle = getComputedStyle(document.body).color;
            ctx.fillText('Not enough data for density plot', 30, 60);
        }

        flaggedSessions = data.flagged_sessions;
        
        document.getElementById('totalSessions').textContent = totalSessions;
        document.getElementById('flaggedSessions').textContent = flaggedSessions;
        document.getElementById('typingSpeed').textContent = `${data.avg_typing_speed.toFixed(1)} ms/keystroke`;
        document.getElementById('scrollSpeed').textContent = `${data.avg_scroll_speed.toFixed(1)} px/s`;

        const tableBody = document.getElementById('activityTable');
        data.recent_activities.forEach(activity => {
            const row = document.createElement('tr');
            row.className = activity.status.toLowerCase() === 'bot' ? 'activity-row-bot' : 'activity-row-human';
            row.innerHTML = `
                <td>${activity.username}</td>
                <td>${activity.typing_speed.toFixed(2)} ms/keystroke</td>
                <td>${activity.scroll_speed.toFixed(2)} px/s</td>
                <td class="status-${activity.status.toLowerCase()}">${activity.status}</td>
                <td>${activity.timestamp}</td>
            `;
            tableBody.appendChild(row);
        });

        // Determine final detection badge: if localStorage lastDetectStatus is Bot, keep Bot; else derive from API
        const latestStatus = (data.recent_activities && data.recent_activities.length)
            ? data.recent_activities[0].status
            : 'Human';
        const savedDetectLS = localStorage.getItem('lastDetectStatus');
        if (savedDetectLS && savedDetectLS.toLowerCase() === 'bot') {
            updateStatusCard('bot');
        } else {
            const showBot = flaggedSessions > 0 || latestStatus.toLowerCase() === 'bot';
            updateStatusCard(showBot ? 'bot' : 'human');
        }

        document.getElementById('lastUpdate').textContent = `Last updated: ${new Date().toLocaleString()}`;
    })
    .catch(error => console.error('Error:', error));