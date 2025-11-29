const fs = require('fs');
const path = require('path');

// Directories to ignore
const ignoreDirs = [
  'node_modules',
  '.git',
  '.dfx',
  'target',      // Rust build output
  'dist',
  'out',
  '.next',
  'build',
  'deps',        // Rust dependencies
  '.cargo',
  'declarations' // Auto-generated type declarations
];

// File prefixes to ignore
const ignoreFilePrefixes = [
  '.env',        // Environment files
  '.git',        // Git files
  '.nvmrc',      // Node version
  '.prettierrc', // Config files
  '.eslintrc',   // Config files
  'LICENSE',     // License files
  'package-lock',// Lock files
  'Cargo.lock',  // Rust lock files
  'README',      // README files (documented separately)
  'tree',        // Avoid including the tree output itself
  'generate',    // Avoid including this script in output
  '.DS_Store'    // Mac files
];

// Only show these directories at the root level
const rootLevelDirs = [
  'crash_backend',
  'plinko_backend',
  'blackjack_backend',
  'dice_backend',
  'openhouse_frontend',
  'scripts'
];

// Function to count lines in a file
const countLines = (filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').length;
  } catch (error) {
    return 0; // Return 0 if file cannot be read
  }
};

const createTree = (dir, indent = '', isRoot = false) => {
  let tree = '';
  let files;

  try {
    files = fs.readdirSync(dir);
  } catch (e) {
    // ignore directories that we can't read
    return '';
  }

  let filteredFiles = files
    .filter(file => !ignoreDirs.includes(file))
    .filter(file => !ignoreFilePrefixes.some(prefix => file.startsWith(prefix)));

  // At root level, only show specific directories
  if (isRoot) {
    filteredFiles = filteredFiles.filter(file => {
      const fullPath = path.join(dir, file);
      try {
        const stats = fs.statSync(fullPath);
        // Only include directories that are in the rootLevelDirs list
        return stats.isDirectory() && rootLevelDirs.includes(file);
      } catch (e) {
        return false;
      }
    });
  }

  filteredFiles.forEach((file, index) => {
    const fullPath = path.join(dir, file);

    let stats;
    try {
      stats = fs.statSync(fullPath);
    } catch (e) {
      return; // Skip files we can't read
    }

    const isLastFile = index === filteredFiles.length - 1;
    const lineEnd = isLastFile ? '└── ' : '├── ';

    if (stats.isDirectory()) {
      tree += `${indent}${lineEnd}${file}/\n`;
      tree += createTree(fullPath, `${indent}${isLastFile ? '    ' : '│   '}`, false);
    } else {
      // Count lines for files and add the count in parentheses
      const lineCount = countLines(fullPath);
      tree += `${indent}${lineEnd}${file} (${lineCount} lines)\n`;
    }
  });

  return tree;
};

// Generate the tree
console.log('Generating OpenHouse project tree...');
const tree = createTree('.', '', true);

// Write to tree.md in markdown format
const markdownContent = `# OpenHouse Casino - Project Structure

Generated on: ${new Date().toISOString()}

\`\`\`
${tree}
\`\`\`

## Summary

This tree shows the complete file structure of the OpenHouse Casino project with line counts for each file.

### Key Directories:
- \`crash_backend/\` - Crash game backend canister
- \`plinko_backend/\` - Plinko game backend canister
- \`blackjack_backend/\` - Blackjack game backend canister
- \`dice_backend/\` - Dice game backend canister
- \`openhouse_frontend/\` - Multi-game frontend interface
- \`scripts/\` - Utility scripts

**Note:** Some files and directories are excluded based on hardcoded patterns.
`;

fs.writeFileSync('tree.md', markdownContent);
console.log('✓ Project tree generated successfully: tree.md');
