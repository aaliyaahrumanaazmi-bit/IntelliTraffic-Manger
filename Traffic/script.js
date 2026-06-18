// ==============================================================================
// AI Smart Traffic & Accident Monitoring System - Frontend Core Controller
// ==============================================================================

// System Configuration
const API_BASE = "http://127.0.0.1:5000";
let activeLane = 1; // 1: North, 2: South, 3: East, 4: West
let systemMode = "Auto"; // Auto / Manual / Emergency
let emergencyLane = null;
let currentDensities = [25, 45, 15, 60]; // Initial densities
let vehicleCounts = [6, 11, 3, 14];      // Initial counts
let activeSignalTimings = { green: 15, yellow: 3, red: 45 };
let currentCountdown = 15;
let intersectionTimer = null;
let vehicleAnimationId = null;
let nightModeActive = false;

// Chart.js references
let densityChart = null;
let vehicleChart = null;
let densityHistory = [[], [], [], []]; // Density history for Lane 1-4
let chartTimeLabels = [];

// Canvas and Vehicle Nodes setup
let simCanvas = null;
let simCtx = null;
let vehiclesArray = [];

// Pre-defined vehicle classes & colors
const vehicleClassColors = {
    car: "#00f0ff",   // Neon Cyan
    bike: "#39ff14",  // Neon Green
    bus: "#ffb800",   // Neon Yellow
    truck: "#ff007f"  // Neon Magenta
};

// Initialize application on load
window.addEventListener('DOMContentLoaded', () => {
    console.log("Dashboard initializing...");
    
    // Initialize Fallback DB and connect to Firebase (which will fallback if placeholders exist)
    if (window.dbAPI) {
        window.dbAPI.initFirebase((status, msg) => {
            document.getElementById('db-status').innerText = status;
            document.getElementById('db-msg').innerText = msg;
            
            const badge = document.getElementById('db-status-badge');
            if (status === "Connected") {
                badge.className = "indicator active";
            } else {
                badge.className = "indicator simulated";
            }
        });
    }

    // Capture Canvas
    simCanvas = document.getElementById('sim-canvas');
    if (simCanvas) {
        simCtx = simCanvas.getContext('2d');
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        initVehicleSimulation();
    }

    // Initialize Charts
    initCharts();

    // Event listener for Firebase DB logs pushed to the console terminal
    window.addEventListener('firebase_log', (e) => {
        addTerminalLine(e.detail);
    });

    // Populate Initial Mock Database Entries
    dbAPI.saveSignalTiming({
        lane_1: { status: "Green", duration: 15 },
        lane_2: { status: "Red", duration: 18 },
        lane_3: { status: "Red", duration: 18 },
        lane_4: { status: "Red", duration: 18 }
    });

    // Initialize Intersection Cycle Loop
    startSignalCycle();

    // Register Upload handler
    setupImageUpload();

    // Hook Up Custom Control Buttons
    setupControls();

    // Start IoT Status Sync Loop (Syncs Flask backend and IoT states every 2 seconds)
    setInterval(syncSystemState, 2000);

    // Initial announcement
    speakVoice("Smart Traffic Management System Online. Autonomous Intelligent Control Active.");
});

// Resizing vector simulation canvas
function resizeCanvas() {
    if (simCanvas) {
        simCanvas.width = simCanvas.parentElement.clientWidth;
        simCanvas.height = 380;
    }
}

// Speak Notification Utility using Speech Synthesis API
function speakVoice(text) {
    if ('speechSynthesis' in window) {
        // Cancel existing speeches
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.pitch = 0.95;
        
        // Find robotic sounding voice if possible
        const voices = window.speechSynthesis.getVoices();
        const techVoice = voices.find(v => v.name.includes("Google US English") || v.name.includes("Microsoft David"));
        if (techVoice) utterance.voice = techVoice;
        
        window.speechSynthesis.speak(utterance);
    }
}

// Format double digits
const padZero = (n) => String(n).padStart(2, '0');

// Generate live terminal console updates
function addTerminalLine(logObj) {
    const term = document.getElementById('firebase-terminal');
    if (!term) return;
    
    const line = document.createElement('div');
    line.className = 'terminal-line';
    
    line.innerHTML = `
        <span class="terminal-time">[${logObj.timestamp}]</span>
        <span class="terminal-tag">${logObj.action}</span>
        <span class="terminal-payload">${logObj.path} &rarr; ${logObj.data}</span>
    `;
    
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;
}

// Sync local states with Flask Server API
async function syncSystemState() {
    try {
        const payload = {
            system_mode: systemMode,
            active_lane: activeLane,
            emergency_lane: emergencyLane,
            current_densities: currentDensities,
            signal_statuses: getSignalStatusArray()
        };
        
        // POST to backend state manager
        const response = await fetch(`${API_BASE}/api/system/state`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            const serverState = await response.json();
            
            // Sync any state overrides triggered via Blynk/App Inventor interfaces
            if (serverState.system_mode !== systemMode) {
                setSystemMode(serverState.system_mode);
            }
            if (serverState.emergency_lane !== emergencyLane) {
                if (serverState.emergency_lane === null) {
                    clearEmergencyOverride();
                } else {
                    triggerEmergencyOverride(serverState.emergency_lane);
                }
            }
            if (serverState.system_mode === "Manual" && serverState.active_lane !== activeLane) {
                switchActiveLaneManually(serverState.active_lane);
            }
        }
    } catch (e) {
        // Quietly fail when server is offline
    }
}

function getSignalStatusArray() {
    const statuses = ["Red", "Red", "Red", "Red"];
    for(let l = 1; l <= 4; l++) {
        if (l === activeLane) {
            statuses[l - 1] = currentCountdown <= 3 ? "Yellow" : "Green";
        }
    }
    return statuses;
}

