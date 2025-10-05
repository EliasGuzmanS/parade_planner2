document.addEventListener('DOMContentLoaded', function () {
    let map, marker;
    let selectedLocation = { lat: 28.6329, lon: -106.0691, name: "Chihuahua" };

    // --- ELEMENTOS DEL DOM ---
    const eventTitleInput = document.getElementById('event-title');
    const futureDatePicker = document.getElementById('future-date-picker');
    const analyzeButton = document.getElementById('analyze-button');
    const resultsPlaceholder = document.getElementById('results-placeholder');
    const resultsDisplay = document.getElementById('results-display');
    const avgTempDisplay = document.getElementById('avg-temp-display');
    const minTempDisplay = document.getElementById('min-temp-display');
    const maxTempDisplay = document.getElementById('max-temp-display');
    const avgPrecipDisplay = document.getElementById('avg-precip-display');
    const avgWindDisplay = document.getElementById('avg-wind-display');
    const alertBox = document.getElementById('alert-box');
    const alertTitle = document.getElementById('alert-title');
    const alertRecommendation = document.getElementById('alert-recommendation');
    const historyList = document.getElementById('history-list');
    const locationNameDisplay = document.getElementById('location-name-display');
    const coordinatesDisplay = document.getElementById('coordinates-display');
    const pleasantScoreDisplay = document.getElementById('pleasant-score-display');
    
    // --- LÓGICA DEL MAPA ---
    function initializeMap() {
        map = L.map('map-placeholder').setView([selectedLocation.lat, selectedLocation.lon], 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);
        marker = L.marker([selectedLocation.lat, selectedLocation.lon], { draggable: true }).addTo(map);

        marker.on('dragend', handleLocationChange);
        map.on('click', handleLocationChange);

        fetchLocationName(selectedLocation.lat, selectedLocation.lon);
    }

    function handleLocationChange(event) {
        const latlng = event.latlng || event.target.getLatLng();
        selectedLocation.lat = latlng.lat;
        selectedLocation.lon = latlng.lng;
        
        if (event.type === 'click') {
            marker.setLatLng(latlng);
        }
        
        fetchLocationName(latlng.lat, latlng.lng);
    }

    async function fetchLocationName(lat, lon) {
        updateLocationDisplay(lat, lon, "Cargando nombre...");
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            selectedLocation.name = data && data.display_name ? data.display_name.split(',')[0] : `Ubicación Desconocida`;
            updateLocationDisplay(lat, lon, selectedLocation.name);
        } catch (error) {
            console.error('Error en reverse geocoding:', error);
            selectedLocation.name = "No se pudo obtener el nombre";
            updateLocationDisplay(lat, lon, selectedLocation.name);
        }
    }

    function updateLocationDisplay(lat, lon, name) {
        locationNameDisplay.textContent = name;
        coordinatesDisplay.textContent = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
    }

    // --- LÓGICA DEL HISTORIAL ---
    function fetchAndRenderHistory() {
        fetch('/api/history')
            .then(response => response.json())
            .then(history => {
                historyList.innerHTML = '';
                if (history.length === 0) {
                    historyList.innerHTML = '<li><div class="event-details">No hay búsquedas guardadas.</div></li>';
                }
                history.forEach(item => {
                    const li = document.createElement('li');
                    
                    if (item.status_color) {
                        li.classList.add(item.status_color);
                    }
                    
                    li.innerHTML = `
                        <div class="event-title">${item.title}</div>
                        <div class="event-details">${new Date(item.date).toLocaleDateString()} - ${item.location.name}</div>
                    `;
                    li.addEventListener('click', () => {
                        eventTitleInput.value = item.title;
                        futureDatePicker.value = item.date;
                        const newLocation = { lat: item.location.lat, lng: item.location.lon };
                        map.setView(newLocation, 10);
                        marker.setLatLng(newLocation);
                        selectedLocation.lat = newLocation.lat;
                        selectedLocation.lon = newLocation.lng;
                        fetchLocationName(newLocation.lat, newLocation.lng);
                        analyzeButton.click();
                    });
                    historyList.appendChild(li);
                });
            });
    }
    
    // --- LÓGICA DEL BOTÓN DE ANÁLISIS ---
    analyzeButton.addEventListener('click', () => {
        const date = futureDatePicker.value;
        const title = eventTitleInput.value || "Evento sin nombre";
        if (!date) {
            alert('Por favor, selecciona una fecha para el análisis.');
            return;
        }

        const dataToSend = {
            lat: selectedLocation.lat,
            lon: selectedLocation.lon,
            date: date,
            title: title,
            locationName: selectedLocation.name
        };

        analyzeButton.textContent = "Analizando 20 años de datos...";
        analyzeButton.disabled = true;
        alertBox.style.display = 'none';

        fetch('/api/historical_averages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSend)
        })
        .then(response => response.ok ? response.json() : response.json().then(err => Promise.reject(err)))
        .then(data => {
            pleasantScoreDisplay.textContent = data.pleasant_score;
            avgTempDisplay.textContent = `${data.avg_temp_max} °C`;
            minTempDisplay.textContent = `${data.historical_min_temp} °C`;
            maxTempDisplay.textContent = `${data.historical_max_temp} °C`;
            avgPrecipDisplay.textContent = `${data.avg_precip} mm`;
            avgWindDisplay.textContent = `${data.avg_wind} km/h`;
            
            if (data.alert) {
                alertTitle.textContent = data.alert.title;
                alertRecommendation.textContent = data.alert.recommendation;
                alertBox.className = data.alert.type;
                alertBox.style.display = 'block';
            } else {
                alertBox.style.display = 'none';
            }
            
            resultsPlaceholder.style.display = 'none';
            resultsDisplay.style.display = 'block';

            fetchAndRenderHistory();
        })
        .catch(error => {
            console.error('Error:', error);
            resultsPlaceholder.textContent = `Error: ${error.error || "Desconocido"}`;
            resultsPlaceholder.style.display = 'block';
            resultsDisplay.style.display = 'none';
        })
        .finally(() => {
            analyzeButton.textContent = "Consultar Clima Histórico";
            analyzeButton.disabled = false;
        });
    });

    // --- INICIALIZACIÓN ---
    initializeMap();
    fetchAndRenderHistory();
});