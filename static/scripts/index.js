const container = document.querySelector('.container');
const LoginLink = document.querySelector('.SignInLink');
const RegisterLink = document.querySelector('.SignUpLink');

// --- Real-time user activity tracking (only after 'Start Typing') ---
// Add Start Typing button if not present
let startBtn = document.getElementById('startTypingBtn');
if (!startBtn) {
    startBtn = document.createElement('button');
    startBtn.id = 'startTypingBtn';
    startBtn.className = 'btn btn-primary';
    startBtn.textContent = 'Start Typing';
    container.insertBefore(startBtn, container.firstChild);
}

let tracking = false;
let lastKeyTime = null;
let typingSpeeds = [];
let lastScrollTime = null;
let lastScrollY = window.scrollY;
let scrollSpeeds = [];
let socket = null;

startBtn.addEventListener('click', () => {
    if (!tracking) {
        tracking = true;
        startBtn.disabled = true;
        startBtn.textContent = 'Tracking...';
        // Connect socket
        if (!socket) socket = io();
        // Add listeners
        window.addEventListener('keydown', trackTyping);
        window.addEventListener('scroll', trackScroll);
    }
});

function trackTyping(e) {
    const now = Date.now();
    if (lastKeyTime) {
        typingSpeeds.push(now - lastKeyTime);
        if (typingSpeeds.length > 10) typingSpeeds.shift();
    }
    lastKeyTime = now;
    sendUserActivity();
}

function trackScroll() {
    const now = Date.now();
    let speed = Math.abs(window.scrollY - lastScrollY) / ((now - (lastScrollTime || now)) / 1000); // px/s
    if (lastScrollTime && now !== lastScrollTime) {
        scrollSpeeds.push(speed);
        if (scrollSpeeds.length > 10) scrollSpeeds.shift();
    }
    lastScrollTime = now;
    lastScrollY = window.scrollY;
    sendUserActivity();
}

function sendUserActivity() {
    if (!tracking || !socket) return;
    const avgTyping = typingSpeeds.length ? typingSpeeds.reduce((a,b) => a+b, 0) / typingSpeeds.length : 0;
    const avgScroll = scrollSpeeds.length ? scrollSpeeds.reduce((a,b) => a+b, 0) / scrollSpeeds.length : 0;
    socket.emit('user_activity', {
        typing_speed: avgTyping,
        scroll_speed: avgScroll,
        timestamp: new Date().toLocaleString()
    });
}
// ---------------------------------------------------------------

RegisterLink.addEventListener('click', () => {
    container.classList.add('active')
})
LoginLink.addEventListener('click', () => {
    container.classList.remove('active')
})

