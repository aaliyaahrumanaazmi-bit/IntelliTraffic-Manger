# AI Smart Traffic & Accident Monitoring System

An integrated, futuristic, real-time intelligent traffic management and safety monitoring platform built using Web Technologies, Machine Learning (Scikit-Learn), statistical modeling in R, Firebase Realtime Database, and IoT simulations (Blynk + MIT App Inventor).

---

## 🌆 System Overview

The system controls a 4-way intersection (North, South, East, West corridors), automatically adjusting green light countdown durations according to vehicle density and traffic congestion, predicting future congestion trends using a Random Forest regressor, routing emergency clearways, simulated Blynk/MIT App Inventor connections, and publishing all events live to a simulated or real Firebase cloud.

---

## 🛠️ Technology Stack

1. **Frontend Dashboard**: HTML5, custom styled Vanilla CSS (Cyberpunk glassmorphic glow elements), JavaScript, Canvas animations, Chart.js for real-time analytics, and Web Speech Synthesis for high-tech voice broadcasts.
2. **Backend Engine**: Python Flask, providing endpoints for vehicle bounding-box detection, ML density evaluations, and Blynk/App Inventor IoT bridges.
3. **Machine Learning Model**: Python Scikit-Learn (Random Forest multi-output regression model) trained on historical datasets to forecast congestion levels based on time of day, weather, and day of week.
4. **Data Analytics**: R language, parsing the generated historical logs, outputting descriptive statistics summaries, linear regression formulas, and high-fidelity PNG graphs.
5. **Database**: Firebase Realtime Database with a seamless fallback to a local terminal-like console database simulator.
6. **Mobile/IoT Integrations**: Blynk Web API and MIT App Inventor web connectors.

---

## 🗂️ Project Structure

```text
Traffic/
├── index.html                  # Cyberpunk Smart City Dashboard Interface
├── style.css                   # Stylesheet (Neon lights, siren pulses, grids, glassmorphism)
├── script.js                   # Client-side core loop: signal states, charts, speech, map
├── firebase.js                 # Database APIs: Dual Firebase-Cloud & Local terminal fallback
├── app.py                      # Flask Server: processes detection uploads & predictions
├── ml_model.py                 # ML Engine: outputs traffic_data.csv & trains Random Forest model
├── r_analysis.R                # R script: generates linear models, boxplots, and text summaries
├── requirements.txt            # Python dependencies
└── README.md                   # This instruction manual
```

---

## ⚡ Quick Start Instructions

### 1. Set Up Python Environment
Ensure that you have Python 3.8+ installed. Open a terminal in the project directory and run:
```bash
# Install all required Python packages (Flask, Pandas, NumPy, Scikit-Learn, Pillow, OpenCV-headless)
pip install -r requirements.txt
```

### 2. Generate Data and Train the ML Model
Generate the synthetic historical traffic logs (`traffic_data.csv`) and train the Random Forest predictor by running:
```bash
python ml_model.py
```
*This produces `traffic_data.csv` and compiles the regression model to `traffic_prediction_model.pkl`.*

### 3. Launch Flask Backend Server
Start the core communication server by running:
```bash
python app.py
```
*The web server will spin up at **`http://127.0.0.1:5000`**. You can open this URL directly in any web browser to view the futuristic Cyberpunk Control Dashboard!*

### 4. Execute R Statistical Analysis
Generate statistical regression charts and analytical policy reports by executing:
```bash
Rscript r_analysis.R
```
*This reads the generated `traffic_data.csv` and outputs three graphs: `hourly_density_trends.png`, `vehicle_composition_box.png`, `congestion_regression_model.png` and a text policy summary report `r_analysis_report.txt`.*

---

## 📡 Live Firebase Cloud Integration
By default, the dashboard runs in a **Simulated fallback DB Mode** that prints all database actions (`PUSH`, `SET`, `LISTEN`) onto a glowing green terminal box in the dashboard.
To connect to a **live production Cloud Database**:
1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2. Under Build, create a **Realtime Database**.
3. Open `firebase.js` in your text editor.
4. Replace the placeholders inside the `firebaseConfig` block with your database keys:
   ```javascript
   const firebaseConfig = {
       apiKey: "YOUR_API_KEY",
       databaseURL: "https://your-project-id-default-rtdb.firebaseio.com",
       projectId: "your-project-id",
       ...
   };
   ```
