# AOSPAN — Pełna implementacja (PL)
Ta strona uruchamia pełny test AOSPAN (Unsworth et al., 2005) w przeglądarce (GitHub Pages).
- Trening liter → Trening działań (limit = mean + 2.5 SD, clamp 3000–6000 ms) → Trening mieszany → Test główny (3×3–7)
- Litera: 800 ms + 200 ms przerwy, przypomnienie bez limitu (siatka 4×3)
- Reakcja „Prawda/Fałsz” natychmiast kończy ekran działania; timeout po przekroczeniu limitu
- Wynik końcowy (PCU, accuracy, mean RT) trafia do Qualtrics (postMessage)
- Pełne logi trafiają do Google Sheets (Apps Script Web App)

## Konfiguracja Google Sheets
W pliku `app.js` uzupełnij linię:
const LOG_ENDPOINT = "PASTE_YOUR_GOOGLE_SCRIPT_URL_HERE";

## Publikacja
1) Wgraj pliki do repozytorium GitHub (root).
2) Włącz GitHub Pages (Settings → Pages → Deploy from branch → main → /(root)).
3) Osadź stronę w Qualtrics przez iframe.
