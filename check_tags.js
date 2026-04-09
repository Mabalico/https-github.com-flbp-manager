const fs = require('fs');
const content = fs.readFileSync('FLBP ONLINE/components/AdminDashboard.tsx', 'utf8');
const start = content.indexOf('<main className="flex-1 rounded');
const mainContent = content.substring(start, content.indexOf('</main>', start));
const tags = [];
const regex = /<\/?([a-zA-Z0-9.]+)[^>]*>/g;
let match;
while ((match = regex.exec(mainContent)) !== null) {
    const fullTag = match[0];
    const tagName = match[1];
    if (fullTag.endsWith('/>')) continue;
    if (fullTag.startsWith('</')) {
        const last = tags.pop();
        if (last.tag !== tagName) {
             console.log(`\nMismatch at index ${match.index}: Expected chiusura di <${last.tag}> (opened at ${last.index}), found ${fullTag}`);
             console.log('Opened here:');
             console.log(mainContent.substring(Math.max(0, last.index - 50), last.index + 100));
             break;
        }
    } else {
        tags.push({ tag: tagName, index: match.index });
    }
}
