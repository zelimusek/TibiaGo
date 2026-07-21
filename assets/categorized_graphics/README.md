# 🎨 Skatalogowane Grafiki TibiaGo (Dwutorowy Eksport: Klasyczny 7.4 vs Adaptowany Post-7.4)

Folder zawiera dwa kompletne, starannie rozdzielone katalogi graficzne w formacie **PNG**:

## 🏛️ [Option 1: Klasyczna Tibia 7.4](./option1_tibia_74_classic)
Zawiera **wyłącznie autentyczne potwory i przedmioty z Tibii 7.4** (506 potworów, 3035 przedmiotów). Brak w nim potworów z nowszych wersji Tibii oraz błędnych zastępczych sprajtów (takich jak ludzik przypisany do żywiołaka wody).

## ⚡ [Option 2: Adaptowane Potwory z Nowszych Wersji](./option2_post_74_adapted)
Zawiera potwory z nowszych wersji Tibii (np. *Massive Water Elemental*, *Ice Overlord*, *Ghazbaran*, *Earth Elemental*), które miały w plikach JSON błędne lub nieistniejące w Tibii 7.4 ID strojów.
W tym folderze zostały one **inteligentnie zrenderowane z użyciem klasycznych sprajtów z Tibii 7.4 i unikalnej tonacji barw** (np. *Massive Water Elemental* wygląda tu jak prawdziwy **Niebieski Żywiołak Wody**, a *Earth Elemental* jako **Zielony Żywiołak Ziemi**!).

---
*Aby odświeżyć eksport w przyszłości, uruchom:* `node scripts/export-categorized-graphics.js`