// --- INTELLIGENT TRAFFIC CONTROL CYCLING ALGORITHM ---
function startSignalCycle() {
    if (intersectionTimer) clearInterval(intersectionTimer);
    
    intersectionTimer = setInterval(() => {
        if (systemMode === "Emergency") {
            // In emergency override, the countdown freezes at a pulsing green light
            currentCountdown = 99;
            updateUI();
            return;
        }
        
        currentCountdown--;
        
        // Trigger yellow light transition before turning red
        if (currentCountdown === 3) {
            triggerYellowPhase();
        }
        
        // Cycle ends: Switch to next lane
        if (currentCountdown <= 0) {
            if (systemMode === "Auto") {
                selectNextLaneAutonomous();
            } else {
                // In Manual mode, repeat the countdown for the same active lane
                calculateDynamicTiming(activeLane);
                currentCountdown = activeSignalTimings.green;
            }
        }
        
        updateUI();
    }, 1000);
}

function triggerYellowPhase() {
    // Light turns amber
    setLightStatusInHUD(activeLane, "Yellow");
    dbAPI.saveSignalTiming({
        active_lane: activeLane,
        status: "Yellow",
        countdown: 3
    });
}

function selectNextLaneAutonomous() {
    // Move to next lane index (1 -> 2 -> 3 -> 4 -> 1)
    let nextL = activeLane + 1;
    if (nextL > 4) nextL = 1;
    
    activeLane = nextL;
    
    // Evaluate traffic densities and calculate dynamically optimized green time!
    calculateDynamicTiming(activeLane);
    currentCountdown = activeSignalTimings.green;
    
    // Voice notice of dynamic changes
    let desc = "Normal";
    if (currentCountdown > 20) desc = "Heavy Traffic Congestion Detected. Extended Priority Green";
    else if (currentCountdown < 10) desc = "Low Traffic. Energy conservation";
    
    speakVoice(`Lane ${activeLane} green. ${desc}. Countdown active.`);
    
    // Write state update to Firebase
    dbAPI.saveSignalTiming({
        active_lane: activeLane,
        status: "Green",
        duration: currentCountdown,
        lane_densities: currentDensities
    });
    
    // Push a log
    dbAPI.saveTrafficLog({
        active_lane: activeLane,
        densities: currentDensities,
        vehicle_counts: vehicleCounts
    });
}

function calculateDynamicTiming(laneIndex) {
    const density = currentDensities[laneIndex - 1];
    
    // Default smart timing thresholds
    let greenTime = 12; 
    
    if (density >= 75) {
        // High density: Increase green timing dynamically to empty the lane grid
        greenTime = nightModeActive ? 15 : 25;
    } else if (density >= 35) {
        // Medium density
        greenTime = nightModeActive ? 10 : 15;
    } else {
        // Low density: Short green duration to quickly pass other queued lanes
        greenTime = nightModeActive ? 5 : 8;
    }
    
    activeSignalTimings = {
        green: greenTime,
        yellow: 3,
        red: 3 * greenTime // Relative Cross red durations
    };
    
    document.getElementById('algo-state-text').innerText = 
        `Dynamic Timer: ${greenTime}s (Density: ${density}%)`;
}

function setSystemMode(mode) {
    systemMode = mode;
    document.getElementById('sys-mode-badge').innerText = mode;
    document.getElementById('sys-mode-badge').className = 
        `badge-neon ${mode === 'Auto' ? 'green' : mode === 'Manual' ? 'yellow' : 'red'}`;
        
    // Toggle manual button active classes
    document.getElementById('btn-mode-auto').className = `cyber-btn ${mode === 'Auto' ? 'active' : ''}`;
    document.getElementById('btn-mode-manual').className = `cyber-btn ${mode === 'Manual' ? 'active' : ''}`;
}

// Switch signals to a lane manually
function switchActiveLaneManually(laneNum) {
    activeLane = laneNum;
    calculateDynamicTiming(activeLane);
    currentCountdown = activeSignalTimings.green;
    speakVoice(`Manual override. Lane ${activeLane} set to green.`);
    
    dbAPI.saveSignalTiming({
        active_lane: activeLane,
        status: "Green (Manual)",
        duration: currentCountdown
    });
    updateUI();
}

// Trigger high-priority sirens and lock intersecting signals red
function triggerEmergencyOverride(laneNum) {
    emergencyLane = laneNum;
    activeLane = laneNum;
    setSystemMode("Emergency");
    
    speakVoice(`Alert! Emergency vehicle priority activated for Lane ${laneNum}. Cross traffic halted!`);
    
    dbAPI.saveAccidentAlert({
        lane: laneNum,
        severity: "CRITICAL",
        message: `EMERGENCY VEHICLE INTERSECTION CLEARWAY: LANE ${laneNum}`
    });
    
    // Siren sound simulation (synthesized beep)
    playEmergencySirenBeeps();
    
    // Set UI buttons
    for (let l = 1; l <= 4; l++) {
        const btn = document.getElementById(`btn-em-${l}`);
        if (btn) btn.className = `cyber-btn red-btn ${l === laneNum ? 'active' : ''}`;
    }
    
    updateUI();
}

function clearEmergencyOverride() {
    emergencyLane = null;
    setSystemMode("Auto");
    
    speakVoice("Emergency priority cleared. Restoring Autonomous Intelligent control loop.");
    
    // Clear button highlights
    for (let l = 1; l <= 4; l++) {
        const btn = document.getElementById(`btn-em-${l}`);
        if (btn) btn.className = `cyber-btn red-btn`;
    }
    
    selectNextLaneAutonomous();
    updateUI();
}

