#!/usr/bin/env node
/**
 * Replace direct assignments to state variables with setter function calls.
 * e.g., isAuthed = true;  →  setIsAuthed(true);
 */

const fs = require('fs');
const path = require('path');

const MODULES_DIR = '/Users/cyingfang/devin/welian/public/modules';

// Read state.js to build var→setter mapping
const stateContent = fs.readFileSync(path.join(MODULES_DIR, 'state.js'), 'utf8');

const stateVars = [];
const setterMap = new Map(); // varName -> setterName

const letRegex = /^export let\s+(\w+)/gm;
let m;
while ((m = letRegex.exec(stateContent)) !== null) {
  stateVars.push(m[1]);
}

const setterRegex = /^export function\s+(set\w+)\s*\(/gm;
const setters = [];
while ((m = setterRegex.exec(stateContent)) !== null) {
  setters.push(m[1]);
}

// Match setters to vars
for (const v of stateVars) {
  const expected = 'set' + v[0].toUpperCase() + v.slice(1);
  // Find exact match
  if (setters.includes(expected)) {
    setterMap.set(v, expected);
  } else {
    // Try case-insensitive
    for (const s of setters) {
      if (s.toLowerCase() === expected.toLowerCase()) {
        setterMap.set(v, s);
        break;
      }
    }
  }
}

console.log('Var→Setter mapping:');
for (const [v, s] of setterMap) {
  console.log(`  ${v} → ${s}`);
}

// Sort state vars by length (longest first) to avoid partial matches
const sortedVars = [...setterMap.keys()].sort((a, b) => b.length - a.length);

// Process each module file
const moduleFiles = fs.readdirSync(MODULES_DIR).filter(f =>
  f.endsWith('.js') && f !== 'state.js' && f !== 'main.js'
);

let totalReplacements = 0;

for (const file of moduleFiles) {
  const filePath = path.join(MODULES_DIR, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let replacements = 0;

  // Also need to make sure setters are imported
  const neededSetters = new Set();

  for (const varName of sortedVars) {
    const setterName = setterMap.get(varName);

    // Pattern: \bvarName\s*=\s* (but not ==, ===, !=, !==)
    // We need to find the full assignment expression up to the semicolon
    // This is tricky because the value can contain semicolons inside strings, objects, etc.

    // Strategy: find each occurrence of `varName = ` (not preceded by . or preceded by line start or whitespace)
    // Then find the matching semicolon by counting braces/parens/brackets

    let offset = 0;
    while (true) {
      // Find the next assignment to this variable
      // Negative lookbehind for . (property access) and = (equality)
      const regex = new RegExp(`(?<![.\\w])\\b${varName}\\s*=\\s*(?!=)`, 'g');
      regex.lastIndex = offset;
      const match = regex.exec(content);

      if (!match) break;

      // Check if this is inside a line comment (simplified — just check current line)
      const lineStart = content.lastIndexOf('\n', match.index) + 1;
      const linePrefix = content.substring(lineStart, match.index);
      if (linePrefix.includes('//')) {
        offset = match.index + match[0].length;
        continue;
      }

      // Find the value expression end (matching semicolon)
      let valueStart = match.index + match[0].length;
      let depth = 0;
      let inString = false;
      let stringChar = '';
      let i = valueStart;

      while (i < content.length) {
        const ch = content[i];

        if (inString) {
          if (ch === '\\') {
            i += 2;
            continue;
          }
          if (ch === stringChar) {
            inString = false;
          }
          i++;
          continue;
        }

        if (ch === "'" || ch === '"' || ch === '`') {
          inString = true;
          stringChar = ch;
          i++;
          continue;
        }

        if (ch === '{' || ch === '(' || ch === '[') depth++;
        else if (ch === '}' || ch === ')' || ch === ']') depth--;
        else if (ch === ';' && depth === 0) break;
        else if (ch === '\n' && depth === 0) {
          // Assignment without semicolon (end of line)
          break;
        }
        i++;
      }

      const valueEnd = i;
      const value = content.substring(valueStart, valueEnd).trim();

      // Skip if the value is empty or just whitespace
      if (!value) {
        offset = match.index + match[0].length;
        continue;
      }

      // Skip if this is actually a `let varName = ` or `const varName = ` or `var varName = ` declaration
      const declBefore = content.substring(Math.max(0, match.index - 10), match.index);
      if (/\b(?:let|const|var)\s+$/.test(declBefore)) {
        offset = match.index + match[0].length;
        continue;
      }

      // Build the replacement: varName = value → setterName(value)
      // The semicolon stays in place, so result is setterName(value);
      const oldText = content.substring(match.index, valueEnd);
      const newText = `${setterName}(${value})`;

      // Replace
      content = content.substring(0, match.index) + newText + content.substring(valueEnd);
      replacements++;
      neededSetters.add(setterName);

      // Update offset (the text changed length)
      offset = match.index + newText.length;
    }
  }

  // Add needed setter imports
  if (neededSetters.size > 0) {
    // Check which setters are already imported
    const importRegex = /import\s+\{([^}]+)\}\s+from\s+'\.\/state\.js';/g;
    const importedFromState = new Set();
    let m2;
    while ((m2 = importRegex.exec(content)) !== null) {
      const names = m2[1].split(',').map(s => s.trim());
      names.forEach(n => importedFromState.add(n));
    }

    const missingSetters = [...neededSetters].filter(s => !importedFromState.has(s));
    if (missingSetters.length > 0) {
      // Add to the last state.js import line
      const lastStateImport = content.match(/import\s+\{([^}]+)\}\s+from\s+'\.\/state\.js';\s*$/gm);
      if (lastStateImport) {
        // Find the last occurrence
        let lastMatch = null;
        const re = /import\s+\{([^}]+)\}\s+from\s+'\.\/state\.js';/g;
        while ((m2 = re.exec(content)) !== null) {
          lastMatch = m2;
        }
        if (lastMatch) {
          const existingNames = lastMatch[1].split(',').map(s => s.trim());
          const allNames = [...existingNames, ...missingSetters].sort();
          // Split into chunks of 20
          const chunks = [];
          for (let i = 0; i < allNames.length; i += 20) {
            chunks.push(allNames.slice(i, i + 20));
          }
          const newImportLines = chunks.map(c => `import { ${c.join(', ')} } from './state.js';`).join('\n');
          content = content.substring(0, lastMatch.index) + newImportLines + content.substring(lastMatch.index + lastMatch[0].length);
        }
      }
    }
  }

  if (replacements > 0) {
    fs.writeFileSync(filePath, content);
    console.log(`${file}: ${replacements} replacements, setters needed: ${[...neededSetters].join(', ')}`);
    totalReplacements += replacements;
  }
}

console.log(`\nTotal replacements: ${totalReplacements}`);
