import shelljs from 'shelljs';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const { exec, cd, mv } = shelljs;

// Helper function for logging
const log = (...args) => console.log(...args);
const logError = (...args) => console.error('\x1b[31m', ...args, '\x1b[0m');
const logSuccess = (...args) => console.log('\x1b[32m', ...args, '\x1b[0m');
const logInfo = (...args) => console.log('\x1b[36m', ...args, '\x1b[0m');

// Print welcome message and environment info
log('\n=== Pake CLI Build Process ===');
logInfo('Node.js version:', process.version);
log('Current platform:', process.platform);
log('\nBuild Parameters:');
[
  ['URL', process.env.URL],
  ['Name', process.env.NAME],
  ['Icon', process.env.ICON],
  ['Height', process.env.HEIGHT],
  ['Width', process.env.WIDTH],
  ['Hide Title Bar', process.env.HIDE_TITLE_BAR],
  ['Resize', process.env.RESIZE],
  ['Multi Arch (Mac only)', process.env.MULTI_ARCH],
  ['Targets (Linux only)', process.env.TARGETS],
  ['Safe Domain', process.env.SAFE_DOMAIN]
].forEach(([key, value]) => log(`${key}: ${value || 'not set'}`));
log('\n===========================\n');

// Validate required parameters
if (!process.env.URL || !process.env.NAME) {
  logError('Error: URL and NAME are required parameters');
  process.exit(1);
}

// Ensure we're in the correct directory
const pakePath = 'node_modules/pake-cli';
if (!fs.existsSync(pakePath)) {
  logError(`Error: ${pakePath} directory not found`);
  process.exit(1);
}
cd(pakePath);

// Construct base parameters
let params = [
  'node cli.js',
  process.env.URL,
  '--name', process.env.NAME,
  '--height', process.env.HEIGHT || '780',
  '--width', process.env.WIDTH || '1200'
].join(' ');

// Add optional parameters
const addParam = (condition, param) => {
  if (condition) params += ` ${param}`;
};

addParam(process.env.HIDE_TITLE_BAR === 'true', '--hide-title-bar');
addParam(process.env.FULLSCREEN === 'true', '--resize');
addParam(process.env.SAFE_DOMAIN, `--safe-domain ${process.env.SAFE_DOMAIN}`);
addParam(process.env.TARGETS, `--targets ${process.env.TARGETS}`);
addParam(process.platform === 'win32' || process.platform === 'linux', '--show-system-tray');

// Handle multi-arch for macOS
if (process.env.MULTI_ARCH === 'true' && process.platform === 'darwin') {
  const result = exec('rustup target add aarch64-apple-darwin');
  if (result.code !== 0) {
    logError('Failed to add aarch64-apple-darwin target');
    process.exit(1);
  }
  params += ' --multi-arch';
}

// Function to download and save icon
const downloadIcon = async (iconFile) => {
  try {
    const response = await axios.get(process.env.ICON, { 
      responseType: 'arraybuffer',
      timeout: 10000 // 10 second timeout
    });
    fs.writeFileSync(iconFile, response.data);
    return `${params} --icon ${iconFile}`;
  } catch (error) {
    logError('Error downloading icon:', error.message);
    return params; // Continue without icon if download fails
  }
};

// Main build process
const main = async () => {
  try {
    // Handle icon download if specified
    if (process.env.ICON) {
      const iconExtensions = {
        linux: 'png',
        darwin: 'icns',
        win32: 'ico'
      };
      
      const iconExt = iconExtensions[process.platform];
      if (iconExt) {
        const iconFile = `icon.${iconExt}`;
        params = await downloadIcon(iconFile);
      } else {
        logError('Unsupported platform for icon download');
      }
    }

    // Create output directory if it doesn't exist
    ['output', '../output', '../../output', 'dist', 'out'].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Log final parameters and start build
    logInfo('\nFinal build parameters:', params);
    logInfo('\nStarting build process...');
    
    const buildResult = exec(params);
    if (buildResult.code !== 0) {
      throw new Error(`Build failed with code ${buildResult.code}`);
    }

    // Move built files to output directory
    const moveFiles = exec(`mv ${process.env.NAME}.* output/`);
    if (moveFiles.code !== 0) {
      throw new Error('Failed to move built files to output directory');
    }

    // Additional file copy for different possible output locations
    ['dist/*', 'out/*'].forEach(dir => {
      if (fs.existsSync(dir.split('/')[0])) {
        exec(`cp -r ${dir} output/ || true`);
      }
    });

    logSuccess('\nBuild completed successfully!');
    
    // Return to original directory
    cd('../..');
    
    // List output files
    logInfo('\nGenerated files:');
    exec('ls -la output/');

  } catch (error) {
    logError('\nBuild failed:', error.message);
    process.exit(1);
  }
};

// Run the build process
main().catch(error => {
  logError('Unexpected error:', error);
  process.exit(1);
});
