/**
 * Inventory Valuation Stability Test
 * 
 * Verifies that inventory valuation does NOT change when the USD exchange rate changes.
 * 
 * Usage:
 *   npx ts-node test/inventory-valuation-stability.test.ts
 */

import * as http from 'http';

const API_HOST = 'localhost';
const API_PORT = 4000;

function request<T>(method: string, path: string, token?: string, body?: any): Promise<T> {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : undefined;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (data) headers['Content-Length'] = Buffer.byteLength(data).toString();

        const req = http.request({ hostname: API_HOST, port: API_PORT, path, method, headers }, (res) => {
            let raw = '';
            res.on('data', (chunk) => raw += chunk);
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`${res.statusCode}: ${raw}`));
                    return;
                }
                try { resolve(JSON.parse(raw)); } catch { reject(new Error(raw)); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

async function main() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  INVENTORY VALUATION STABILITY TEST');
    console.log('  Verifies value does NOT change with exchange rate');
    console.log('═══════════════════════════════════════════════════════\n');

    // Step 1: Login
    console.log('🔑 Logging in as OWNER...');
    const loginRes = await request<{ accessToken: string }>('POST', '/api/auth/login', undefined, {
        email: 'mohamed@outletmaster.ly',
        password: 'Admin123!',
    });
    const token = loginRes.accessToken;
    console.log('   ✅ Logged in\n');

    // Step 2: Get current USD rate
    console.log('💱 Getting current USD rate...');
    const settings = await request<Record<string, string>>('GET', '/api/settings', token);
    const originalRate = Number(settings.parallelUsdRate || settings.sellingUsdRate || 0);
    console.log(`   Current rate: ${originalRate} LYD/USD\n`);

    // Step 3: Fetch inventory BEFORE rate change
    console.log('📦 Fetching inventory (BEFORE rate change)...');
    const before = await request<any[]>('GET', '/api/inventory/grouped', token);
    const beforeValues: Record<string, { name: string; branch: string; value: number; qty: number }> = {};
    let totalBefore = 0;
    for (const g of before) {
        const key = `${g.productId}__${g.branchId}`;
        beforeValues[key] = {
            name: g.productName,
            branch: g.branchName,
            value: g.inventoryValue || 0,
            qty: g.totalQuantity,
        };
        totalBefore += g.inventoryValue || 0;
    }
    console.log(`   Found ${before.length} product-branch groups`);
    console.log(`   Total inventory value: ${totalBefore.toFixed(2)} LYD\n`);

    // Print each product's value
    for (const g of before) {
        console.log(`   ${g.productName} @ ${g.branchName}: qty=${g.totalQuantity}, value=${(g.inventoryValue || 0).toFixed(2)}`);
    }
    console.log('');

    // Step 4: Change exchange rate (significant change to make any bug obvious)
    const newRate = originalRate >= 7 ? originalRate - 1.5 : originalRate + 1.5;
    console.log(`💱 Changing rate from ${originalRate} → ${newRate}...`);
    await request('POST', '/api/settings/usd-rate', token, { rate: newRate, recalculate: true });
    console.log('   ✅ Rate changed & sale prices recalculated\n');

    // Step 5: Fetch inventory AFTER rate change
    console.log('📦 Fetching inventory (AFTER rate change)...');
    const after = await request<any[]>('GET', '/api/inventory/grouped', token);
    let totalAfter = 0;
    const failures: string[] = [];

    for (const g of after) {
        const key = `${g.productId}__${g.branchId}`;
        const newVal = g.inventoryValue || 0;
        totalAfter += newVal;
        const oldEntry = beforeValues[key];
        if (!oldEntry) continue;

        if (Math.abs(newVal - oldEntry.value) > 0.001) {
            failures.push(
                `   ❌ ${oldEntry.name} @ ${oldEntry.branch}: ${oldEntry.value.toFixed(2)} → ${newVal.toFixed(2)} (Δ ${(newVal - oldEntry.value).toFixed(2)})`
            );
        } else {
            console.log(`   ✅ ${oldEntry.name} @ ${oldEntry.branch}: ${oldEntry.value.toFixed(2)} (unchanged)`);
        }
    }
    console.log('');

    // Step 6: Restore original rate
    console.log(`💱 Restoring original rate to ${originalRate}...`);
    await request('POST', '/api/settings/usd-rate', token, { rate: originalRate, recalculate: true });
    console.log('   ✅ Rate restored\n');

    // Step 7: Report
    console.log('═══════════════════════════════════════════════════════');
    if (failures.length === 0) {
        console.log('  ✅ PASS — All inventory values remained stable!');
        console.log(`  Total before: ${totalBefore.toFixed(2)} LYD`);
        console.log(`  Total after:  ${totalAfter.toFixed(2)} LYD`);
        console.log(`  Difference:   ${Math.abs(totalAfter - totalBefore).toFixed(2)} LYD`);
    } else {
        console.log(`  ❌ FAIL — ${failures.length} products changed value!`);
        console.log(`  Total before: ${totalBefore.toFixed(2)} LYD`);
        console.log(`  Total after:  ${totalAfter.toFixed(2)} LYD`);
        console.log(`  Difference:   ${(totalAfter - totalBefore).toFixed(2)} LYD`);
        console.log('\n  Changed products:');
        failures.forEach(f => console.log(f));
    }
    console.log('═══════════════════════════════════════════════════════\n');

    process.exit(failures.length > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('❌ Test error:', err.message);
    process.exit(1);
});
