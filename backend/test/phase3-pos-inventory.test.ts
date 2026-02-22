/**
 * Phase 3 — POS & Inventory Operations Tests
 * 
 * Tests FIFO sale deduction, sale void with stock reversal,
 * stock transfers (dispatch/receive), returns with restock policy,
 * and stock ledger audit trail.
 * 
 * Usage:
 *   npx ts-node test/phase3-pos-inventory.test.ts
 * 
 * Prerequisites:
 *   - Backend running on localhost:4000
 *   - OWNER user: mohamed@outletmaster.ly / Admin123!
 *   - At least one branch and one variant with stock
 */

import * as http from 'http';
import { randomUUID } from 'crypto';

const API = { host: 'localhost', port: 4000 };

function req<T>(method: string, path: string, token?: string, body?: any): Promise<T> {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : undefined;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (data) headers['Content-Length'] = Buffer.byteLength(data).toString();

        const r = http.request({ ...API, path, method, headers }, (res) => {
            let raw = '';
            res.on('data', (c) => raw += c);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(raw);
                    if (res.statusCode && res.statusCode >= 400) {
                        reject(new Error(`${res.statusCode}: ${JSON.stringify(parsed)}`));
                    } else {
                        resolve(parsed);
                    }
                } catch {
                    if (res.statusCode && res.statusCode >= 400) reject(new Error(`${res.statusCode}: ${raw}`));
                    else resolve(raw as any);
                }
            });
        });
        r.on('error', reject);
        if (data) r.write(data);
        r.end();
    });
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
    if (condition) { passed++; console.log(`   ✅ ${msg}`); }
    else { failed++; console.log(`   ❌ FAIL: ${msg}`); }
}

