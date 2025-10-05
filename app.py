from flask import Flask, render_template, request, jsonify
import requests
import pandas as pd
from datetime import datetime

app = Flask(__name__)

# Base de datos en memoria para el historial
search_history = []

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/history', methods=['GET'])
def get_history():
    """Devuelve el historial de búsquedas."""
    return jsonify(search_history)

def calculate_pleasant_score(temp, precip, radiation):
    """
    Calcula un puntaje de "Clima Agradable" de 0 a 100.
    """
    score = 100
    
    # Puntuación por Temperatura
    if 22 <= temp <= 25:
        pass # Puntuación perfecta
    elif 18 <= temp < 22 or 25 < temp <= 28:
        score -= 15 # Ligeramente fuera del ideal
    elif temp < 18 or temp > 28:
        score -= 30 # Clima no muy agradable
        
    # Puntuación por Precipitación
    if precip > 2.0:
        score -= 40 # Lluvia significativa
    elif precip > 0.5:
        score -= 20 # Llovizna o lluvia ligera
        
    # Puntuación por Radiación/UV (el valor está en J/m², lo normalizamos a MJ/m²)
    uv_proxy = radiation / 1_000_000
    if uv_proxy > 28:
        score -= 20 # Demasiado sol
        
    return max(0, int(score))

@app.route('/api/historical_averages', methods=['POST'])
def historical_averages():
    data = request.json
    lat, lon, target_date_str, event_title = data.get('lat'), data.get('lon'), data.get('date'), data.get('title', 'Evento sin nombre')
    location_name = data.get('locationName', 'Ubicación desconocida')

    try:
        target_date = datetime.strptime(target_date_str, '%Y-%m-%d')
        target_month_day = target_date.strftime('%m-%d')
        
        start_date_hist = f"{datetime.now().year - 20}-01-01"
        end_date_hist = f"{datetime.now().year - 1}-12-31"

        api_url = (
            "https://archive-api.open-meteo.com/v1/archive"
            f"?latitude={lat}&longitude={lon}&start_date={start_date_hist}&end_date={end_date_hist}"
            "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,shortwave_radiation_sum"
        )
        
        response = requests.get(api_url, timeout=20)
        response.raise_for_status()
        om_data = response.json()

        df = pd.DataFrame(om_data['daily'])
        df['time'] = pd.to_datetime(df['time'])
        df.set_index('time', inplace=True)
        
        specific_day_df = df[df.index.strftime('%m-%d') == target_month_day]

        if specific_day_df.empty: return jsonify({"error": "No hay datos históricos."}), 404

        avg_temp_max = specific_day_df['temperature_2m_max'].mean()
        historical_max_temp = specific_day_df['temperature_2m_max'].max()
        historical_min_temp = specific_day_df['temperature_2m_min'].min()
        avg_precip = specific_day_df['precipitation_sum'].mean()
        max_precip = specific_day_df['precipitation_sum'].max()
        avg_wind = specific_day_df['windspeed_10m_max'].mean()
        avg_radiation = specific_day_df['shortwave_radiation_sum'].mean()

        alert = None
        status_color = "normal"  # Color por defecto

        if historical_max_temp > 35:
            alert = { "title": "¡CUIDADO! CALOR EXTREMO HISTÓRICO", "recommendation": f"Este día ha alcanzado picos de hasta {historical_max_temp:.0f}°C. Es crucial llevar protección solar y beber abundante agua.", "type": "danger" }
        elif historical_max_temp > 28:
            alert = { "title": "PRECAUCIÓN: DÍA MUY CALUROSO", "recommendation": f"Se han registrado temperaturas de hasta {historical_max_temp:.0f}°C. No olvides llevar gorra y mantenerte hidratado.", "type": "warning" }
        elif historical_min_temp < 5:
            alert = { "title": "AVISO: FRÍO SIGNIFICATIVO REGISTRADO", "recommendation": f"Se han registrado temperaturas de hasta {historical_min_temp:.0f}°C. Se recomienda llevar abrigo.", "type": "info" }
        elif avg_precip > 5:
            alert = { "title": "AVISO: ALTA PROBABILIDAD DE LLUVIA", "recommendation": f"El promedio de lluvia para este día es de {avg_precip:.1f} mm. Es probable que necesites un plan B con techo.", "type": "secondary" }
        
        pleasant_score = calculate_pleasant_score(avg_temp_max, avg_precip, avg_radiation)
        
        if alert:
            status_color = alert['type']
        elif pleasant_score >= 85:
            status_color = "success"

        results = {
            "avg_temp_max": f"{avg_temp_max:.1f}", "historical_min_temp": f"{historical_min_temp:.1f}",
            "historical_max_temp": f"{historical_max_temp:.1f}", "avg_precip": f"{avg_precip:.2f}",
            "avg_wind": f"{avg_wind:.1f}", "alert": alert,
            "pleasant_score": pleasant_score
        }
        
        history_entry = { 
            "title": event_title, "date": target_date_str, 
            "location": {"lat": lat, "lon": lon, "name": location_name}, 
            "results": results,
            "status_color": status_color
        }
        search_history.insert(0, history_entry)

        return jsonify(results)

    except Exception as e:
        return jsonify({"error": f"Ocurrió un error en el servidor."}), 500

if __name__ == '__main__':
    app.run(debug=True)