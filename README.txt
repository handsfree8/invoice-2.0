Rose Legacy — Invoice App
=========================

FILES IN THIS FOLDER
---------------------
index.html     → Main page (invoice + estimate)
style.css      → Styles (sidebar, cards, table, responsive)
app.js         → Logic (PDF generation, JSON save/load, totals)
logo.png       → Company logo
vercel.json    → Vercel deployment config

DEPLOY TO VERCEL (3 steps)
---------------------------
Option A — Drag & Drop (easiest, no account needed):
  1. Go to https://vercel.com/new
  2. Click "Browse" and select this entire folder
  3. Click Deploy → Done!

Option B — Via GitHub:
  1. Create a repo on GitHub and upload all these files
  2. Go to https://vercel.com → "Add New Project"
  3. Import your GitHub repo → Deploy

Option C — Vercel CLI:
  1. npm install -g vercel
  2. cd into this folder
  3. Run: vercel
  4. Follow the prompts

IMPORTANT NOTE ABOUT LOGO
--------------------------
The logo.png file must be in the same folder as index.html.
It is referenced as: src="logo.png"

HOW TO USE
----------
- Invoice tab: fill client info, add line items, set tax/discount
- Estimate tab: create ball park estimates with their own PDF
- "Download Invoice PDF" → generates a branded PDF
- "Save JSON" → saves all data to reload later
- "Load JSON" → restores a previously saved invoice
- Notes and Warranty Disclaimer are saved to browser localStorage

FEATURES IMPROVED
-----------------
✓ Sidebar navigation (Invoice / Estimate)
✓ Cleaner card-based layout
✓ Better table UI with inline editing
✓ Separate tax amount, discount amount displayed
✓ Toast notifications (Save, Load, PDF)
✓ Responsive design (mobile-friendly)
✓ Purple-branded PDF headers
✓ Estimate data included in JSON save/load
✓ HTML XSS protection on input values
