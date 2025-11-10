// ===== Data Storage =====
class PixelArtManager {
    constructor() {
        this.images = [];
        this.folders = [
            { id: 'root', name: 'All Images', parent: null }
        ];
        this.selectedImage = null;
        this.selectedImages = []; // Multi-select support
        this.lastSelectedIndex = null; // For shift+click range selection
        this.currentFolder = 'root';
        this.colorFilter = 'all';
        this.sizeFilter = 'all';
        this.paletteMatchFilter = 'all';
        this.searchQuery = '';
        this.sortBy = 'date-new'; // Sort option: name, date-new, date-old, size, colors, ready
        this.masterPalette = [];
        this.loadedPalette = [];
        this.paletteColorNames = new Map(); // Map hex to color name
        
        this.loadFromStorage();
        this.loadMasterPalette();
    }

    // Load master palette from storage or try to fetch from file
    async loadMasterPalette() {
        const stored = localStorage.getItem('pixelVoxelMasterPalette');
        const storedNames = localStorage.getItem('pixelVoxelPaletteNames');
        
        if (stored && storedNames) {
            this.loadedPalette = JSON.parse(stored);
            this.paletteColorNames = new Map(JSON.parse(storedNames));
        } else {
            // Try to auto-load master-palette.txt
            try {
                const response = await fetch('/master-palette.txt');
                if (response.ok) {
                    const text = await response.text();
                    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
                    
                    this.loadedPalette = [];
                    this.paletteColorNames.clear();
                    
                    for (const line of lines) {
                        const parts = line.split(/\s+/);
                        if (parts.length >= 2) {
                            const name = parts[0];
                            const hex = parts[1].toUpperCase();
                            this.loadedPalette.push(hex);
                            this.paletteColorNames.set(hex, name);
                        }
                    }
                    
                    localStorage.setItem('pixelVoxelMasterPalette', JSON.stringify(this.loadedPalette));
                    localStorage.setItem('pixelVoxelPaletteNames', JSON.stringify([...this.paletteColorNames]));
                    console.log(`✅ Auto-loaded ${this.loadedPalette.length} colors with names from master-palette.txt`);
                }
            } catch (err) {
                console.log('Master palette not found, you can load it manually');
            }
        }
    }

    // Load data from localStorage
    loadFromStorage() {
        const stored = localStorage.getItem('pixelVoxelData');
        if (stored) {
            const data = JSON.parse(stored);
            this.images = data.images || [];
            
            // Convert colorMap from object back to Map
            this.images.forEach(img => {
                if (img.colorMap && typeof img.colorMap === 'object' && !img.colorMap instanceof Map) {
                    img.colorMap = new Map(Object.entries(img.colorMap));
                }
            });
            
            this.folders = data.folders || this.folders;
            this.masterPalette = data.masterPalette || [];
        }
    }

    // Save data to localStorage
    saveToStorage() {
        // Convert colorMap from Map to object for JSON serialization
        const imagesToSave = this.images.map(img => ({
            ...img,
            colorMap: img.colorMap instanceof Map ? Object.fromEntries(img.colorMap) : img.colorMap
        }));
        
        const data = {
            images: imagesToSave,
            folders: this.folders,
            masterPalette: this.masterPalette
        };
        localStorage.setItem('pixelVoxelData', JSON.stringify(data));
    }

    // Add new image
    addImage(imageData) {
        const id = Date.now() + Math.random();
        
        // Convert colorMap to Map if it's an object
        let colorMap = imageData.colorMap || new Map();
        if (colorMap && typeof colorMap === 'object' && !(colorMap instanceof Map)) {
            colorMap = new Map(Object.entries(colorMap));
        }
        
        const image = {
            id,
            name: imageData.name,
            dataUrl: imageData.dataUrl,
            width: imageData.width,
            height: imageData.height,
            colors: imageData.colors,
            colorCount: imageData.colors.length,
            palette: imageData.colors,
            colorMap: colorMap, // Store pixel count per color
            folder: this.currentFolder,
            createdAt: new Date().toISOString()
        };
        
        this.images.push(image);
        this.updateMasterPalette(imageData.colors);
        this.saveToStorage();
        return image;
    }

    // Update master palette with new colors
    updateMasterPalette(colors) {
        colors.forEach(color => {
            if (!this.masterPalette.includes(color)) {
                this.masterPalette.push(color);
            }
        });
        this.saveToStorage();
    }

    // Get images for current view
    getFilteredImages() {
        let filtered = this.images;

        // Filter by folder
        if (this.currentFolder !== 'root') {
            filtered = filtered.filter(img => img.folder === this.currentFolder);
        }

        // Filter by color count
        if (this.colorFilter !== 'all') {
            const colorNum = parseInt(this.colorFilter);
            filtered = filtered.filter(img => img.colorCount === colorNum);
        }

        // Filter by size
        if (this.sizeFilter !== 'all') {
            const [w, h] = this.sizeFilter.split('x').map(Number);
            filtered = filtered.filter(img => img.width === w && img.height === h);
        }

        // Filter by palette match
        if (this.paletteMatchFilter !== 'all' && this.loadedPalette.length > 0) {
            filtered = filtered.filter(img => {
                const matchScore = this.calculatePaletteMatch(img.palette);
                if (this.paletteMatchFilter === 'exact') {
                    return matchScore === 100;
                } else if (this.paletteMatchFilter === 'similar') {
                    return matchScore >= 70 && matchScore < 100;
                } else if (this.paletteMatchFilter === 'different') {
                    return matchScore < 70;
                }
                return true;
            });
        }

        // Filter by search
        if (this.searchQuery) {
            const query = this.searchQuery.toLowerCase();
            filtered = filtered.filter(img => 
                img.name.toLowerCase().includes(query)
            );
        }

        // Sort
        switch (this.sortBy) {
            case 'name':
                filtered.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'date-new':
                filtered.sort((a, b) => b.id - a.id);
                break;
            case 'date-old':
                filtered.sort((a, b) => a.id - b.id);
                break;
            case 'size':
                filtered.sort((a, b) => (b.width * b.height) - (a.width * a.height));
                break;
            case 'colors':
                filtered.sort((a, b) => b.colorCount - a.colorCount);
                break;
            case 'ready':
                filtered.sort((a, b) => {
                    const aReady = this.isReadyToDev(a) ? 1 : 0;
                    const bReady = this.isReadyToDev(b) ? 1 : 0;
                    return bReady - aReady; // Ready items first
                });
                break;
        }

        return filtered;
    }

    // Calculate how well an image's palette matches the master palette (0-100%)
    calculatePaletteMatch(imagePalette) {
        if (this.loadedPalette.length === 0) return 0;
        
        let matches = 0;
        for (const color of imagePalette) {
            // Check exact match
            if (this.loadedPalette.includes(color.toUpperCase())) {
                matches++;
            } else {
                // Check similar colors (within threshold)
                const imgRgb = hexToRgb(color);
                const hasSimilar = this.loadedPalette.some(paletteColor => {
                    const palRgb = hexToRgb(paletteColor);
                    return colorDistance(imgRgb, palRgb) < 20;
                });
                if (hasSimilar) matches++;
            }
        }
        
        return Math.round((matches / imagePalette.length) * 100);
    }

    // Check if image is ready to dev (all pixel counts divisible by 10)
    isReadyToDev(img) {
        if (!img.colorMap || (img.colorMap instanceof Map && img.colorMap.size === 0)) {
            return false;
        }
        
        let colorMap = img.colorMap;
        
        // Ensure colorMap is a Map
        if (colorMap && typeof colorMap === 'object' && !(colorMap instanceof Map)) {
            colorMap = new Map(Object.entries(colorMap));
        }
        
        // Check if all pixel counts are divisible by 10
        for (const [color, count] of colorMap.entries()) {
            if (count % 10 !== 0) {
                return false;
            }
        }
        
        return colorMap.size > 0; // Must have at least one color
    }

    // Add new folder
    addFolder(name, parent = null) {
        const id = Date.now() + Math.random();
        const folder = { id, name, parent };
        this.folders.push(folder);
        this.saveToStorage();
        return folder;
    }

    // Move image to folder
    moveImage(imageId, folderId) {
        const image = this.images.find(img => img.id === imageId);
        if (image) {
            image.folder = folderId;
            this.saveToStorage();
        }
    }

    // Delete image
    deleteImage(imageId) {
        this.images = this.images.filter(img => img.id !== imageId);
        this.saveToStorage();
    }

    // Get folder by id
    getFolder(id) {
        return this.folders.find(f => f.id === id);
    }

    // Get image count for folder
    getFolderCount(folderId) {
        if (folderId === 'root') {
            return this.images.length;
        }
        return this.images.filter(img => img.folder === folderId).length;
    }
}

// ===== Color Analysis =====
function analyzeImage(imageElement, quantize = false, threshold = 30) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = imageElement.width;
        canvas.height = imageElement.height;
        ctx.drawImage(imageElement, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        const colorMap = new Map(); // Map of color -> pixel count
        
        // Extract colors with frequency
        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const a = pixels[i + 3];
            
            // Skip transparent pixels
            if (a < 128) continue;
            
            const hex = rgbToHex(r, g, b);
            colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
        }
        
        let colors = Array.from(colorMap.keys());
        
        // If too many colors and quantize is enabled, merge similar colors
        if (quantize && colors.length > 15) {
            colors = quantizeColors(colorMap, threshold);
        }
        
        resolve({
            width: canvas.width,
            height: canvas.height,
            colors: colors,
            colorMap: colorMap, // Include pixel counts for each color
            originalColorCount: colorMap.size
        });
    });
}

// Quantize colors by merging similar ones
function quantizeColors(colorMap, threshold) {
    const colors = Array.from(colorMap.entries())
        .sort((a, b) => b[1] - a[1]); // Sort by frequency
    
    const palette = [];
    const used = new Set();
    
    for (const [color, count] of colors) {
        if (used.has(color)) continue;
        
        // Find similar colors and merge
        const rgb = hexToRgb(color);
        const similar = [color];
        
        for (const [otherColor] of colors) {
            if (used.has(otherColor) || color === otherColor) continue;
            
            const otherRgb = hexToRgb(otherColor);
            const distance = colorDistance(rgb, otherRgb);
            
            if (distance < threshold) {
                similar.push(otherColor);
                used.add(otherColor);
            }
        }
        
        palette.push(color);
        used.add(color);
        
        if (palette.length >= 15) break;
    }
    
    return palette;
}

// Calculate color distance (Euclidean)
function colorDistance(rgb1, rgb2) {
    return Math.sqrt(
        Math.pow(rgb1.r - rgb2.r, 2) +
        Math.pow(rgb1.g - rgb2.g, 2) +
        Math.pow(rgb1.b - rgb2.b, 2)
    );
}

// Convert HEX to RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

// Convert RGB to HEX
function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

// ===== UI Controller =====
class UIController {
    constructor(manager) {
        this.manager = manager;
        this.initElements();
        this.attachEventListeners();
        this.autoLoadFromServer();
    }

    initElements() {
        // Buttons
        this.importBtn = document.getElementById('importBtn');
        this.importFolderBtn = document.getElementById('importFolderBtn');
        this.loadPaletteBtn = document.getElementById('loadPaletteBtn');
        this.fileInput = document.getElementById('fileInput');
        this.folderInput = document.getElementById('folderInput');
        this.paletteInput = document.getElementById('paletteInput');
        this.newFolderBtn = document.getElementById('newFolderBtn');
        
        // Containers
        this.galleryGrid = document.getElementById('galleryGrid');
        this.foldersTree = document.getElementById('foldersTree');
        this.previewSection = document.getElementById('previewSection');
        this.infoSection = document.getElementById('infoSection');
        this.sizeFilterButtons = document.getElementById('sizeFilterButtons');
        this.masterPaletteDisplay = document.getElementById('masterPaletteDisplay');
        
        // Status bar elements
        this.statusImage = document.getElementById('statusImage');
        this.statusSize = document.getElementById('statusSize');
        this.statusColors = document.getElementById('statusColors');
        this.statusColorSwatch = document.getElementById('statusColorSwatch');
        this.statusColorName = document.getElementById('statusColorName');
        this.statusColorHex = document.getElementById('statusColorHex');
        this.statusMatch = document.getElementById('statusMatch');
        
        // Info elements
        this.galleryTitle = document.getElementById('galleryTitle');
        this.galleryCount = document.getElementById('galleryCount');
        this.thumbnailSize = document.getElementById('thumbnailSize');
        this.sizeLabel = document.getElementById('sizeLabel');
        
        // Modals
        this.folderModal = document.getElementById('folderModal');
        this.moveModal = document.getElementById('moveModal');
        this.colorEditorModal = document.getElementById('colorEditorModal');
        
        // Color editor elements
        this.colorEditorCanvas = document.getElementById('colorEditorCanvas');
        this.colorEditorPalette = document.getElementById('colorEditorPalette');
        this.replaceFromSwatch = document.getElementById('replaceFromSwatch');
        this.replaceFromHex = document.getElementById('replaceFromHex');
        this.replaceToColor = document.getElementById('replaceToColor');
        this.replaceToHex = document.getElementById('replaceToHex');
        this.replaceColorBtn = document.getElementById('replaceColorBtn');
        this.masterPaletteQuick = document.getElementById('masterPaletteQuick');
        
        // Color editor state
        this.selectedColorToReplace = null;
        this.currentEditingImageData = null;
        
        // Pixel editor reference
        this.pixelEditor = null;
    }