5. Reload your browser. The dashboard will automatically switch to **Live Cloud Mode** and store logs in the cloud!

---

## 📱 MIT App Inventor Integration Guide
A companion mobile dashboard can be assembled in [MIT App Inventor](https://appinventor.mit.edu/) to monitor statistics and manually control signals.

### Mobile UI Layout
Create a screen containing:
*   **Web Component**: Label it `Web1` (used to query the Flask server).
*   **Timer/Clock Component**: Label it `Clock1`, set timer interval to `2000` (enabled).
*   **Labels**: Display labels for Mode, Active Green Lane, Average Density, and Recent Alert.
*   **Buttons**: Create three buttons for manual overriding: "Force Lane 1 Green", "Trigger Emergency Bypass", and "Restore Autonomous Mode".

### Blocks Code Architecture
1.  **Polling Data (Clock Timer triggered)**:
    *   Set `Web1.Url` to `http://127.0.0.1:5000/api/iot/appinventor/status` (or your public IP address).
    *   Call `Web1.Get`.
2.  **Handling JSON response (`Web1.GotText` event)**:
    *   Decode response using `JsonTextDecode`.
    *   Parse values matching the JSON tags:
        *   `m` &rarr; System mode (Auto/Manual/Emergency)
        *   `ad` &rarr; Average density %
        *   `al` &rarr; Active green lane index
        *   `latest_event` &rarr; Recent accident or warning log.
    *   Update mobile labels accordingly.
3.  **Sending Mobile Commands**:
    *   *Manual Switch*: Set `Web1.Url` to `http://127.0.0.1:5000/api/iot/appinventor/control`
    *   Set headers to `application/json` and post a JSON string:
        *   `{"command": "manual", "lane": 1}` to force green lane.
        *   `{"command": "emergency", "lane": 2}` to trigger priority sirens.
        *   `{"command": "auto"}` to clear overrides.

---

## 🎛️ Blynk IoT Dashboard Configuration
To map physical or virtual nodes onto a Blynk IoT dashboard:

### Virtual Pins Matrix Map
Configure a Blynk Mobile template with the following pins:

| Virtual Pin | Direction | Data Type | Description / Usage |
| :--- | :--- | :--- | :--- |
| **V1** | Read | Float | Cumulative Average Density (%) |
| **V2** | Read | Integer | Active Green Lane index (1 - 4) |
| **V3** | Read | Integer | Emergency Mode Status (1: Active, 0: Cleared) |
| **V4** | Read | Float | Lane 1 (North Corridor) Traffic Density % |
| **V5** | Read | Float | Lane 2 (South Corridor) Traffic Density % |
| **V6** | Read | Float | Lane 3 (East Corridor) Traffic Density % |
| **V7** | Read | Float | Lane 4 (West Corridor) Traffic Density % |
| **V10** | Write | Integer (Switch) | Admin Override toggle (0: Auto, 1: Manual Override) |
| **V11** | Write | Integer (Slider) | Manual target Lane index (1 - 4) |
| **V12** | Write | Integer (Button) | Emergency bypass trigger (Lane index, 0: Clear) |

### Telemetry Updates Webhook
Configure your Blynk hardware script (or a Webhook widget) to poll and sync values from our Flask backend:
*   Fetch state: `GET http://127.0.0.1:5000/api/iot/blynk?pin=V1`
*   Post override switches: `GET http://127.0.0.1:5000/api/iot/blynk?pin=V10&value=1` (manually locks system to admin mode).

---

## 🚨 Main Features Walkthrough

1.  **Adaptive Green Timer (Cyberpunk Algorithm)**:
    *   Green lights dynamically adjust: if lane density is high (>75%), green light extends to **25 seconds** to empty the corridor. If density is low (<35%), green timer scales down to **8 seconds** to prevent empty road idling.
2.  **Vehicle Detection Canvas**:
    *   Allows image file uploads or instant click simulation on peak hour scenes. The AI canvas draws solid neon rectangles (cyan for cars, green for bikes, yellow for buses, and pink for trucks) and computes localized density levels in real-time.
3.  **Emergency Strobe Siren**:
    *   Simulates sirens: flashing neon red popup alerts, voice synthesis alerts, siren audio bleeps, and automated locking of cross traffic signals to Red to prioritize emergency corridors.
4.  **Night Mode Automation**:
    *   Diminishes system layouts further, scales down base vehicle traffic volumes to nighttime patterns, and reduces countdown timer cycles to conserve energy.
