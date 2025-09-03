# SHIELD Dashboard

**SHIELD Dashboard** je centralni deo sistema za vizuelizaciju i nadzor simuliranih IoT senzora za građevinsku infrastrukturu.

## Ključne funkcionalnosti dashboarda

- **Prikaz trenutnog stanja sistema**: Vizuelni prikaz svih aktivnih senzora i njihovih trenutnih vrednosti (vlažnost, vibracije, naprezanja).
- **Istorijski grafovi**: Prikaz istorije očitavanja senzora kroz interaktivne grafove za analizu trendova i promena tokom vremena.
- **Alarmi**: Prikaz aktivnih alarma u realnom vremenu, kao i kompletna istorija svih alarma (žuti i crveni nivo).
- **Centralizovani nadzor**: Dashboard omogućava korisniku da na jednom mestu prati sve podatke i događaje iz sistema.

## Tehnologije

- **Electron**: Za izradu desktop aplikacije (cross-platform).
- **Flask**: Backend server za obradu podataka, komunikaciju sa MQTT i rad sa bazom.
- **Baza podataka**: Za čuvanje istorijskih podataka senzora i alarma (SQLite).
- **Frontend**: Web tehnologije (HTML, CSS, JavaScript) za korisnički interfejs unutar Electron aplikacije.
- **MQTT**: Dashboard je subscriber na sve relevantne teme i prima podatke sa svih senzora i aktuatora.
- **JSON**: Format razmene podataka.

## Brza instalacija i pokretanje

### Preduslovi
- Node.js (v16 ili noviji)
- Python 3.8+
- MQTT Broker (opciono za testiranje - može koristiti javni broker)

### Instalacija

1. **Instaliranje dependencies:**
```bash
# Instaliraj Node.js dependencies
npm install

# Instaliraj Python dependencies
cd backend
pip install -r requirements.txt
```

2. **Pokretanje u development modu:**
```bash
# Pokreni oba servera odjednom
npm run dev

# Ili pokreni posebno:
npm run start-backend  # Pokreni Flask backend
npm run start-electron # Pokreni Electron app
```

3. **Testiranje sa mock podacima:**
```bash
# U novom terminalu, pokreni test data generator
python test_data_generator.py
# Izaberi 'continuous' da generiše podatke u realnom vremenu
```

### Brzo testiranje bez MQTT brokera

Možete testirati aplikaciju čak i bez lokalnog MQTT brokera. Backend će se pokrenuti i frontend će raditi. Za simulaciju podataka koristite test skriptu.

## Struktura projekta

```
dashboard/
├── src/
│   ├── electron/           # Electron main process
│   │   ├── main.js        # Glavna Electron aplikacija
│   │   └── preload.js     # Preload script za bezbednost
│   └── frontend/          # Frontend web aplikacija
│       ├── index.html     # Glavna HTML strana
│       ├── css/           # Stilovi
│       └── js/            # JavaScript moduli
├── backend/               # Flask backend
│   ├── app.py            # Glavna Flask aplikacija
│   └── requirements.txt  # Python dependencies
├── test_data_generator.py # Test skripta za simulaciju senzora
├── package.json          # Node.js konfiguracija
└── README.md
```

## Upotreba

### Dashboard
Dashboard pokrećete kao Electron desktop aplikaciju. Nakon pokretanja:
- Electron frontend komunicira sa Flask backendom
- Prikazuje se trenutno stanje svih senzora
- Prikazuju se istorijski grafovi za svaki tip senzora
- Prikazuje se lista svih alarma sa vremenom i tipom alarma

### Upravljanje alarmima
- Pregled svih alarma u realnom vremenu
- Potvrđivanje (acknowledge) alarma
- Filtriranje alarma po statusu
- Istorija svih alarma

### Monitoring senzora
- Pregled svih povezanih senzora
- Real-time vrednosti senzora
- Grafički prikaz istorijskih podataka
- Status indikatori (normalno/upozorenje/kritično)

## MQTT Integracija

Backend se pretplaćuje na MQTT topics:
- `sensors/+/data` - Podaci sa senzora
- `alarms/+` - Alarmi

### Format poruka

**Podaci senzora:**
```json
{
  "type": "humidity",
  "value": 65.5,
  "location": "Building A - Floor 1",
  "timestamp": "2025-09-03T10:30:00Z"
}
```

**Alarmi:**
```json
{
  "type": "threshold",
  "level": "warning",
  "message": "Humidity level above normal range",
  "timestamp": "2025-09-03T10:30:00Z"
}
```

## Pakovanje aplikacije

```bash
# Kreiraj distributable package za trenutnu platformu
npm run build

# Kreiraj package za sve platforme (potrebne su dodatne konfiguracije)
npm run dist
```

## Testiranje

Uključen je test generator koji simulira senzore:

```bash
python test_data_generator.py
```

Generator omogućava:
- Kontinuirano generisanje podataka
- Burst generisanje test podataka
- Simulaciju alarma na osnovu threshold vrednosti

## Ograničenja

Dashboard prikazuje podatke iz simulacije, nije namenjen za upotrebu u realnim kritičnim sistemima bez dodatnih provera.

## Zaključak

SHIELD Dashboard omogućava centralizovan, vizuelan i istorijski uvid u stanje simuliranog IoT sistema za građevinsku infrastrukturu, sa posebnim fokusom na alarmne događaje i analizu podataka senzora.