    attachEventListeners() {
        // Import button
        this.importBtn.addEventListener('click', () => {
            this.fileInput.click();
        });

        // Import folder button
        this.importFolderBtn.addEventListener('click', () => {
            this.folderInput.click();
        });

        // Load palette button
        this.loadPaletteBtn.addEventListener('click', () => {
            this.paletteInput.click();
        });

        // File input
        this.fileInput.addEventListener('change', (e) => {
            this.handleFileImport(e.target.files);
        });

        // Folder input
        this.folderInput.addEventListener('change', (e) => {
            this.handleFolderImport(e.target.files);
        });

        // Palette input
        this.paletteInput.addEventListener('change', (e) => {
            this.handlePaletteImport(e.target.files[0]);
        });

        // New folder button
        this.newFolderBtn.addEventListener('click', () => {
            this.showFolderModal();
        });

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => 
                    b.classList.remove('active')
                );
                e.target.classList.add('active');
                this.manager.colorFilter = e.target.dataset.filter;
                this.renderGallery();
            });
        });

        // Palette match buttons
        document.querySelectorAll('.match-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.match-btn').forEach(b => 
                    b.classList.remove('active')
                );
                e.target.classList.add('active');
                this.manager.paletteMatchFilter = e.target.dataset.match;
                this.renderGallery();
            });
        });

        // Search input
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.manager.searchQuery = e.target.value;
            this.renderGallery();
        });

        // Thumbnail size slider
        this.thumbnailSize.addEventListener('input', (e) => {
            const size = e.target.value;
            this.sizeLabel.textContent = size + 'px';
            this.galleryGrid.style.gridTemplateColumns = 
                `repeat(auto-fill, minmax(${size}px, 1fr))`;
        });

        // Sort by select
        document.getElementById('sortBySelect').addEventListener('change', (e) => {
            this.manager.sortBy = e.target.value;
            this.renderGallery();
        });

        // Folder modal buttons
        document.getElementById('createFolderBtn').addEventListener('click', async () => {
            const name = document.getElementById('folderNameInput').value.trim();
            if (name) {
                await this.createFolderOnServer(name);
                this.manager.addFolder(name);
                this.render();
                this.hideFolderModal();
            }
        });

        document.getElementById('cancelFolderBtn').addEventListener('click', () => {
            this.hideFolderModal();
        });

        // Action buttons
        document.getElementById('exportX1Btn').addEventListener('click', () => {
            this.exportImage(1);
        });

        document.getElementById('exportX10Btn').addEventListener('click', () => {
            this.exportImage(10);
        });

        document.getElementById('moveToFolderBtn').addEventListener('click', () => {
            this.showMoveModal();
        });

        document.getElementById('deleteBtn').addEventListener('click', async () => {
            // Multi-select delete
            if (this.manager.selectedImages.length > 0) {
                if (confirm(`Delete ${this.manager.selectedImages.length} images? This will delete the actual files from disk.`)) {
                    for (const imageId of this.manager.selectedImages) {
                        const img = this.manager.images.find(i => i.id === imageId);
                        if (img) {
                            await this.deleteImageFromServer(img);
                            this.manager.deleteImage(imageId);
                        }
                    }
                    this.manager.selectedImages = [];
                    this.render();
                }
            }
            // Single image delete
            else if (this.manager.selectedImage && confirm('Delete this image? This will delete the actual file from disk.')) {
                await this.deleteImageFromServer(this.manager.selectedImage);
                this.manager.deleteImage(this.manager.selectedImage.id);
                this.manager.selectedImage = null;
                this.render();
            }
        });

        // Move modal buttons
        document.getElementById('confirmMoveBtn').addEventListener('click', async () => {
            const selectedFolder = document.querySelector('.folder-list-item.selected');
            if (!selectedFolder) return;
            
            const targetFolderId = selectedFolder.dataset.folderId;
            
            // Multi-select move
            if (this.manager.selectedImages.length > 0) {
                for (const imageId of this.manager.selectedImages) {
                    const img = this.manager.images.find(i => i.id === imageId);
                    if (img) {
                        await this.moveImageOnServer(img, targetFolderId);
                        this.manager.moveImage(imageId, targetFolderId);
                    }
                }
                this.manager.selectedImages = [];
                document.getElementById('confirmMoveBtn').textContent = 'Move';
                this.render();
                this.hideMoveModal();
            }
            // Single image move
            else if (this.manager.selectedImage) {
                await this.moveImageOnServer(this.manager.selectedImage, targetFolderId);
                this.manager.moveImage(this.manager.selectedImage.id, targetFolderId);
                this.render();
                this.hideMoveModal();
            }
        });

        document.getElementById('cancelMoveBtn').addEventListener('click', () => {
            this.hideMoveModal();
        });

        // Redraw button
        document.getElementById('redrawBtn').addEventListener('click', () => {
            if (this.manager.selectedImage) {
                this.showPixelEditor();
            }
        });

        // Edit colors button
        document.getElementById('editColorsBtn').addEventListener('click', () => {
            if (this.manager.selectedImage) {
                this.showColorEditor();
            }
        });

        // Color editor controls
        this.replaceToColor.addEventListener('input', (e) => {
            this.replaceToHex.textContent = e.target.value.toUpperCase();
        });

        document.getElementById('replaceColorBtn').addEventListener('click', () => {
            this.replaceColor();
        });

        document.getElementById('saveColorsBtn').addEventListener('click', () => {
            this.saveEditedImage();
        });

        document.getElementById('cancelColorEditBtn').addEventListener('click', () => {
            this.hideColorEditor();
        });
        
        // Multi-select controls
        document.getElementById('selectAllBtn').addEventListener('click', () => {
            const images = this.manager.getFilteredImages();
            this.manager.selectedImages = images.map(img => img.id);
            this.renderGallery();
            this.renderPreview(); // Update preview for multi-select
        });
        
        document.getElementById('deselectAllBtn').addEventListener('click', () => {
            this.manager.selectedImages = [];
            this.renderGallery();
            this.renderPreview(); // Clear multi-preview
        });
        
        document.getElementById('deleteSelectedBtn').addEventListener('click', async () => {
            if (this.manager.selectedImages.length === 0) return;
            
            if (confirm(`Delete ${this.manager.selectedImages.length} images? This will delete the actual files from disk.`)) {
                for (const imageId of this.manager.selectedImages) {
                    const img = this.manager.images.find(i => i.id === imageId);
                    if (img) {
                        await this.deleteImageFromServer(img);
                        this.manager.deleteImage(imageId);
                    }
                }
                this.manager.selectedImages = [];
                this.render();
            }
        });
        
        document.getElementById('moveSelectedBtn').addEventListener('click', () => {
            if (this.manager.selectedImages.length === 0) return;
            this.showMultiMoveModal();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+A for select all (when not in input field)
            if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                const images = this.manager.getFilteredImages();
                this.manager.selectedImages = images.map(img => img.id);
                this.renderGallery();
                this.renderPreview(); // Update preview for multi-select
            }
            
            // Escape to deselect all
            if (e.key === 'Escape' && this.manager.selectedImages.length > 0) {
                this.manager.selectedImages = [];
                this.renderGallery();
                this.renderPreview(); // Clear multi-preview
            }
        });
    }

    async handleFileImport(files) {
        const fileArray = Array.from(files);
        
        for (const file of fileArray) {
            if (!file.type.match('image/png')) continue;
            
            const dataUrl = await this.readFileAsDataURL(file);
            const img = new Image();
            
            img.onload = async () => {
                let width = img.width;
                let height = img.height;
                let scaledDataUrl = dataUrl;
                let detectedScale = 1;

                // Auto-detect if image is scaled (x2, x4, x8, x10, etc.)
                // Check if dimensions are multiples and result would be in valid range
                const possibleScales = [10, 8, 4, 2];
                for (const scale of possibleScales) {
                    const originalW = width / scale;
                    const originalH = height / scale;
                    
                    // Check if it divides evenly and results in valid pixel art size
                    if (Number.isInteger(originalW) && Number.isInteger(originalH) &&
                        originalW >= 16 && originalW <= 32 &&
                        originalH >= 16 && originalH <= 32) {
                        
                        // Hard edge downscaling - sample exact pixels
                        const sourceCanvas = document.createElement('canvas');
                        const sourceCtx = sourceCanvas.getContext('2d');
                        sourceCanvas.width = width;
                        sourceCanvas.height = height;
                        sourceCtx.drawImage(img, 0, 0);
                        const sourceData = sourceCtx.getImageData(0, 0, width, height);
                        
                        const destCanvas = document.createElement('canvas');
                        const destCtx = destCanvas.getContext('2d');
                        destCanvas.width = originalW;
                        destCanvas.height = originalH;
                        const destData = destCtx.createImageData(originalW, originalH);
                        
                        // Sample center pixel of each scaled block
                        for (let y = 0; y < originalH; y++) {
                            for (let x = 0; x < originalW; x++) {
                                // Get center pixel of the scaled block
                                const sourceX = Math.floor(x * scale + scale / 2);
                                const sourceY = Math.floor(y * scale + scale / 2);
                                const sourceIdx = (sourceY * width + sourceX) * 4;
                                const destIdx = (y * originalW + x) * 4;
                                
                                destData.data[destIdx] = sourceData.data[sourceIdx];
                                destData.data[destIdx + 1] = sourceData.data[sourceIdx + 1];
                                destData.data[destIdx + 2] = sourceData.data[sourceIdx + 2];
                                destData.data[destIdx + 3] = sourceData.data[sourceIdx + 3];
                            }
                        }
                        
                        destCtx.putImageData(destData, 0, 0);
                        scaledDataUrl = destCanvas.toDataURL('image/png');
                        width = originalW;
                        height = originalH;
                        detectedScale = scale;
                        
                        console.log(`Detected x${scale} scaled image, hard-edge downscaled to ${width}x${height}`);
                        break;
                    }
                }

                // Validate size after scaling detection (16-32px)
                if (width < 16 || width > 32 || height < 16 || height > 32) {
                    alert(`Image ${file.name} size must be between 16x16 and 32x32 pixels. Current: ${width}x${height}. Could not auto-scale.`);
                    return;
                }

                // Create temp image for analysis with corrected size
                const analyzeImg = new Image();
                analyzeImg.onload = async () => {
                    // Use quantization if image was scaled (likely has smoothing artifacts)
                    const analysis = await analyzeImage(analyzeImg, detectedScale > 1, 30);
                    
                    console.log(`Original colors: ${analysis.originalColorCount}, After quantization: ${analysis.colors.length}`);
                    
                    // Validate color count (2-15)
                    if (analysis.colors.length < 2 || analysis.colors.length > 15) {
                        alert(`Image ${file.name} must have 2-15 colors. Found: ${analysis.colors.length} (original: ${analysis.originalColorCount})`);
                        return;
                    }

                    // Clean up filename if it has scale suffix
                    let cleanName = file.name;
                    if (detectedScale > 1) {
                        cleanName = file.name.replace(/_x\d+/gi, '');
                    }

                    this.manager.addImage({
                        name: cleanName,
                        dataUrl: scaledDataUrl,
                        width: analysis.width,
                        height: analysis.height,
                        colors: analysis.colors,
                        colorMap: analysis.colorMap
                    });

                    this.render();
                };
                analyzeImg.src = scaledDataUrl;
            };

            img.src = dataUrl;
        }

        this.fileInput.value = '';
    }

    async handleFolderImport(files) {
        const fileArray = Array.from(files);
        const pngFiles = fileArray.filter(file => file.type.match('image/png'));
        
        if (pngFiles.length === 0) {
            alert('No PNG files found in the selected folder!');
            return;
        }

        console.log(`Found ${pngFiles.length} PNG files. Processing...`);
        
        // Create folder structure based on file paths
        const folderMap = new Map();
        
        for (const file of pngFiles) {
            const path = file.webkitRelativePath || file.name;
            const pathParts = path.split('/');
            
            // Skip if file is in root
            if (pathParts.length > 1) {
                const folderPath = pathParts.slice(0, -1).join('/');
                if (!folderMap.has(folderPath)) {
                    // Create folder if not exists
                    const folderName = pathParts[pathParts.length - 2];
                    const existingFolder = this.manager.folders.find(f => f.name === folderName);
                    
                    if (!existingFolder) {
                        const newFolder = this.manager.addFolder(folderName);
                        folderMap.set(folderPath, newFolder.id);
                    } else {
                        folderMap.set(folderPath, existingFolder.id);
                    }
                }
            }
        }

        // Process each file
        let processed = 0;
        let skipped = 0;
        
        for (const file of pngFiles) {
            try {
                const path = file.webkitRelativePath || file.name;
                const pathParts = path.split('/');
                const folderPath = pathParts.slice(0, -1).join('/');
                const targetFolder = folderMap.get(folderPath) || 'root';
                
                const dataUrl = await this.readFileAsDataURL(file);
                const img = new Image();
                
                await new Promise((resolve) => {
                    img.onload = async () => {
                        try {
                            let width = img.width;
                            let height = img.height;
                            let scaledDataUrl = dataUrl;
                            let detectedScale = 1;

                            // Auto-detect if image is scaled
                            const possibleScales = [10, 8, 4, 2];
                            for (const scale of possibleScales) {
                                const originalW = width / scale;
                                const originalH = height / scale;
                                
                                if (Number.isInteger(originalW) && Number.isInteger(originalH) &&
                                    originalW >= 16 && originalW <= 32 &&
                                    originalH >= 16 && originalH <= 32) {
                                    
                                    // Hard edge downscaling
                                    const sourceCanvas = document.createElement('canvas');
                                    const sourceCtx = sourceCanvas.getContext('2d');
                                    sourceCanvas.width = width;
                                    sourceCanvas.height = height;
                                    sourceCtx.drawImage(img, 0, 0);
                                    const sourceData = sourceCtx.getImageData(0, 0, width, height);
                                    
                                    const destCanvas = document.createElement('canvas');
                                    const destCtx = destCanvas.getContext('2d');
                                    destCanvas.width = originalW;
                                    destCanvas.height = originalH;
                                    const destData = destCtx.createImageData(originalW, originalH);
                                    
                                    for (let y = 0; y < originalH; y++) {
                                        for (let x = 0; x < originalW; x++) {
                                            const sourceX = Math.floor(x * scale + scale / 2);
                                            const sourceY = Math.floor(y * scale + scale / 2);
                                            const sourceIdx = (sourceY * width + sourceX) * 4;
                                            const destIdx = (y * originalW + x) * 4;
                                            
                                            destData.data[destIdx] = sourceData.data[sourceIdx];
                                            destData.data[destIdx + 1] = sourceData.data[sourceIdx + 1];
                                            destData.data[destIdx + 2] = sourceData.data[sourceIdx + 2];
                                            destData.data[destIdx + 3] = sourceData.data[sourceIdx + 3];
                                        }
                                    }
                                    
                                    destCtx.putImageData(destData, 0, 0);
                                    scaledDataUrl = destCanvas.toDataURL('image/png');
                                    width = originalW;
                                    height = originalH;
                                    detectedScale = scale;
                                    break;
                                }
                            }

                            // Skip if size is invalid
                            if (width < 16 || width > 32 || height < 16 || height > 32) {
                                console.warn(`Skipped ${file.name}: Invalid size ${width}x${height}`);
                                skipped++;
                                resolve();
                                return;
                            }

                            const analyzeImg = new Image();
                            analyzeImg.onload = async () => {
                                const analysis = await analyzeImage(analyzeImg, detectedScale > 1, 30);
                                
                                // Skip if color count is invalid
                                if (analysis.colors.length < 2 || analysis.colors.length > 15) {
                                    console.warn(`Skipped ${file.name}: Invalid colors ${analysis.colors.length}`);
                                    skipped++;
                                    resolve();
                                    return;
                                }

                                let cleanName = file.name;
                                if (detectedScale > 1) {
                                    cleanName = file.name.replace(/_x\d+/gi, '');
                                }

                                // Save to specific folder
                                const prevFolder = this.manager.currentFolder;
                                this.manager.currentFolder = targetFolder;
                                
                                this.manager.addImage({
                                    name: cleanName,
                                    dataUrl: scaledDataUrl,
                                    width: analysis.width,
                                    height: analysis.height,
                                    colors: analysis.colors,
                                    colorMap: analysis.colorMap
                                });

                                this.manager.currentFolder = prevFolder;
                                processed++;
                                resolve();
                            };
                            analyzeImg.src = scaledDataUrl;
                        } catch (err) {
                            console.error(`Error processing ${file.name}:`, err);
                            skipped++;
                            resolve();
                        }
                    };
                    
                    img.onerror = () => {
                        console.error(`Failed to load ${file.name}`);
                        skipped++;
                        resolve();
                    };
                    
                    img.src = dataUrl;
                });
            } catch (err) {
                console.error(`Error reading ${file.name}:`, err);
                skipped++;
            }
        }

        this.render();
        this.folderInput.value = '';
        
        alert(`Import complete!\nProcessed: ${processed}\nSkipped: ${skipped}`);
    }

    async autoLoadFromServer() {
        try {
            console.log('🔍 Checking for PixelAssets folder...');
            
            const response = await fetch('/api/images');
            const data = await response.json();
            
            if (!data.success || data.images.length === 0) {
                console.log('No images found in PixelAssets folder');
                this.render();
                return;
            }
            
            console.log(`📂 Found ${data.count} images in PixelAssets. Auto-loading...`);
            
            // Create folder structure
            const folderMap = new Map();
            folderMap.set('', 'root');
            
            for (const imageData of data.images) {
                if (imageData.folder) {
                    if (!folderMap.has(imageData.folder)) {
                        const folderName = imageData.folder.split('/').pop() || imageData.folder;
                        const existingFolder = this.manager.folders.find(f => f.name === folderName);
                        
                        if (!existingFolder) {
                            const newFolder = this.manager.addFolder(folderName);
                            folderMap.set(imageData.folder, newFolder.id);
                        } else {
                            folderMap.set(imageData.folder, existingFolder.id);
                        }
                    }
                }
            }
            
            // Process images
            let processed = 0;
            let skipped = 0;
            const skipReasons = {
                duplicate: 0,
                invalidSize: 0,
                invalidColors: 0,
                loadError: 0,
                other: 0
            };
            
            for (const imageData of data.images) {
                try {
                    const targetFolder = folderMap.get(imageData.folder) || 'root';
                    
                    // Check if already imported
                    const existing = this.manager.images.find(img => img.name === imageData.name);
                    if (existing) {
                        skipReasons.duplicate++;
                        skipped++;
                        continue;
                    }
                    
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    
                    await new Promise((resolve) => {
                        img.onload = async () => {
                            try {
                                let width = img.width;
                                let height = img.height;
                                let detectedScale = 1;
                                let canvas = document.createElement('canvas');
                                let ctx = canvas.getContext('2d');
                                
                                // Auto-detect scale
                                const possibleScales = [10, 8, 4, 2];
                                for (const scale of possibleScales) {
                                    const originalW = width / scale;
                                    const originalH = height / scale;
                                    
                                    if (Number.isInteger(originalW) && Number.isInteger(originalH) &&
                                        originalW >= 16 && originalW <= 32 &&
                                        originalH >= 16 && originalH <= 32) {
                                        
                                        // Hard edge downscaling
                                        const sourceCanvas = document.createElement('canvas');
                                        const sourceCtx = sourceCanvas.getContext('2d');
                                        sourceCanvas.width = width;
                                        sourceCanvas.height = height;
                                        sourceCtx.drawImage(img, 0, 0);
                                        const sourceData = sourceCtx.getImageData(0, 0, width, height);
                                        
                                        canvas.width = originalW;
                                        canvas.height = originalH;
                                        const destData = ctx.createImageData(originalW, originalH);
                                        
                                        for (let y = 0; y < originalH; y++) {
                                            for (let x = 0; x < originalW; x++) {
                                                const sourceX = Math.floor(x * scale + scale / 2);
                                                const sourceY = Math.floor(y * scale + scale / 2);
                                                const sourceIdx = (sourceY * width + sourceX) * 4;
                                                const destIdx = (y * originalW + x) * 4;
                                                
                                                destData.data[destIdx] = sourceData.data[sourceIdx];
                                                destData.data[destIdx + 1] = sourceData.data[sourceIdx + 1];
                                                destData.data[destIdx + 2] = sourceData.data[sourceIdx + 2];
                                                destData.data[destIdx + 3] = sourceData.data[sourceIdx + 3];
                                            }
                                        }
                                        
                                        ctx.putImageData(destData, 0, 0);
                                        width = originalW;
                                        height = originalH;
                                        detectedScale = scale;
                                        break;
                                    }
                                }
                                
                                // If no downscaling needed, just draw original
                                if (detectedScale === 1) {
                                    canvas.width = width;
                                    canvas.height = height;
                                    ctx.drawImage(img, 0, 0);
                                }
                                
                                // Validate size
                                if (width < 16 || width > 32 || height < 16 || height > 32) {
                                    console.warn(`❌ Skipped ${imageData.name}: Size ${width}x${height} (must be 16-32px)`);
                                    skipReasons.invalidSize++;
                                    skipped++;
                                    resolve();
                                    return;
                                }
                                
                                const dataUrl = canvas.toDataURL('image/png');
                                const analyzeImg = new Image();
                                
                                analyzeImg.onload = async () => {
                                    const analysis = await analyzeImage(analyzeImg, detectedScale > 1, 30);
                                    
                                    if (analysis.colors.length < 2 || analysis.colors.length > 15) {
                                        console.warn(`❌ Skipped ${imageData.name}: ${analysis.colors.length} colors (must be 2-15)`);
                                        skipReasons.invalidColors++;
                                        skipped++;
                                        resolve();
                                        return;
                                    }
                                    
                                    let cleanName = imageData.name;
                                    if (detectedScale > 1) {
                                        cleanName = imageData.name.replace(/_x\d+/gi, '');
                                    }
                                    
                                    const prevFolder = this.manager.currentFolder;
                                    this.manager.currentFolder = targetFolder;
                                    
                                    this.manager.addImage({
                                        name: cleanName,
                                        dataUrl: dataUrl,
                                        width: analysis.width,
                                        height: analysis.height,
                                        colors: analysis.colors,
                                        colorMap: analysis.colorMap
                                    });
                                    
                                    this.manager.currentFolder = prevFolder;
                                    processed++;
                                    
                                    // Update UI periodically
                                    if (processed % 10 === 0) {
                                        console.log(`⏳ Progress: ${processed}/${data.count} processed...`);
                                        this.render();
                                    }
                                    
                                    resolve();
                                };
                                
                                analyzeImg.src = dataUrl;
                                
                            } catch (err) {
                                console.error(`❌ Error processing ${imageData.name}:`, err);
                                skipReasons.other++;
                                skipped++;
                                resolve();
                            }
                        };
                        
                        img.onerror = () => {
                            console.error(`❌ Failed to load ${imageData.name}`);
                            skipReasons.loadError++;
                            skipped++;
                            resolve();
                        };
                        
                        img.src = imageData.url;
                    });
                    
                } catch (err) {
                    console.error(`❌ Error with ${imageData.name}:`, err);
                    skipReasons.other++;
                    skipped++;
                }
            }
            
            this.render();
            
            console.log(`\n✅ Auto-load complete!`);
            console.log(`📊 Summary:`);
            console.log(`   Total: ${data.count}`);
            console.log(`   ✓ Processed: ${processed}`);
            console.log(`   ✗ Skipped: ${skipped}`);
            console.log(`\n📋 Skip reasons:`);
            console.log(`   - Duplicate: ${skipReasons.duplicate}`);
            console.log(`   - Invalid size: ${skipReasons.invalidSize}`);
            console.log(`   - Invalid colors: ${skipReasons.invalidColors}`);
            console.log(`   - Load error: ${skipReasons.loadError}`);
            console.log(`   - Other: ${skipReasons.other}`);
            
        } catch (error) {
            console.error('Failed to auto-load from server:', error);
            this.render();
        }
    }

    readFileAsDataURL(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
        });
    }

    render() {
        this.renderMasterPalette();
        this.renderSizeFilters();
        this.renderFolders();
        this.renderGallery();
        this.renderPreview();
    }

    renderMasterPalette() {
        if (this.manager.loadedPalette.length === 0) {
            this.masterPaletteDisplay.innerHTML = '<p class="palette-hint">Load master-palette.txt to compare</p>';
            return;
        }

        const html = this.manager.loadedPalette.map(color => {
            const name = this.manager.paletteColorNames.get(color) || color;
            return `<div class="master-palette-color" 
                         style="background-color: ${color}" 
                         title="${name} - ${color}"
                         data-color="${color}"
                         data-name="${name}"></div>`;
        }).join('');

        this.masterPaletteDisplay.innerHTML = html;

        // Add hover events to palette colors
        document.querySelectorAll('.master-palette-color').forEach(el => {
            el.addEventListener('mouseenter', (e) => {
                const color = e.target.dataset.color;
                const name = e.target.dataset.name;
                this.updateStatusBar(null, null, null, color, name);
            });
            el.addEventListener('mouseleave', () => {
                this.clearStatusColor();
            });
        });
    }

    async handlePaletteImport(file) {
        if (!file) return;

        try {
            const text = await file.text();
            const lines = text.split('\n').map(line => line.trim()).filter(line => line);
            
            const colors = [];
            const colorNames = new Map();

            for (const line of lines) {
                const parts = line.split(/\s+/);
                if (parts.length >= 2) {
                    const name = parts[0];
                    const hex = parts[1].toUpperCase();
                    colors.push(hex);
                    colorNames.set(hex, name);
                } else if (line.startsWith('#')) {
                    // Old format - just hex
                    colors.push(line.toUpperCase());
                }
            }

            if (colors.length === 0) {
                alert('No valid colors found in file!');
                return;
            }

            this.manager.loadedPalette = colors;
            this.manager.paletteColorNames = colorNames;
            localStorage.setItem('pixelVoxelMasterPalette', JSON.stringify(colors));
            localStorage.setItem('pixelVoxelPaletteNames', JSON.stringify([...colorNames]));
            
            console.log(`✅ Loaded ${colors.length} colors from palette`);
            this.render();

        } catch (err) {
            console.error('Error loading palette:', err);
            alert('Failed to load palette file');
        }

        this.paletteInput.value = '';
    }

    renderSizeFilters() {
        // Get all unique sizes from images
        const sizes = new Set();
        this.manager.images.forEach(img => {
            sizes.add(`${img.width}x${img.height}`);
        });

        // Sort sizes
        const sortedSizes = Array.from(sizes).sort((a, b) => {
            const [w1] = a.split('x').map(Number);
            const [w2] = b.split('x').map(Number);
            return w1 - w2;
        });

        // Build HTML
        const html = [
            `<button class="size-btn ${this.manager.sizeFilter === 'all' ? 'active' : ''}" data-size="all">All</button>`,
            ...sortedSizes.map(size => {
                const isActive = this.manager.sizeFilter === size;
                return `<button class="size-btn ${isActive ? 'active' : ''}" data-size="${size}">${size}</button>`;
            })
        ].join('');

        this.sizeFilterButtons.innerHTML = html;

        // Attach event listeners
        document.querySelectorAll('.size-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.size-btn').forEach(b => 
                    b.classList.remove('active')
                );
                e.target.classList.add('active');
                this.manager.sizeFilter = e.target.dataset.size;
                this.renderGallery();
            });
        });
    }

    renderFolders() {
        const html = this.manager.folders.map(folder => {
            const count = this.manager.getFolderCount(folder.id);
            const isActive = this.manager.currentFolder === folder.id;
            
            return `
                <div class="folder-item ${isActive ? 'active' : ''}" 
                     data-folder="${folder.id}">
                    <span class="folder-icon">${folder.id === 'root' ? '📂' : '📁'}</span>
                    <span class="folder-name">${folder.name}</span>
                    <span class="folder-count">${count}</span>
                </div>
            `;
        }).join('');

        this.foldersTree.innerHTML = html;

        // Attach click handlers
        document.querySelectorAll('.folder-item').forEach(item => {
            item.addEventListener('click', (e) => {
                this.manager.currentFolder = e.currentTarget.dataset.folder;
                this.render();
            });
        });

        // Update gallery title
        const currentFolder = this.manager.getFolder(this.manager.currentFolder);
        if (currentFolder) {
            this.galleryTitle.textContent = currentFolder.name;
        }
    }

    renderGallery() {
        const images = this.manager.getFilteredImages();
        
        this.galleryCount.textContent = `${images.length} items`;
        
        // Update selected count and show/hide controls
        const selectedCount = this.manager.selectedImages.length;
        const selectedCountEl = document.getElementById('selectedCount');
        const multiSelectControls = document.getElementById('multiSelectControls');
        
        if (selectedCount > 0) {
            selectedCountEl.textContent = `${selectedCount} selected`;
            selectedCountEl.style.display = 'inline-block';
            multiSelectControls.style.display = 'flex';
        } else {
            selectedCountEl.style.display = 'none';
            multiSelectControls.style.display = 'none';
        }

        if (images.length === 0) {
            this.galleryGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🖼️</div>
                    <p>No images found</p>
                    <p class="empty-hint">Try adjusting your filters or import new images</p>
                </div>
            `;
            return;
        }

        const html = images.map((img, index) => {
            const isSelected = this.manager.selectedImage?.id === img.id;
            const isMultiSelected = this.manager.selectedImages.includes(img.id);
            
            // Calculate palette match if master palette is loaded
            let paletteMatch = '';
            if (this.manager.loadedPalette.length > 0) {
                const matchScore = this.manager.calculatePaletteMatch(img.palette);
                let matchClass = 'match-different';
                let matchLabel = 'Different';
                
                if (matchScore === 100) {
                    matchClass = 'match-exact';
                    matchLabel = 'Exact';
                } else if (matchScore >= 70) {
                    matchClass = 'match-similar';
                    matchLabel = 'Similar';
                }
                
                paletteMatch = `<div class="palette-match-badge ${matchClass}">${matchLabel} ${matchScore}%</div>`;
            }
            
            // Check if all colors are divisible by 10 (Ready to Dev)
            let readyToDev = '';
            if (this.manager.isReadyToDev(img)) {
                readyToDev = `<div class="ready-to-dev-badge" title="All pixel counts divisible by 10">✓ Ready to Dev</div>`;
            }
            
            // Check which level this image is assigned to
            let levelTag = '';
            if (window.levelManager) {
                const assignedLevel = window.levelManager.levels.find(l => l.assignedImage === img.id);
                if (assignedLevel) {
                    levelTag = `<div class="level-tag" title="Assigned to Level ${assignedLevel.level}">Level: ${assignedLevel.level}</div>`;
                }
            }
            
            return `
                <div class="image-item ${isSelected ? 'selected' : ''} ${isMultiSelected ? 'multi-selected' : ''}" 
                     data-image-id="${img.id}"
                     data-image-index="${index}">
                    <div class="image-thumbnail">
                        <img src="${img.dataUrl}" alt="${img.name}">
                    </div>
                    <div class="image-info">
                        <div class="image-name" title="${img.name}">${img.name}</div>
                        <div class="image-meta">
                            <span>${img.width}x${img.height}</span>
                            <span class="color-count">${img.colorCount} colors</span>
                        </div>
                        ${paletteMatch}
                        ${readyToDev}
                        ${levelTag}
                    </div>
                </div>
            `;
        }).join('');

        this.galleryGrid.innerHTML = html;

        // Attach click handlers
        document.querySelectorAll('.image-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const imageId = parseFloat(e.currentTarget.dataset.imageId);
                const imageIndex = parseInt(e.currentTarget.dataset.imageIndex);
                
                // Shift+Click: Range select
                if (e.shiftKey && this.manager.lastSelectedIndex !== null) {
                    const start = Math.min(this.manager.lastSelectedIndex, imageIndex);
                    const end = Math.max(this.manager.lastSelectedIndex, imageIndex);
                    
                    // Select all images in range
                    for (let i = start; i <= end; i++) {
                        const imgId = images[i].id;
                        if (!this.manager.selectedImages.includes(imgId)) {
                            this.manager.selectedImages.push(imgId);
                        }
                    }
                    this.renderGallery();
                    this.renderPreview(); // Update preview for multi-select
                    return;
                }
                
                // Ctrl+Click: Toggle individual selection
                if (e.ctrlKey || e.metaKey) {
                    if (this.manager.selectedImages.includes(imageId)) {
                        this.manager.selectedImages = this.manager.selectedImages.filter(id => id !== imageId);
                    } else {
                        this.manager.selectedImages.push(imageId);
                    }
                    this.manager.lastSelectedIndex = imageIndex;
                    this.renderGallery();
                    this.renderPreview(); // Update preview for multi-select
                    return;
                }
                
                // Normal single selection
                this.manager.selectedImages = [];
                this.manager.lastSelectedIndex = imageIndex;
                this.manager.selectedImage = this.manager.images.find(img => img.id === imageId);
                this.render();
            });

            // Add hover event for status bar
            item.addEventListener('mouseenter', (e) => {
                const imageId = parseFloat(e.currentTarget.dataset.imageId);
                const img = this.manager.images.find(i => i.id === imageId);
                if (img) {
                    const match = this.manager.loadedPalette.length > 0 
                        ? `${this.manager.calculatePaletteMatch(img.palette)}%`
                        : '-';
                    this.updateStatusBar(img.name, `${img.width}x${img.height}`, img.colorCount, null, null, match);
                }
            });
            
            item.addEventListener('mouseleave', () => {
                this.clearStatusBar();
            });
        });
        
        // Setup drag & drop for level manager
        if (window.levelManager) {
            window.levelManager.setupDragAndDrop();
        }
    }

    renderPreview() {
        // Multi-select preview
        if (this.manager.selectedImages.length > 0) {
            const selectedImgs = this.manager.selectedImages.map(id => 
                this.manager.images.find(img => img.id === id)
            ).filter(img => img);
            
            this.previewSection.innerHTML = `
                <h3>Multi-Select Preview</h3>
                <div class="multi-preview-info">
                    <p><strong>${selectedImgs.length}</strong> images selected</p>
                </div>
                <div class="multi-preview-grid">
                    ${selectedImgs.map(img => `
                        <div class="multi-preview-item">
                            <img src="${img.dataUrl}" alt="${img.name}">
                            <div class="multi-preview-name">${img.name}</div>
                        </div>
                    `).join('')}
                </div>
            `;
            this.infoSection.style.display = 'none';
            return;
        }
        
        // Single image preview
        if (!this.manager.selectedImage) {
            this.previewSection.innerHTML = `
                <h3>Preview</h3>
                <div class="preview-empty">
                    <p>Select an image to preview</p>
                </div>
            `;
            this.infoSection.style.display = 'none';
            return;
        }

        const img = this.manager.selectedImage;
        
        this.previewSection.innerHTML = `
            <h3>Preview</h3>
            <div class="preview-canvas">
                <div class="preview-image" style="width: ${img.width * 8}px;">
                    <img src="${img.dataUrl}" style="width: ${img.width * 8}px; height: ${img.height * 8}px;">
                </div>
            </div>
        `;

        // Show info section
        this.infoSection.style.display = 'block';
        
        document.getElementById('infoName').textContent = img.name;
        document.getElementById('infoSize').textContent = `${img.width}x${img.height}px`;
        document.getElementById('infoColors').textContent = img.colorCount;
        
        const folder = this.manager.getFolder(img.folder);
        document.getElementById('infoFolder').textContent = folder ? folder.name : 'Unknown';

        // Render palette with names and pixel counts
        let colorMap = img.colorMap || new Map();
        
        // Ensure colorMap is a Map
        if (colorMap && typeof colorMap === 'object' && !(colorMap instanceof Map)) {
            colorMap = new Map(Object.entries(colorMap));
        }
        
        // If colorMap is empty, re-analyze the image to get pixel counts
        if (colorMap.size === 0) {
            console.log('ColorMap empty, re-analyzing image...');
            this.reAnalyzeImage(img).then(newColorMap => {
                img.colorMap = newColorMap;
                this.manager.saveToStorage();
                this.renderPreview(); // Re-render with new data
            });
        }
        
        console.log('renderPreview - colorMap:', colorMap);
        console.log('renderPreview - palette:', img.palette);
        
        const paletteHtml = img.palette.map(color => {
            const colorUpper = color.toUpperCase();
            const name = this.manager.paletteColorNames.get(colorUpper) || '';
            // Try both uppercase and lowercase
            const pixelCount = colorMap.get(color) || colorMap.get(colorUpper) || colorMap.get(color.toLowerCase()) || 0;
            const displayName = name || colorUpper;
            const title = name ? `${name} - ${colorUpper}\n${pixelCount} pixels` : `${colorUpper}\n${pixelCount} pixels`;
            console.log(`Preview Color ${color}: ${pixelCount}px (name: ${displayName})`);
            return `<div class="palette-color-item">
                        <div class="palette-color" 
                             style="background-color: ${color}" 
                             title="${title}"
                             data-color="${color}"
                             data-name="${displayName}: ${pixelCount}px"></div>
                        <div class="palette-color-label">${displayName}</div>
                        <div class="palette-color-count">${pixelCount}px</div>
                    </div>`;
        }).join('');
        document.getElementById('paletteGrid').innerHTML = paletteHtml;

        // Add hover and Alt+click events to palette colors
        document.querySelectorAll('#paletteGrid .palette-color').forEach(el => {
            el.addEventListener('mouseenter', (e) => {
                const color = e.target.dataset.color;
                const name = e.target.dataset.name;
                this.updateStatusBar(null, null, null, color, name);
            });
            el.addEventListener('mouseleave', () => {
                this.clearStatusColor();
            });
            
            // Alt+Click to pick color
            el.addEventListener('click', (e) => {
                if (e.altKey) {
                    const color = e.target.dataset.color;
                    // Set color in color editor if open
                    const replaceToColor = document.getElementById('replaceToColor');
                    if (replaceToColor) {
                        replaceToColor.value = color;
                        document.getElementById('replaceToHex').textContent = color.toUpperCase();
                    }
                    this.updateStatusBar(null, null, null, color, `Picked: ${color.toUpperCase()}`);
                }
            });
        });
        
        // Add Alt+Click to preview image for color picking
        const previewImg = this.previewSection.querySelector('.preview-image img');
        if (previewImg) {
            previewImg.style.cursor = 'crosshair';
            previewImg.addEventListener('click', (e) => {
                if (e.altKey) {
                    this.pickColorFromImage(e, previewImg, img);
                }
            });
        }
    }

    exportImage(scale) {
        if (!this.manager.selectedImage) return;

        const img = this.manager.selectedImage;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        // Disable smoothing for pixel art
        ctx.imageSmoothingEnabled = false;

        const image = new Image();
        image.onload = () => {
            ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = img.name.replace('.png', '') + `_x${scale}.png`;
                a.click();
                URL.revokeObjectURL(url);
            });
        };
        image.src = img.dataUrl;
    }
    
    // Re-analyze image to get color pixel counts
    async reAnalyzeImage(imageData) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                canvas.width = imageData.width;
                canvas.height = imageData.height;
                ctx.drawImage(img, 0, 0);
                
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const pixels = imgData.data;
                const colorMap = new Map();
                
                // Count pixels for each color
                for (let i = 0; i < pixels.length; i += 4) {
                    const r = pixels[i];
                    const g = pixels[i + 1];
                    const b = pixels[i + 2];
                    const a = pixels[i + 3];
                    
                    // Skip transparent pixels
                    if (a < 128) continue;
                    
                    const hex = rgbToHex(r, g, b);
                    colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
                }
                
                console.log('Re-analyzed colorMap:', colorMap);
                resolve(colorMap);
            };
            img.src = imageData.dataUrl;
        });
    }
    
    // Pick color from image at click position
    pickColorFromImage(event, imgElement, imageData) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        
        const tempImg = new Image();
        tempImg.onload = () => {
            ctx.drawImage(tempImg, 0, 0);
            
            // Get click position relative to the displayed image
            const rect = imgElement.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            // Convert to actual pixel position (accounting for scale)
            const scaleX = imageData.width / rect.width;
            const scaleY = imageData.height / rect.height;
            const pixelX = Math.floor(x * scaleX);
            const pixelY = Math.floor(y * scaleY);
            
            // Get pixel color
            if (pixelX >= 0 && pixelX < imageData.width && pixelY >= 0 && pixelY < imageData.height) {
                const pixel = ctx.getImageData(pixelX, pixelY, 1, 1).data;
                const color = rgbToHex(pixel[0], pixel[1], pixel[2]);
                
                // Set color in color editor
                const replaceToColor = document.getElementById('replaceToColor');
                if (replaceToColor) {
                    replaceToColor.value = color;
                    document.getElementById('replaceToHex').textContent = color.toUpperCase();
                }
                
                // Get color name and pixel count
                const colorUpper = color.toUpperCase();
                const name = this.manager.paletteColorNames.get(colorUpper) || '';
                const colorMap = imageData.colorMap || new Map();
                const pixelCount = colorMap.get(color) || colorMap.get(colorUpper) || 0;
                const displayText = name ? `${name} - ${colorUpper} (${pixelCount}px)` : `${colorUpper} (${pixelCount}px)`;
                
                this.updateStatusBar(null, null, null, color, `Picked: ${displayText}`);
            }
        };
        tempImg.src = imageData.dataUrl;
    }

    showFolderModal() {
        this.folderModal.classList.add('active');
        document.getElementById('folderNameInput').value = '';
        document.getElementById('folderNameInput').focus();
    }

    hideFolderModal() {
        this.folderModal.classList.remove('active');
    }

    showMoveModal() {
        if (!this.manager.selectedImage) return;

        const html = this.manager.folders.map(folder => `
            <div class="folder-list-item" data-folder-id="${folder.id}">
                <span>${folder.id === 'root' ? '📂' : '📁'}</span>
                <span>${folder.name}</span>
            </div>
        `).join('');

        document.getElementById('folderList').innerHTML = html;

        // Attach click handlers
        document.querySelectorAll('.folder-list-item').forEach(item => {
            item.addEventListener('click', (e) => {
                document.querySelectorAll('.folder-list-item').forEach(i => 
                    i.classList.remove('selected')
                );
                e.currentTarget.classList.add('selected');
            });
        });

        this.moveModal.classList.add('active');
    }
    
    showMultiMoveModal() {
        if (this.manager.selectedImages.length === 0) return;

        const html = this.manager.folders.map(folder => `
            <div class="folder-list-item" data-folder-id="${folder.id}">
                <span>${folder.id === 'root' ? '📂' : '📁'}</span>
                <span>${folder.name}</span>
            </div>
        `).join('');

        document.getElementById('folderList').innerHTML = html;

        // Update confirm button text
        const confirmBtn = document.getElementById('confirmMoveBtn');
        confirmBtn.textContent = `Move ${this.manager.selectedImages.length} Images`;

        // Attach click handlers
        document.querySelectorAll('.folder-list-item').forEach(item => {
            item.addEventListener('click', (e) => {
                document.querySelectorAll('.folder-list-item').forEach(i => 
                    i.classList.remove('selected')
                );
                e.currentTarget.classList.add('selected');
            });
        });

        this.moveModal.classList.add('active');
    }

    hideMoveModal() {
        this.moveModal.classList.remove('active');
    }

    updateStatusBar(imageName, size, colors, colorHex, colorName, match) {
        if (imageName !== undefined && imageName !== null) {
            this.statusImage.textContent = imageName;
        }
        if (size !== undefined && size !== null) {
            this.statusSize.textContent = size;
        }
        if (colors !== undefined && colors !== null) {
            this.statusColors.textContent = colors;
        }
        if (colorHex !== undefined && colorHex !== null) {
            this.statusColorSwatch.style.backgroundColor = colorHex;
            this.statusColorHex.textContent = colorHex.toUpperCase();
            this.statusColorName.textContent = colorName || '';
        }
        if (match !== undefined && match !== null) {
            this.statusMatch.textContent = match;
        }
    }

    clearStatusBar() {
        this.statusImage.textContent = '-';
        this.statusSize.textContent = '-';
        this.statusColors.textContent = '-';
        this.statusColorSwatch.style.backgroundColor = '#1a1a1a';
        this.statusColorName.textContent = '-';
        this.statusColorHex.textContent = '-';
        this.statusMatch.textContent = '-';
    }

    clearStatusColor() {
        this.statusColorSwatch.style.backgroundColor = '#1a1a1a';
        this.statusColorName.textContent = '-';
        this.statusColorHex.textContent = '-';
    }

    showColorEditor() {
        const img = this.manager.selectedImage;
        if (!img) return;

        // Load image to canvas with pixel-perfect rendering
        const canvas = this.colorEditorCanvas;
        const ctx = canvas.getContext('2d', { alpha: true });
        
        // Disable all smoothing/antialiasing
        ctx.imageSmoothingEnabled = false;
        ctx.imageSmoothingQuality = 'low';
        
        const image = new Image();
        image.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            
            // Draw image pixel-perfect
            ctx.drawImage(image, 0, 0, img.width, img.height);
            
            // Store current image data (exact pixel copy)
            this.currentEditingImageData = ctx.getImageData(0, 0, img.width, img.height);
            
            // Render palette
            this.renderColorEditorPalette(img.palette);
            this.renderMasterPaletteQuick();
            
            this.colorEditorModal.classList.add('active');
        };
        image.src = img.dataUrl;
    }

    hideColorEditor() {
        this.colorEditorModal.classList.remove('active');
        this.selectedColorToReplace = null;
        this.currentEditingImageData = null;
        this.replaceColorBtn.disabled = true;
    }

    renderColorEditorPalette(colors) {
        const html = colors.map(color => {
            const colorUpper = color.toUpperCase();
            const name = this.manager.paletteColorNames.get(colorUpper) || '';
            
            // Check if color exists in master palette
            const isInPalette = this.manager.loadedPalette.length === 0 || 
                                this.manager.loadedPalette.some(paletteColor => {
                                    if (paletteColor === colorUpper) return true;
                                    // Check similar colors (within threshold)
                                    const imgRgb = hexToRgb(colorUpper);
                                    const palRgb = hexToRgb(paletteColor);
                                    return colorDistance(imgRgb, palRgb) < 20;
                                });
            
            const notInPaletteClass = !isInPalette ? 'not-in-palette' : '';
            const title = name ? `${name} - ${colorUpper}` : colorUpper;
            const fullTitle = !isInPalette ? `⚠️ Not in palette - ${title}` : title;
            
            return `<div class="palette-color ${notInPaletteClass}" 
                         style="background-color: ${color}" 
                         title="${fullTitle}"
                         data-color="${colorUpper}"></div>`;
        }).join('');

        this.colorEditorPalette.innerHTML = html;

        // Add click handlers
        document.querySelectorAll('#colorEditorPalette .palette-color').forEach(el => {
            el.addEventListener('click', (e) => {
                document.querySelectorAll('#colorEditorPalette .palette-color').forEach(c => 
                    c.classList.remove('selected')
                );
                e.target.classList.add('selected');
                
                const color = e.target.dataset.color;
                this.selectedColorToReplace = color;
                this.replaceFromSwatch.style.backgroundColor = color;
                this.replaceFromHex.textContent = color;
                this.replaceColorBtn.disabled = false;
            });
        });
    }

    renderMasterPaletteQuick() {
        if (this.manager.loadedPalette.length === 0) {
            this.masterPaletteQuick.innerHTML = '<p style="color: #666; font-size: 11px;">No master palette loaded</p>';
            return;
        }

        const html = this.manager.loadedPalette.map(color => {
            const name = this.manager.paletteColorNames.get(color) || '';
            const title = name ? `${name} - ${color}` : color;
            return `<div class="palette-color" 
                         style="background-color: ${color}" 
                         title="${title}"
                         data-color="${color}"></div>`;
        }).join('');

        this.masterPaletteQuick.innerHTML = html;

        // Quick replace - click palette color to set as target
        document.querySelectorAll('#masterPaletteQuick .palette-color').forEach(el => {
            el.addEventListener('click', (e) => {
                const color = e.target.dataset.color;
                this.replaceToColor.value = color;
                this.replaceToHex.textContent = color;
            });
        });
    }

    replaceColor() {
        if (!this.selectedColorToReplace || !this.currentEditingImageData) return;

        const fromColor = hexToRgb(this.selectedColorToReplace);
        const toColor = hexToRgb(this.replaceToColor.value);
        
        // Work directly with imageData to avoid any canvas artifacts
        const imageData = this.currentEditingImageData;
        const data = imageData.data;

        // Replace all pixels with exact matching color (no tolerance)
        let replacedCount = 0;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // Exact match only
            if (r === fromColor.r && g === fromColor.g && b === fromColor.b) {
                data[i] = toColor.r;
                data[i + 1] = toColor.g;
                data[i + 2] = toColor.b;
                // Keep alpha unchanged: data[i + 3] = data[i + 3];
                replacedCount++;
            }
        }

        console.log(`🎨 Replaced ${replacedCount / 4} pixels from ${this.selectedColorToReplace} to ${this.replaceToColor.value.toUpperCase()}`);

        // Redraw canvas with pixel-perfect rendering
        const ctx = this.colorEditorCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.putImageData(imageData, 0, 0);

        // Update palette display
        const newPalette = Array.from(new Set(
            this.manager.selectedImage.palette.map(c => 
                c.toUpperCase() === this.selectedColorToReplace ? this.replaceToColor.value.toUpperCase() : c
            )
        ));

        this.renderColorEditorPalette(newPalette);
        
        // Reset selection
        this.selectedColorToReplace = null;
        this.replaceFromSwatch.style.backgroundColor = '#1a1a1a';
        this.replaceFromHex.textContent = 'Select color';
        this.replaceColorBtn.disabled = true;
    }

    async saveEditedImage() {
        if (!this.manager.selectedImage || !this.currentEditingImageData) return;

        // Get edited image as dataURL with NO compression/smoothing
        const canvas = this.colorEditorCanvas;
        const ctx = canvas.getContext('2d');
        
        // Ensure no smoothing
        ctx.imageSmoothingEnabled = false;
        
        // Extract colors directly from current ImageData to avoid re-compression artifacts
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        const colorSet = new Set();
        
        // Extract unique colors
        for (let i = 0; i < pixels.length; i += 4) {
            const a = pixels[i + 3];
            if (a < 128) continue; // Skip transparent
            
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const hex = rgbToHex(r, g, b).toUpperCase();
            colorSet.add(hex);
        }
        
        const colors = Array.from(colorSet);
        
        console.log(`💾 Saving with ${colors.length} colors:`, colors);
        
        // Get dataURL - use PNG with no compression
        const newDataUrl = canvas.toDataURL('image/png');
        
        // Update image in manager
        this.manager.selectedImage.dataUrl = newDataUrl;
        this.manager.selectedImage.colors = colors;
        this.manager.selectedImage.colorCount = colors.length;
        this.manager.selectedImage.palette = colors;
        
        this.manager.saveToStorage();
        
        // Save to server
        await this.saveImageToServer(newDataUrl);
        
        this.hideColorEditor();
        this.render();
        
        console.log('✅ Image colors updated and saved!');
    }

    async saveImageToServer(dataUrl) {
        try {
            const img = this.manager.selectedImage;
            const folder = this.manager.getFolder(img.folder);
            const folderPath = folder && folder.id !== 'root' ? folder.name : '';
            
            const response = await fetch('/api/save-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: img.name,
                    dataUrl: dataUrl,
                    folder: folderPath
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('✅ File saved to disk:', result.path);
            } else {
                console.error('❌ Failed to save file:', result.message);
                alert('Failed to save file to disk: ' + result.message);
            }
            
        } catch (error) {
            console.error('❌ Error saving to server:', error);
            alert('Error saving file to disk. Check console for details.');
        }
    }

    async deleteImageFromServer(img) {
        try {
            const folder = this.manager.getFolder(img.folder);
            const folderPath = folder && folder.id !== 'root' ? folder.name : '';
            
            const response = await fetch('/api/delete-image', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: img.name,
                    folder: folderPath
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('🗑️ File deleted from disk');
            } else {
                console.error('❌ Failed to delete file:', result.message);
                alert('Failed to delete file from disk: ' + result.message);
            }
            
        } catch (error) {
            console.error('❌ Error deleting from server:', error);
            alert('Error deleting file from disk. Check console for details.');
        }
    }

    async createFolderOnServer(folderName) {
        try {
            const response = await fetch('/api/create-folder', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    folderName: folderName,
                    parentFolder: '' // Create in root PixelAssets
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('📁 Folder created on disk:', result.path);
            } else {
                console.error('❌ Failed to create folder:', result.message);
                alert('Failed to create folder on disk: ' + result.message);
            }
            
        } catch (error) {
            console.error('❌ Error creating folder:', error);
            alert('Error creating folder on disk. Check console for details.');
        }
    }

    async moveImageOnServer(img, targetFolderId) {
        try {
            const fromFolder = this.manager.getFolder(img.folder);
            const toFolder = this.manager.getFolder(targetFolderId);
            
            const fromFolderPath = fromFolder && fromFolder.id !== 'root' ? fromFolder.name : '';
            const toFolderPath = toFolder && toFolder.id !== 'root' ? toFolder.name : '';
            
            const response = await fetch('/api/move-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: img.name,
                    fromFolder: fromFolderPath,
                    toFolder: toFolderPath
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('📦 File moved on disk:', result.newPath);
            } else {
                console.error('❌ Failed to move file:', result.message);
                alert('Failed to move file on disk: ' + result.message);
            }
            
        } catch (error) {
            console.error('❌ Error moving file:', error);
            alert('Error moving file on disk. Check console for details.');
        }
    }

    showPixelEditor() {
        const img = this.manager.selectedImage;
        if (!img) return;

        // Initialize pixel editor
        if (!this.pixelEditor) {
            this.pixelEditor = new PixelEditor(this.manager);
        }
        
        this.pixelEditor.loadImage(img);
    }
}

// ===== Pixel Editor =====
class PixelEditor {
    constructor(manager) {
        this.manager = manager;
        this.initElements();
        this.initState();
        this.attachEventListeners();
    }

    initElements() {
        this.modal = document.getElementById('pixelEditorModal');
        this.canvas = document.getElementById('pixelEditorCanvas');
        this.tempCanvas = document.getElementById('tempLayerCanvas');
        this.previewCanvas = document.getElementById('previewCanvas');
    this.ctx = this.canvas.getContext('2d', { alpha: true, willReadFrequently: true });
    this.tempCtx = this.tempCanvas.getContext('2d', { alpha: true, willReadFrequently: true });
    this.previewCtx = this.previewCanvas.getContext('2d', { alpha: true, willReadFrequently: true });
        
        // Disable smoothing
        [this.ctx, this.tempCtx, this.previewCtx].forEach(ctx => {
            ctx.imageSmoothingEnabled = false;
        });

        // UI elements
        this.toolButtons = document.querySelectorAll('.tool-btn');
        this.primaryColorBox = document.getElementById('primaryColorBox');
        this.secondaryColorBox = document.getElementById('secondaryColorBox');
        this.editorPaletteGrid = document.getElementById('editorPaletteGrid');
        this.layersList = document.getElementById('layersList');
        this.zoomSlider = document.getElementById('canvasZoom');
        this.zoomValue = document.getElementById('zoomValue');
        this.canvasWrapper = document.getElementById('canvasWrapper');
        this.showGridCheckbox = document.getElementById('showGridCheckbox');
        this.fillShapeCheckbox = document.getElementById('fillShapeCheckbox');
        this.undoBtn = document.getElementById('undoBtn');
        this.redoBtn = document.getElementById('redoBtn');
        
        // Crop elements
        this.cropControlsSection = document.getElementById('cropControlsSection');
        this.cropSizeDisplay = document.getElementById('cropSizeDisplay');
        this.applyCropBtn = document.getElementById('applyCropBtn');
        this.cancelCropBtn = document.getElementById('cancelCropBtn');
        
        // Lasso elements
        this.lassoControlsSection = document.getElementById('lassoControlsSection');
        this.moveLassoBtn = document.getElementById('moveLassoBtn');
        this.cutLassoBtn = document.getElementById('cutLassoBtn');
        this.cancelLassoBtn = document.getElementById('cancelLassoBtn');
    }

    initState() {
        this.currentTool = 'pencil';
        this.primaryColor = '#000000';
        this.secondaryColor = '#FFFFFF';
        this.zoom = 16;
        this.showGrid = true;
        this.fillShape = false;
        
        this.layers = [];
        this.currentLayerIndex = 0;
        
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;
        
        this.isDrawing = false;
        this.startX = 0;
        this.startY = 0;
        this.imageData = null;
        this.altKeyPressed = false;
        
        // Crop state
        this.cropMode = false;
        this.cropRect = null;
        this.cropSelection = null;
        this.cropDragging = false;
        this.cropResizing = false;
        this.cropHandle = null;
        
        // Lasso state
        this.lassoMode = false;
        this.lassoPoints = [];
        this.lassoSelection = null;
        this.lassoContent = null;
        this.lassoDragging = false;
        this.lassoDragStart = null;
        this.lassoContentPos = null;
    }

    attachEventListeners() {
        // Tool selection
        this.toolButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.toolButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTool = btn.dataset.tool;
                
                // Show/hide crop controls
                if (btn.dataset.tool === 'crop') {
                    this.enterCropMode();
                } else {
                    this.exitCropMode();
                }
                
                // Show/hide lasso controls
                if (btn.dataset.tool === 'lasso') {
                    this.enterLassoMode();
                } else {
                    this.exitLassoMode();
                }
            });
        });

        // Color selection
        this.primaryColorBox.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'color';
            input.value = this.primaryColor;
            input.addEventListener('change', (e) => {
                this.setPrimaryColor(e.target.value);
            });
            input.click();
        });

        this.secondaryColorBox.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'color';
            input.value = this.secondaryColor;
            input.addEventListener('change', (e) => {
                this.setSecondaryColor(e.target.value);
            });
            input.click();
        });

        // Zoom
        this.zoomSlider.addEventListener('input', (e) => {
            this.setZoom(parseInt(e.target.value));
        });

        // Grid toggle
        this.showGridCheckbox.addEventListener('change', (e) => {
            this.showGrid = e.target.checked;
            this.updateCanvasBackground();
        });

        this.fillShapeCheckbox.addEventListener('change', (e) => {
            this.fillShape = e.target.checked;
        });

        // Canvas drawing
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('mouseleave', (e) => this.onMouseUp(e));
        
        // Alt key for color picking
        this.canvas.addEventListener('keydown', (e) => {
            if (e.altKey && !this.altKeyPressed) {
                this.altKeyPressed = true;
                this.canvas.style.cursor = 'crosshair';
            }
        });
        this.canvas.addEventListener('keyup', (e) => {
            if (!e.altKey && this.altKeyPressed) {
                this.altKeyPressed = false;
                this.canvas.style.cursor = 'crosshair';
            }
        });

        // Layers
        document.getElementById('addLayerBtn').addEventListener('click', () => this.addLayer());
        document.getElementById('deleteLayerBtn').addEventListener('click', () => this.deleteLayer());

        // Undo/Redo
        this.undoBtn.addEventListener('click', () => this.undo());
        this.redoBtn.addEventListener('click', () => this.redo());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.onKeyDown(e));

        // Save/Cancel
        document.getElementById('saveDrawingBtn').addEventListener('click', () => this.save());
        document.getElementById('cancelDrawingBtn').addEventListener('click', () => this.close());
        
        // Crop controls
        this.applyCropBtn.addEventListener('click', () => this.confirmCrop());
        this.cancelCropBtn.addEventListener('click', () => this.exitCropMode());
        
        // Lasso controls
        this.moveLassoBtn.addEventListener('click', () => this.moveLassoContent());
        this.cutLassoBtn.addEventListener('click', () => this.cutLassoContent());
        this.cancelLassoBtn.addEventListener('click', () => this.exitLassoMode());
    }

    loadImage(imageData) {
        this.imageData = imageData;
        
        // Setup canvas
        this.canvas.width = imageData.width;
        this.canvas.height = imageData.height;
        this.tempCanvas.width = imageData.width;
        this.tempCanvas.height = imageData.height;
        this.previewCanvas.width = imageData.width;
        this.previewCanvas.height = imageData.height;

        // Load image to canvas
        const img = new Image();
        img.onload = () => {
            // Create base layer
            this.layers = [{
                id: 1,
                name: 'Layer 1',
                visible: true,
                canvas: document.createElement('canvas'),
                ctx: null
            }];
            
            this.layers[0].canvas.width = imageData.width;
            this.layers[0].canvas.height = imageData.height;
            this.layers[0].ctx = this.layers[0].canvas.getContext('2d', { alpha: true, willReadFrequently: true });
            this.layers[0].ctx.imageSmoothingEnabled = false;
            this.layers[0].ctx.drawImage(img, 0, 0);
            
            this.currentLayerIndex = 0;
            
            // Setup palette
            this.setupPalette(imageData.palette);
            
            // Initial render
            this.composeLayers();
            this.updatePreview();
            this.renderLayers();
            this.setZoom(this.zoom);
            
            // Save initial state
            this.saveHistory();
            
            // Show modal
            this.modal.classList.add('active');
        };
        img.src = imageData.dataUrl;
    }

    setupPalette(colors) {
        this.palette = colors.map(c => c.toUpperCase());
        
        // Get color map from current image
        let colorMap = this.imageData.colorMap || new Map();
        
        // Ensure colorMap is a Map, not an object
        if (colorMap && typeof colorMap === 'object' && !(colorMap instanceof Map)) {
            colorMap = new Map(Object.entries(colorMap));
        }
        
        console.log('setupPalette - colorMap:', colorMap);
        console.log('setupPalette - palette:', this.palette);
        
        // Set default colors
        if (this.palette.length > 0) {
            this.setPrimaryColor(this.palette[0]);
            if (this.palette.length > 1) {
                this.setSecondaryColor(this.palette[1]);
            }
        }

        // Setup Master Palette
        const masterPaletteEl = document.getElementById('editorMasterPalette');
        if (masterPaletteEl) {
            const masterHtml = Array.from(this.manager.paletteColorNames.entries()).map(([hex, name]) => {
                return `<div class="palette-color" 
                             style="background-color: ${hex}" 
                             data-color="${hex}"
                             title="${name}"></div>`;
            }).join('');
            masterPaletteEl.innerHTML = masterHtml;
            
            // Add click handlers for master palette
            masterPaletteEl.querySelectorAll('.palette-color').forEach(el => {
                el.addEventListener('click', (e) => {
                    if (e.button === 0 || e.type === 'click') {
                        // Shift+Click to replace color
                        if (e.shiftKey) {
                            this.showColorReplaceMenu(e.target.dataset.color);
                        } else {
                            this.setPrimaryColor(e.target.dataset.color);
                        }
                    }
                });
                el.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.setSecondaryColor(e.target.dataset.color);
                });
            });
        }

        // Setup Current Palette with pixel counts
        const currentPaletteEl = document.getElementById('editorPaletteGrid');
        if (currentPaletteEl) {
            const currentHtml = this.palette.map(color => {
                const pixelCount = colorMap.get(color) || colorMap.get(color.toLowerCase()) || 0;
                const colorName = this.manager.paletteColorNames.get(color) || color;
                const notDivisibleBy10 = (pixelCount % 10) !== 0;
                const highlightClass = notDivisibleBy10 ? ' not-divisible-10' : '';
                console.log(`Color ${color}: ${pixelCount}px${notDivisibleBy10 ? ' ⚠️ NOT divisible by 10' : ''}`);
                return `<div class="current-color-item${highlightClass}" data-color="${color}">
                            <div class="current-color-swatch" style="background-color: ${color}"></div>
                            <div class="current-color-info">
                                <div class="current-color-name">${colorName}${notDivisibleBy10 ? ' ⚠️' : ''}</div>
                                <div class="current-color-count">${pixelCount}px</div>
                            </div>
                        </div>`;
            }).join('');
            currentPaletteEl.innerHTML = currentHtml;

            // Add click handlers for current palette
            currentPaletteEl.querySelectorAll('.current-color-item').forEach(el => {
                el.addEventListener('click', (e) => {
                    if (e.button === 0 || e.type === 'click') {
                        this.setPrimaryColor(el.dataset.color);
                    }
                });
                el.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.setSecondaryColor(el.dataset.color);
                });
            });
        }

        // Update preview info
        this.updatePreviewInfo(colorMap);
    }

    updatePreviewInfo(colorMap) {
        // Update size
        const sizeEl = document.getElementById('previewSize');
        if (sizeEl) {
            sizeEl.textContent = `${this.canvas.width}x${this.canvas.height}`;
        }

        // Update total pixels
        const totalPixelsEl = document.getElementById('previewTotalPixels');
        if (totalPixelsEl) {
            let total = 0;
            if (colorMap instanceof Map) {
                colorMap.forEach(count => total += count);
            }
            totalPixelsEl.textContent = total.toString();
        }

        // Update color count
        const colorCountEl = document.getElementById('previewColorCount');
        if (colorCountEl) {
            colorCountEl.textContent = this.palette.length.toString();
        }
    }

    setPrimaryColor(color) {
        this.primaryColor = color.toUpperCase();
        
        if (this.primaryColor === 'TRANSPARENT') {
            // Show checkerboard pattern for transparent
            this.primaryColorBox.style.backgroundColor = 'transparent';
            this.primaryColorBox.style.backgroundImage = 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%)';
            this.primaryColorBox.style.backgroundSize = '8px 8px';
            this.primaryColorBox.style.backgroundPosition = '0 0';
        } else {
            this.primaryColorBox.style.backgroundColor = this.primaryColor;
            this.primaryColorBox.style.backgroundImage = 'none';
        }
        
        // Update current palette selection
        document.querySelectorAll('#editorPaletteGrid .current-color-item').forEach(el => {
            el.classList.toggle('active', el.dataset.color === this.primaryColor);
        });
    }

    setSecondaryColor(color) {
        this.secondaryColor = color.toUpperCase();
        
        if (this.secondaryColor === 'TRANSPARENT') {
            // Show checkerboard pattern for transparent
            this.secondaryColorBox.style.backgroundColor = 'transparent';
            this.secondaryColorBox.style.backgroundImage = 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%)';
            this.secondaryColorBox.style.backgroundSize = '8px 8px';
            this.secondaryColorBox.style.backgroundPosition = '0 0';
        } else {
            this.secondaryColorBox.style.backgroundColor = this.secondaryColor;
            this.secondaryColorBox.style.backgroundImage = 'none';
        }
    }

    setZoom(zoom) {
        this.zoom = zoom;
        this.zoomValue.textContent = zoom + 'x';
        
        const displayWidth = this.canvas.width * zoom;
        const displayHeight = this.canvas.height * zoom;
        
        this.canvas.style.width = displayWidth + 'px';
        this.canvas.style.height = displayHeight + 'px';
        this.tempCanvas.style.width = displayWidth + 'px';
        this.tempCanvas.style.height = displayHeight + 'px';
        
        this.updateCanvasBackground();
    }

    updateCanvasBackground() {
        if (this.showGrid) {
            this.canvas.classList.add('show-grid');
            this.tempCanvas.classList.add('show-grid');
            
            // Update grid size to match zoom level (1 pixel = zoom px)
            const gridSize = this.zoom;
            this.canvas.style.backgroundSize = `${gridSize}px ${gridSize}px`;
            this.tempCanvas.style.backgroundSize = `${gridSize}px ${gridSize}px`;
        } else {
            this.canvas.classList.remove('show-grid');
            this.tempCanvas.classList.remove('show-grid');
        }
    }

    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        const x = Math.floor((e.clientX - rect.left) * scaleX);
        const y = Math.floor((e.clientY - rect.top) * scaleY);
        
        return { x, y };
    }

    onMouseDown(e) {
        // Crop mode handles its own events
        if (this.cropMode) return;
        
        const { x, y } = this.getCanvasCoordinates(e);
        
        // Alt+Click to pick color (works with any tool)
        if (e.altKey) {
            this.pickColor(x, y, e.button === 2);
            return;
        }
        
        // Lasso tool
        if (this.currentTool === 'lasso') {
            if (this.lassoContent) return; // Already have selection
            
            this.isDrawing = true;
            this.lassoPoints = [{ x, y }];
            return;
        }
        
        this.isDrawing = true;
        this.startX = x;
        this.startY = y;

        const color = e.button === 2 ? this.secondaryColor : this.primaryColor;

        if (this.currentTool === 'pencil') {
            this.drawPixel(x, y, color);
        } else if (this.currentTool === 'eraser') {
            this.erasePixel(x, y);
        } else if (this.currentTool === 'picker') {
            this.pickColor(x, y, e.button === 2);
        } else if (this.currentTool === 'fill') {
            this.floodFill(x, y, color);
            this.isDrawing = false;
        } else if (this.currentTool === 'crop') {
            // Crop preview will be shown on mouse move
        }
    }

    onMouseMove(e) {
        if (this.cropMode) return;
        
        // Lasso drawing
        if (this.currentTool === 'lasso' && this.isDrawing && !this.lassoContent) {
            const { x, y } = this.getCanvasCoordinates(e);
            this.lassoPoints.push({ x, y });
            this.drawLassoPath();
            return;
        }
        
        if (!this.isDrawing) return;

        const { x, y } = this.getCanvasCoordinates(e);
        const color = e.button === 2 ? this.secondaryColor : this.primaryColor;

        if (this.currentTool === 'pencil') {
            this.drawLine(this.startX, this.startY, x, y, color);
            this.startX = x;
            this.startY = y;
        } else if (this.currentTool === 'eraser') {
            this.drawLine(this.startX, this.startY, x, y, null, true);
            this.startX = x;
            this.startY = y;
        } else if (['line', 'rectangle', 'circle'].includes(this.currentTool)) {
            this.drawShapePreview(this.startX, this.startY, x, y, color);
        }
    }

    onMouseUp(e) {
        // Lasso complete
        if (this.currentTool === 'lasso' && this.isDrawing && !this.lassoContent) {
            this.isDrawing = false;
            if (this.lassoPoints.length > 2) {
                this.extractLassoContent();
            }
            return;
        }
        
        if (!this.isDrawing) return;

        const { x, y } = this.getCanvasCoordinates(e);
        const color = e.button === 2 ? this.secondaryColor : this.primaryColor;

        if (this.currentTool === 'line') {
            this.drawLineShape(this.startX, this.startY, x, y, color);
        } else if (this.currentTool === 'rectangle') {
            this.drawRectangle(this.startX, this.startY, x, y, color);
        } else if (this.currentTool === 'circle') {
            this.drawCircle(this.startX, this.startY, x, y, color);
        }

        this.clearTempLayer();
        this.isDrawing = false;
        this.saveHistory();
        this.composeLayers();
        this.updatePreview();
    }

    drawPixel(x, y, color) {
        if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return;
        
        const layer = this.layers[this.currentLayerIndex];
        layer.ctx.fillStyle = color;
        layer.ctx.fillRect(x, y, 1, 1);
        
        this.composeLayers();
        this.updatePreview();
    }

    erasePixel(x, y) {
        if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return;
        
        const layer = this.layers[this.currentLayerIndex];
        layer.ctx.clearRect(x, y, 1, 1);
        
        this.composeLayers();
        this.updatePreview();
    }

    drawLine(x0, y0, x1, y1, color, isEraser = false) {
        // Bresenham's line algorithm
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        while (true) {
            if (isEraser) {
                this.erasePixel(x0, y0);
            } else {
                this.drawPixel(x0, y0, color);
            }

            if (x0 === x1 && y0 === y1) break;
            
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x0 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y0 += sy;
            }
        }
    }

    drawShapePreview(x0, y0, x1, y1, color) {
        this.clearTempLayer();
        
        this.tempCtx.fillStyle = color;
        this.tempCtx.strokeStyle = color;

        if (this.currentTool === 'line') {
            this.drawLineOnContext(this.tempCtx, x0, y0, x1, y1, color);
        } else if (this.currentTool === 'rectangle') {
            this.drawRectangleOnContext(this.tempCtx, x0, y0, x1, y1, color);
        } else if (this.currentTool === 'circle') {
            this.drawCircleOnContext(this.tempCtx, x0, y0, x1, y1, color);
        }
    }

    drawLineShape(x0, y0, x1, y1, color) {
        const layer = this.layers[this.currentLayerIndex];
        this.drawLineOnContext(layer.ctx, x0, y0, x1, y1, color);
    }

    drawLineOnContext(ctx, x0, y0, x1, y1, color) {
        ctx.fillStyle = color;
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = x0 < x1 ? 1 : -1;
        const sy = y0 < y1 ? 1 : -1;
        let err = dx - dy;

        while (true) {
            ctx.fillRect(x0, y0, 1, 1);
            if (x0 === x1 && y0 === y1) break;
            
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x0 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y0 += sy;
            }
        }
    }

    drawRectangle(x0, y0, x1, y1, color) {
        const layer = this.layers[this.currentLayerIndex];
        this.drawRectangleOnContext(layer.ctx, x0, y0, x1, y1, color);
    }

    drawRectangleOnContext(ctx, x0, y0, x1, y1, color) {
        const minX = Math.min(x0, x1);
        const minY = Math.min(y0, y1);
        const maxX = Math.max(x0, x1);
        const maxY = Math.max(y0, y1);

        ctx.fillStyle = color;
        
        if (this.fillShape) {
            ctx.fillRect(minX, minY, maxX - minX + 1, maxY - minY + 1);
        } else {
            // Draw outline
            for (let x = minX; x <= maxX; x++) {
                ctx.fillRect(x, minY, 1, 1);
                ctx.fillRect(x, maxY, 1, 1);
            }
            for (let y = minY; y <= maxY; y++) {
                ctx.fillRect(minX, y, 1, 1);
                ctx.fillRect(maxX, y, 1, 1);
            }
        }
    }

    drawCircle(x0, y0, x1, y1, color) {
        const layer = this.layers[this.currentLayerIndex];
        this.drawCircleOnContext(layer.ctx, x0, y0, x1, y1, color);
    }

    drawCircleOnContext(ctx, x0, y0, x1, y1, color) {
        const radius = Math.round(Math.sqrt(Math.pow(x1 - x0, 2) + Math.pow(y1 - y0, 2)));
        ctx.fillStyle = color;

        // Midpoint circle algorithm
        let x = radius;
        let y = 0;
        let err = 0;

        while (x >= y) {
            if (this.fillShape) {
                for (let i = -x; i <= x; i++) {
                    ctx.fillRect(x0 + i, y0 + y, 1, 1);
                    ctx.fillRect(x0 + i, y0 - y, 1, 1);
                }
                for (let i = -y; i <= y; i++) {
                    ctx.fillRect(x0 + i, y0 + x, 1, 1);
                    ctx.fillRect(x0 + i, y0 - x, 1, 1);
                }
            } else {
                ctx.fillRect(x0 + x, y0 + y, 1, 1);
                ctx.fillRect(x0 + y, y0 + x, 1, 1);
                ctx.fillRect(x0 - y, y0 + x, 1, 1);
                ctx.fillRect(x0 - x, y0 + y, 1, 1);
                ctx.fillRect(x0 - x, y0 - y, 1, 1);
                ctx.fillRect(x0 - y, y0 - x, 1, 1);
                ctx.fillRect(x0 + y, y0 - x, 1, 1);
                ctx.fillRect(x0 + x, y0 - y, 1, 1);
            }

            if (err <= 0) {
                y += 1;
                err += 2 * y + 1;
            }
            if (err > 0) {
                x -= 1;
                err -= 2 * x + 1;
            }
        }
    }

    pickColor(x, y, isSecondary = false) {
        if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return;
        
        // Get color from the composed canvas (all visible layers)
        const imageData = this.ctx.getImageData(x, y, 1, 1);
        const [r, g, b, a] = imageData.data;
        
        // If transparent pixel, set to special "eraser" color
        if (a < 128) {
            const transparentColor = 'TRANSPARENT';
            if (isSecondary) {
                this.setSecondaryColor(transparentColor);
            } else {
                this.setPrimaryColor(transparentColor);
            }
            console.log(`🎨 Picked transparent (Eraser mode)`);
            return;
        }
        
        const color = rgbToHex(r, g, b).toUpperCase();
        
        if (isSecondary) {
            this.setSecondaryColor(color);
        } else {
            this.setPrimaryColor(color);
        }
        
        // Show feedback
        console.log(`🎨 Picked color: ${color} (${isSecondary ? 'Secondary' : 'Primary'})`);
    }

    floodFill(x, y, fillColor) {
        if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return;
        
        const layer = this.layers[this.currentLayerIndex];
        const imageData = layer.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const pixels = imageData.data;
        
        const startPos = (y * this.canvas.width + x) * 4;
        const startR = pixels[startPos];
        const startG = pixels[startPos + 1];
        const startB = pixels[startPos + 2];
        const startA = pixels[startPos + 3];
        
        // Check if filling with transparent (eraser mode)
        const isEraser = fillColor === 'TRANSPARENT';
        
        let fillRgb = null;
        if (!isEraser) {
            fillRgb = hexToRgb(fillColor);
            // Don't fill if same color
            if (startR === fillRgb.r && startG === fillRgb.g && startB === fillRgb.b && startA === 255) return;
        } else {
            // Don't erase if already transparent
            if (startA < 128) return;
        }
        
        const stack = [[x, y]];
        const visited = new Set();
        
        while (stack.length > 0) {
            const [cx, cy] = stack.pop();
            const key = `${cx},${cy}`;
            
            if (visited.has(key)) continue;
            if (cx < 0 || cy < 0 || cx >= this.canvas.width || cy >= this.canvas.height) continue;
            
            const pos = (cy * this.canvas.width + cx) * 4;
            const r = pixels[pos];
            const g = pixels[pos + 1];
            const b = pixels[pos + 2];
            const a = pixels[pos + 3];
            
            if (r !== startR || g !== startG || b !== startB || a !== startA) continue;
            
            visited.add(key);
            
            if (isEraser) {
                // Erase (set to transparent)
                pixels[pos] = 0;
                pixels[pos + 1] = 0;
                pixels[pos + 2] = 0;
                pixels[pos + 3] = 0;
            } else {
                // Fill with color
                pixels[pos] = fillRgb.r;
                pixels[pos + 1] = fillRgb.g;
                pixels[pos + 2] = fillRgb.b;
                pixels[pos + 3] = 255;
            }
            
            stack.push([cx + 1, cy]);
            stack.push([cx - 1, cy]);
            stack.push([cx, cy + 1]);
            stack.push([cx, cy - 1]);
        }
        
        layer.ctx.putImageData(imageData, 0, 0);
        this.composeLayers();
        this.updatePreview();
        this.saveHistory();
    }

    clearTempLayer() {
        this.tempCtx.clearRect(0, 0, this.tempCanvas.width, this.tempCanvas.height);
    }

    enterCropMode() {
        this.cropMode = true;
        this.cropControlsSection.style.display = 'block';
        
        // Create crop selection for entire canvas
        this.cropRect = {
            x: 0,
            y: 0,
            width: this.canvas.width,
            height: this.canvas.height
        };
        
        this.showCropSelection();
        this.updateCropDisplay();
    }

    exitCropMode() {
        this.cropMode = false;
        if (this.cropControlsSection) {
            this.cropControlsSection.style.display = 'none';
        }
        this.hideCropSelection();
        this.cropRect = null;
    }

    showCropSelection() {
        this.hideCropSelection();
        
        const selection = document.createElement('div');
        selection.className = 'crop-selection';
        selection.id = 'cropSelection';
        
        // Add resize handles
        const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
        handles.forEach(pos => {
            const handle = document.createElement('div');
            handle.className = `crop-handle ${pos}`;
            handle.dataset.handle = pos;
            selection.appendChild(handle);
        });
        
        this.canvasWrapper.appendChild(selection);
        this.cropSelection = selection;
        
        this.updateCropSelectionPosition();
        this.attachCropHandlers();
    }

    hideCropSelection() {
        if (this.cropSelection) {
            this.cropSelection.remove();
            this.cropSelection = null;
        }
    }

    updateCropSelectionPosition() {
        if (!this.cropSelection || !this.cropRect) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const canvasRect = this.canvasWrapper.getBoundingClientRect();
        const scaleX = rect.width / this.canvas.width;
        const scaleY = rect.height / this.canvas.height;
        
        this.cropSelection.style.left = (rect.left - canvasRect.left + this.cropRect.x * scaleX) + 'px';
        this.cropSelection.style.top = (rect.top - canvasRect.top + this.cropRect.y * scaleY) + 'px';
        this.cropSelection.style.width = (this.cropRect.width * scaleX) + 'px';
        this.cropSelection.style.height = (this.cropRect.height * scaleY) + 'px';
    }

    attachCropHandlers() {
        const handles = this.cropSelection.querySelectorAll('.crop-handle');
        
        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                this.cropResizing = true;
                this.cropHandle = handle.dataset.handle;
                this.cropStartX = e.clientX;
                this.cropStartY = e.clientY;
                this.cropStartRect = { ...this.cropRect };
            });
        });
        
        this.cropSelection.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('crop-handle')) return;
            this.cropDragging = true;
            this.cropStartX = e.clientX;
            this.cropStartY = e.clientY;
            this.cropStartRect = { ...this.cropRect };
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!this.cropMode) return;
            
            if (this.cropDragging) {
                this.handleCropDrag(e);
            } else if (this.cropResizing) {
                this.handleCropResize(e);
            }
        });
        
        document.addEventListener('mouseup', () => {
            this.cropDragging = false;
            this.cropResizing = false;
            this.cropHandle = null;
        });
    }

    handleCropDrag(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        const dx = (e.clientX - this.cropStartX) * scaleX;
        const dy = (e.clientY - this.cropStartY) * scaleY;
        
        let newX = Math.round(this.cropStartRect.x + dx);
        let newY = Math.round(this.cropStartRect.y + dy);
        
        // Constrain to canvas
        newX = Math.max(0, Math.min(newX, this.canvas.width - this.cropRect.width));
        newY = Math.max(0, Math.min(newY, this.canvas.height - this.cropRect.height));
        
        this.cropRect.x = newX;
        this.cropRect.y = newY;
        
        this.updateCropSelectionPosition();
        this.updateCropDisplay();
    }

    handleCropResize(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        const dx = Math.round((e.clientX - this.cropStartX) * scaleX);
        const dy = Math.round((e.clientY - this.cropStartY) * scaleY);
        
        let newX = this.cropStartRect.x;
        let newY = this.cropStartRect.y;
        let newWidth = this.cropStartRect.width;
        let newHeight = this.cropStartRect.height;
        
        const handle = this.cropHandle;
        
        if (handle.includes('w')) {
            newX = Math.max(0, this.cropStartRect.x + dx);
            newWidth = this.cropStartRect.width - (newX - this.cropStartRect.x);
        }
        if (handle.includes('e')) {
            newWidth = Math.min(this.canvas.width - this.cropStartRect.x, this.cropStartRect.width + dx);
        }
        if (handle.includes('n')) {
            newY = Math.max(0, this.cropStartRect.y + dy);
            newHeight = this.cropStartRect.height - (newY - this.cropStartRect.y);
        }
        if (handle.includes('s')) {
            newHeight = Math.min(this.canvas.height - this.cropStartRect.y, this.cropStartRect.height + dy);
        }
        
        // Min size 1x1
        if (newWidth >= 1 && newHeight >= 1) {
            this.cropRect.x = newX;
            this.cropRect.y = newY;
            this.cropRect.width = newWidth;
            this.cropRect.height = newHeight;
            
            this.updateCropSelectionPosition();
            this.updateCropDisplay();
        }
    }

    updateCropDisplay() {
        if (!this.cropRect) return;
        this.cropSizeDisplay.textContent = `${this.cropRect.width}x${this.cropRect.height}`;
    }

    confirmCrop() {
        if (!this.cropRect) return;
        
        const { x, y, width, height } = this.cropRect;
        
        // Crop all layers
        const newLayers = this.layers.map(layer => {
            const newCanvas = document.createElement('canvas');
            newCanvas.width = width;
            newCanvas.height = height;
            const newCtx = newCanvas.getContext('2d', { alpha: true, willReadFrequently: true });
            newCtx.imageSmoothingEnabled = false;
            
            newCtx.drawImage(
                layer.canvas,
                x, y, width, height,
                0, 0, width, height
            );
            
            return {
                id: layer.id,
                name: layer.name,
                visible: layer.visible,
                canvas: newCanvas,
                ctx: newCtx
            };
        });
        
        this.layers = newLayers;
        
        // Update canvas sizes
        this.canvas.width = width;
        this.canvas.height = height;
        this.tempCanvas.width = width;
        this.tempCanvas.height = height;
        this.previewCanvas.width = width;
        this.previewCanvas.height = height;
        
        if (this.imageData) {
            this.imageData.width = width;
            this.imageData.height = height;
        }
        
        this.exitCropMode();
        this.composeLayers();
        this.updatePreview();
        this.renderLayers();
        this.saveHistory();
        
        console.log(`✂️ Cropped to ${width}x${height}`);
    }

    composeLayers() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (const layer of this.layers) {
            if (layer.visible) {
                this.ctx.drawImage(layer.canvas, 0, 0);
            }
        }
    }

    updatePreview() {
        this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
        this.previewCtx.drawImage(this.canvas, 0, 0);

        // Recompute color counts from the composed canvas so counts stay realtime while drawing
        try {
            if (this.canvas && this.ctx && this.manager && this.manager.selectedImage) {
                const w = this.canvas.width;
                const h = this.canvas.height;
                const imgData = this.ctx.getImageData(0, 0, w, h);
                const pixels = imgData.data;
                const colorMap = new Map();

                for (let i = 0; i < pixels.length; i += 4) {
                    const r = pixels[i];
                    const g = pixels[i + 1];
                    const b = pixels[i + 2];
                    const a = pixels[i + 3];
                    if (a < 128) continue; // ignore transparent
                    const hex = rgbToHex(r, g, b);
                    colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
                }

                // Update selected image colorMap (keep as Map)
                this.manager.selectedImage.colorMap = colorMap;

                // Update preview info (size / total pixels / color count)
                this.updatePreviewInfo(colorMap);

                // Update current palette counts in the editor sidebar (if present)
                const currentPaletteEl = document.getElementById('editorPaletteGrid');
                if (currentPaletteEl) {
                    currentPaletteEl.querySelectorAll('.current-color-item').forEach(el => {
                        const c = (el.dataset.color || '').toUpperCase();
                        const count = colorMap.get(c) || colorMap.get(c.toLowerCase()) || 0;
                        const countEl = el.querySelector('.current-color-count');
                        if (countEl) countEl.textContent = `${count}px`;
                        
                        // Update highlight for not divisible by 10
                        const notDivisibleBy10 = (count % 10) !== 0;
                        if (notDivisibleBy10) {
                            el.classList.add('not-divisible-10');
                            const nameEl = el.querySelector('.current-color-name');
                            if (nameEl && !nameEl.textContent.includes('⚠️')) {
                                nameEl.textContent = nameEl.textContent.replace(' ⚠️', '') + ' ⚠️';
                            }
                        } else {
                            el.classList.remove('not-divisible-10');
                            const nameEl = el.querySelector('.current-color-name');
                            if (nameEl) {
                                nameEl.textContent = nameEl.textContent.replace(' ⚠️', '');
                            }
                        }
                    });
                }
            }
        } catch (err) {
            // getImageData can fail in some contexts; don't break drawing for it
            console.warn('Could not compute realtime colorMap:', err);
        }
    }
    addLayer() {
        const newLayer = {
            id: Date.now(),
            name: `Layer ${this.layers.length + 1}`,
            visible: true,
            canvas: document.createElement('canvas'),
            ctx: null
        };
        
        newLayer.canvas.width = this.canvas.width;
        newLayer.canvas.height = this.canvas.height;
    newLayer.ctx = newLayer.canvas.getContext('2d', { alpha: true, willReadFrequently: true });
        newLayer.ctx.imageSmoothingEnabled = false;
        
        this.layers.push(newLayer);
        this.currentLayerIndex = this.layers.length - 1;
        
        this.renderLayers();
        this.saveHistory();
    }

    deleteLayer() {
        if (this.layers.length <= 1) return;
        
        this.layers.splice(this.currentLayerIndex, 1);
        this.currentLayerIndex = Math.min(this.currentLayerIndex, this.layers.length - 1);
        
        this.renderLayers();
        this.composeLayers();
        this.updatePreview();
        this.saveHistory();
    }

    renderLayers() {
        const html = this.layers.map((layer, index) => {
            const isActive = index === this.currentLayerIndex;
            const visIcon = layer.visible ? '👁️' : '🚫';
            
            return `<div class="layer-item ${isActive ? 'active' : ''}" data-index="${index}">
                        <span class="layer-name">${layer.name}</span>
                        <span class="layer-visibility" data-index="${index}">${visIcon}</span>
                    </div>`;
        }).reverse().join('');
        
        this.layersList.innerHTML = html;
        
        // Add click handlers
        document.querySelectorAll('.layer-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (!e.target.classList.contains('layer-visibility')) {
                    this.currentLayerIndex = parseInt(e.currentTarget.dataset.index);
                    this.renderLayers();
                }
            });
        });
        
        document.querySelectorAll('.layer-visibility').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(e.target.dataset.index);
                this.layers[index].visible = !this.layers[index].visible;
                this.renderLayers();
                this.composeLayers();
                this.updatePreview();
            });
        });
    }

    saveHistory() {
        // Remove any redo history
        this.history = this.history.slice(0, this.historyIndex + 1);
        
        // Save current state
        const state = {
            layers: this.layers.map(layer => ({
                id: layer.id,
                name: layer.name,
                visible: layer.visible,
                imageData: layer.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
            })),
            currentLayerIndex: this.currentLayerIndex
        };
        
        this.history.push(state);
        
        // Limit history
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }
        
        this.updateUndoRedoButtons();
    }

    undo() {
        if (this.historyIndex <= 0) return;
        
        this.historyIndex--;
        this.restoreHistory(this.history[this.historyIndex]);
    }

    redo() {
        if (this.historyIndex >= this.history.length - 1) return;
        
        this.historyIndex++;
        this.restoreHistory(this.history[this.historyIndex]);
    }

    restoreHistory(state) {
        this.currentLayerIndex = state.currentLayerIndex;
        
        // Restore layers
        this.layers = state.layers.map(layerState => {
            const layer = {
                id: layerState.id,
                name: layerState.name,
                visible: layerState.visible,
                canvas: document.createElement('canvas'),
                ctx: null
            };
            
            layer.canvas.width = this.canvas.width;
            layer.canvas.height = this.canvas.height;
            layer.ctx = layer.canvas.getContext('2d', { alpha: true, willReadFrequently: true });
            layer.ctx.imageSmoothingEnabled = false;
            layer.ctx.putImageData(layerState.imageData, 0, 0);
            
            return layer;
        });
        
        this.composeLayers();
        this.updatePreview();
        this.renderLayers();
        this.updateUndoRedoButtons();
    }

    updateUndoRedoButtons() {
        this.undoBtn.disabled = this.historyIndex <= 0;
        this.redoBtn.disabled = this.historyIndex >= this.history.length - 1;
    }

    onKeyDown(e) {
        if (!this.modal.classList.contains('active')) return;
        
        // Undo/Redo
        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            this.undo();
        } else if (e.ctrlKey && e.key === 'y') {
            e.preventDefault();
            this.redo();
        }
        
        // Tool shortcuts
        const toolKeys = {
            'b': 'pencil',
            'e': 'eraser',
            'i': 'picker',
            'g': 'fill',
            'l': 'line',
            'r': 'rectangle',
            'o': 'circle',
            'c': 'crop'
        };
        
        if (toolKeys[e.key.toLowerCase()]) {
            e.preventDefault();
            const tool = toolKeys[e.key.toLowerCase()];
            this.toolButtons.forEach(btn => {
                if (btn.dataset.tool === tool) {
                    btn.click();
                }
            });
        }
    }

    save() {
        // Merge all layers
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = this.canvas.width;
        finalCanvas.height = this.canvas.height;
        const finalCtx = finalCanvas.getContext('2d', { alpha: true, willReadFrequently: true });
        finalCtx.imageSmoothingEnabled = false;
        
        for (const layer of this.layers) {
            if (layer.visible) {
                finalCtx.drawImage(layer.canvas, 0, 0);
            }
        }
        
        // Extract colors
        const imageData = finalCtx.getImageData(0, 0, finalCanvas.width, finalCanvas.height);
        const pixels = imageData.data;
        const colorSet = new Set();
        
        for (let i = 0; i < pixels.length; i += 4) {
            const a = pixels[i + 3];
            if (a < 128) continue;
            
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];
            const hex = rgbToHex(r, g, b).toUpperCase();
            colorSet.add(hex);
        }
        
        const colors = Array.from(colorSet);
        const dataUrl = finalCanvas.toDataURL('image/png');
        
        console.log(`💾 Saving drawing with ${colors.length} colors:`, colors);
        
        // Update image in memory
        this.manager.selectedImage.dataUrl = dataUrl;
        this.manager.selectedImage.colors = colors;
        this.manager.selectedImage.colorCount = colors.length;
        this.manager.selectedImage.palette = colors;
        
        this.manager.saveToStorage();
        
        // Save to server (overwrite file)
        this.saveToServer(dataUrl);
        
        this.close();
        
        // Refresh UI
        const ui = window.ui;
        if (ui) {
            ui.render();
        }
        
        console.log('✅ Drawing saved!');
    }

    async saveToServer(dataUrl) {
        try {
            const img = this.manager.selectedImage;
            
            // Get folder from image
            const folder = this.manager.getFolder(img.folder);
            const folderPath = folder && folder.id !== 'root' ? folder.name : '';
            
            const response = await fetch('/api/save-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: img.name,
                    dataUrl: dataUrl,
                    folder: folderPath
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('✅ File saved to disk:', result.path);
            } else {
                console.error('❌ Failed to save file:', result.message);
                alert('Failed to save file to disk: ' + result.message);
            }
            
        } catch (error) {
            console.error('❌ Error saving to server:', error);
            alert('Error saving file to disk. Check console for details.');
        }
    }

    showColorReplaceMenu(newColor) {
        const colorName = this.manager.paletteColorNames.get(newColor) || newColor;
        
        // Create menu HTML with current colors
        const menuItems = this.palette.map(oldColor => {
            const oldColorName = this.manager.paletteColorNames.get(oldColor) || oldColor;
            const colorMap = this.manager.selectedImage.colorMap || new Map();
            const pixelCount = colorMap.get(oldColor) || colorMap.get(oldColor.toUpperCase()) || colorMap.get(oldColor.toLowerCase()) || 0;
            
            return `
                <div class="replace-menu-item" data-old-color="${oldColor}" data-new-color="${newColor}">
                    <div class="replace-colors">
                        <div class="replace-color-box" style="background-color: ${oldColor}" title="${oldColorName}"></div>
                        <span class="replace-arrow">→</span>
                        <div class="replace-color-box" style="background-color: ${newColor}" title="${colorName}"></div>
                    </div>
                    <div class="replace-info">
                        <div class="replace-name">${oldColorName}</div>
                        <div class="replace-count">${pixelCount}px</div>
                    </div>
                </div>
            `;
        }).join('');
        
        // Show modal
        const existingMenu = document.getElementById('colorReplaceMenu');
        if (existingMenu) existingMenu.remove();
        
        const menu = document.createElement('div');
        menu.id = 'colorReplaceMenu';
        menu.className = 'color-replace-menu';
        menu.innerHTML = `
            <div class="replace-menu-header">
                <h3>Replace Color</h3>
                <div class="replace-menu-subtitle">Select color to replace with <strong>${colorName}</strong></div>
                <button class="replace-menu-close">✖</button>
            </div>
            <div class="replace-menu-items">
                ${menuItems}
            </div>
        `;
        
        document.body.appendChild(menu);
        
        // Add event listeners
        menu.querySelector('.replace-menu-close').addEventListener('click', () => menu.remove());
        menu.addEventListener('click', (e) => {
            if (e.target === menu) menu.remove();
        });
        
        menu.querySelectorAll('.replace-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const oldColor = item.dataset.oldColor;
                const newColor = item.dataset.newColor;
                this.replaceColor(oldColor, newColor);
                menu.remove();
            });
        });
    }

    replaceColor(oldColor, newColor) {
        console.log(`🔄 Replacing ${oldColor} with ${newColor}`);
        
        const oldRgb = hexToRgb(oldColor.toUpperCase());
        const newRgb = hexToRgb(newColor.toUpperCase());
        
        if (!oldRgb || !newRgb) {
            console.error('Invalid color format');
            return;
        }
        
        let replacedCount = 0;
        
        // Replace color in all layers
        this.layers.forEach(layer => {
            const imageData = layer.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            const pixels = imageData.data;
            
            for (let i = 0; i < pixels.length; i += 4) {
                const r = pixels[i];
                const g = pixels[i + 1];
                const b = pixels[i + 2];
                const a = pixels[i + 3];
                
                // Skip transparent
                if (a < 128) continue;
                
                // Check if color matches
                if (r === oldRgb.r && g === oldRgb.g && b === oldRgb.b) {
                    pixels[i] = newRgb.r;
                    pixels[i + 1] = newRgb.g;
                    pixels[i + 2] = newRgb.b;
                    replacedCount++;
                }
            }
            
            layer.ctx.putImageData(imageData, 0, 0);
        });
        
        console.log(`✅ Replaced ${replacedCount} pixels`);
        
        // Update display
        this.composeLayers();
        this.updatePreview();
        this.saveHistory();
        
        // Update palette
        const newPalette = this.palette.filter(c => c.toUpperCase() !== oldColor.toUpperCase());
        if (!newPalette.includes(newColor.toUpperCase())) {
            newPalette.push(newColor.toUpperCase());
        }
        this.palette = newPalette;
        
        // Re-setup palette display
        const colorMap = this.manager.selectedImage.colorMap || new Map();
        this.setupPalette(this.palette);
    }

    // ===== LASSO TOOL =====
    
    enterLassoMode() {
        this.lassoMode = true;
        this.lassoControlsSection.style.display = 'block';
        this.lassoPoints = [];
        this.clearLassoSelection();
    }

    exitLassoMode() {
        this.lassoMode = false;
        if (this.lassoControlsSection) {
            this.lassoControlsSection.style.display = 'none';
        }
        this.clearLassoSelection();
        this.lassoPoints = [];
    }

    clearLassoSelection() {
        const existing = document.getElementById('lassoSelection');
        if (existing) existing.remove();
        
        const existingContent = document.getElementById('lassoContentDiv');
        if (existingContent) existingContent.remove();
        
        this.lassoSelection = null;
        this.lassoContent = null;
    }

    drawLassoPath() {
        if (this.lassoPoints.length < 2) return;
        
        this.clearLassoSelection();
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'lassoSelection';
        svg.className = 'lasso-selection';
        svg.style.cssText = `position: absolute; top: 0; left: 0; width: ${this.canvas.offsetWidth}px; height: ${this.canvas.offsetHeight}px; pointer-events: none;`;
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.className = 'lasso-path';
        
        let d = `M ${this.lassoPoints[0].x * this.zoom} ${this.lassoPoints[0].y * this.zoom}`;
        for (let i = 1; i < this.lassoPoints.length; i++) {
            d += ` L ${this.lassoPoints[i].x * this.zoom} ${this.lassoPoints[i].y * this.zoom}`;
        }
        d += ' Z';
        
        path.setAttribute('d', d);
        svg.appendChild(path);
        
        this.canvasWrapper.appendChild(svg);
        this.lassoSelection = svg;
    }

    isPointInLasso(px, py) {
        if (this.lassoPoints.length < 3) return false;
        
        let inside = false;
        for (let i = 0, j = this.lassoPoints.length - 1; i < this.lassoPoints.length; j = i++) {
            const xi = this.lassoPoints[i].x, yi = this.lassoPoints[i].y;
            const xj = this.lassoPoints[j].x, yj = this.lassoPoints[j].y;
            
            const intersect = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    extractLassoContent() {
        if (this.lassoPoints.length < 3) return;
        
        const layer = this.layers[this.currentLayerIndex];
        const imageData = layer.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const pixels = imageData.data;
        
        // Find bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.lassoPoints.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
        
        minX = Math.max(0, Math.floor(minX));
        minY = Math.max(0, Math.floor(minY));
        maxX = Math.min(this.canvas.width - 1, Math.ceil(maxX));
        maxY = Math.min(this.canvas.height - 1, Math.ceil(maxY));
        
        const width = maxX - minX + 1;
        const height = maxY - minY + 1;
        
        // Create content canvas
        const contentCanvas = document.createElement('canvas');
        contentCanvas.width = width;
        contentCanvas.height = height;
        const contentCtx = contentCanvas.getContext('2d', { alpha: true, willReadFrequently: true });
        const contentData = contentCtx.createImageData(width, height);
        
        // Copy pixels inside lasso
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                if (this.isPointInLasso(x, y)) {
                    const srcIdx = (y * this.canvas.width + x) * 4;
                    const dstIdx = ((y - minY) * width + (x - minX)) * 4;
                    
                    contentData.data[dstIdx] = pixels[srcIdx];
                    contentData.data[dstIdx + 1] = pixels[srcIdx + 1];
                    contentData.data[dstIdx + 2] = pixels[srcIdx + 2];
                    contentData.data[dstIdx + 3] = pixels[srcIdx + 3];
                    
                    // Clear from original layer
                    pixels[srcIdx + 3] = 0;
                }
            }
        }
        
        contentCtx.putImageData(contentData, 0, 0);
        layer.ctx.putImageData(imageData, 0, 0);
        
        // Create floating content div
        const contentDiv = document.createElement('div');
        contentDiv.id = 'lassoContentDiv';
        contentDiv.className = 'lasso-content';
        contentDiv.style.cssText = `left: ${minX * this.zoom}px; top: ${minY * this.zoom}px; width: ${width * this.zoom}px; height: ${height * this.zoom}px;`;
        contentDiv.appendChild(contentCanvas);
        
        contentCanvas.style.width = (width * this.zoom) + 'px';
        contentCanvas.style.height = (height * this.zoom) + 'px';
        
        this.canvasWrapper.appendChild(contentDiv);
        this.lassoContent = {
            canvas: contentCanvas,
            div: contentDiv,
            x: minX,
            y: minY,
            width: width,
            height: height
        };
        
        // Add drag handlers
        contentDiv.addEventListener('mousedown', (e) => this.onLassoContentMouseDown(e));
        
        this.composeLayers();
        this.updatePreview();
    }

    onLassoContentMouseDown(e) {
        e.stopPropagation();
        this.lassoDragging = true;
        const rect = this.canvasWrapper.getBoundingClientRect();
        this.lassoDragStart = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            contentX: this.lassoContent.x,
            contentY: this.lassoContent.y
        };
        
        const onMove = (e) => {
            if (!this.lassoDragging) return;
            const rect = this.canvasWrapper.getBoundingClientRect();
            const currentX = e.clientX - rect.left;
            const currentY = e.clientY - rect.top;
            
            const deltaX = Math.round((currentX - this.lassoDragStart.x) / this.zoom);
            const deltaY = Math.round((currentY - this.lassoDragStart.y) / this.zoom);
            
            this.lassoContent.x = this.lassoDragStart.contentX + deltaX;
            this.lassoContent.y = this.lassoDragStart.contentY + deltaY;
            
            this.lassoContent.div.style.left = (this.lassoContent.x * this.zoom) + 'px';
            this.lassoContent.div.style.top = (this.lassoContent.y * this.zoom) + 'px';
        };
        
        const onUp = () => {
            this.lassoDragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    moveLassoContent() {
        if (!this.lassoContent) return;
        
        // Paste content to current position
        const layer = this.layers[this.currentLayerIndex];
        layer.ctx.drawImage(
            this.lassoContent.canvas,
            this.lassoContent.x,
            this.lassoContent.y
        );
        
        this.composeLayers();
        this.updatePreview();
        this.saveHistory();
        this.exitLassoMode();
        
        console.log('📦 Moved lasso content');
    }

    cutLassoContent() {
        // Content is already cut (extracted), just finalize
        this.exitLassoMode();
        this.saveHistory();
        console.log('✂️ Cut lasso content');
    }

    close() {
        this.modal.classList.remove('active');
        this.layers = [];
        this.history = [];
        this.historyIndex = -1;
    }
}

// ===== Level Manager =====
class LevelManager {
    constructor(pixelArtManager) {
        this.manager = pixelArtManager;
        this.levels = [];
        this.currentLevel = null;
        this.sortColumn = null;
        this.sortDirection = 'asc'; // 'asc' or 'desc'
        
        this.initElements();
        this.attachEventListeners();
        this.loadFromStorage();
        this.switchView('gallery'); // Default to gallery only
    }

    initElements() {
        this.splitContainer = document.getElementById('splitContainer');
        this.levelView = document.getElementById('levelView');
        this.galleryView = document.getElementById('galleryView');
        this.levelTableBody = document.getElementById('levelTableBody');
        this.totalLevels = document.getElementById('totalLevels');
        this.assignedLevels = document.getElementById('assignedLevels');
        this.readyLevels = document.getElementById('readyLevels');
        
        // Tabs
        this.galleryTab = document.getElementById('galleryViewTab');
        this.splitTab = document.getElementById('splitViewTab');
        this.levelTab = document.getElementById('levelViewTab');
        
        // Buttons
        this.importLevelDataBtn = document.getElementById('importLevelDataBtn');
        this.exportLevelSheetBtn = document.getElementById('exportLevelSheetBtn');
        this.levelDataInput = document.getElementById('levelDataInput');
        
        // Modal
        this.assignModal = document.getElementById('assignImageModal');
        this.assignLevelNumber = document.getElementById('assignLevelNumber');
        this.assignImageGrid = document.getElementById('assignImageGrid');
        this.assignSearchInput = document.getElementById('assignSearchInput');
        this.assignMatchRequirementsCheck = document.getElementById('assignMatchRequirementsCheck');
        this.assignReadyOnlyCheck = document.getElementById('assignReadyOnlyCheck');
    }

    attachEventListeners() {
        // Tab switching
        this.galleryTab.addEventListener('click', () => this.switchView('gallery'));
        this.splitTab.addEventListener('click', () => this.switchView('split'));
        this.levelTab.addEventListener('click', () => this.switchView('level'));
        
        // Import level data
        this.importLevelDataBtn.addEventListener('click', () => {
            this.levelDataInput.click();
        });
        
        this.levelDataInput.addEventListener('change', (e) => {
            this.handleLevelDataImport(e.target.files[0]);
        });
        
        // Export sheet
        this.exportLevelSheetBtn.addEventListener('click', () => {
            this.exportLevelSheet();
        });
        
        // Assign modal
        document.getElementById('cancelAssignBtn').addEventListener('click', () => {
            this.hideAssignModal();
        });
        
        this.assignSearchInput.addEventListener('input', () => {
            this.renderAssignImageGrid();
        });
        
        this.assignMatchRequirementsCheck.addEventListener('change', () => {
            this.renderAssignImageGrid();
        });
        
        this.assignReadyOnlyCheck.addEventListener('change', () => {
            this.renderAssignImageGrid();
        });
    }

    switchView(view) {
        // Remove all active classes
        this.galleryTab.classList.remove('active');
        this.splitTab.classList.remove('active');
        this.levelTab.classList.remove('active');
        
        // Remove all view classes
        this.splitContainer.classList.remove('gallery-only', 'split-view', 'level-only');
        
        if (view === 'gallery') {
            this.splitContainer.classList.add('gallery-only');
            this.galleryTab.classList.add('active');
        } else if (view === 'split') {
            this.splitContainer.classList.add('split-view');
            this.splitTab.classList.add('active');
        } else if (view === 'level') {
            this.splitContainer.classList.add('level-only');
            this.levelTab.classList.add('active');
        }
    }

    async handleLevelDataImport(file) {
        if (!file) return;
        
        const text = await file.text();
        const ext = file.name.split('.').pop().toLowerCase();
        
        try {
            if (ext === 'json') {
                this.levels = JSON.parse(text);
            } else if (ext === 'csv') {
                this.levels = this.parseCSV(text);
            }
            
            this.saveToStorage();
            this.renderLevelTable();
            alert(`✅ Imported ${this.levels.length} levels`);
        } catch (error) {
            alert('❌ Error importing level data: ' + error.message);
        }
    }

    parseCSV(text) {
        const lines = text.split('\n').filter(l => l.trim());
        const levels = [];
        
        // Parse header to find column indices
        let headerLine = lines[0];
        const hasHeader = headerLine.toLowerCase().includes('level') || 
                         headerLine.toLowerCase().includes('tên');
        
        const startIndex = hasHeader ? 1 : 0;
        
        for (let i = startIndex; i < lines.length; i++) {
            // Split but preserve empty values
            const parts = lines[i].split(',');
            
            // Trim each part but keep track of empty columns
            const trimmedParts = parts.map(p => p ? p.trim() : '');
            
            if (trimmedParts.length >= 2) {
                // Column mapping theo hình:
                // A=0: Tên Level (Level number)
                // B=1: Độ Khó Level (Level difficulty)
                // C-G=2-6: BỎ QUA
                // H=7: Số lượng màu (Colors)
                // I=8: Số lượng Pixel (Size)
                // J=9: tranh (Preview image path/name)
                // K=10: Độ khó của tranh (Image difficulty)
                // L-N=11-13: BỎ QUA
                
                const level = {
                    level: parseInt(trimmedParts[0]) || levels.length + 1, // Column A
                    difficulty: trimmedParts[1] || 'easy', // Column B
                    colors: parseInt(trimmedParts[7]) || 0, // Column H
                    size: trimmedParts[8] || '', // Column I
                    imageDifficulty: trimmedParts[10] || '', // Column K
                    assignedImage: null,
                    status: 'empty'
                };
                
                levels.push(level);
            }
        }
        
        return levels;
    }

    renderLevelTable() {
        if (this.levels.length === 0) {
            this.levelTableBody.innerHTML = `
                <tr class="empty-row">
                    <td colspan="9">
                        <div class="empty-state">
                            <p>📥 Import level data (CSV/JSON) to start</p>
                            <p class="empty-hint">Format: level, difficulty, colors, size, note</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }
        
        const html = this.levels.map(level => {
            const assignedImg = level.assignedImage ? 
                this.manager.images.find(img => img.id === level.assignedImage) : null;
            
            let statusClass = 'empty';
            let statusText = 'Empty';
            
            if (assignedImg) {
                const isReady = this.manager.isReadyToDev(assignedImg);
                statusClass = isReady ? 'ready' : 'assigned';
                statusText = isReady ? '✓ Ready' : 'Assigned';
            }
            
            const difficultyClass = `difficulty-${level.difficulty.toLowerCase().replace(/\s+/g, '')}`;
            
            // Image difficulty badge class
            const imgDiffClass = level.imageDifficulty ? 
                `difficulty-${level.imageDifficulty.toLowerCase().replace(/\s+/g, '')}` : '';
            
            // Check if there are matching images for this level (for highlight)
            let rowClass = '';
            let matchingImagesCount = 0;
            if (level.colors && level.size) {
                const availableImages = this.manager.images.filter(img => {
                    const imgSize = `${img.width}x${img.height}`.toLowerCase();
                    const levelSize = level.size.toLowerCase();
                    const matchesSize = imgSize === levelSize;
                    const matchesColors = img.colorCount === level.colors;
                    
                    // Check if not assigned to another level
                    const isAssignedElsewhere = this.levels.some(l => 
                        l.assignedImage === img.id && l.level !== level.level
                    );
                    
                    return matchesSize && matchesColors && !isAssignedElsewhere;
                });
                
                matchingImagesCount = availableImages.length;
                
                if (matchingImagesCount > 0 && !assignedImg) {
                    rowClass = 'level-has-matches';
                } else if (!assignedImg) {
                    rowClass = 'level-no-assignment';
                }
            } else if (!assignedImg) {
                rowClass = 'level-no-assignment';
            }
            
            return `
                <tr data-level="${level.level}" data-droppable="true" class="${rowClass}">
                    <td><span class="level-number">${level.level}</span></td>
                    <td><span class="difficulty-badge ${difficultyClass}">${level.difficulty}</span></td>
                    <td>${level.colors || '-'}</td>
                    <td>${level.size || '-'}</td>
                    <td class="level-preview-cell">
                        ${assignedImg ? `<img src="${assignedImg.dataUrl}" class="level-preview-img">` : '-'}
                    </td>
                    <td>
                        ${assignedImg ? `
                            <div class="level-assigned-img">
                                <img src="${assignedImg.dataUrl}">
                                <span class="level-assigned-name">${assignedImg.name}</span>
                            </div>
                        ` : (matchingImagesCount > 0 ? `<span class="match-hint">${matchingImagesCount} match${matchingImagesCount > 1 ? 'es' : ''}</span>` : '-')}
                    </td>
                    <td><span class="level-status status-${statusClass}">${statusText}</span></td>
                    <td>${level.imageDifficulty ? `<span class="difficulty-badge ${imgDiffClass}">${level.imageDifficulty}</span>` : '-'}</td>
                    <td class="level-actions">
                        <button class="btn-assign" onclick="levelManager.showAssignModal(${level.level})">
                            ${assignedImg ? 'Change' : 'Assign'}
                        </button>
                        ${assignedImg ? `<button class="btn-remove" onclick="levelManager.removeAssignment(${level.level})">Remove</button>` : ''}
                        <button class="btn-remove" onclick="levelManager.deleteLevel(${level.level})" title="Delete Level">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');
        
        this.levelTableBody.innerHTML = html;
        this.setupDragAndDrop();
        this.updateStats();
        this.updateSortArrows();
    }

    updateStats() {
        this.totalLevels.textContent = this.levels.length;
        
        const assigned = this.levels.filter(l => l.assignedImage).length;
        this.assignedLevels.textContent = assigned;
        
        const ready = this.levels.filter(l => {
            if (!l.assignedImage) return false;
            const img = this.manager.images.find(i => i.id === l.assignedImage);
            return img && this.manager.isReadyToDev(img);
        }).length;
        this.readyLevels.textContent = ready;
    }

    showAssignModal(levelNumber) {
        const level = this.levels.find(l => l.level === levelNumber);
        if (!level) return;
        
        this.currentLevel = level;
        this.assignLevelNumber.textContent = levelNumber;
        this.renderAssignImageGrid();
        this.assignModal.classList.add('active');
    }

    hideAssignModal() {
        this.assignModal.classList.remove('active');
        this.currentLevel = null;
    }

    renderAssignImageGrid() {
        let images = [...this.manager.images];
        
        // Filter out already assigned images (to other levels)
        const assignedImageIds = this.levels
            .filter(l => l.assignedImage && l.level !== this.currentLevel.level)
            .map(l => l.assignedImage);
        
        images = images.filter(img => !assignedImageIds.includes(img.id));
        
        // Filter by search
        const query = this.assignSearchInput.value.toLowerCase();
        if (query) {
            images = images.filter(img => img.name.toLowerCase().includes(query));
        }
        
        // Filter by requirements (size & colors)
        if (this.assignMatchRequirementsCheck.checked && this.currentLevel) {
            images = images.filter(img => {
                let matchesSize = true;
                let matchesColors = true;
                
                // Check size if level has size requirement
                if (this.currentLevel.size) {
                    const expectedSize = this.currentLevel.size.toLowerCase();
                    const actualSize = `${img.width}x${img.height}`.toLowerCase();
                    matchesSize = actualSize === expectedSize;
                }
                
                // Check colors if level has color requirement
                if (this.currentLevel.colors > 0) {
                    matchesColors = img.colorCount === this.currentLevel.colors;
                }
                
                return matchesSize && matchesColors;
            });
        }
        
        // Filter by ready only
        if (this.assignReadyOnlyCheck.checked) {
            images = images.filter(img => this.manager.isReadyToDev(img));
        }
        
        if (images.length === 0) {
            this.assignImageGrid.innerHTML = `
                <div class="empty-state">
                    <p>No images found</p>
                    <p class="empty-hint">Try disabling filters</p>
                </div>
            `;
            return;
        }
        
        const html = images.map(img => {
            const isReady = this.manager.isReadyToDev(img);
            return `
                <div class="assign-image-item" onclick="levelManager.assignImage(${img.id})">
                    <img src="${img.dataUrl}">
                    <div class="assign-image-name">${img.name}</div>
                    <div class="assign-image-info">${img.width}x${img.height} | ${img.colorCount}c ${isReady ? '✓' : ''}</div>
                </div>
            `;
        }).join('');
        
        this.assignImageGrid.innerHTML = html;
    }

    assignImage(imageId) {
        if (!this.currentLevel) return;
        
        this.currentLevel.assignedImage = imageId;
        this.saveToStorage();
        this.renderLevelTable();
        this.hideAssignModal();
    }

    removeAssignment(levelNumber) {
        const level = this.levels.find(l => l.level === levelNumber);
        if (!level) return;
        
        if (confirm(`Remove assignment from Level ${levelNumber}?`)) {
            level.assignedImage = null;
            this.saveToStorage();
            this.renderLevelTable();
        }
    }

    exportLevelSheet() {
        const data = this.levels.map(level => {
            const img = level.assignedImage ? 
                this.manager.images.find(i => i.id === level.assignedImage) : null;
            
            const isReady = img && this.manager.isReadyToDev(img);
            
            return {
                level: level.level,
                difficulty: level.difficulty,
                colors: level.colors,
                size: level.size,
                assignedImage: img ? img.name : '',
                actualColors: img ? img.colorCount : '',
                actualSize: img ? `${img.width}x${img.height}` : '',
                status: isReady ? 'Ready' : (img ? 'Assigned' : 'Empty'),
                imageDifficulty: level.imageDifficulty || ''
            };
        });
        
        // Create CSV with necessary columns
        const headers = ['Level', 'Level Difficulty', 'Expected Colors', 'Expected Size', 'Assigned Image', 'Actual Colors', 'Actual Size', 'Status', 'Image Difficulty'];
        const csv = [
            headers.join(','),
            ...data.map(row => [
                row.level,
                row.difficulty,
                row.colors,
                row.size,
                row.assignedImage,
                row.actualColors,
                row.actualSize,
                row.status,
                row.imageDifficulty
            ].join(','))
        ].join('\n');
        
        // Download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `level-sheet-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    setupDragAndDrop() {
        // Setup draggable images in gallery
        const imageItems = document.querySelectorAll('.image-item');
        imageItems.forEach(item => {
            item.setAttribute('draggable', 'true');
            
            item.addEventListener('dragstart', (e) => {
                const imageId = e.currentTarget.dataset.imageId;
                e.dataTransfer.setData('imageId', imageId);
                e.currentTarget.classList.add('dragging');
            });
            
            item.addEventListener('dragend', (e) => {
                e.currentTarget.classList.remove('dragging');
            });
        });
        
        // Setup drop zones in level table
        const levelRows = document.querySelectorAll('tr[data-droppable="true"]');
        levelRows.forEach(row => {
            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.currentTarget.classList.add('drag-over');
            });
            
            row.addEventListener('dragleave', (e) => {
                e.currentTarget.classList.remove('drag-over');
            });
            
            row.addEventListener('drop', (e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('drag-over');
                
                const imageId = parseFloat(e.dataTransfer.getData('imageId'));
                const levelNumber = parseInt(e.currentTarget.dataset.level);
                
                if (imageId && levelNumber) {
                    this.assignImageToLevel(imageId, levelNumber);
                }
            });
        });
    }

    assignImageToLevel(imageId, levelNumber) {
        const level = this.levels.find(l => l.level === levelNumber);
        if (!level) return;
        
        level.assignedImage = imageId;
        this.saveToStorage();
        this.renderLevelTable();
        
        // Show notification
        const img = this.manager.images.find(i => i.id === imageId);
        if (img) {
            console.log(`✅ Assigned "${img.name}" to Level ${levelNumber}`);
        }
    }

    deleteLevel(levelNumber) {
        if (!confirm(`Delete Level ${levelNumber}? This cannot be undone.`)) {
            return;
        }
        
        this.levels = this.levels.filter(l => l.level !== levelNumber);
        this.saveToStorage();
        this.renderLevelTable();
    }

    sortLevels(column) {
        // Toggle direction if clicking the same column, otherwise reset to asc
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }
        
        // Sort the levels array
        this.levels.sort((a, b) => {
            let valA, valB;
            
            switch(column) {
                case 'level':
                    valA = a.level || 0;
                    valB = b.level || 0;
                    break;
                case 'difficulty':
                    valA = (a.difficulty || '').toLowerCase();
                    valB = (b.difficulty || '').toLowerCase();
                    break;
                case 'colors':
                    valA = a.colors || 0;
                    valB = b.colors || 0;
                    break;
                case 'size':
                    // Parse size like "20x20" to numeric for sorting
                    const parseSize = (size) => {
                        if (!size) return 0;
                        const [w, h] = size.toLowerCase().split('x').map(n => parseInt(n) || 0);
                        return w * h;
                    };
                    valA = parseSize(a.size);
                    valB = parseSize(b.size);
                    break;
                case 'assigned':
                    // Sort by whether assigned or not, then by image name
                    if (!a.assignedImage && !b.assignedImage) return 0;
                    if (!a.assignedImage) return this.sortDirection === 'asc' ? 1 : -1;
                    if (!b.assignedImage) return this.sortDirection === 'asc' ? -1 : 1;
                    
                    const imgA = this.manager.images.find(i => i.id === a.assignedImage);
                    const imgB = this.manager.images.find(i => i.id === b.assignedImage);
                    valA = imgA ? imgA.name.toLowerCase() : '';
                    valB = imgB ? imgB.name.toLowerCase() : '';
                    break;
                case 'status':
                    // Sort by status: Ready > Pending > Empty
                    const getStatusValue = (level) => {
                        if (!level.assignedImage) return 0;
                        const img = this.manager.images.find(i => i.id === level.assignedImage);
                        if (!img) return 0;
                        return this.manager.isReadyToDev(img) ? 2 : 1;
                    };
                    valA = getStatusValue(a);
                    valB = getStatusValue(b);
                    break;
                case 'imageDiff':
                    valA = (a.imageDifficulty || '').toLowerCase();
                    valB = (b.imageDifficulty || '').toLowerCase();
                    break;
                default:
                    return 0;
            }
            
            // Compare values
            let comparison = 0;
            if (valA < valB) comparison = -1;
            if (valA > valB) comparison = 1;
            
            return this.sortDirection === 'asc' ? comparison : -comparison;
        });
        
        this.renderLevelTable();
        this.updateSortArrows();
    }

    updateSortArrows() {
        // Reset all arrows
        const arrows = ['sortLevel', 'sortDifficulty', 'sortColors', 'sortSize', 'sortAssigned', 'sortStatus', 'sortImageDiff'];
        arrows.forEach(id => {
            const elem = document.getElementById(id);
            if (elem) elem.textContent = '↕';
        });
        
        // Update active arrow
        if (this.sortColumn) {
            const columnMap = {
                'level': 'sortLevel',
                'difficulty': 'sortDifficulty',
                'colors': 'sortColors',
                'size': 'sortSize',
                'assigned': 'sortAssigned',
                'status': 'sortStatus',
                'imageDiff': 'sortImageDiff'
            };
            
            const activeId = columnMap[this.sortColumn];
            if (activeId) {
                const elem = document.getElementById(activeId);
                if (elem) {
                    elem.textContent = this.sortDirection === 'asc' ? '↑' : '↓';
                }
            }
        }
    }

    saveToStorage() {
        localStorage.setItem('pixelVoxelLevels', JSON.stringify(this.levels));
    }

    loadFromStorage() {
        const stored = localStorage.getItem('pixelVoxelLevels');
        if (stored) {
            this.levels = JSON.parse(stored);
            this.renderLevelTable();
        }
    }
}

// ===== Initialize App =====
const manager = new PixelArtManager();
const ui = new UIController(manager);
const levelManager = new LevelManager(manager);
window.ui = ui; // Make accessible for pixel editor
window.levelManager = levelManager; // Make accessible for level actions

console.log('PixelVoxel initialized! 🎨');