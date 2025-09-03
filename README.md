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

## Upotreba

Dashboard pokrećete kao Electron desktop aplikaciju. Nakon pokretanja:
- Electron frontend komunicira sa Flask backendom.
- Prikazuje se trenutno stanje svih senzora.
- Prikazuju se istorijski grafovi za svaki tip senzora.
- Prikazuje se lista svih alarma sa vremenom i tipom alarma.

## Ograničenja

Dashboard prikazuje podatke iz simulacije, nije namenjen za upotrebu u realnim kritičnim sistemima bez dodatnih provera.

## Zaključak

SHIELD Dashboard omogućava centralizovan, vizuelan i istorijski uvid u stanje simuliranog IoT sistema za građevinsku infrastrukturu, sa posebnim fokusom na alarmne događaje i analizu podataka senzora.