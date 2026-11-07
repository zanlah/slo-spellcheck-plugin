# Črkovalnik — Word add-in za slovenski pravopis

Dodatek za Microsoft Word (Office 365), ki preverja pravopis v slovenščini in ponuja predloge popravkov. Uporablja besedni seznam, sestavljen iz morfološkega leksikona [Sloleks 3.1](http://hdl.handle.net/11356/2080) (CJVT UL) in slovarja LibreOffice (Hunspell) – skupaj približno 3,3 milijona besednih oblik. Črkovalnik je nastal, ker Microsoft Office na macOS še vedno ne podpira slovenskega črkovalnika.

## Klasična uporaba (za netehnične uporabnike)

1. prenesite [install.sh](https://github.com/zanlah/slo-spellcheck-plugin/blob/master/install.sh)
2. odprite terminal (v isti mapi kot je install.sh)
3. zaženite

```bash
  bash ./install.sh https://crkovalnik.zanlah.si
```

ta skripta uporabi BASE_URL da prenese manifest.xml iz strežnika in ga prenese v [username]/Library/Containers/com.microsoft.Word/Data/Documents/wef

## Kaj vse je vključeno

- Preverjanje črkovanja s slovarjem Sloleks 3.1 + LibreOffice (≈ 3,3 milijona oblik)
- Opozorilo na manjkajoče strešice (npr. »drzava« → »država«)
- Predlogi, razvrščeni po pogostosti v korpusu Gigafida
- Preverjanje predlogov s/z in k/h (tudi pred kraticami in števili)
- Preverjanje sklona za predlogi (»brez mizo« → »brez mize«), dvojine (»z dvema prijatelji«) in števnikov (»pet avtomobili«)
- Preverjanje ločil in presledkov
- Sklanjanje in spregatev: tabele vseh oblik besede (Sloleks 3.1)
- Uporabniški slovar z možnostjo dodajanja besed
- Branje označenega besedila na glas (TTS)
- Predlogi za zamenjavo napačnih besed

---

## Zahteve

- **Node.js** 18+ in **npm** (za lokalni razvoj in gradnjo)
- **Docker** in **Docker Compose** (za uvedbo na strežnik)

---

## Lokalni razvoj

1. Namestite odvisnosti:
   ```bash
   npm install
   ```
2. V enem terminalu zaženite razvojni strežnik (HTTPS na vratih 3000):
   ```bash
   npm run dev-server
   ```
3. V drugem terminalu sideloadajte dodatek v Word (uporabi `office-addin-dev-settings`):
   ```bash
   npm start
   ```
4. Odprite Word in odprite add-in "Črkovalnik".

Odstranitev add-in_a iz Worda: `npm run stop`.

---

## Deploy

### Coolify (gradnja neposredno iz repozitorija)

Coolify sam zgradi sliko iz `Dockerfile` v tem repozitoriju, zato Docker Huba ne potrebujete.

1. **+ New → Application → Public Repository** in vnesite `https://github.com/zanlah/slo-spellcheck-plugin` (za samodejni deploy ob vsakem pushu raje izberite **Private Repository (with GitHub App)**, ki doda webhook).
2. Branch: `master`, **Build Pack: Dockerfile**.
3. **Ports Exposes: `3000`**, v **Domains** vpišite `https://crkovalnik.zanlah.si`.
4. Deploy.

Spremenljivk okolja ni treba nastavljati: zagonska skripta (`docker-entrypoint.sh`) vzame domeno iz Coolifyjeve spremenljivke `COOLIFY_URL` in jo vpiše v `manifest.xml`. Če želite drug naslov, nastavite **BASE_URL**. Coolify sam poskrbi za HTTPS, kontejner pa privzeto streže navaden HTTP (`USE_HTTPS=false`).

Med gradnjo se zaženejo testi (`npm test`); če kateri pade, deploy ne uspe in ostane tekoča prejšnja različica.

### Lokalno z Dockerjem

```bash
cp .env.example .env   # nastavite BASE_URL, PORT, USE_HTTPS
docker compose up --build -d
```

Brez `.env` se add-in zažene na `https://localhost:3000` s samopodpisanim certifikatom. Manifest je nato na voljo na `<BASE_URL>/manifest.xml`; uporabite ga za **sideload** v Wordu ali ga naložite v **Office 365 Admin Center**.

### Slika za drug strežnik

```bash
docker build -t vaše-ime/slo-spellcheck-plugin:latest .
docker push vaše-ime/slo-spellcheck-plugin:latest
docker run -d -p 3000:3000 -e BASE_URL=https://addin.vaša-domena.si vaše-ime/slo-spellcheck-plugin:latest
```

**BASE_URL** se v manifest vstavi ob zagonu, zato ena slika deluje za različne naslove.

---

## Ukazi

| Ukaz                        | Opis                                                                         |
| --------------------------- | ---------------------------------------------------------------------------- |
| `npm run dev-server`        | Zažene webpack dev strežnik (HTTPS, vrata 3000).                             |
| `npm start`                 | Sideloada dodatek v Word (zahteva tekoč dev-server).                         |
| `npm run stop`              | Odstrani sideloadan dodatek iz Worda.                                        |
| `npm run build`             | Production build v mapo `dist/`.                                             |
| `npm test`                  | Zažene teste.                                                                |
| `docker compose up --build` | Zgradi in zažene add-in v Dockerju (uporabi `BASE_URL` in `PORT` iz `.env`). |

---

## Preprosta uporaba črkovalnika (za netehnične uporabnike)

Za hitro namestitev lahko preprosto zaženete naslednji ukaz, ki samodejno nastavi vse potrebno:

```
./install.sh https://crkovalnik.zanlah.si
```

Skripta bo s strežnika prenesla ustrezen manifest.xml, ga shranila v vašo Wordovo mapo ([username]/Library/Containers/com.microsoft.Word/Data/Documents/wef) in nastavila, da Word uporablja moj gostovani črkovalnik. Tako ste pripravljeni na uporabo brez dodatne konfiguracije.

## Vklop črkovalnika v Office 365 na macOS

1. Odprite Word in pojdite v **Home** > **Add-ins**.
2. Pod zavihkom **Developer Add-ins** poiščite "Črkovalnik" z ikono slovenske zastave.
3. Če dodatka ne vidite takoj, zaprite Word in ga ponovno odprite – včasih je treba program znova zagnati, da se novi dodatek prikaže.
4. Kliknite na dodatek, da ga aktivirate in začnete uporabljati Slovenian Spell Checker.

## Licence

Koda add-ina: MIT (glej [LICENSE](LICENSE)).  
Slovar (`src/taskpane/dict/sl.dawg`) je izpeljan iz dveh virov, podrobnosti v [src/taskpane/dict/README.md](src/taskpane/dict/README.md):

- **Sloleks 3.1**: CC BY-SA 4.0, Čibej, J. idr., CJVT UL, http://hdl.handle.net/11356/2080
- **LibreOffice sl_SI (Hunspell)**: GPL-3.0 ALI LGPL-2.1 (vir: [LibreOffice Slovenian Dictionary Pack](https://extensions.libreoffice.org/extensions/slovenian-dictionary-pack/))

## Merjenje natančnosti (korpus Šolar)

Pravila za sklone, števila in predloge so preverjena na razvojnem korpusu [Šolar 3.0](http://hdl.handle.net/11356/1589) (šolski spisi z učiteljskimi popravki; licenca CC BY-NC-SA, zato ni v repozitoriju):

```bash
python3 scripts/eval/solar_extract.py Solar.TEI.zip solar.jsonl
node scripts/eval/solar-eval.mjs solar.jsonl samples.json
```

## Ponovna izdelava slovarja

Datoteka `sl.dawg` je že v repozitoriju. Za ponovno izdelavo (npr. ob novi različici Sloleksa) prenesite `Sloleks.3.1.zip` s [CLARIN.SI](http://hdl.handle.net/11356/2080) in zaženite (potreben je ukaz `unzip`):

```bash
npm run build:dict -- /pot/do/Sloleks.3.1.zip
```
