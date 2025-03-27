import fs from 'fs';
import path from 'path';

// Combine all CSS files
const cssDir = path.join('assets', 'style');
const cssFiles = [
    'init.style.css',
    'map.style.css',
    'search.style.css',
    'discover.style.css',
    'floater.style.css',
    'legal.style.css',
    'support.style.css',
    'weather.style.css'
];

let cssContent = '';
for (const file of cssFiles) {
    try {
        const filePath = path.join(cssDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        cssContent += content;
    } catch (err) {
        console.error(`Error reading CSS file ${file}:`, err);
    }
}

// Write combined CSS to minified file
try {
    const minCssPath = path.join('public', 'src', 'style.min.css');
    fs.writeFileSync(minCssPath, cssContent);
    console.log(`✅ CSS files combined to ${minCssPath}`);
} catch (err) {
    console.error('Error writing combined CSS:', err);
}

// Combine all JS files
const jsDir = path.join('assets', 'interface');
const jsFiles = [
    'env.js',
    'init.interface.js',
    'map.interface.js',
    'weather.interface.js'
];

let jsContent = '';
for (const file of jsFiles) {
    try {
        const filePath = path.join(jsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        jsContent += content;
    } catch (err) {
        console.error(`Error reading JS file ${file}:`, err);
    }
}

// Write combined JS to minified file
try {
    const minJsPath = path.join('public', 'src', 'interface.min.js');
    fs.writeFileSync(minJsPath, jsContent);
    console.log(`✅ JS files combined to ${minJsPath}`);
} catch (err) {
    console.error('Error writing combined JS:', err);
}

console.log('Minification process completed!'); 