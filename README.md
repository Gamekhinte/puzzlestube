# Puzzlestube von screame

Werbefreie Puzzle-Web-App, auf Deutsch und für Senioren gebaut. Läuft komplett im Browser, ohne Server.

- 2D-Puzzles von 36 bis 1000 Teilen, mit eigenen Fotos oder 114 mitgelieferten Bildern
- Satellitenbilder von oben (in elf Bundesländern scharfe amtliche Luftbilder)
- 28 3D-Puzzles mit 12, 24 oder 200 Teilen
- Speichert den Stand von selbst, läuft nach dem ersten Laden offline

## Starten

```bash
npm install
npm run dev
```

Fertige Version: `npm run build`, das Ergebnis liegt in `dist`.

## Bildnachweis

Alle mitgelieferten Fotos und Gemälde stammen aus Wikimedia Commons und sind gemeinfrei oder CC0. Die Liste mit Urheber und Lizenz steht in `src/gallery.ts` und in der App unter "Bildnachweis". Satellitenbilder: EOxCloudless (CC BY-NC-SA 4.0). Luftbilder: die Vermessungsverwaltungen der Länder (Lizenzen in `src/tabs/SatelliteModal.tsx`).
