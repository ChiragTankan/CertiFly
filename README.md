# 🚀 CertiFly — Cosmic Automated Delivery Suite

CertiFly is a premium, high-octane bulk mailing and customized certificate generation engine. Implemented on a lightning-fast React + Vite SPA frontend coupled with an Express backend, and secured via Firebase Firestore, it provides a seamless visual coordinate designer, high-fidelity sandbox dry-runs, and direct SMTP relays for multi-message delivery.

The interface is styled entirely with a **deep galactic slate theme** featuring glowing amethyst-purple and fuchsia borders, neon gradient buttons, and spacious negative space. It feels incredibly premium, lightweight, and modern.

---

## 🛠️ Developer "Who to Touch" Quick Guide

As a beginner developer, here is your cheat sheet. If something looks wrong, has an error, or needs a change, look here first:

### 🧩 If you want to modify...

1. **How the bulk sequence behaves, steps in the wizard, or page structure:**
   * 👉 **File to edit**: `/src/App.tsx`
   * *What's in here*: This is the heart of the application. It manages the multi-step campaign builder (Upload CSV ➔ Column Match ➔ Format Selector ➔ Write Message & Template Layout ➔ Dispatch & Live Stats).
2. **The colors, custom buttons, scrollbars, glowing borders, or fonts:**
   * 👉 **File to edit**: `/src/index.css`
   * *What's in here*: Custom Google fonts loaded (Plus Jakarta Sans, Space Grotesk), custom interactive button style transitions (`glow-on-hover`), custom dark background overrides, and scrollbar layouts.
3. **The interactive Certificate coordinate layout tool (bounding clicks, scale ratios, sizes):**
   * 👉 **File to edit**: `/src/components/CertDesigner.tsx`
   * *What's in here*: Natural resolution canvas, coordinate ratio scaling calculations, responsive sliders, font selection, and center anchors.
4. **How spreadsheet files are opened or read (CSV, TSV, XLS):**
   * 👉 **File to edit**: `/src/components/CSVParser.tsx`
   * *What's in here*: Excel/CSV upload zone, parsing libraries, row extraction logic, and structure indicators.
5. **SMTP connection fields, validation configurations, or storage credentials:**
   * 👉 **File to edit**: `/src/components/SMTPSettings.tsx`
   * *What's in here*: Layout of host/port inputs, TLS toggles, security headers, and browser storage persistence.
6. **How campaign history is queried or deleted:**
   * 👉 **File to edit**: `/src/components/CampaignList.tsx`
   * *What's in here*: Historical query cards, delete functions, and safety filters.
7. **Production backend details or mailer pipelines:**
   * 👉 **File to edit**: `/server.ts`
   * *What's in here*: Production entry point proxying requests, loading template configurations, or handling server-side delivery.

---

## ⚙️ How the Application Works

### 1️⃣ Core Flow Structure
```
[Spreadsheet Upload] ➜ [Column Matcher] ➜ [Format Toggle] ➜ [Visual Designer] ➜ [Live Dispatch Status]
```

* **Step 1: Upload Emails List:** Drag-and-drop or select a sheet `.csv` containing your participant metrics.
* **Step 2: Match Columns:** Tell CertiFly which columns represent "Participant name" and "Participant email" using responsive selectors.
* **Step 3: Choose Email Format:** Choose if you want plain text delivery or if you want to generate high-resolution certificate attachments.
* **Step 4: Write Email Message:** Write your email copy using dynamic parenthesized variables. If certificate generation is enabled, you'll see the integrated **Visual Interactive Canvas Designer** to upload your design and click coordinates instantly.
* **Step 5: Send Campaign:** Send live! Track current transmission rate, elapsed minutes/seconds, delivered counters, and skipped items inside an immersive glowing dispatch telemetry terminal.

---

## 🔒 Private Storage Integration (Firestore Security)

The application communicates directly with Firebase Firestore to persist historical campaigns securely. 

To prevent safety exceptions, CertiFly automatically restricts read/write operations so that creators can only query their respective collections.

### Securing Queries
The campaign retrieval filter uses a custom query clause:
```typescript
query(campaignsRef, where("createdBy", "==", currentUser.uid))
```
This is configured inside `/src/components/CampaignList.tsx` to automatically match Firestore security rules.

---

## 🎨 Theme Details
* **Backgrounds & Rails:** Supercharged `#000000` dark backgrounds and `#05020c` side-cards.
* **Borders & Rules:** Amethyst purple `border-purple-900/40` and translucent fuchsia gradients.
* **Typography:** Display titles use *Space Grotesk* for a tech-forward look; bodies use *Plus Jakarta Sans* for high readability.
* **Primary Interactive Nodes:** Beautiful custom gradients (`bg-gradient-to-r from-purple-600 to-pink-600`) with hover animations and custom dropshadows.

---

## 🚀 Running CertiFly & Deployment

### Quick Checks before running
Verify syntax errors and confirm imports using our validation commands:

```bash
# 1. Inspect syntax & style
npm run lint

# 2. Build production assets (Vite bundle output)
npm run build
```

### Self-Hosted / Vercel Requirements
To deploy to **Vercel** or any cloud platform:
1. Ensure your `.env` contains:
   * `GEMINI_API_KEY`: Secure backend proxy key.
   * `APP_URL`: Your production canonical link.
2. The runtime config in `/vercel.json` already defines production asset routes. No complex configurations are required. Enjoy absolute serverless mailing portability!
