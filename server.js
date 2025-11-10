const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const PIXEL_ASSETS_DIR = path.join(__dirname, 'PixelAssets');

// Middleware to parse JSON and handle large payloads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(__dirname));

// API to get all PNG files from PixelAssets folder
app.get('/api/images', (req, res) => {
    try {
        const images = [];
        
        // Recursive function to scan directories
        function scanDirectory(dir, relativePath = '') {
            const items = fs.readdirSync(dir);
            
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stats = fs.statSync(fullPath);
                
                if (stats.isDirectory()) {
                    // Recursively scan subdirectories
                    scanDirectory(fullPath, path.join(relativePath, item));
                } else if (stats.isFile() && item.toLowerCase().endsWith('.png')) {
                    // Add PNG file to list
                    const relPath = path.join(relativePath, item);
                    images.push({
                        name: item,
                        path: relPath.replace(/\\/g, '/'), // Convert to forward slashes
                        folder: relativePath.replace(/\\/g, '/'),
                        url: `/PixelAssets/${relPath.replace(/\\/g, '/')}`
                    });
                }
            }
        }
        
        // Check if PixelAssets directory exists
        if (!fs.existsSync(PIXEL_ASSETS_DIR)) {
            return res.json({ 
                success: false, 
                message: 'PixelAssets folder not found',
                images: [] 
            });
        }
        
        scanDirectory(PIXEL_ASSETS_DIR);
        
        res.json({
            success: true,
            count: images.length,
            images: images
        });
        
    } catch (error) {
        console.error('Error scanning directory:', error);
        res.status(500).json({
            success: false,
            message: error.message,
            images: []
        });
    }
});

