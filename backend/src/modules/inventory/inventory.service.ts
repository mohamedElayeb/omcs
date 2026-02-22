import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Inventory, StockMovement, StockTransfer, ProductVariant, StockLedger } from '../../entities';
import { StockMovementAction, TransferStatus } from '../../common/enums';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class InventoryService {
    constructor(
        @InjectRepository(Inventory) private invRepo: Repository<Inventory>,
        @InjectRepository(StockMovement) private movRepo: Repository<StockMovement>,
        @InjectRepository(StockTransfer) private transRepo: Repository<StockTransfer>,
        @InjectRepository(ProductVariant) private varRepo: Repository<ProductVariant>,
        @InjectRepository(StockLedger) private ledgerRepo: Repository<StockLedger>,
        private dataSource: DataSource,
        private events: EventsGateway,
    ) { }

    async findAll(branchId?: string) {
        const qb = this.invRepo.createQueryBuilder('i')
            .leftJoinAndSelect('i.variant', 'v')
            .leftJoinAndSelect('v.product', 'p')
            .leftJoinAndSelect('i.branch', 'b');
        if (branchId) qb.where('i.branchId = :bid', { bid: branchId });
        return qb.orderBy('p.name', 'ASC').getMany();
    }

    async getAlerts() {
        return this.invRepo.createQueryBuilder('i')
            .leftJoinAndSelect('i.variant', 'v')
            .leftJoinAndSelect('v.product', 'p')
            .leftJoinAndSelect('i.branch', 'b')
            .where('i.quantity <= i.lowStockThreshold')
            .orderBy('i.quantity', 'ASC')
            .getMany();
    }

    async getGrouped(branchId?: string, filters?: {
        sku?: string; name?: string; brand?: string;
        size?: string; color?: string; status?: string; // OK | LOW | OUT
        lowStock?: boolean; search?: string; // general search across all text fields
    }) {
        const qb = this.invRepo.createQueryBuilder('i')
            .leftJoinAndSelect('i.variant', 'v')
            .leftJoinAndSelect('v.product', 'p')
            .leftJoinAndSelect('i.branch', 'b');
        if (branchId) qb.andWhere('i.branchId = :bid', { bid: branchId });

        // ─── Field-level Inventory Search Filters (Feature C) ───
        if (filters?.sku) qb.andWhere('LOWER(v.sku) LIKE :sku', { sku: `%${filters.sku.toLowerCase()}%` });
        if (filters?.name) qb.andWhere('LOWER(p.name) LIKE :pname', { pname: `%${filters.name.toLowerCase()}%` });
        if (filters?.brand) qb.andWhere('LOWER(p.brand) LIKE :brand', { brand: `%${filters.brand.toLowerCase()}%` });
        if (filters?.size) qb.andWhere('LOWER(v.size) LIKE :size', { size: `%${filters.size.toLowerCase()}%` });
        if (filters?.color) qb.andWhere('LOWER(v.color) LIKE :color', { color: `%${filters.color.toLowerCase()}%` });
        // General search across SKU, name, brand, size, color
        if (filters?.search) {
            const s = `%${filters.search.toLowerCase()}%`;
            qb.andWhere('(LOWER(v.sku) LIKE :s OR LOWER(p.name) LIKE :s OR LOWER(p.brand) LIKE :s OR LOWER(v.size) LIKE :s OR LOWER(v.color) LIKE :s)', { s });
        }

        const rows = await qb.orderBy('p.name', 'ASC').addOrderBy('v.size', 'ASC').getMany();

        // Step 1: Consolidate batches by variant+branch
        const variantMap = new Map<string, {
            variantId: string; sku: string; size: string; color: string;
            quantity: number; lowStockThreshold: number;
            costPrice: number; salePrice: number;
            totalBatchCost: number; // sum of (batch.costLydAtPurchase * batch.quantity)
            product: any; branchId: string; branchName: string;
        }>();

        for (const row of rows) {
            const vKey = `${row.variantId}__${row.branchId}`;
            let entry = variantMap.get(vKey);
            const qty = row.quantity || 0;
            // NEVER use variant.costPrice (mutable). Fall back to variant.costLydAtPurchase (immutable).
            const batchCost = Number(row.costLydAtPurchase) || Number(row.variant?.costLydAtPurchase) || 0;

            if (!entry) {
                entry = {
                    variantId: row.variantId,
                    sku: row.variant?.sku || '',
                    size: row.variant?.size || '',
                    color: row.variant?.color || '',
                    quantity: 0,
                    lowStockThreshold: row.lowStockThreshold || 5,
                    costPrice: Number(row.variant?.costPrice || 0),
                    salePrice: Number(row.variant?.salePrice || 0),
                    totalBatchCost: 0,
                    product: row.variant?.product,
                    branchId: row.branchId,
                    branchName: row.branch?.name || '',
                };
                variantMap.set(vKey, entry);
            }
            entry.quantity += qty;
            entry.totalBatchCost += batchCost * qty;
        }

        // Step 2: Group by product+branch
        const map = new Map<string, {
            productId: string; productName: string; productNameAr: string; brand: string; imageUrl: string;
            branchId: string; branchName: string;
            totalQuantity: number; lowStockCount: number;
            costPrice: number; salePrice: number;
            inventoryValue: number; // historical cost-based valuation
            variants: { variantId: string; sku: string; size: string; color: string; quantity: number; lowStockThreshold: number; costPrice: number; salePrice: number }[];
        }>();

        for (const entry of variantMap.values()) {
            const key = `${entry.product?.id || ''}__${entry.branchId}`;
            let group = map.get(key);
            if (!group) {
                group = {
                    productId: entry.product?.id || '',
                    productName: entry.product?.name || '',
                    productNameAr: (entry.product as any)?.nameAr || '',
                    brand: entry.product?.brand || '',
                    imageUrl: (entry.product as any)?.imageUrl || '',
                    branchId: entry.branchId,
                    branchName: entry.branchName,
                    totalQuantity: 0,
                    lowStockCount: 0,
                    costPrice: entry.costPrice,
                    salePrice: entry.salePrice,
                    inventoryValue: 0,
                    variants: [],
                };
                map.set(key, group);
            }
            group.totalQuantity += entry.quantity;
            group.inventoryValue += entry.totalBatchCost;
            if (entry.quantity <= entry.lowStockThreshold) group.lowStockCount++;
            group.variants.push({
                variantId: entry.variantId,
                sku: entry.sku,
                size: entry.size,
                color: entry.color,
                quantity: entry.quantity,
                lowStockThreshold: entry.lowStockThreshold,
                costPrice: entry.costPrice,
                salePrice: entry.salePrice,
            });
        }

        let results = Array.from(map.values());

        // Post-processing filters for status and lowStock
        if (filters?.lowStock) {
            results = results.filter(g => g.lowStockCount > 0);
        }
        if (filters?.status) {
            const st = filters.status.toUpperCase();
            results = results.filter(g => {
                const hasOut = g.variants.some(v => v.quantity === 0);
                const hasLow = g.lowStockCount > 0;
                if (st === 'OUT') return hasOut;
                if (st === 'LOW') return hasLow && !hasOut;
                if (st === 'OK') return !hasLow && !hasOut;
                return true;
            });
        }

        return results;
    }

    /**
     * Calculate total inventory valuation using historical batch costs.
     * Value = sum of (batch.costLydAtPurchase * batch.quantity) for all batches.
     * Batches without cost data use variant.costLydAtPurchase (immutable) as fallback.
     */
    async getInventoryValuation(branchId?: string) {
        const qb = this.invRepo.createQueryBuilder('i')
            .leftJoinAndSelect('i.variant', 'v')
            .leftJoinAndSelect('v.product', 'p')
            .leftJoinAndSelect('i.branch', 'b')
            .where('i.quantity > 0');
        if (branchId) qb.andWhere('i.branchId = :bid', { bid: branchId });
        const rows = await qb.getMany();

        let totalValue = 0;
        let totalItems = 0;
        const byBranch: Record<string, { branchName: string; value: number; items: number }> = {};

        for (const row of rows) {
            // NEVER use variant.costPrice (mutable). Fall back to variant.costLydAtPurchase (immutable).
            const unitCost = Number(row.costLydAtPurchase) || Number(row.variant?.costLydAtPurchase) || 0;
            const batchValue = unitCost * row.quantity;
            totalValue += batchValue;
            totalItems += row.quantity;

            const bid = row.branchId;
            if (!byBranch[bid]) byBranch[bid] = { branchName: row.branch?.name || '', value: 0, items: 0 };
            byBranch[bid].value += batchValue;
            byBranch[bid].items += row.quantity;
        }

        return { totalValue, totalItems, byBranch };
    }


    /**
     * Restock a variant at a branch.
     * 
     * If purchase cost data is provided (costUsd, purchaseUsdRate), a new 
     * inventory BATCH row is created to preserve historical purchase cost.
     * Previous batches are never modified.
     * 
     * If no cost data provided, falls back to legacy behavior: increments
     * the first existing row or creates one with no cost data.
     */
    async restock(
        variantId: string,
        branchId: string,
        quantity: number,
        userId: string,
        costData?: { costUsd?: number; purchaseUsdRate?: number; costLydAtPurchase?: number; purchaseDate?: string },
    ) {
        return this.dataSource.transaction(async (em) => {
            let inv: Inventory;

            if (costData?.costUsd && costData?.purchaseUsdRate) {
                // ─── New batch row with purchase cost ───
                const costLyd = costData.costLydAtPurchase || (costData.costUsd * costData.purchaseUsdRate);
                inv = em.create(Inventory, {
                    variantId,
                    branchId,
                    quantity,
                    costUsd: costData.costUsd,
                    purchaseUsdRate: costData.purchaseUsdRate,
                    costLydAtPurchase: costLyd,
                    purchaseDate: costData.purchaseDate || new Date().toISOString().slice(0, 10),
                    lastRestocked: new Date(),
                });
                await em.save(Inventory, inv);
            } else {
                // ─── Legacy: increment existing row ───
                const existing = await em.findOne(Inventory, { where: { variantId, branchId } });
                if (existing) {
                    existing.quantity += quantity;
                    existing.lastRestocked = new Date();
                    inv = await em.save(Inventory, existing);
                } else {
                    inv = em.create(Inventory, { variantId, branchId, quantity, lastRestocked: new Date() });
                    inv = await em.save(Inventory, inv);
                }
            }

            // Total stock across all batches for this variant+branch
            const allBatches = await em.find(Inventory, { where: { variantId, branchId } });
            const totalQty = allBatches.reduce((s, b) => s + b.quantity, 0);

            await em.save(StockMovement, em.create(StockMovement, {
                variantId, branchId,
                action: StockMovementAction.RESTOCK,
                quantityChange: quantity,
                quantityAfter: totalQty,
                performedBy: userId,
            }));

            // Stock ledger
            await em.save(StockLedger, em.create(StockLedger, {
                variantId, branchId,
                movementType: 'RESTOCK', qtyDelta: quantity, qtyAfter: totalQty,
                referenceType: 'restock',
                createdBy: userId,
            }));

            // Emit event with total quantity
            this.events.emitInventoryUpdated({ variantId, branchId, quantity: totalQty });

            return inv;
        });
    }

    // ─── TRANSFER WORKFLOW ───
    // Step 1: Initiate Transfer (just creates the record — no stock changes yet)
    async initiateTransfer(variantId: string, fromBranchId: string, toBranchId: string, quantity: number, userId: string, notes?: string) {
        if (fromBranchId === toBranchId) throw new BadRequestException('Cannot transfer to the same branch');

        // Validate stock across all FIFO batches
        const batches = await this.invRepo.find({ where: { variantId, branchId: fromBranchId } });
        const totalStock = batches.reduce((s, b) => s + b.quantity, 0);
        if (totalStock < quantity) throw new BadRequestException('Insufficient stock at source branch');

        const transfer = await this.transRepo.save(this.transRepo.create({
            variantId, fromBranchId, toBranchId, quantity,
            initiatedBy: userId,
            status: TransferStatus.PENDING,
            notes: notes || undefined,
        }));

        this.events.emitTransferCreated(transfer);

        return this.transRepo.findOne({
            where: { id: transfer.id },
            relations: ['variant', 'variant.product', 'fromBranch', 'toBranch', 'initiator'],
        });
    }

    // Step 2: Dispatch — immediately removes stock from source branch using FIFO
    async dispatchTransfer(transferId: string, userId: string) {
        return this.dataSource.transaction(async (em) => {
            const transfer = await em.findOne(StockTransfer, { where: { id: transferId } });
            if (!transfer) throw new NotFoundException('Transfer not found');
            if (transfer.status !== TransferStatus.PENDING && transfer.status !== TransferStatus.APPROVED) {
                throw new BadRequestException(`Transfer is ${transfer.status}, cannot dispatch`);
            }

            // FIFO deduction from source branch
            const srcBatches = await em.find(Inventory, {
                where: { variantId: transfer.variantId, branchId: transfer.fromBranchId },
                order: { createdAt: 'ASC' },
            });
            const srcTotal = srcBatches.reduce((s, b) => s + b.quantity, 0);
            if (srcTotal < transfer.quantity) {
                throw new BadRequestException('Insufficient stock at source branch');
            }

            let remaining = transfer.quantity;
            for (const batch of srcBatches) {
                if (remaining <= 0) break;
                const take = Math.min(remaining, batch.quantity);
                batch.quantity -= take;
                await em.save(Inventory, batch);
                remaining -= take;
            }

            const srcAfter = srcTotal - transfer.quantity;

            // Log TRANSFER_OUT movement
            await em.save(StockMovement, em.create(StockMovement, {
                variantId: transfer.variantId,
                branchId: transfer.fromBranchId,
                action: StockMovementAction.TRANSFER_OUT,
                quantityChange: -transfer.quantity,
                quantityAfter: srcAfter,
                performedBy: userId,
                referenceId: transferId,
            }));

            // Stock ledger
            await em.save(StockLedger, em.create(StockLedger, {
                variantId: transfer.variantId, branchId: transfer.fromBranchId,
                movementType: 'TRANSFER_SHIP', qtyDelta: -transfer.quantity, qtyAfter: srcAfter,
                referenceType: 'transfer', referenceId: transferId,
                createdBy: userId,
            }));

            // Update transfer status
            transfer.status = TransferStatus.DISPATCHED;
            transfer.dispatchedBy = userId;
            transfer.dispatchedAt = new Date();
            await em.save(StockTransfer, transfer);

            // Emit events
            this.events.emitInventoryUpdated({
                variantId: transfer.variantId,
                branchId: transfer.fromBranchId,
                quantity: srcAfter,
            });
            this.events.emitTransferShipped(transfer);

            // Low stock alert
            if (srcAfter > 0 && srcAfter <= (srcBatches[0]?.lowStockThreshold || 5)) {
                const variant = await em.findOne(ProductVariant, { where: { id: transfer.variantId }, relations: ['product'] });
                this.events.server?.emit('stock.alert', {
                    variantId: transfer.variantId,
                    sku: variant?.sku,
                    productName: variant?.product?.name,
                    branchId: transfer.fromBranchId,
                    quantity: srcAfter,
                    threshold: srcBatches[0]?.lowStockThreshold || 5,
                    message: `Low stock after transfer: ${variant?.sku} — ${srcAfter} left`,
                });
            }

            return transfer;
        });
    }

    // Step 3a: Receive — adds stock to destination branch
    async receiveTransfer(transferId: string, userId: string) {
        return this.dataSource.transaction(async (em) => {
            const transfer = await em.findOne(StockTransfer, { where: { id: transferId } });
            if (!transfer) throw new NotFoundException('Transfer not found');
            if (transfer.status !== TransferStatus.DISPATCHED) {
                throw new BadRequestException(`Transfer is ${transfer.status}, must be DISPATCHED to receive`);
            }

            // Add stock to destination branch
            let toInv = await em.findOne(Inventory, {
                where: { variantId: transfer.variantId, branchId: transfer.toBranchId },
            });
            if (!toInv) {
                toInv = em.create(Inventory, {
                    variantId: transfer.variantId,
                    branchId: transfer.toBranchId,
                    quantity: 0,
                });
            }
            toInv.quantity += transfer.quantity;
            await em.save(Inventory, toInv);

            // Total qty at destination
            const dstBatches = await em.find(Inventory, { where: { variantId: transfer.variantId, branchId: transfer.toBranchId } });
            const dstTotal = dstBatches.reduce((s, b) => s + b.quantity, 0);

            // Log TRANSFER_IN movement
            await em.save(StockMovement, em.create(StockMovement, {
                variantId: transfer.variantId,
                branchId: transfer.toBranchId,
                action: StockMovementAction.TRANSFER_IN,
                quantityChange: transfer.quantity,
                quantityAfter: dstTotal,
                performedBy: userId,
                referenceId: transferId,
            }));

            // Stock ledger
            await em.save(StockLedger, em.create(StockLedger, {
                variantId: transfer.variantId, branchId: transfer.toBranchId,
                movementType: 'TRANSFER_RECEIVE', qtyDelta: transfer.quantity, qtyAfter: dstTotal,
                referenceType: 'transfer', referenceId: transferId,
                createdBy: userId,
            }));

            // Update transfer status
            transfer.status = TransferStatus.RECEIVED;
            transfer.receivedBy = userId;
            transfer.receivedAt = new Date();
            await em.save(StockTransfer, transfer);

            // Emit events
            this.events.emitInventoryUpdated({
                variantId: transfer.variantId,
                branchId: transfer.toBranchId,
                quantity: dstTotal,
            });
            this.events.emitTransferReceived(transfer);

            return transfer;
        });
    }

    // Step 3b: Cancel — restores stock to source branch (only if DISPATCHED)
    async cancelTransfer(transferId: string, userId: string) {
        return this.dataSource.transaction(async (em) => {
            const transfer = await em.findOne(StockTransfer, { where: { id: transferId } });
            if (!transfer) throw new NotFoundException('Transfer not found');
            if (transfer.status === TransferStatus.RECEIVED || transfer.status === TransferStatus.CANCELLED) {
                throw new BadRequestException(`Transfer is already ${transfer.status}`);
            }

            // If dispatched, restore stock to source branch
            if (transfer.status === TransferStatus.DISPATCHED) {
                const fromInv = await em.findOne(Inventory, {
                    where: { variantId: transfer.variantId, branchId: transfer.fromBranchId },
                });
                if (fromInv) {
                    fromInv.quantity += transfer.quantity;
                    await em.save(Inventory, fromInv);

                    const allBatches = await em.find(Inventory, {
                        where: { variantId: transfer.variantId, branchId: transfer.fromBranchId },
                    });
                    const totalQty = allBatches.reduce((s, b) => s + b.quantity, 0);

                    await em.save(StockMovement, em.create(StockMovement, {
                        variantId: transfer.variantId,
                        branchId: transfer.fromBranchId,
                        action: StockMovementAction.ADJUSTMENT,
                        quantityChange: transfer.quantity,
                        quantityAfter: totalQty,
                        performedBy: userId,
                        referenceId: transferId,
                    }));

                    // Stock ledger
                    await em.save(StockLedger, em.create(StockLedger, {
                        variantId: transfer.variantId, branchId: transfer.fromBranchId,
                        movementType: 'ADJUSTMENT', qtyDelta: transfer.quantity, qtyAfter: totalQty,
                        referenceType: 'transfer', referenceId: transferId,
                        note: 'Transfer cancelled — stock restored',
                        createdBy: userId,
                    }));

                    this.events.emitInventoryUpdated({
                        variantId: transfer.variantId,
                        branchId: transfer.fromBranchId,
                        quantity: totalQty,
                    });
                }
            }

            transfer.status = TransferStatus.CANCELLED;
            transfer.cancelledAt = new Date();
            await em.save(StockTransfer, transfer);

            return transfer;
        });
    }

    // ─── IMMEDIATE TRANSFER (Feature D) ───
    // Subtracts from source and adds to destination in one atomic transaction.
    // Status goes directly to COMPLETED — no approval workflow.
    async immediateTransfer(
        variantId: string, fromBranchId: string, toBranchId: string,
        quantity: number, userId: string, notes?: string,
    ) {
        if (fromBranchId === toBranchId) throw new BadRequestException('Cannot transfer to the same branch');
        if (quantity <= 0) throw new BadRequestException('Quantity must be positive');

        return this.dataSource.transaction(async (em) => {
            // 1. Verify source stock (sum across all FIFO batches)
            const srcBatches = await em.find(Inventory, {
                where: { variantId, branchId: fromBranchId },
                order: { createdAt: 'ASC' },
            });
            const srcTotal = srcBatches.reduce((s, b) => s + b.quantity, 0);
            if (srcTotal < quantity) {
                throw new BadRequestException(`Insufficient stock (have ${srcTotal}, need ${quantity})`);
            }

            // 2. FIFO deduction from source batches — preserve historical cost on destination
            let remaining = quantity;
            const costBatches: { costUsd: number | null; purchaseUsdRate: number | null; costLydAtPurchase: number | null; purchaseDate: string | null; qty: number }[] = [];

            for (const batch of srcBatches) {
                if (remaining <= 0) break;
                const take = Math.min(remaining, batch.quantity);
                costBatches.push({
                    costUsd: batch.costUsd ? Number(batch.costUsd) : null,
                    purchaseUsdRate: batch.purchaseUsdRate ? Number(batch.purchaseUsdRate) : null,
                    costLydAtPurchase: batch.costLydAtPurchase ? Number(batch.costLydAtPurchase) : null,
                    purchaseDate: batch.purchaseDate || null,
                    qty: take,
                });
                batch.quantity -= take;
                await em.save(Inventory, batch);
                remaining -= take;
            }

            // 3. Add to destination — create batch rows preserving original cost data
            for (const cb of costBatches) {
                // Check if matching batch exists at destination
                const existing = await em.findOne(Inventory, {
                    where: { variantId, branchId: toBranchId, costUsd: cb.costUsd as any, purchaseUsdRate: cb.purchaseUsdRate as any },
                });
                if (existing) {
                    existing.quantity += cb.qty;
                    await em.save(Inventory, existing);
                } else {
                    const variant = await em.findOne(ProductVariant, { where: { id: variantId } });
                    await em.save(Inventory, em.create(Inventory, {
                        variantId,
                        branchId: toBranchId,
                        quantity: cb.qty,
                        lowStockThreshold: 5,
                        costUsd: cb.costUsd as any,
                        purchaseUsdRate: cb.purchaseUsdRate as any,
                        costLydAtPurchase: cb.costLydAtPurchase as any,
                        purchaseDate: cb.purchaseDate as any,
                    }));
                }
            }

            // 4. Stock movements
            const srcAfter = srcTotal - quantity;
            const dstBatches = await em.find(Inventory, { where: { variantId, branchId: toBranchId } });
            const dstAfter = dstBatches.reduce((s, b) => s + b.quantity, 0);

            await em.save(StockMovement, em.create(StockMovement, {
                variantId, branchId: fromBranchId,
                action: StockMovementAction.TRANSFER_OUT,
                quantityChange: -quantity, quantityAfter: srcAfter,
                performedBy: userId,
                note: `Immediate transfer to branch`,
            }));
            await em.save(StockMovement, em.create(StockMovement, {
                variantId, branchId: toBranchId,
                action: StockMovementAction.TRANSFER_IN,
                quantityChange: quantity, quantityAfter: dstAfter,
                performedBy: userId,
                note: `Immediate transfer from branch`,
            }));

            // 5. Transfer record for audit
            const transfer = await em.save(StockTransfer, em.create(StockTransfer, {
                variantId, fromBranchId, toBranchId, quantity,
                initiatedBy: userId,
                status: TransferStatus.COMPLETED,
                notes: notes || 'Immediate transfer',
                dispatchedBy: userId,
                receivedBy: userId,
                dispatchedAt: new Date(),
                receivedAt: new Date(),
            }));

            // 6. Stock ledger entries
            await em.save(StockLedger, em.create(StockLedger, {
                variantId, branchId: fromBranchId,
                movementType: 'TRANSFER_SHIP', qtyDelta: -quantity, qtyAfter: srcAfter,
                referenceType: 'transfer', referenceId: transfer.id,
                createdBy: userId,
            }));
            await em.save(StockLedger, em.create(StockLedger, {
                variantId, branchId: toBranchId,
                movementType: 'TRANSFER_RECEIVE', qtyDelta: quantity, qtyAfter: dstAfter,
                referenceType: 'transfer', referenceId: transfer.id,
                createdBy: userId,
            }));

            // 7. Emit realtime events
            this.events.emitInventoryUpdated({ variantId, branchId: fromBranchId, quantity: srcAfter });
            this.events.emitInventoryUpdated({ variantId, branchId: toBranchId, quantity: dstAfter });

            // 8. Low stock alert check
            const variant = await em.findOne(ProductVariant, { where: { id: variantId }, relations: ['product'] });
            if (srcAfter > 0 && srcAfter <= (srcBatches[0]?.lowStockThreshold || 5)) {
                this.events.server?.emit('stock.alert', {
                    variantId,
                    sku: variant?.sku,
                    productName: variant?.product?.name,
                    branchId: fromBranchId,
                    quantity: srcAfter,
                    threshold: srcBatches[0]?.lowStockThreshold || 5,
                    message: `Low stock: ${variant?.sku} (${variant?.product?.name}) — ${srcAfter} left`,
                });
            }

            return em.findOne(StockTransfer, {
                where: { id: transfer.id },
                relations: ['variant', 'variant.product', 'fromBranch', 'toBranch', 'initiator'],
            });
        });
    }

    // ─── Transfer Queries ───
    async findAllTransfers(query?: { status?: string; fromBranchId?: string; toBranchId?: string }) {
        const qb = this.transRepo.createQueryBuilder('t')
            .leftJoinAndSelect('t.variant', 'v')
            .leftJoinAndSelect('v.product', 'p')
            .leftJoinAndSelect('t.fromBranch', 'fb')
            .leftJoinAndSelect('t.toBranch', 'tb')
            .leftJoinAndSelect('t.initiator', 'u')
            .leftJoinAndSelect('t.dispatcher', 'd')
            .leftJoinAndSelect('t.receiver', 'r');
        if (query?.status) qb.andWhere('t.status = :st', { st: query.status });
        if (query?.fromBranchId) qb.andWhere('t.fromBranchId = :fbid', { fbid: query.fromBranchId });
        if (query?.toBranchId) qb.andWhere('t.toBranchId = :tbid', { tbid: query.toBranchId });
        return qb.orderBy('t.createdAt', 'DESC').getMany();
    }

    findTransfer(id: string) {
        return this.transRepo.findOne({
            where: { id },
            relations: ['variant', 'variant.product', 'fromBranch', 'toBranch', 'initiator', 'dispatcher', 'receiver'],
        });
    }

    getMovements(branchId?: string, variantId?: string) {
        const qb = this.movRepo.createQueryBuilder('m')
            .leftJoinAndSelect('m.variant', 'v')
            .leftJoinAndSelect('v.product', 'p')
            .leftJoinAndSelect('m.branch', 'b');
        if (branchId) qb.andWhere('m.branchId = :bid', { bid: branchId });
        if (variantId) qb.andWhere('m.variantId = :vid', { vid: variantId });
        return qb.orderBy('m.createdAt', 'DESC').limit(100).getMany();
    }

    // ─── Stock Ledger Queries ───
    async getStockLedger(query?: { branchId?: string; variantId?: string; movementType?: string; limit?: number }) {
        const qb = this.ledgerRepo.createQueryBuilder('l')
            .leftJoinAndSelect('l.variant', 'v')
            .leftJoinAndSelect('v.product', 'p')
            .leftJoinAndSelect('l.branch', 'b')
            .leftJoinAndSelect('l.creator', 'u');
        if (query?.branchId) qb.andWhere('l.branchId = :bid', { bid: query.branchId });
        if (query?.variantId) qb.andWhere('l.variantId = :vid', { vid: query.variantId });
        if (query?.movementType) qb.andWhere('l.movementType = :mt', { mt: query.movementType });
        return qb.orderBy('l.createdAt', 'DESC').limit(query?.limit || 200).getMany();
    }

    // ─── Low Stock Alerts ───
    async getLowStockAlerts(branchId?: string) {
        // Consolidate across all batches for each variant+branch
        const qb = this.invRepo.createQueryBuilder('i')
            .select('i.variant_id', 'variantId')
            .addSelect('i.branch_id', 'branchId')
            .addSelect('SUM(i.quantity)', 'totalQty')
            .addSelect('MIN(i.low_stock_threshold)', 'threshold')
            .groupBy('i.variant_id')
            .addGroupBy('i.branch_id')
            .having('SUM(i.quantity) <= MIN(i.low_stock_threshold)')
            .andHaving('SUM(i.quantity) > 0');
        if (branchId) qb.andWhere('i.branch_id = :bid', { bid: branchId });
        const raw = await qb.getRawMany();

        // Enrich with variant/product/branch data
        const results: any[] = [];
        for (const row of raw) {
            const variant = await this.varRepo.findOne({ where: { id: row.variantId }, relations: ['product'] });
            const inv = await this.invRepo.findOne({ where: { variantId: row.variantId, branchId: row.branchId }, relations: ['branch'] });
            results.push({
                variantId: row.variantId,
                branchId: row.branchId,
                branchName: inv?.branch?.name || '',
                sku: variant?.sku || '',
                productName: variant?.product?.name || '',
                size: variant?.size || '',
                color: variant?.color || '',
                totalQuantity: Number(row.totalQty),
                threshold: Number(row.threshold),
            });
        }
        return results;
    }

    // ─── Update low stock threshold ───
    async updateThreshold(variantId: string, branchId: string, threshold: number) {
        const rows = await this.invRepo.find({ where: { variantId, branchId } });
        if (rows.length === 0) throw new NotFoundException('Inventory not found for this variant/branch');
        for (const row of rows) {
            row.lowStockThreshold = threshold;
            await this.invRepo.save(row);
        }
        return { variantId, branchId, threshold };
    }
}
