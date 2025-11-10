# PixelVoxel - Pixel Art Manager

## 🚀 Quick Start

### 1. Install Node.js
Download and install Node.js from https://nodejs.org/ (if you haven't already)

### 2. Install Dependencies
Open PowerShell in this folder and run:
```powershell
npm install
```

### 3. Run the Server
```powershell
npm start
```

The server will start at: **http://localhost:3000**

### 4. Open in Browser
Navigate to: **http://localhost:3000**

The tool will automatically scan and load all PNG files from the `PixelAssets` folder!

---

## 📂 Folder Structure
```
PixelVoxel/
├── PixelAssets/          # Put your pixel art PNG files here
│   ├── subfolder1/       # Subfolders will be auto-detected
│   └── subfolder2/
├── index.html
├── styles.css
├── app.js
├── server.js
└── package.json
```

---

## ✨ Features

### Auto-Loading
- Automatically scans `PixelAssets` folder on startup
- Creates folders based on directory structure
- Detects and downscales x2, x4, x8, x10 images
- Color quantization for smoothed images

### Manual Import
- Import single PNG files
- Import entire folders
- Drag & drop support (coming soon)

### Management
- Organize images in folders
- Filter by color count (2-5, 6-10, 11-15)
- Search by name
- Move images between folders

### Export
- Export x1 (original size)
- Export x10 (scaled up)

---

## ⚙️ Requirements

- **Node.js** 14+ 
- **Image Size**: 16x16 to 32x32 pixels
- **Color Count**: 2-15 colors
- **Format**: PNG only

---

## 🛠️ Development Mode

For auto-restart on file changes:
```powershell
npm run dev
```

---

## 📝 Notes

- All data is saved in browser's LocalStorage
- Server only reads files, doesn't modify them
- Images are processed in the browser for security

---

## 🐛 Troubleshooting

**Images not loading?**
- Make sure `PixelAssets` folder exists
- Check console (F12) for errors
- Verify PNG files are valid

**Server won't start?**
- Check if port 3000 is already in use
- Try: `npm install` again

**Colors look wrong?**
- Try re-exporting your pixel art with "Nearest Neighbor" scaling
- Avoid anti-aliasing when scaling up
