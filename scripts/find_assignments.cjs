#!/usr/bin/env node
/**
 * Find all assignments to state variables in module files.
 * These need to be replaced with setter function calls.
 */

const fs = require('fs');
const path = require('path');

const MODULES_DIR = '/Users/cyingfang/devin/welian/public/modules';

// Read state.js to get all exported let variables and their setters
const stateContent = fs.readFileSync(path.join(MODULES_DIR, 'state.js'), 'utf8');

const stateVars = [];
const stateSetters = new Map(); // varName -> setterName

const letRegex = /^export let\s+(\w+)/gm;
let m;
while ((m = letRegex.exec(stateContent)) !== null) {
  stateVars.push(m[1]);
}

// Build setter map: setIsAuthed -> isAuthed
const setterRegex = /^export function\s+(set\w+)\s*\(/gm;
while ((m = setterRegex.exec(stateContent)) !== null) {
  const setterName = m[1];
  const varName = setterName[3].toLowerCase() + setterName.slice(4);
  stateSetters.set(varName, setterName);
}

// Also check for exact match (e.g., setPAY_AMOUNTS -> PAY_AMOUNTS)
for (const v of stateVars) {
  const expectedSetter = 'set' + v[0].toUpperCase() + v.slice(1);
  if (stateSetters.has(v)) {
    // already mapped
  } else {
    // Try case-insensitive match
    for (const [vn, sn] of stateSetters) {
      if (vn.toLowerCase() === v.toLowerCase()) {
        stateSetters.set(v, sn);
        break;
      }
    }
  }
}

console.log('State variables that have setters:');
for (const v of stateVars) {
  const s = stateSetters.get(v);
  if (s) {
    console.log(`  ${v} -> ${s}`);
  } else {
    console.log(`  ${v} -> NO SETTER!`);
  }
}

// Find all assignments in module files (excluding state.js and main.js)
const moduleFiles = fs.readdirSync(MODULES_DIR).filter(f =>
  f.endsWith('.js') && f !== 'state.js' && f !== 'main.js'
);

const assignmentRegex = /(\w+)\s*=\s*[^=]/g;  // x = something (not ==)
const compoundAssignRegex = /(\w+)\s*(\+=|-=|\*=|\/=|%=|\.push|\.pop|\.splice|\.shift|\.unshift)/g;

let totalAssignments = 0;

for (const file of moduleFiles) {
  const content = fs.readFileSync(path.join(MODULES_DIR, file), 'utf8');
  const assignments = [];

  // Find simple assignments: varName = value
  let m2;
  const regex = new RegExp(`\\b(${stateVars.join('|')})\\s*=\\s*[^=]`, 'g');
  while ((m2 = regex.exec(content)) !== null) {
    const varName = m2[1];
    const lineNum = content.substring(0, m2.index).split('\n').length;
    const line = content.split('\n')[lineNum - 1].trim();
    assignments.push({ varName, lineNum, line });
  }

  // Find compound assignments: varName += value, etc.
  const regex2 = new RegExp(`\\b(${stateVars.join('|')})\\s*\\+=`, 'g');
  while ((m2 = regex2.exec(content)) !== null) {
    const varName = m2[1];
    const lineNum = content.substring(0, m2.index).split('\n').length;
    const line = content.split('\n')[lineNum - 1].trim();
    assignments.push({ varName, lineNum, line, type: '+=' });
  }

  // Find .push, .pop, etc. on state variables (these mutate arrays/objects)
  // These are actually OK for objects/arrays since we're mutating, not reassigning
  // But let's note them

  if (assignments.length > 0) {
    console.log(`\n=== ${file} (${assignments.length} assignments) ===`);
    for (const a of assignments) {
      const setter = stateSetters.get(a.varName);
      console.log(`  L${a.lineNum}: ${a.varName} ${a.type || '='} ... -> ${setter || 'NO SETTER'}`);
      console.log(`    ${a.line.substring(0, 100)}`);
    }
    totalAssignments += assignments.length;
  }
}

console.log(`\nTotal assignments to state variables: ${totalAssignments}`);
