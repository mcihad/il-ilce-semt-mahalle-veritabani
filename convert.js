const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'il-ilce-semt-mahalle-2021_01_29_10_57_42-dump.sql');
const outputFile = path.join(__dirname, 'il-ilce-semt-mahalle-postgresql.sql');

let content = fs.readFileSync(inputFile, 'utf8');

// 1. Remove standard SQL comments starting with --
content = content.replace(/^--.*$/gm, '');

// 2. Remove MySQL specific comments /*! ... */
content = content.replace(/\/\*!.*?\*\//gs, '');

// 3. Remove block comments /* ... */ (including multi-line)
content = content.replace(/\/\*.*?\*\//gs, '');

// 4. Remove backticks
content = content.replace(/`/g, '');

// 5. Handle CREATE TABLE adjustments
content = content.split('\n').map(line => {
    let trimmed = line.trim();

    // 1. Remove MySQL-only column attributes
    line = line.replace(/COLLATE \w+/gi, '');
    line = line.replace(/CHARACTER SET \w+/gi, '');

    // 2. Handle SERIAL conversion (AUTO_INCREMENT)
    if (line.includes('AUTO_INCREMENT')) {
        // Any column with AUTO_INCREMENT in MySQL becomes SERIAL in PostgreSQL
        // We'll replace the entire type and AUTO_INCREMENT part
        line = line.replace(/(int|tinyint|smallint|mediumint|bigint).*?AUTO_INCREMENT/i, 'SERIAL');
    }

    // 3. Normalize remaining integer types (Remove length specifiers and unsigned)
    // Example: int(11) unsigned -> int
    line = line.replace(/(int|tinyint|smallint|mediumint|bigint)\(\d+\)/gi, '$1');
    line = line.replace(/\bunsigned\b/gi, '');

    // 4. Schema Handling: Prefix tables with "mezarlik."
    // Match "DROP TABLE IF EXISTS table_name"
    line = line.replace(/DROP TABLE IF EXISTS (\w+)/gi, 'DROP TABLE IF EXISTS mezarlik.$1');
    // Match "CREATE TABLE table_name ("
    line = line.replace(/CREATE TABLE (\w+) \(/gi, 'CREATE TABLE mezarlik.$1 (');
    // Match "INSERT INTO table_name"
    line = line.replace(/INSERT INTO (\w+)/gi, 'INSERT INTO mezarlik.$1');

    // 5. Remove ENGINE=InnoDB, AUTO_INCREMENT=..., DEFAULT CHARSET=..., COLLATE=..., COMMENT=...
    if (trimmed.startsWith(') ENGINE=') || trimmed.includes(') ENGINE=')) {
        return ');';
    }

    // 6. Apostrophe Escaping: Replace MySQL escape \' with PostgreSQL escape ''
    line = line.replace(/\\'/g, "''");

    // 7. Remove KEY lines
    if (trimmed.startsWith('KEY ')) {
        return '';
    }

    // 7. Remove LOCK TABLES / UNLOCK TABLES
    if (trimmed.startsWith('LOCK TABLES') || trimmed.startsWith('UNLOCK TABLES')) {
        return '';
    }

    return line;
}).filter(line => line.trim() !== '').join('\n');

// Add schema creation at the very top
content = "CREATE SCHEMA IF NOT EXISTS mezarlik;\n\n" + content;

// Additional cleanup:
// 1. Remove redundancy: sometimes KEY lines leave a trailing comma on the previous line
content = content.replace(/,\n\s*\)/g, '\n)');

// 2. Remove all lines that are just a semicolon or whitespace + semicolon
content = content.split('\n').filter(line => {
    let t = line.trim();
    return t !== '' && t !== ';';
}).join('\n');

// 3. Ensure INSERT statements have a space or newline before them (optional but good for readability)
content = content.replace(/INSERT INTO/g, '\nINSERT INTO');

fs.writeFileSync(outputFile, content);
console.log('Conversion complete: ' + outputFile);
