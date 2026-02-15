# 📚 Library Management System v3.0

A complete library/study space management system with cloud sync, built for GitHub Pages deployment.

## ✨ Features

- **Dashboard** — Overview with stats, due students, live clock
- **Student Management** — Add, edit, delete, search, export CSV, photo upload
- **Seat & Hall Management** — Visual seat map with color-coded status
- **Payment Management** — Track payments, discounts, WhatsApp reminders
- **Accounts Summary** — Daily/monthly/yearly collection with password protection
- **Smart Alerts** — Auto-detect overdue students, bulk deactivation
- **Activity Log** — Track all actions
- **Settings** — Shifts, WhatsApp template, QR code, password, backup/restore
- **Cloud Sync** — Firebase Realtime Database with Google sign-in
- **Advanced Calculations** — Fee changes tracking, overpayment detection, precise date math

## 📁 File Structure

```
├── index.html           ← Main entry (loads all scripts)
├── styles.css           ← All CSS styles
├── README.md            ← This file
└── js/
    ├── config.js        ← Constants & default values
    ├── firebase-db.js   ← Firebase cloud database layer
    ├── utils.js         ← Utility functions & financial calculations
    ├── icons.js         ← SVG icon components
    ├── components.js    ← Shared UI (Button, Input, Modal, Card...)
    ├── login.js         ← Login page
    ├── dashboard.js     ← Dashboard page
    ├── students.js      ← Student management page
    ├── seats.js         ← Seat & hall management page
    ├── payments.js      ← Payment management page
    ├── accounts.js      ← Accounts summary page
    ├── alerts.js        ← Smart alerts page
    ├── activity.js      ← Activity log page
    ├── settings.js      ← Settings page
    └── app.js           ← Main app, sidebar, routing (manager file)
```

## 🚀 GitHub Pages Deployment

1. Create a new repository on GitHub
2. Upload all files maintaining the folder structure
3. Go to **Settings** → **Pages**
4. Under "Source", select **Deploy from a branch**
5. Choose `main` branch and `/ (root)` folder
6. Click Save — your site will be live at `https://yourusername.github.io/repo-name/`

## ☁️ Firebase Cloud Storage Setup (FREE)

### Step 1: Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Add Project"** → Name it → Continue → Create

### Step 2: Enable Authentication
1. In Firebase Console → **Build** → **Authentication**
2. Click **"Get Started"**
3. Go to **Sign-in method** tab → Enable **Google**
4. Add your email as support email → Save

### Step 3: Create Realtime Database
1. Go to **Build** → **Realtime Database**
2. Click **"Create Database"**
3. Choose your region → **Start in test mode** → Enable

### Step 4: Get Your Config
1. Go to **Project Settings** (gear icon ⚙️)
2. Scroll down to **"Your apps"** section
3. Click the **Web** button (`</>`)
4. Register your app (any name)
5. Copy the `firebaseConfig` object

### Step 5: Paste Config
Open `js/firebase-db.js` and replace the placeholder:
```javascript
const FIREBASE_CONFIG = {
  apiKey: "YOUR_ACTUAL_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### Step 6: Set Database Rules
Go to **Realtime Database** → **Rules** tab and set:
```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    }
  }
}
```

Now your data is securely stored per Google account!

## 🔧 Default Login

- **Username:** `admin`
- **Password:** `admin123`

Change these in Settings after first login.

## 💡 Usage Without Firebase

The app works perfectly **without** Firebase — all data is stored in browser localStorage. Firebase is optional for cloud sync across devices.

## 📱 Mobile Friendly

Fully responsive design with mobile sidebar menu.