// API to save/overwrite PNG file
app.post('/api/save-image', (req, res) => {
    try {
        const { filename, dataUrl, folder } = req.body;
        
        if (!filename || !dataUrl) {
            return res.status(400).json({
                success: false,
                message: 'Missing filename or dataUrl'
            });
        }
        
        // Extract base64 data from dataUrl
        const matches = dataUrl.match(/^data:image\/png;base64,(.+)$/);
        if (!matches) {
            return res.status(400).json({
                success: false,
                message: 'Invalid dataUrl format'
            });
        }
        
        const base64Data = matches[1];
        const buffer = Buffer.from(base64Data, 'base64');
        
        // Construct file path
        let targetDir = PIXEL_ASSETS_DIR;
        if (folder && folder !== '') {
            targetDir = path.join(PIXEL_ASSETS_DIR, folder);
            
            // Create directory if it doesn't exist
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
        }
        
        const filePath = path.join(targetDir, filename);
        
        // Write file
        fs.writeFileSync(filePath, buffer);
        
        console.log(`✅ Saved: ${filePath}`);
        
        res.json({
            success: true,
            message: 'File saved successfully',
            path: filePath
        });
        
    } catch (error) {
        console.error('Error saving file:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// API to delete PNG file
app.delete('/api/delete-image', (req, res) => {
    try {
        const { filename, folder } = req.body;
        
        if (!filename) {
            return res.status(400).json({
                success: false,
                message: 'Missing filename'
            });
        }
        
        // Construct file path
        let targetDir = PIXEL_ASSETS_DIR;
        if (folder && folder !== '') {
            targetDir = path.join(PIXEL_ASSETS_DIR, folder);
        }
        
        const filePath = path.join(targetDir, filename);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }
        
        // Delete file
        fs.unlinkSync(filePath);
        
        console.log(`🗑️ Deleted: ${filePath}`);
        
        res.json({
            success: true,
            message: 'File deleted successfully'
        });
        
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// API to create folder
app.post('/api/create-folder', (req, res) => {
    try {
        const { folderName, parentFolder } = req.body;
        
        if (!folderName) {
            return res.status(400).json({
                success: false,
                message: 'Missing folderName'
            });
        }
        
        // Construct folder path
        let targetDir = PIXEL_ASSETS_DIR;
        if (parentFolder && parentFolder !== '') {
            targetDir = path.join(PIXEL_ASSETS_DIR, parentFolder);
        }
        
        const newFolderPath = path.join(targetDir, folderName);
        
        // Check if folder already exists
        if (fs.existsSync(newFolderPath)) {
            return res.status(400).json({
                success: false,
                message: 'Folder already exists'
            });
        }
        
        // Create folder
        fs.mkdirSync(newFolderPath, { recursive: true });
        
        console.log(`📁 Created folder: ${newFolderPath}`);
        
        res.json({
            success: true,
            message: 'Folder created successfully',
            path: newFolderPath
        });
        
    } catch (error) {
        console.error('Error creating folder:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// API to move/rename file
app.post('/api/move-image', (req, res) => {
    try {
        const { filename, fromFolder, toFolder } = req.body;
        
        if (!filename) {
            return res.status(400).json({
                success: false,
                message: 'Missing filename'
            });
        }
        
        // Construct source path
        let sourceDir = PIXEL_ASSETS_DIR;
        if (fromFolder && fromFolder !== '') {
            sourceDir = path.join(PIXEL_ASSETS_DIR, fromFolder);
        }
        const sourcePath = path.join(sourceDir, filename);
        
        // Check if source exists
        if (!fs.existsSync(sourcePath)) {
            return res.status(404).json({
                success: false,
                message: 'Source file not found'
            });
        }
        
        // Construct destination path
        let destDir = PIXEL_ASSETS_DIR;
        if (toFolder && toFolder !== '') {
            destDir = path.join(PIXEL_ASSETS_DIR, toFolder);
            
            // Create destination folder if it doesn't exist
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }
        }
        const destPath = path.join(destDir, filename);
        
        // Move file
        fs.renameSync(sourcePath, destPath);
        
        console.log(`📦 Moved: ${sourcePath} → ${destPath}`);
        
        res.json({
            success: true,
            message: 'File moved successfully',
            newPath: destPath
        });
        
    } catch (error) {
        console.error('Error moving file:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// API to get folder structure
app.get('/api/folders', (req, res) => {
    try {
        const folders = [];
        
        function scanFolders(dir, relativePath = '') {
            const items = fs.readdirSync(dir);
            
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stats = fs.statSync(fullPath);
                
                if (stats.isDirectory()) {
                    const relPath = path.join(relativePath, item);
                    folders.push({
                        name: item,
                        path: relPath.replace(/\\/g, '/'),
                        parent: relativePath.replace(/\\/g, '/') || null
                    });
                    
                    // Recursively scan subdirectories
                    scanFolders(fullPath, relPath);
                }
            }
        }
        
        if (fs.existsSync(PIXEL_ASSETS_DIR)) {
            scanFolders(PIXEL_ASSETS_DIR);
        }
        
        res.json({
            success: true,
            count: folders.length,
            folders: folders
        });
        
    } catch (error) {
        console.error('Error scanning folders:', error);
        res.status(500).json({
            success: false,
            message: error.message,
            folders: []
        });
    }
});

// API to rename file
app.post('/api/rename-image', (req, res) => {
    try {
        const { oldFilename, newFilename, folder } = req.body;
        
        if (!oldFilename || !newFilename) {
            return res.status(400).json({
                success: false,
                message: 'Missing oldFilename or newFilename'
            });
        }
        
        // Construct paths
        let targetDir = PIXEL_ASSETS_DIR;
        if (folder && folder !== '') {
            targetDir = path.join(PIXEL_ASSETS_DIR, folder);
        }
        
        const oldPath = path.join(targetDir, oldFilename);
        const newPath = path.join(targetDir, newFilename);
        
        // Check if source exists
        if (!fs.existsSync(oldPath)) {
            return res.status(404).json({
                success: false,
                message: 'Source file not found'
            });
        }
        
        // Check if destination already exists
        if (fs.existsSync(newPath)) {
            return res.status(409).json({
                success: false,
                message: 'File with new name already exists'
            });
        }
        
        // Rename file
        fs.renameSync(oldPath, newPath);
        
        console.log(`🏷️ Renamed: ${oldFilename} → ${newFilename}`);
        
        res.json({
            success: true,
            message: 'File renamed successfully',
            oldName: oldFilename,
            newName: newFilename
        });
        
    } catch (error) {
        console.error('Error renaming file:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// API to copy file (for safe rename)
app.post('/api/copy-image', (req, res) => {
    try {
        const { sourceFilename, destFilename, folder } = req.body;
        
        if (!sourceFilename || !destFilename) {
            return res.status(400).json({
                success: false,
                message: 'Missing sourceFilename or destFilename'
            });
        }
        
        // Construct paths
        let targetDir = PIXEL_ASSETS_DIR;
        if (folder && folder !== '') {
            targetDir = path.join(PIXEL_ASSETS_DIR, folder);
        }
        
        const sourcePath = path.join(targetDir, sourceFilename);
        const destPath = path.join(targetDir, destFilename);
        
        // Check if source exists
        if (!fs.existsSync(sourcePath)) {
            return res.status(404).json({
                success: false,
                message: 'Source file not found'
            });
        }
        
        // Check if destination already exists
        if (fs.existsSync(destPath)) {
            return res.status(409).json({
                success: false,
                message: 'Destination file already exists'
            });
        }
        
        // Copy file
        fs.copyFileSync(sourcePath, destPath);
        
        console.log(`📋 Copied: ${sourceFilename} → ${destFilename}`);
        
        res.json({
            success: true,
            message: 'File copied successfully',
            sourceName: sourceFilename,
            destName: destFilename
        });
        
    } catch (error) {
        console.error('Error copying file:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// API to delete file
app.post('/api/delete-image', (req, res) => {
    try {
        const { filename, folder } = req.body;
        
        if (!filename) {
            return res.status(400).json({
                success: false,
                message: 'Missing filename'
            });
        }
        
        // Construct path
        let targetDir = PIXEL_ASSETS_DIR;
        if (folder && folder !== '') {
            targetDir = path.join(PIXEL_ASSETS_DIR, folder);
        }
        
        const filePath = path.join(targetDir, filename);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }
        
        // Delete file
        fs.unlinkSync(filePath);
        
        console.log(`🗑️ Deleted: ${filename}`);
        
        res.json({
            success: true,
            message: 'File deleted successfully',
            filename: filename
        });
        
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// API to save assignment data to file
app.post('/api/save-assignment-data', (req, res) => {
    try {
        const data = req.body;
        
        // Save to project root
        const filePath = path.join(__dirname, 'level-assignments.json');
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        
        console.log(`💾 Assignment data saved to: level-assignments.json`);
        
        res.json({
            success: true,
            message: 'Assignment data saved',
            filePath: 'level-assignments.json'
        });
        
    } catch (error) {
        console.error('Error saving assignment data:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`🎨 PixelVoxel Server running at http://localhost:${PORT}`);
    console.log(`📂 Scanning folder: ${PIXEL_ASSETS_DIR}`);
});