// Bleep siren sounds
function playEmergencySirenBeeps() {
    if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            
            // Generate oscillating pitch siren
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(600, ctx.currentTime);
            oscillator.frequency.linearRampToValueAtTime(1000, ctx.currentTime + 0.5);
            oscillator.frequency.linearRampToValueAtTime(600, ctx.currentTime + 1.0);
            
            gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.2);
            
            oscillator.start();
            oscillator.stop(ctx.currentTime + 1.2);
        } catch (e) {}
    }
}

// --- ACCIDENT SIMULATION AND POPUP ALERTS ---
function triggerAccidentSimulation() {
    const laneIndex = Math.floor(Math.random() * 4) + 1;
    
    // 1. Instantly escalate affected lane density to represent gridlock
    currentDensities[laneIndex - 1] = 95.0;
    vehicleCounts[laneIndex - 1] = 23;
    
    // 2. Trigger active siren popups
    const modal = document.getElementById('accident-modal-hud');
    document.getElementById('acc-lane-val').innerText = `Lane ${laneIndex} (Grid coordinates X-54, Y-12)`;
    document.getElementById('acc-time-val').innerText = new Date().toLocaleTimeString();
    
    modal.classList.add('active');
    
    speakVoice(`Critical Warning. Traffic accident detected at Lane ${laneIndex}. Emergency services dispatched. System restructuring queue cycles.`);
    
    // Play sound alert
    playEmergencySirenBeeps();
    playEmergencySirenBeeps();
    
    // 3. Write accident push to Firebase
    dbAPI.saveAccidentAlert({
        lane: laneIndex,
        severity: "HIGH",
        location: `Intersection Corridor ${laneIndex}`,
        message: `Collison detected. Vehicle bottleneck density locked at 95%.`
    });
    
    // 4. Set emergency bypass modes automatically
    triggerEmergencyOverride(laneIndex);
    
    // Update charts immediately
    updateChartData();
}

function dismissAccidentModal() {
    document.getElementById('accident-modal-hud').classList.remove('active');
    clearEmergencyOverride();
}

// --- NIGHT MODE TOGGLING & CYCLES ---
function toggleNightMode() {
    nightModeActive = !nightModeActive;
    
    if (nightModeActive) {
        document.body.classList.add('night-mode');
        document.getElementById('btn-night-toggle').className = "cyber-btn active";
        document.getElementById('night-mode-status').innerText = "Active";
        
        // Scale down lane loads
        currentDensities = currentDensities.map(d => Math.round(d * 0.4));
        vehicleCounts = vehicleCounts.map(c => Math.round(c * 0.4));
        
        speakVoice("Night mode automation engaged. Energy savings active. Truncating signals countdown cycles.");
        dbAPI.dbSet("sys/night_mode", { active: true, time: new Date().toLocaleTimeString() });
    } else {
        document.body.classList.remove('night-mode');
        document.getElementById('btn-night-toggle').className = "cyber-btn";
        document.getElementById('night-mode-status').innerText = "Inactive (Day Ops)";
        
        // Restore lane loads
        currentDensities = [30, 50, 20, 65];
        vehicleCounts = [7, 12, 4, 15];
        
        speakVoice("Restoring standard Day operational cycle.");
        dbAPI.dbSet("sys/night_mode", { active: false, time: new Date().toLocaleTimeString() });
    }
    
    calculateDynamicTiming(activeLane);
    currentCountdown = activeSignalTimings.green;
    
    updateUI();
    updateChartData();
}

// --- PREDICT HISTORICAL CONGESTION API BRIDGE (ML DASHBOARD) ---
async function fetchMLPredictionsForSelectedTime() {
    const hourVal = parseInt(document.getElementById('predict-hour-select').value);
    const weatherVal = parseInt(document.getElementById('predict-weather-select').value);
    
    try {
        const response = await fetch(`${API_BASE}/api/predict?hour=${hourVal}&weather=${weatherVal}`);
        if (response.ok) {
            const data = await response.json();
            const pred = data.prediction;
            
            document.getElementById('ml-pred-density').innerText = `${pred.predicted_density}%`;
            document.getElementById('ml-pred-index').innerText = pred.predicted_congestion_index;
            
            const catBadge = document.getElementById('ml-pred-category');
            catBadge.innerText = pred.congestion_category;
            catBadge.className = `badge-neon ${pred.congestion_category === 'High' ? 'red' : pred.congestion_category === 'Medium' ? 'yellow' : 'green'}`;
            
            // Add a terminal print
            dbAPI.dbSet("predictions/last_query", {
                queried_hour: hourVal,
                queried_weather: weatherVal,
                density: pred.predicted_density,
                congestion: pred.predicted_congestion_index
            });
        }
    } catch (e) {
        // Fallback local calculations if python backend server is offline
        console.warn("Flask ML Predict API offline. Running local client prediction fallback.");
        let base_density = 40;
        if (8 <= hourVal && hourVal <= 10) base_density = 75;
        if (17 <= hourVal && hourVal <= 19) base_density = 80;
        if (22 <= hourVal || hourVal <= 5) base_density = 15;
        
        let density = Math.min(100.0, base_density + (weatherVal * 10));
        let index = Math.round(Math.min(1.0, (density / 100) + 0.05), 2);
        
        let cat = "Low";
        if (index > 0.65) cat = "High";
        else if (index > 0.35) cat = "Medium";
        
        document.getElementById('ml-pred-density').innerText = `${density}%`;
        document.getElementById('ml-pred-index').innerText = index;
        
        const catBadge = document.getElementById('ml-pred-category');
        catBadge.innerText = cat;
        catBadge.className = `badge-neon ${cat === 'High' ? 'red' : cat === 'Medium' ? 'yellow' : 'green'}`;
    }
}

