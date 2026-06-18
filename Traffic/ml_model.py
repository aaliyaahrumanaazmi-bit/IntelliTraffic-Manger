import os
import pandas as pd
import numpy as np
import pickle
from datetime import datetime, timedelta

def generate_sample_dataset(file_path="traffic_data.csv", num_records=1500):
    """
    Generates a realistic synthetic historical dataset for traffic management.
    Saves the data as a CSV file.
    """
    print(f"Generating synthetic traffic dataset with {num_records} records...")
    
    np.random.seed(42)
    start_date = datetime(2026, 1, 1)
    
    data = []
    
    for i in range(num_records):
        current_time = start_date + timedelta(hours=i)
        hour = current_time.hour
        day_of_week = current_time.weekday()  # 0: Monday, 6: Sunday
        is_weekend = 1 if day_of_week >= 5 else 0
        
        # Weather simulation: 0: Clear, 1: Rain, 2: Fog, 3: Stormy
        weather = np.random.choice([0, 1, 2, 3], p=[0.70, 0.18, 0.08, 0.04])
        
        # Base count determined by time of day (rush hours)
        # Rush hours: 8-10 AM (hour 8-9) and 5-7 PM (hour 17-18)
        if 8 <= hour <= 10 or 17 <= hour <= 19:
            base_count = 60 if is_weekend == 0 else 30
        elif 22 <= hour or hour <= 5:
            base_count = 10  # Night hours
        else:
            base_count = 35
            
        # Add random noise and weather effect (weather slows/jams traffic)
        weather_modifier = 1.0 + (weather * 0.15)
        
        # Vehicle count for 4 lanes
        lane_1 = int(np.random.poisson(base_count) * weather_modifier)
        lane_2 = int(np.random.poisson(base_count * 0.9) * weather_modifier)
        lane_3 = int(np.random.poisson(base_count * 0.8) * weather_modifier)
        lane_4 = int(np.random.poisson(base_count * 0.85) * weather_modifier)
        
        # Ensure non-negative
        lane_1, lane_2, lane_3, lane_4 = max(0, lane_1), max(0, lane_2), max(0, lane_3), max(0, lane_4)
        
        total_vehicles = lane_1 + lane_2 + lane_3 + lane_4
        
        # Density calculation (assuming capacity is 250 vehicles for the intersection zone)
        capacity = 250
        density = min(100.0, round((total_vehicles / capacity) * 100, 2))
        
        # Congestion Index (0.0 to 1.0)
        # Higher density, poor weather, and busy hours yield higher congestion
        congestion_index = 0.1 + (density / 130) + (weather * 0.08)
        if 8 <= hour <= 10 or 17 <= hour <= 19:
            congestion_index += 0.1
        congestion_index = min(1.0, max(0.0, round(congestion_index, 2)))
        
        # Accident Probability (higher congestion + poor weather = higher risk)
        accident_prob = 0.005 + (congestion_index * 0.05) + (weather * 0.03)
        accident_occurred = 1 if np.random.random() < accident_prob else 0
        
        data.append({
            "timestamp": current_time.strftime("%Y-%m-%d %H:%M:%S"),
            "hour": hour,
            "day_of_week": day_of_week,
            "is_weekend": is_weekend,
            "weather": weather,
            "lane_1_count": lane_1,
            "lane_2_count": lane_2,
            "lane_3_count": lane_3,
            "lane_4_count": lane_4,
            "total_vehicles": total_vehicles,
            "density": density,
            "congestion_index": congestion_index,
            "accident_occurred": accident_occurred
        })
        
    df = pd.DataFrame(data)
    df.to_csv(file_path, index=False)
    print(f"Dataset successfully saved to {file_path}")
    return df

def train_and_save_model(csv_path="traffic_data.csv", model_path="traffic_prediction_model.pkl"):
    """
    Trains an ML model to predict traffic density and congestion index.
    Saves the model as a pickle file.
    """
    if not os.path.exists(csv_path):
        df = generate_sample_dataset(csv_path)
    else:
        df = pd.read_csv(csv_path)
        
    from sklearn.model_selection import train_test_split
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.metrics import mean_squared_error, r2_score
    
    print("Preparing data for ML training...")
    
    # Features: hour, day_of_week, is_weekend, weather
    X = df[["hour", "day_of_week", "is_weekend", "weather"]]
    
    # Targets: density, congestion_index
    y = df[["density", "congestion_index"]]
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print("Training Random Forest Regressor model...")
    # MultiOutput Random Forest Regressor
    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    
    # Evaluate
    predictions = model.predict(X_test)
    mse = mean_squared_error(y_test, predictions, multioutput='raw_values')
    r2 = r2_score(y_test, predictions, multioutput='raw_values')
    
    print(f"Model Evaluation Results:")
    print(f"  - Density Prediction MSE: {mse[0]:.4f}, R2 Score: {r2[0]:.4f}")
    print(f"  - Congestion Index MSE: {mse[1]:.4f}, R2 Score: {r2[1]:.4f}")
    
    # Save the trained model
    with open(model_path, "wb") as f:
        pickle.dump(model, f)
        
    print(f"Trained machine learning model saved successfully as {model_path}")
    return model

def predict_traffic(hour, day_of_week, is_weekend, weather, model_path="traffic_prediction_model.pkl"):
    """
    Predicts traffic density and congestion index for a given set of conditions.
    """
    if not os.path.exists(model_path):
        print(f"Model file {model_path} not found. Training model first...")
        model = train_and_save_model()
    else:
        with open(model_path, "rb") as f:
            model = pickle.load(f)
            
    input_data = pd.DataFrame([[hour, day_of_week, is_weekend, weather]], 
                              columns=["hour", "day_of_week", "is_weekend", "weather"])
    
    prediction = model.predict(input_data)[0]
    
    density = round(prediction[0], 2)
    congestion_index = round(prediction[1], 2)
    
    # Map congestion index to category
    if congestion_index < 0.35:
        category = "Low"
    elif congestion_index < 0.65:
        category = "Medium"
    else:
        category = "High"
        
    return {
        "predicted_density": density,
        "predicted_congestion_index": congestion_index,
        "congestion_category": category
    }

if __name__ == "__main__":
    # Ensure local directory structure
    csv_file = "traffic_data.csv"
    model_file = "traffic_prediction_model.pkl"
    
    # Generate data and train model
    generate_sample_dataset(csv_file)
    train_and_save_model(csv_file, model_file)
    
    # Quick test prediction
    test_pred = predict_traffic(hour=17, day_of_week=0, is_weekend=0, weather=1) # 5 PM, Monday, Rainy
    print(f"\nTest prediction for Monday 5 PM (Rainy):")
    print(f"  - Predicted Density: {test_pred['predicted_density']}%")
    print(f"  - Predicted Congestion Index: {test_pred['predicted_congestion_index']}")
    print(f"  - Congestion Level: {test_pred['congestion_category']}")