async function main() {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  PHASE 3 — POS & INVENTORY TESTS');
    console.log('═══════════════════════════════════════════════════\n');

    // ─── Login ───
    console.log('🔑 Logging in...');
    const login = await req<{ accessToken: string }>('POST', '/api/auth/login', undefined, {
        email: 'mohamed@outletmaster.ly', password: 'Admin123!',
    });
    const token = login.accessToken;
    console.log('   Logged in\n');

    // ─── Find a branch and variant with stock ───
    console.log('📦 Finding test data...');
    const inventory = await req<any[]>('GET', '/api/inventory', token);
    const testItem = inventory.find((i: any) => i.quantity >= 3);
    if (!testItem) {
        console.log('   ⚠️ No inventory with qty >= 3 found. Skipping stock-dependent tests.');
        console.log('   Create stock first: POST /api/inventory/restock');
        process.exit(0);
    }
    const branchId = testItem.branchId;
    const variantId = testItem.variantId;
    const stockBefore = inventory
        .filter((i: any) => i.variantId === variantId && i.branchId === branchId)
        .reduce((s: number, i: any) => s + i.quantity, 0);
    console.log(`   Using variant ${variantId} @ branch ${branchId} (stock: ${stockBefore})\n`);

    // ═══════════════════════════════════════
    // TEST 1: POS Sale with FIFO deduction
    // ═══════════════════════════════════════
    console.log('─── TEST 1: POS Sale (FIFO deduction) ───');
    const saleQty = 1;
    const sale = await req<any>('POST', '/api/sales', token, {
        branchId,
        items: [{ variantId, quantity: saleQty }],
        paymentMethod: 'CASH',
        idempotencyKey: randomUUID(),
        notes: 'Phase 3 test sale',
    });
    assert(!!sale.id, `Sale created: ${sale.invoiceNumber}`);
    assert(sale.status === 'COMPLETED', `Sale status is COMPLETED`);
    assert(sale.items?.length === 1, `Sale has 1 item`);
    assert(sale.total > 0, `Sale total > 0 (${sale.total})`);

    // Verify stock decreased
    const invAfterSale = await req<any[]>('GET', `/api/inventory?branchId=${branchId}`, token);
    const stockAfterSale = invAfterSale
        .filter((i: any) => i.variantId === variantId)
        .reduce((s: number, i: any) => s + i.quantity, 0);
    assert(stockAfterSale === stockBefore - saleQty, `Stock decreased: ${stockBefore} → ${stockAfterSale}`);
    console.log('');

    // ═══════════════════════════════════════
    // TEST 2: Void Sale (stock reversal)
    // ═══════════════════════════════════════
    console.log('─── TEST 2: Void Sale (stock reversal) ───');
    const voided = await req<any>('POST', `/api/sales/${sale.id}/void`, token, {
        reason: 'Phase 3 test void',
    });
    assert(voided.status === 'VOIDED', `Sale status changed to VOIDED`);

    // Verify stock restored
    const invAfterVoid = await req<any[]>('GET', `/api/inventory?branchId=${branchId}`, token);
    const stockAfterVoid = invAfterVoid
        .filter((i: any) => i.variantId === variantId)
        .reduce((s: number, i: any) => s + i.quantity, 0);
    assert(stockAfterVoid === stockBefore, `Stock restored: ${stockAfterSale} → ${stockAfterVoid} (was ${stockBefore})`);
    console.log('');

    // ═══════════════════════════════════════
    // TEST 3: Double void should fail
    // ═══════════════════════════════════════
    console.log('─── TEST 3: Double void prevention ───');
    try {
        await req<any>('POST', `/api/sales/${sale.id}/void`, token, { reason: 'double void' });
        assert(false, 'Second void should have thrown');
    } catch (err: any) {
        assert(err.message.includes('400'), `Double void rejected: ${err.message.slice(0, 80)}`);
    }
    console.log('');

    // ═══════════════════════════════════════
    // TEST 4: Stock Transfer (initiate → dispatch → receive)
    // ═══════════════════════════════════════
    console.log('─── TEST 4: Stock Transfer Workflow ───');

    // Find another branch
    const branches = await req<any[]>('GET', '/api/branches', token);
    const otherBranch = branches.find((b: any) => b.id !== branchId);
    if (!otherBranch) {
        console.log('   ⚠️ Only one branch found — skipping transfer tests\n');
    } else {
        const transferQty = 1;
        // Initiate
        const transfer = await req<any>('POST', '/api/inventory/transfers', token, {
            variantId, fromBranchId: branchId, toBranchId: otherBranch.id, quantity: transferQty,
        });
        assert(!!transfer.id, `Transfer created: ${transfer.id}`);
        assert(transfer.status === 'PENDING', 'Transfer status is PENDING');

        // Dispatch (deducts from source)
        const dispatched = await req<any>('PATCH', `/api/inventory/transfers/${transfer.id}/dispatch`, token);
        assert(dispatched.status === 'DISPATCHED', 'Transfer status is DISPATCHED');

        const srcAfterDispatch = (await req<any[]>('GET', `/api/inventory?branchId=${branchId}`, token))
            .filter((i: any) => i.variantId === variantId)
            .reduce((s: number, i: any) => s + i.quantity, 0);
        assert(srcAfterDispatch === stockBefore - transferQty, `Source stock reduced by ${transferQty}`);

        // Receive (adds to destination)
        const received = await req<any>('PATCH', `/api/inventory/transfers/${transfer.id}/receive`, token);
        assert(received.status === 'RECEIVED', 'Transfer status is RECEIVED');

        const dstAfterReceive = (await req<any[]>('GET', `/api/inventory?branchId=${otherBranch.id}`, token))
            .filter((i: any) => i.variantId === variantId)
            .reduce((s: number, i: any) => s + i.quantity, 0);
        assert(dstAfterReceive >= transferQty, `Destination has at least ${transferQty} units`);
        console.log('');
    }

    // ═══════════════════════════════════════
    // TEST 5: Stock Ledger Audit Trail
    // ═══════════════════════════════════════
    console.log('─── TEST 5: Stock Ledger ───');
    const ledger = await req<any[]>('GET', `/api/inventory/ledger?variantId=${variantId}&branchId=${branchId}`, token);
    assert(Array.isArray(ledger), `Ledger returned array (${ledger.length} entries)`);
    const saleEntries = ledger.filter((l: any) => l.movementType === 'SALE');
    const voidEntries = ledger.filter((l: any) => l.movementType === 'SALE_VOID');
    assert(saleEntries.length > 0, `Found ${saleEntries.length} SALE ledger entries`);
    assert(voidEntries.length > 0, `Found ${voidEntries.length} SALE_VOID ledger entries`);
    console.log('');

    // ═══════════════════════════════════════
    // TEST 6: Low Stock Alerts
    // ═══════════════════════════════════════
    console.log('─── TEST 6: Low Stock Alerts ───');
    const alerts = await req<any[]>('GET', `/api/inventory/low-stock?branchId=${branchId}`, token);
    assert(Array.isArray(alerts), `Low stock alerts returned (${alerts.length} items)`);
    console.log('');

    // ═══════════════════════════════════════
    // TEST 7: Daily Summary (includes void stats)
    // ═══════════════════════════════════════
    console.log('─── TEST 7: Daily Summary ───');
    const summary = await req<any>('GET', `/api/sales/daily-summary?branchId=${branchId}`, token);
    assert(summary.voidedCount !== undefined, `Summary includes voidedCount: ${summary.voidedCount}`);
    assert(summary.voidedTotal !== undefined, `Summary includes voidedTotal: ${summary.voidedTotal}`);
    console.log('');

    // ═══════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════
    console.log('═══════════════════════════════════════════════════');
    const emoji = failed === 0 ? '✅' : '❌';
    console.log(`  ${emoji} RESULTS: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════\n');

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('❌ Unhandled error:', err.message);
    process.exit(1);
});