// --- MOCK TRAFFIC VEHICLE DETECTION UPLOADER ---
function setupImageUpload() {
    const dropzone = document.getElementById('image-upload-zone');
    const uploader = document.getElementById('file-uploader');
    const previewCanvas = document.getElementById('preview-detection-canvas');
    
    dropzone.addEventListener('click', () => uploader.click());
    
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "#00f0ff";
    });
    
    dropzone.addEventListener('dragleave', () => {
        dropzone.style.borderColor = "rgba(157, 0, 255, 0.4)";
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = "rgba(157, 0, 255, 0.4)";
        if (e.dataTransfer.files.length > 0) {
            processUploadedFile(e.dataTransfer.files[0]);
        }
    });
    
    uploader.addEventListener('change', () => {
        if (uploader.files.length > 0) {
            processUploadedFile(uploader.files[0]);
        }
    });
}

function triggerDemoScene(sceneType) {
    document.getElementById('detect-scene-title').innerText = `Scene Mode: ${sceneType.toUpperCase()}`;
    
    // Simulate image overlay structure or load placeholder in Canvas
    const ctx = document.getElementById('preview-detection-canvas').getContext('2d');
    const w = 600;
    const h = 330;
    ctx.canvas.width = w;
    ctx.canvas.height = h;
    
    // Clear canvas
    ctx.clearRect(0, 0, w, h);
    
    // Draw high-tech wireframe city perspective inside detection canvas
    ctx.strokeStyle = "rgba(157, 0, 255, 0.2)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    for (let y = 0; y < h; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    
    // Draw road perspective
    ctx.strokeStyle = "rgba(0, 240, 255, 0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.1, h);
    ctx.lineTo(w * 0.4, h * 0.3);
    ctx.lineTo(w * 0.6, h * 0.3);
    ctx.lineTo(w * 0.9, h);
    ctx.stroke();
    
    // Draw a virtual horizon HUD
    ctx.fillStyle = "rgba(0, 240, 255, 0.08)";
    ctx.fillRect(10, 10, w - 20, 40);
    ctx.strokeStyle = "#00f0ff";
    ctx.strokeRect(10, 10, w - 20, 40);
    
    ctx.fillStyle = "#00f0ff";
    ctx.font = "11px 'Share Tech Mono'";
    ctx.fillText("AI COMPUTER VISION INTEGRATED DETECTOR ENGINE v2.8", 20, 34);
    
    // Query local endpoint or fetch scene details
    fetch(`${API_BASE}/api/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene: sceneType })
    })
    .then(r => r.json())
    .then(data => {
        renderDetectionBoxesOnCanvas(ctx, data);
    })
    .catch(err => {
        // Direct local drawing fallback
        console.warn("Detection API offline, loading pre-structured client layout boxes.");
        const fallbackScenes = {
            morning_rush: {
                vehicle_count: 12,
                counts: { car: 8, bike: 2, bus: 1, truck: 1 },
                density: 50.0,
                bounding_boxes: [
                    { x: 50, y: 120, w: 60, h: 50, class: "car", confidence: 0.91 },
                    { x: 140, y: 130, w: 70, h: 55, class: "car", confidence: 0.88 },
                    { x: 230, y: 110, w: 100, h: 80, class: "bus", confidence: 0.95 },
                    { x: 360, y: 160, w: 30, h: 40, class: "bike", confidence: 0.82 },
                    { x: 100, y: 220, w: 85, h: 70, class: "car", confidence: 0.94 },
                    { x: 420, y: 200, w: 110, h: 90, class: "truck", confidence: 0.96 }
                ]
            },
            rainy_storm: {
                vehicle_count: 5,
                counts: { car: 3, bike: 0, bus: 0, truck: 2 },
                density: 20.8,
                bounding_boxes: [
                    { x: 80, y: 130, w: 110, h: 90, class: "truck", confidence: 0.93 },
                    { x: 260, y: 150, w: 65, h: 50, class: "car", confidence: 0.85 },
                    { x: 380, y: 180, w: 120, h: 95, class: "truck", confidence: 0.97 }
                ]
            },
            night_ops: {
                vehicle_count: 2,
                counts: { car: 1, bike: 1, bus: 0, truck: 0 },
                density: 8.3,
                bounding_boxes: [
                    { x: 120, y: 140, w: 65, h: 55, class: "car", confidence: 0.92 },
                    { x: 310, y: 170, w: 25, h: 35, class: "bike", confidence: 0.81 }
                ]
            }
        };
        const mockData = fallbackScenes[sceneType] || fallbackScenes["morning_rush"];
        renderDetectionBoxesOnCanvas(ctx, mockData);
    });
}

function processUploadedFile(file) {
    document.getElementById('detect-scene-title').innerText = `Uploaded: ${file.name.substring(0, 18)}...`;
    
    const canvas = document.getElementById('preview-detection-canvas');
    const ctx = canvas.getContext('2d');
    
    // Draw loading overlay on canvas
    ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ff007f";
    ctx.font = "14px 'Share Tech Mono'";
    ctx.fillText("AI NEURAL DETECTOR CONVOLUTION LOADING...", canvas.width * 0.15, canvas.height * 0.5);
    
    const formData = new FormData();
    formData.append('image', file);
    
    // Push upload to server API
    fetch(`${API_BASE}/api/detect`, {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        // Read file using FileReader to render image backdrop
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                // Resize canvas matching image scale ratio
                canvas.width = img.width > 600 ? 600 : img.width;
                canvas.height = Math.round((canvas.width / img.width) * img.height);
                
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                renderDetectionBoxesOnCanvas(ctx, data);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    })
    .catch(err => {
        // Fallback drawing if server fails or uploads directory error
        console.warn("Backend upload failed, loading generic visual simulation coordinates.");
        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                canvas.width = 600;
                canvas.height = 330;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                // Generic detection boxes
                const genericData = {
                    vehicle_count: 5,
                    counts: { car: 3, bike: 1, bus: 0, truck: 1 },
                    density: 20.8,
                    bounding_boxes: [
                        { x: 40, y: 150, w: 75, h: 65, class: "car", confidence: 0.94 },
                        { x: 180, y: 180, w: 30, h: 40, class: "bike", confidence: 0.78 },
                        { x: 260, y: 160, w: 120, h: 105, class: "truck", confidence: 0.91 },
                        { x: 440, y: 220, w: 80, h: 70, class: "car", confidence: 0.88 }
                    ]
                };
                renderDetectionBoxesOnCanvas(ctx, genericData);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function renderDetectionBoxesOnCanvas(ctx, data) {
    const scaleX = ctx.canvas.width / 600;
    const scaleY = ctx.canvas.height / 330;
    
    // Draw bounding boxes
    data.bounding_boxes.forEach(box => {
        const x = Math.round(box.x * scaleX);
        const y = Math.round(box.y * scaleY);
        const w = Math.round(box.w * scaleX);
        const h = Math.round(box.h * scaleY);
        
        const color = vehicleClassColors[box.class] || "#ffffff";
        
        // Box border
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        
        // Corner indicators for cyberpunk neon look
        ctx.fillStyle = color;
        const cornerLen = 6;
        ctx.fillRect(x - 1, y - 1, cornerLen, 3);
        ctx.fillRect(x - 1, y - 1, 3, cornerLen);
        
        ctx.fillRect(x + w - cornerLen + 1, y - 1, cornerLen, 3);
        ctx.fillRect(x + w - 2, y - 1, 3, cornerLen);
        
        ctx.fillRect(x - 1, y + h - 2, cornerLen, 3);
        ctx.fillRect(x - 1, y + h - cornerLen + 1, 3, cornerLen);
        
        ctx.fillRect(x + w - cornerLen + 1, y + h - 2, cornerLen, 3);
        ctx.fillRect(x + w - 2, y + h - cornerLen + 1, 3, cornerLen);
        
        // Inner translucent overlay
        ctx.fillStyle = hexToRGBA(color, 0.08);
        ctx.fillRect(x, y, w, h);
        
        // Top label with text class and confidence
        ctx.fillStyle = color;
        ctx.font = "9px 'Share Tech Mono'";
        const text = `${box.class.toUpperCase()} ${Math.round(box.confidence * 100)}%`;
        const textWidth = ctx.measureText(text).width;
        
        ctx.fillRect(x, y - 12, textWidth + 8, 12);
        
        ctx.fillStyle = "#07030d";
        ctx.fillText(text, x + 4, y - 3);
    });
    
    // Update numerical indicators in the UI
    document.getElementById('det-cnt-total').innerText = padZero(data.vehicle_count);
    document.getElementById('det-cnt-car').innerText = padZero(data.counts.car);
    document.getElementById('det-cnt-bike').innerText = padZero(data.counts.bike);
    document.getElementById('det-cnt-bus').innerText = padZero(data.counts.bus);
    document.getElementById('det-cnt-truck').innerText = padZero(data.counts.truck);
    
    // Speak results
    speakVoice(`Detection complete. Identifed ${data.vehicle_count} targets. Density levels are ${data.density_category}.`);
    
    // Push updates to database logs
    dbAPI.saveTrafficLog({
        image_detection: true,
        vehicle_count: data.vehicle_count,
        density: data.density,
        counts: data.counts
    });
}

function hexToRGBA(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// --- FRONTEND ACTION BUTTON HOOKS ---
function setupControls() {
    // Mode switches
    document.getElementById('btn-mode-auto').addEventListener('click', () => setSystemMode("Auto"));
    document.getElementById('btn-mode-manual').addEventListener('click', () => setSystemMode("Manual"));
    
    // Manual light toggles
    for (let l = 1; l <= 4; l++) {
        document.getElementById(`btn-man-${l}`).addEventListener('click', () => {
            if (systemMode !== "Manual") {
                setSystemMode("Manual");
            }
            switchActiveLaneManually(l);
        });
    }

    // Emergency Override controls
    for (let l = 1; l <= 4; l++) {
        document.getElementById(`btn-em-${l}`).addEventListener('click', () => {
            if (emergencyLane === l) {
                clearEmergencyOverride();
            } else {
                triggerEmergencyOverride(l);
            }
        });
    }

    // Accident Simulator
    document.getElementById('btn-simulate-accident').addEventListener('click', triggerAccidentSimulation);
    document.getElementById('btn-dismiss-accident').addEventListener('click', dismissAccidentModal);

    // Night Mode Toggle
    document.getElementById('btn-night-toggle').addEventListener('click', toggleNightMode);

    // ML Predictions Query Trigger
    document.getElementById('btn-query-ml').addEventListener('click', fetchMLPredictionsForSelectedTime);

    // Initial ML evaluation load
    setTimeout(fetchMLPredictionsForSelectedTime, 1000);
}

// --- GRAPHING & REAL-TIME ANALYTICS (CHART.JS) ---
function initCharts() {
    // 1. Live Density Chart
    const ctxD = document.getElementById('chart-live-density').getContext('2d');
    
    // Pre-populate historical mock timeline
    for (let i = 8; i > 0; i--) {
        const timeStr = new Date(Date.now() - i * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        chartTimeLabels.push(timeStr);
        densityHistory[0].push(20 + Math.random() * 20);
        densityHistory[1].push(35 + Math.random() * 20);
        densityHistory[2].push(10 + Math.random() * 15);
        densityHistory[3].push(50 + Math.random() * 20);
    }
    
    densityChart = new Chart(ctxD, {
        type: 'line',
        data: {
            labels: chartTimeLabels,
            datasets: [
                { label: 'Lane 1 (North)', data: densityHistory[0], borderColor: '#00f0ff', borderWidth: 2, tension: 0.3, fill: false },
                { label: 'Lane 2 (South)', data: densityHistory[1], borderColor: '#ff007f', borderWidth: 2, tension: 0.3, fill: false },
                { label: 'Lane 3 (East)', data: densityHistory[2], borderColor: '#39ff14', borderWidth: 2, tension: 0.3, fill: false },
                { label: 'Lane 4 (West)', data: densityHistory[3], borderColor: '#ffb800', borderWidth: 2, tension: 0.3, fill: false }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#8c7fa7', font: { family: 'Outfit' } } }
            },
            scales: {
                x: { grid: { color: 'rgba(157, 0, 255, 0.1)' }, ticks: { color: '#8c7fa7' } },
                y: { min: 0, max: 100, grid: { color: 'rgba(157, 0, 255, 0.1)' }, ticks: { color: '#8c7fa7' } }
            }
        }
    });

    // 2. Vehicle Class Distribution Chart
    const ctxV = document.getElementById('chart-vehicle-classes').getContext('2d');
    vehicleChart = new Chart(ctxV, {
        type: 'bar',
        data: {
            labels: ['Cars', 'Bikes', 'Buses', 'Trucks'],
            datasets: [{
                label: 'Simulated Count',
                data: [34, 18, 5, 9],
                backgroundColor: ['#00f0ff', '#39ff14', '#ffb800', '#ff007f'],
                borderColor: 'transparent'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#8c7fa7' } },
                y: { grid: { color: 'rgba(157, 0, 255, 0.1)' }, ticks: { color: '#8c7fa7', precision: 0 } }
            }
        }
    });
}

function updateChartData() {
    if (!densityChart || !vehicleChart) return;
    
    // Add current time label
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    chartTimeLabels.push(timeStr);
    if (chartTimeLabels.length > 10) chartTimeLabels.shift();
    
    // Push new lane densities
    for(let l = 0; l < 4; l++) {
        densityHistory[l].push(currentDensities[l]);
        if (densityHistory[l].length > 10) densityHistory[l].shift();
    }
    
    densityChart.update();
    
    // Generate new total vehicle counts across classes for bar charts
    const totals = [0, 0, 0, 0]; // Cars, Bikes, Buses, Trucks
    vehicleCounts.forEach(cnt => {
        totals[0] += Math.round(cnt * 0.65);
        totals[1] += Math.round(cnt * 0.20);
        totals[2] += Math.round(cnt * 0.05);
        totals[3] += Math.round(cnt * 0.10);
    });
    
    vehicleChart.data.datasets[0].data = totals;
    vehicleChart.update();
}

// --- INTERSECTION STATE RENDER CODES ---
function updateUI() {
    // 1. Update active green countdowns
    for(let l = 1; l <= 4; l++) {
        const countdownEl = document.getElementById(`time-cnt-${l}`);
        const overlayEl = document.getElementById(`lane-hud-cnt-${l}`);
        
        if (countdownEl) {
            if (l === activeLane) {
                countdownEl.innerText = padZero(currentCountdown);
                countdownEl.style.display = "flex";
            } else {
                countdownEl.style.display = "none";
            }
        }
        
        if (overlayEl) {
            overlayEl.innerText = `${Math.round(currentDensities[l-1])}% Density (${vehicleCounts[l-1]} Vehicles)`;
        }
    }
    
    // 2. Adjust Traffic Light colors
    for(let l = 1; l <= 4; l++) {
        const redLens = document.querySelector(`.signal-lane-${l} .red`);
        const yellowLens = document.querySelector(`.signal-lane-${l} .yellow`);
        const greenLens = document.querySelector(`.signal-lane-${l} .green`);
        
        // Reset active
        redLens.classList.remove('active');
        yellowLens.classList.remove('active');
        greenLens.classList.remove('active');
        
        if (l === activeLane) {
            if (currentCountdown <= 3) {
                yellowLens.classList.add('active');
                setLightStatusInHUD(l, "Yellow");
            } else {
                greenLens.classList.add('active');
                setLightStatusInHUD(l, "Green");
            }
        } else {
            redLens.classList.add('active');
            setLightStatusInHUD(l, "Red");
        }
    }

    // 3. Highlight manual buttons
    for(let l = 1; l <= 4; l++) {
        const btn = document.getElementById(`btn-man-${l}`);
        if (btn) {
            btn.className = `cyber-btn ${l === activeLane && systemMode === "Manual" ? 'active' : ''}`;
        }
    }

    // 4. Update core numeric dashboard labels
    const avgD = Math.round(currentDensities.reduce((a,b)=>a+b, 0) / 4);
    const sumC = vehicleCounts.reduce((a,b)=>a+b, 0);
    
    document.getElementById('hud-avg-density').innerText = `${avgD}%`;
    document.getElementById('hud-total-vehicles').innerText = padZero(sumC);
    
    const densityBadge = document.getElementById('hud-density-category');
    let cat = "Low";
    if (avgD > 75) cat = "High";
    else if (avgD > 35) cat = "Medium";
    densityBadge.innerText = cat;
    densityBadge.className = `badge-neon ${cat === 'High' ? 'red' : cat === 'Medium' ? 'yellow' : 'green'}`;
}

function setLightStatusInHUD(laneNum, status) {
    const el = document.getElementById(`hud-status-lane-${laneNum}`);
    if (el) {
        el.innerText = status;
        el.className = `badge-neon ${status === 'Green' ? 'green' : status === 'Yellow' ? 'yellow' : 'red'}`;
    }
}

// --- 2D CANVAS VECTOR SMART CITY SIMULATOR ---
function initVehicleSimulation() {
    vehiclesArray = [];
    
    // Populate some initial moving car nodes
    // Lanes: North -> goes South (Y increases, X: centered lane left side)
    // South -> goes North (Y decreases, X: centered lane right side)
    // East -> goes West (X decreases, Y: centered lane top side)
    // West -> goes East (X increases, Y: centered lane bottom side)
    
    // We animate simple structures inside canvas loop
    function animate() {
        if (!simCtx) return;
        
        simCtx.clearRect(0, 0, simCanvas.width, simCanvas.height);
        
        // 1. Draw High-tech dark backgrounds
        simCtx.fillStyle = "rgba(7, 3, 13, 0.4)";
        simCtx.fillRect(0, 0, simCanvas.width, simCanvas.height);
        
        const cx = simCanvas.width / 2;
        const cy = simCanvas.height / 2;
        const rw = 80; // Road width
        
        // 2. Draw roads
        simCtx.fillStyle = "rgba(20, 12, 38, 0.8)";
        // Vertical Road
        simCtx.fillRect(cx - rw/2, 0, rw, simCanvas.height);
        // Horizontal Road
        simCtx.fillRect(0, cy - rw/2, simCanvas.width, rw);
        
        // Road striping
        simCtx.strokeStyle = "rgba(157, 0, 255, 0.4)";
        simCtx.lineWidth = 1;
        simCtx.setLineDash([5, 5]);
        
        // Vertical Center Dash
        simCtx.beginPath();
        simCtx.moveTo(cx, 0); simCtx.lineTo(cx, cy - rw/2);
        simCtx.moveTo(cx, cy + rw/2); simCtx.lineTo(cx, simCanvas.height);
        // Horizontal Center Dash
        simCtx.moveTo(0, cy); simCtx.lineTo(cx - rw/2, cy);
        simCtx.moveTo(cx + rw/2, cy); simCtx.lineTo(simCanvas.width, cy);
        simCtx.stroke();
        simCtx.setLineDash([]);
        
        // Solid lanes borders
        simCtx.strokeStyle = "rgba(0, 240, 255, 0.25)";
        simCtx.strokeRect(cx - rw/2, 0, rw, simCanvas.height);
        simCtx.strokeRect(0, cy - rw/2, simCanvas.width, rw);
        
        // Center intersection ring
        simCtx.beginPath();
        simCtx.arc(cx, cy, rw/2, 0, Math.PI * 2);
        simCtx.strokeStyle = "rgba(0, 240, 255, 0.4)";
        ctxD = simCtx.fillStyle = "rgba(0, 240, 255, 0.05)";
        simCtx.fill();
        simCtx.stroke();
        
        // 3. Update and render moving vehicles
        updateSimulatedVehicles(cx, cy, rw);
        
        // Loop simulation
        vehicleAnimationId = requestAnimationFrame(animate);
    }
    
    // Spawn initial nodes
    for (let i = 0; i < 30; i++) {
        spawnVehicle();
    }
    
    animate();
}

function spawnVehicle() {
    const lane = Math.floor(Math.random() * 4) + 1; // 1: North, 2: South, 3: East, 4: West
    const classes = ["car", "bike", "bus", "truck"];
    const vClass = classes[Math.floor(Math.random() * classes.length)];
    
    let v = {
        lane: lane,
        class: vClass,
        speed: 1.5 + Math.random() * 1.5,
        color: vehicleClassColors[vClass],
        id: Math.random()
    };
    
    // Starting coordinates based on lanes
    if (lane === 1) { // North -> Heading South
        v.x = simCanvas.width / 2 + 15;
        v.y = -20 - Math.random() * 150;
    } else if (lane === 2) { // South -> Heading North
        v.x = simCanvas.width / 2 - 15;
        v.y = simCanvas.height + 20 + Math.random() * 150;
    } else if (lane === 3) { // East -> Heading West
        v.x = simCanvas.width + 20 + Math.random() * 150;
        v.y = simCanvas.height / 2 - 15;
    } else { // West -> Heading East
        v.x = -20 - Math.random() * 150;
        v.y = simCanvas.height / 2 + 15;
    }
    
    vehiclesArray.push(v);
}

function updateSimulatedVehicles(cx, cy, rw) {
    const stopOffset = rw / 2 + 12; // Stop line coordinate buffer
    const queueGap = 14; // Minimum spacing between queued vehicles
    
    // Define stop lines for each lane
    const stopLines = {
        1: cy - stopOffset, // Lane 1 (North->South): vehicles stop above intersection
        2: cy + stopOffset, // Lane 2 (South->North): vehicles stop below intersection
        3: cx + stopOffset, // Lane 3 (East->West): vehicles stop right of intersection
        4: cx - stopOffset  // Lane 4 (West->East): vehicles stop left of intersection
    };
    
    // Sort vehicles per lane so we process front-most vehicles first.
    // Front vehicles stop first, then trailing vehicles queue behind them.
    const sortedVehicles = [...vehiclesArray].sort((a, b) => {
        if (a.lane !== b.lane) return a.lane - b.lane;
        if (a.lane === 1) return b.y - a.y; // Highest Y first (closest to stop line)
        if (a.lane === 2) return a.y - b.y; // Lowest Y first
        if (a.lane === 3) return a.x - b.x; // Lowest X first
        if (a.lane === 4) return b.x - a.x; // Highest X first
        return 0;
    });
    
    sortedVehicles.forEach(v => {
        // Determine if this lane's light is red (not the active green/yellow lane)
        const isLightRed = (v.lane !== activeLane);
        
        let shouldStop = false;
        
        if (v.lane === 1) { // North heading South (Y increases)
            const stopY = stopLines[1];
            // Vehicle has already cleared the intersection — always let it continue
            const hasPassedIntersection = v.y > cy + rw / 2;
            
            if (!hasPassedIntersection) {
                // RED LIGHT STOP: only when vehicle is at or about to cross stop line
                if (isLightRed && v.y <= stopY && v.y + v.speed >= stopY) {
                    v.y = stopY; // Snap to the stop line
                    shouldStop = true;
                }
                // HOLD: vehicle already sitting exactly on the stop line from a previous frame
                if (isLightRed && v.y === stopY) {
                    shouldStop = true;
                }
                
                // QUEUE: find the closest vehicle directly ahead in this lane
                let closestDist = Infinity;
                vehiclesArray.forEach(other => {
                    if (other.lane === 1 && other.id !== v.id && other.y > v.y) {
                        const dist = other.y - v.y;
                        if (dist < closestDist) closestDist = dist;
                    }
                });
                if (closestDist < queueGap) {
                    shouldStop = true;
                }
            }
            
            if (!shouldStop) v.y += v.speed;
            
        } else if (v.lane === 2) { // South heading North (Y decreases)
            const stopY = stopLines[2];
            const hasPassedIntersection = v.y < cy - rw / 2;
            
            if (!hasPassedIntersection) {
                if (isLightRed && v.y >= stopY && v.y - v.speed <= stopY) {
                    v.y = stopY;
                    shouldStop = true;
                }
                if (isLightRed && v.y === stopY) {
                    shouldStop = true;
                }
                
                let closestDist = Infinity;
                vehiclesArray.forEach(other => {
                    if (other.lane === 2 && other.id !== v.id && other.y < v.y) {
                        const dist = v.y - other.y;
                        if (dist < closestDist) closestDist = dist;
                    }
                });
                if (closestDist < queueGap) {
                    shouldStop = true;
                }
            }
            
            if (!shouldStop) v.y -= v.speed;
            
        } else if (v.lane === 3) { // East heading West (X decreases)
            const stopX = stopLines[3];
            const hasPassedIntersection = v.x < cx - rw / 2;
            
            if (!hasPassedIntersection) {
                if (isLightRed && v.x >= stopX && v.x - v.speed <= stopX) {
                    v.x = stopX;
                    shouldStop = true;
                }
                if (isLightRed && v.x === stopX) {
                    shouldStop = true;
                }
                
                let closestDist = Infinity;
                vehiclesArray.forEach(other => {
                    if (other.lane === 3 && other.id !== v.id && other.x < v.x) {
                        const dist = v.x - other.x;
                        if (dist < closestDist) closestDist = dist;
                    }
                });
                if (closestDist < queueGap) {
                    shouldStop = true;
                }
            }
            
            if (!shouldStop) v.x -= v.speed;
            
        } else { // Lane 4: West heading East (X increases)
            const stopX = stopLines[4];
            const hasPassedIntersection = v.x > cx + rw / 2;
            
            if (!hasPassedIntersection) {
                if (isLightRed && v.x <= stopX && v.x + v.speed >= stopX) {
                    v.x = stopX;
                    shouldStop = true;
                }
                if (isLightRed && v.x === stopX) {
                    shouldStop = true;
                }
                
                let closestDist = Infinity;
                vehiclesArray.forEach(other => {
                    if (other.lane === 4 && other.id !== v.id && other.x > v.x) {
                        const dist = other.x - v.x;
                        if (dist < closestDist) closestDist = dist;
                    }
                });
                if (closestDist < queueGap) {
                    shouldStop = true;
                }
            }
            
            if (!shouldStop) v.x += v.speed;
        }
        
        // Draw the vehicle node (glowing vector circle)
        simCtx.fillStyle = v.color;
        simCtx.beginPath();
        simCtx.arc(v.x, v.y, v.class === 'bus' ? 6 : v.class === 'truck' ? 5 : v.class === 'bike' ? 2 : 4, 0, Math.PI * 2);
        simCtx.shadowColor = v.color;
        simCtx.shadowBlur = 8;
        simCtx.fill();
        simCtx.shadowBlur = 0; // Reset blur for speed
    });
    
    // Filter out vehicles that exited screen limits and spawn replacements
    const initialLen = vehiclesArray.length;
    vehiclesArray = vehiclesArray.filter(v => {
        return (v.x > -50 && v.x < simCanvas.width + 50 && v.y > -50 && v.y < simCanvas.height + 50);
    });
    
    // Replenish deleted nodes
    const diff = initialLen - vehiclesArray.length;
    for (let i = 0; i < diff; i++) {
        spawnVehicle();
    }
    
    // Periodically update internal simulated traffic loads based on moving nodes
    simulateDynamicLaneTrafficDrifts();
}

let driftTimer = 0;
function simulateDynamicLaneTrafficDrifts() {
    driftTimer++;
    if (driftTimer < 240) return; // Run every 4 seconds
    driftTimer = 0;
    
    if (systemMode === "Emergency" || nightModeActive) return;
    
    // Simulate natural lane queues backing up or clearing
    for (let l = 1; l <= 4; l++) {
        if (l === activeLane) {
            // Green lane empties out
            currentDensities[l - 1] = Math.max(10.0, currentDensities[l - 1] - (Math.random() * 12 + 4));
            vehicleCounts[l - 1] = Math.max(2, Math.round(currentDensities[l - 1] * 0.22));
        } else {
            // Closed lanes build queue lines
            currentDensities[l - 1] = Math.min(98.0, currentDensities[l - 1] + (Math.random() * 6 + 1));
            vehicleCounts[l - 1] = Math.max(1, Math.round(currentDensities[l - 1] * 0.22));
        }
    }
    
    // Recalculate charts and trigger updates
    updateChartData();
    updateUI();
}
