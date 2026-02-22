/**
 * Inventory Valuation Stability Test
 * 
 * Verifies that inventory valuation does NOT change when the USD exchange rate changes.
 * 
 * Usage:
 *   node test/inventory-valuation-stability.js
 */

const http = require('http');

const API_HOST = 'localhost';
const API_PORT = 4000;

function request(method, path, token, body) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : undefined;
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        if (data) headers['Content-Length'] = Buffer.byteLength(data).toString();

        const req = http.request({ hostname: API_HOST, port: API_PORT, path, method, headers }, (res) => {
            let raw = '';
            res.on('data', (chunk) => raw += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    reject(new Error(res.statusCode + ': ' + raw));
                    return;
                }
                try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error(raw)); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function main() {
    console.log('');
    console.log('===================================================');
    console.log('  INVENTORY VALUATION STABILITY TEST');
    console.log('  Verifies value does NOT change with exchange rate');
    console.log('===================================================');
    console.log('');

    // Step 1: Login
    console.log('[1] Logging in as OWNER...');
    const loginRes = await request('POST', '/api/auth/login', null, {
        email: 'mohamed@outletmaster.ly',
        password: 'Admin123!',
    });
    const token = loginRes.accessToken;
    if (!token) throw new Error('No token received! Response: ' + JSON.stringify(loginRes));
    console.log('    OK - Logged in');
    console.log('');

    // Step 2: Get current USD rate
    console.log('[2] Getting current USD rate...');
    const settings = await request('GET', '/api/settings', token);
    const originalRate = Number(settings.parallelUsdRate || 0);
    console.log('    Current rate: ' + originalRate + ' LYD/USD');
    console.log('');

    // Step 3: Fetch inventory BEFORE rate change
    console.log('[3] Fetching inventory (BEFORE rate change)...');
    const before = await request('GET', '/api/inventory/grouped', token);
    const beforeValues = {};
    let totalBefore = 0;
    for (const g of before) {
        const key = g.productId + '__' + g.branchId;
        beforeValues[key] = {
            name: g.productName,
            branch: g.branchName,
            value: g.inventoryValue || 0,
            qty: g.totalQuantity,
        };
        totalBefore += g.inventoryValue || 0;
    }
    console.log('    Found ' + before.length + ' product-branch groups');
    console.log('    Total inventory value: ' + totalBefore.toFixed(2) + ' LYD');
    for (const g of before) {
        console.log('      ' + g.productName + ' @ ' + g.branchName + ': qty=' + g.totalQuantity + ', value=' + (g.inventoryValue || 0).toFixed(2));
    }
    console.log('');

    // Step 4: Change exchange rate
    const newRate = originalRate >= 7 ? originalRate - 1.5 : originalRate + 1.5;
    console.log('[4] Changing rate from ' + originalRate + ' -> ' + newRate + '...');
    await request('POST', '/api/settings/usd-rate', token, { rate: newRate, recalculate: true });
    console.log('    OK - Rate changed & sale prices recalculated');
    console.log('');

    // Step 5: Fetch inventory AFTER rate change
    console.log('[5] Fetching inventory (AFTER rate change)...');
    const after = await request('GET', '/api/inventory/grouped', token);
    let totalAfter = 0;
    const failures = [];

    for (const g of after) {
        const key = g.productId + '__' + g.branchId;
        const newVal = g.inventoryValue || 0;
        totalAfter += newVal;
        const oldEntry = beforeValues[key];
        if (!oldEntry) continue;

        if (Math.abs(newVal - oldEntry.value) > 0.001) {
            failures.push('    FAIL: ' + oldEntry.name + ' @ ' + oldEntry.branch + ': ' + oldEntry.value.toFixed(2) + ' -> ' + newVal.toFixed(2) + ' (delta=' + (newVal - oldEntry.value).toFixed(2) + ')');
        } else {
            console.log('    OK: ' + oldEntry.name + ' @ ' + oldEntry.branch + ': ' + oldEntry.value.toFixed(2) + ' (unchanged)');
        }
    }
    console.log('');

    // Step 6: Restore original rate
    console.log('[6] Restoring original rate to ' + originalRate + '...');
    await request('POST', '/api/settings/usd-rate', token, { rate: originalRate, recalculate: true });
    console.log('    OK - Rate restored');
    console.log('');

    // Step 7: Report
    console.log('===================================================');
    if (failures.length === 0) {
        console.log('  PASS - All inventory values remained stable!');
        console.log('  Total before: ' + totalBefore.toFixed(2) + ' LYD');
        console.log('  Total after:  ' + totalAfter.toFixed(2) + ' LYD');
        console.log('  Difference:   ' + Math.abs(totalAfter - totalBefore).toFixed(2) + ' LYD');
    } else {
        console.log('  FAIL - ' + failures.length + ' products changed value!');
        console.log('  Total before: ' + totalBefore.toFixed(2) + ' LYD');
        console.log('  Total after:  ' + totalAfter.toFixed(2) + ' LYD');
        console.log('  Difference:   ' + (totalAfter - totalBefore).toFixed(2) + ' LYD');
        console.log('');
        console.log('  Changed products:');
        failures.forEach(f => console.log(f));
    }
    console.log('===================================================');
    console.log('');

    process.exit(failures.length > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Test error: ' + err.message);
    process.exit(1);
});
