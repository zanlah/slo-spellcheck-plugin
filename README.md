# Črkovalnik — Word add-in za slovenski pravopis

Dodatek za Microsoft Word (Office 365), ki preverja pravopis v slovenščini in ponuja predloge popravkov. Uporablja slovar iz projekta LibreOffice (Hunspell).

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
4. Odprite Word in odprite nalogo Črkovalnik.

Odstranitev dodataka iz Worda: `npm run stop`.

---

## Uvedba (deploy) z Dockerjem

### 1. Nastavite URL in vrata

Ustvarite datoteko `.env` (npr. iz primera):

```bash
cp .env.example .env
```

Uredite `.env` in nastavite **BASE_URL** na naslov, kjer bo add-in dejansko dostopen (brez poševnice na koncu):

- **Lokalno preizkušanje:** `BASE_URL=https://localhost:3000`
- **Produkcija:** npr. `BASE_URL=https://addin.vaša-domena.si`

Če želite, spremenite tudi **PORT** (vrata na gostitelju, privzeto 3000). Če so vrata 3000 zasedena, v `.env` nastavite npr. **PORT=3001** (in **BASE_URL** ustrezno, npr. `https://localhost:3001`).

**Za Coolify (domena brez vrat, npr. https://crkovalnik.zanlah.si/):**  
V Coolifyu nastavite domeno in navedite, da kontejner posluša na vratih **3000** (kot pri drugih aplikacijah). V `.env` nastavite **BASE_URL=https://crkovalnik.zanlah.si**. Coolifyov proxy poskrbi za HTTPS in certifikat.

### 2. Zaženite (z gradnjo ali s sliko z Docker Huba)

**Gradnja iz izvorne kode (privzeto):**

```bash
docker compose up --build -d
```

**Uporaba že naložene slike z Docker Huba:**  
V `docker-compose.yml` zakomentirajte `build: .` in odkomentirajte vrstico z `image:`. V `.env` nastavite **BASE_URL** in po želji **DOCKER_IMAGE**. Nato:

```bash
docker compose up -d
```

Strežnik servira vsebino add-ina prek HTTPS na vratih, ki jih določa `PORT`. Manifest (`manifest.xml`) se ob zagonu posodobi z vašim `BASE_URL`, tako da Word ve, od kje nalagati taskpane in ikone.

### 3. Pridobite manifest za namestitev

- Če add-in servirate na `https://vaš-strežnik:3000`, manifest prenesite z:
  ```
  https://vaš-strežnik:3000/manifest.xml
  ```
- Shranite ga in ga uporabite za **sideload** v Wordu ali naložite v **Office 365 Admin Center** za razdelitev uporabnikom.

### 4. Namestitev v Wordu (sideload)

V Wordu: **Vstavi** → **Dodatki** → **Moji dodatki** → **Skupna raba mape** (ali **Upravljanje dodatkov** → **Naloži moj dodatek**) in izberite preneseni `manifest.xml`. Dodatek se naloži z vašega `BASE_URL`.

---

## Ukazi

| Ukaz | Opis |
|------|------|
| `npm run dev-server` | Zažene webpack dev strežnik (HTTPS, vrata 3000). |
| `npm start` | Sideloada dodatek v Word (zahteva tekoč dev-server). |
| `npm run stop` | Odstrani sideloadan dodatek iz Worda. |
| `npm run build` | Production build v mapo `dist/`. |
| `docker compose up --build` | Zgradi in zažene add-in v Dockerju (uporabi `BASE_URL` in `PORT` iz `.env`). |

### Nalaganje slike na Docker Hub

Če želite sliko uporabiti drugje brez gradnje, jo zgradite, označite in potisnite:

```bash
docker build -t your-dockerhub-username/word-spellcheck-addin:latest .
docker push your-dockerhub-username/word-spellcheck-addin:latest
```

Na drugem strežniku v `.env` nastavite **BASE_URL** (npr. `https://addin.vaša-domena.si`) in po želji **DOCKER_IMAGE** (npr. `your-dockerhub-username/word-spellcheck-addin:latest`), nato `docker compose up -d`. **BASE_URL** se vstavi v manifest ob zagonu posodovja, zato ena slika deluje za različne naslove.

---

## Licence

Koda add-ina: MIT (glej [LICENSE](LICENSE)).  
Slovenski slovar: GPL-3.0 ALI LGPL-2.1 (vir: [LibreOffice Slovenian Dictionary Pack](https://extensions.libreoffice.org/extensions/slovenian-dictionary-pack/)).
