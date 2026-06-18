// ==============================================================================
// AI Smart Traffic & Accident Monitoring System - Firebase Integration
// ==============================================================================
// Exposes a unified interface for database operations. If real Firebase 
// credentials are not configured, it seamlessly falls back to a simulated 
// database and logs events to a glowing UI console.

// Global placeholder configuration.
// Replace with your real Firebase config credentials to connect to your live database!
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "your-project-id.firebaseapp.com",
    databaseURL: "https://your-project-id-default-rtdb.firebaseio.com",
    projectId: "your-project-id",
    storageBucket: "your-project-id.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Global simulated database state
window.simulatedFirebaseLogs = [];
window.firebaseActive = false;
let dbRef = null;

// Function to log database operations to the console simulator
function logDbEvent(action, path, data) {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = {
        timestamp: timestamp,
        action: action.toUpperCase(),
        path: path,
        data: JSON.stringify(data)
    };
    window.simulatedFirebaseLogs.push(logMessage);
    
    // Keep last 40 logs
    if (window.simulatedFirebaseLogs.length > 40) {
        window.simulatedFirebaseLogs.shift();
    }
    
    // Trigger custom event to notify frontend terminal component
    const event = new CustomEvent('firebase_log', { detail: logMessage });
    window.dispatchEvent(event);
}

// Initialize Firebase
function initFirebase(onStatusChange) {
    // Check if configuration has been replaced with real credentials
    const isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY" && 
                          firebaseConfig.databaseURL && 
                          !firebaseConfig.databaseURL.includes("your-project-id");
                          
    if (!isConfigured) {
        console.warn("Firebase: Using simulated database. Fill in firebaseConfig in firebase.js for live Realtime Database connectivity.");
        window.firebaseActive = false;
        if (onStatusChange) onStatusChange("Simulated", "Using Local Memory Fallback DB");
        logDbEvent("INIT", "/sys", { status: "Simulated", mode: "Dual-Mode Local Console Active" });
        return;
    }
    
    try {
        // Dynamically load Firebase SDK if not already present
        if (typeof firebase === 'undefined') {
            console.error("Firebase SDK script not loaded in index.html.");
            window.firebaseActive = false;
            if (onStatusChange) onStatusChange("Error", "Firebase SDK missing");
            return;
        }
        
        // Initialize Firebase app
        firebase.initializeApp(firebaseConfig);
        dbRef = firebase.database();
        window.firebaseActive = true;
        
        console.log("Firebase: Realtime Database successfully initialized and connected.");
        if (onStatusChange) onStatusChange("Connected", "Live Cloud Database Active");
        logDbEvent("INIT", "/sys", { status: "Connected", host: firebaseConfig.databaseURL });
        
    } catch (error) {
        console.error("Firebase initialization failed:", error);
        window.firebaseActive = false;
        if (onStatusChange) onStatusChange("Failed", error.message);
        logDbEvent("ERROR", "/sys/error", { message: error.message });
    }
}

// Database Writes: Write live logs
function dbPush(path, data) {
    if (window.firebaseActive && dbRef) {
        try {
            const newRef = dbRef.ref(path).push();
            newRef.set(data);
            logDbEvent("PUSH (CLOUODB)", path, data);
        } catch (e) {
            console.error("Firebase cloud push error:", e);
            logDbEvent("PUSH (ERROR)", path, data);
        }
    } else {
        // Simulated push
        logDbEvent("PUSH (MOCKDB)", path, data);
        
        // Save to localStorage for demo persistence
        try {
            const localData = JSON.parse(localStorage.getItem(path) || "[]");
            localData.push(data);
            if (localData.length > 50) localData.shift(); // Cap local history
            localStorage.setItem(path, JSON.stringify(localData));
        } catch (e) {}
    }
}

// Database Writes: Set specific state key
function dbSet(path, data) {
    if (window.firebaseActive && dbRef) {
        try {
            dbRef.ref(path).set(data);
            logDbEvent("SET (CLOUDDB)", path, data);
        } catch (e) {
            console.error("Firebase cloud set error:", e);
            logDbEvent("SET (ERROR)", path, data);
        }
    } else {
        // Simulated set
        logDbEvent("SET (MOCKDB)", path, data);
        try {
            localStorage.setItem(path, JSON.stringify(data));
        } catch (e) {}
    }
}

// Real-time Database Reads / Listeners
function dbOn(path, callback) {
    if (window.firebaseActive && dbRef) {
        try {
            dbRef.ref(path).on('value', (snapshot) => {
                const data = snapshot.val();
                logDbEvent("LISTEN (CLOUDDB)", path, data);
                callback(data);
            });
        } catch (e) {
            console.error("Firebase cloud listen error:", e);
        }
    } else {
        // Simulated listener trigger initially
        setTimeout(() => {
            try {
                const localData = localStorage.getItem(path);
                if (localData) {
                    const data = JSON.parse(localData);
                    logDbEvent("LISTEN (MOCKDB)", path, data);
                    callback(data);
                }
            } catch (e) {}
        }, 100);
        
        // Bind to a custom event for local triggers
        window.addEventListener(`mock_db_update_${path.replace(/\//g, '_')}`, (e) => {
            logDbEvent("LISTEN (MOCKDB_TRIGGER)", path, e.detail);
            callback(e.detail);
        });
    }
}

// Export database operations
window.dbAPI = {
    initFirebase,
    dbPush,
    dbSet,
    dbOn,
    
    // Core functional helpers
    saveTrafficLog: function(densityData) {
        this.dbPush("traffic_logs", {
            timestamp: new Date().toISOString(),
            ...densityData
        });
    },
    
    saveAccidentAlert: function(accidentData) {
        this.dbPush("accident_alerts", {
            timestamp: new Date().toISOString(),
            ...accidentData
        });
        // Push notification update
        this.dbSet("notifications/latest_alert", {
            type: "ACCIDENT",
            title: "COLLISION DETECTED",
            message: accidentData.message,
            lane: accidentData.lane,
            time: new Date().toLocaleTimeString()
        });
    },
    
    saveSignalTiming: function(timingData) {
        this.dbSet("signal_timings", {
            last_updated: new Date().toISOString(),
            ...timingData
        });
    },
    
    triggerMockUpdate: function(path, data) {
        if (!window.firebaseActive) {
            // Trigger local listener event
            const eventName = `mock_db_update_${path.replace(/\//g, '_')}`;
            const event = new CustomEvent(eventName, { detail: data });
            window.dispatchEvent(event);
        }
    }
};
