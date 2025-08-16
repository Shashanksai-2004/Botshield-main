const typingBox = document.getElementById("typing-box");
const typingSpeedDisplay = document.getElementById("typing-speed");
const timerDisplay = document.getElementById("timer");
const scrollSpeedDisplay = document.getElementById("scroll-speed");

let botDetected = false;
let typingSpeeds = []; 
let pasteCount = 0;
let suspiciousCount = 0;
let lastKeypressTime = Date.now();
let lastKeyPressTime = Date.now();
let redirectTimeout = null;
let timerStarted = false; 
let timeLeft = 30; 
let scrollSpeeds = [];
let lastScrollTop = window.scrollY;
let lastTimestamp = Date.now();

function resetTrackingVariables() {
    botDetected = false;
    typingSpeeds = [];
    pasteCount = 0;
    suspiciousCount = 0;
    lastKeypressTime = Date.now();
    lastKeyPressTime = Date.now();
    redirectTimeout = null;
    timerStarted = false;
    timeLeft = 30;
    scrollSpeeds = [];
    lastScrollTop = window.scrollY;
    lastTimestamp = Date.now();
    
    if (typingSpeedDisplay) typingSpeedDisplay.textContent = 'Typing Speed: 0 ms/keystroke';
    if (scrollSpeedDisplay) scrollSpeedDisplay.textContent = 'Scroll Speed: 0 px/s';
    if (timerDisplay) timerDisplay.textContent = 'Time Remaining: 30s';
}

function startTimer() {
    resetTrackingVariables();
    timerStarted = true;

    timerDisplay.textContent = `Time Remaining: ${timeLeft}s`;

    const timer = setInterval(() => {
        timeLeft--;
        timerDisplay.textContent = `Time Remaining: ${timeLeft}s`;

        if (timeLeft <= 0) {
            clearInterval(timer);
            timerDisplay.textContent = 'Time Complete';
            
            const avgTypingSpeed = typingSpeeds.length > 0 ? typingSpeeds.reduce((a, b) => a + b, 0) / typingSpeeds.length : 0;
            const avgScrollSpeed = scrollSpeeds.length > 0 ? scrollSpeeds.reduce((a, b) => a + b, 0) / scrollSpeeds.length : 0;
            sendBehaviorData(avgTypingSpeed, avgScrollSpeed);
            
            window.open('/dashboard', '_blank');
        }
    }, 1000);
}

if (typingBox) {
    typingBox.addEventListener("paste", (event) => {
        pasteCount++;
        if (pasteCount >= 2) { 
            sendBehaviorData(0, 0);
        }
    });

    typingBox.addEventListener("keydown", (event) => {
        const now = Date.now();
        const timeBetweenKeystrokes = now - lastKeypressTime;
        lastKeypressTime = now;

        if (timeBetweenKeystrokes >= 10 && timeBetweenKeystrokes <= 1000) {
            typingSpeeds.push(timeBetweenKeystrokes);

            if (typingSpeeds.length > 15) {
                typingSpeeds.shift();
            }

            const avgSpeed = typingSpeeds.reduce((a, b) => a + b, 0) / typingSpeeds.length;
            typingSpeedDisplay.textContent = `Typing Speed: ${avgSpeed.toFixed(2)} ms/keystroke`;
            
            if (typingSpeeds.length >= 10) {
                checkForBot();
            }
        }
    });
}

document.addEventListener('keydown', () => {
    if (!timerStarted) return; 
    const currentTime = Date.now();
    const timeDiff = currentTime - lastKeyPressTime;
    
    if (timeDiff > 0) {
        const currentSpeed = timeDiff;
        typingSpeeds.push(currentSpeed);
        if (typingSpeeds.length > 5) {
            typingSpeeds.shift();
        }
        
        const avgTypingSpeed = typingSpeeds.reduce((a, b) => a + b, 0) / typingSpeeds.length;
        typingSpeedDisplay.textContent = `Typing Speed: ${avgTypingSpeed.toFixed(2)} ms/keystroke`;
    }
    
    lastKeyPressTime = currentTime;
});

window.addEventListener("scroll", (event) => {
    if (!timerStarted) return; 
    const currentScrollTop = window.scrollY;
    const currentTime = Date.now();
    const timeDiff = (currentTime - lastTimestamp) / 1000; 
    
    if (timeDiff > 0) {
        const distance = Math.abs(currentScrollTop - lastScrollTop);
        const currentSpeed = distance / timeDiff;
        
        scrollSpeeds.push(currentSpeed);
        if (scrollSpeeds.length > 5) {
            scrollSpeeds.shift();
        }
        
        const avgScrollSpeed = scrollSpeeds.reduce((a, b) => a + b, 0) / scrollSpeeds.length;
        scrollSpeedDisplay.textContent = `Scroll Speed: ${avgScrollSpeed.toFixed(2)} px/s`;
        
        sendBehaviorData(0, avgScrollSpeed);
        
        if (avgScrollSpeed > 5000) {
            if (!botDetected) {
                botDetected = true;
                sendBehaviorData(0, avgScrollSpeed);
                alert("Bot behavior detected. You will be logged out for security reasons.");
                window.location.href = '/logout';
            }
        }
    }
    
    lastScrollTop = currentScrollTop;
    lastTimestamp = currentTime;
});

function checkForBot() {
    if (typingSpeeds.length < 10) return;

    const avg = typingSpeeds.reduce((a, b) => a + b, 0) / typingSpeeds.length;
    const variance = Math.sqrt(
        typingSpeeds.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / typingSpeeds.length
    );

    if (avg < 50) {
        sendBehaviorData(avg, 0);
        return; 
    }

    const isCurrentlySuspicious = variance < 5 || avg < 50;

    if (isCurrentlySuspicious) {
        suspiciousCount++;
        if (suspiciousCount >= 3) { 
            sendBehaviorData(avg, 0);
        }
    } else {
   
        if (suspiciousCount > 0) {
            suspiciousCount = 0;
            const avgScrollSpeed = scrollSpeeds.length > 0 ? scrollSpeeds.reduce((a, b) => a + b, 0) / scrollSpeeds.length : 0;
            sendBehaviorData(avg, avgScrollSpeed);
        }
    }
}

function sendBehaviorData(typingSpeed, scrollSpeed) {
    fetch('/api/behavior', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            typing_speed: typingSpeed,
            scroll_speed: scrollSpeed,
            suspicious_count: suspiciousCount,
            paste_count: pasteCount,
            keystroke_count: typingSpeeds.length,
            is_logout: false
        })
    })
    .then(response => response.json())
    .then(result => {
        if (result.prediction === 'Bot' && !botDetected) {
            botDetected = true;
            alert("Bot behavior detected. You will be logged out for security reasons.");
            window.location.href = '/logout';
        }
    })
    .catch(error => console.error('Error:', error));
}

startTimer();