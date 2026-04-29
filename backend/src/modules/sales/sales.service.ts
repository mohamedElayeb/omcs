import { Injectable, BadRequestException, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between } from 'typeorm';
import { Sale, SaleItem, Inventory, StockMovement, ProductVariant, DeliveryLog, SystemSetting, BankTransferLog, StockLedger } from '../../entities';
import { StockMovementAction, PaymentMethod, SaleStatus, DeliveryPaidStatus, TransferPaymentStatus } from '../../common/enums';
import { User } from '../../entities';
import { EventsGateway } from '../events/events.gateway';
import { ActivityLogService } from '../activity-log/activity-log.service';

interface CreateSaleDto {
    branchId: string;
    items: { variantId: string; quantity: number; discount?: number }[];
    discountPercent?: number;
    idempotencyKey?: string;
    managerOverrideBy?: string;
    paymentMethod?: string;
    notes?: string;
    paidAmount?: number;
    // Bank transfer fields
    transferReference?: string;
    transferBankName?: string;
    transferAmount?: number;
    transferDate?: string;
    // Delivery Phase 1 fields
    customerName?: string;
    customerPhone?: string;
    deliveryAddress?: string;
    deliveryCity?: string;
    deliveryCompany?: string;
    deliveryFee?: number;
    // Split payment
    splitPaymentMethod?: string;
    splitPaymentAmount?: number;
}

@Injectable()
export class SalesService {
    constructor(
        @InjectRepository(Sale) private saleRepo: Repository<Sale>,
        @InjectRepository(Inventory) private invRepo: Repository<Inventory>,
        @InjectRepository(ProductVariant) private variantRepo: Repository<ProductVariant>,
        @InjectRepository(DeliveryLog) private deliveryLogRepo: Repository<DeliveryLog>,
        @InjectRepository(BankTransferLog) private bankTransferLogRepo: Repository<BankTransferLog>,
        @InjectRepository(SystemSetting) private settingsRepo: Repository<SystemSetting>,
        @InjectRepository(StockLedger) private ledgerRepo: Repository<StockLedger>,
        private dataSource: DataSource,
        private events: EventsGateway,
        private activityLog: ActivityLogService,
    ) { }

    private async getCurrentUsdRate(): Promise<number> {
        const row = await this.settingsRepo.findOne({ where: { key: 'parallelUsdRate' } });
        return Number(row?.value) || 6.30;
    }

    // ─── Helper: log to stock ledger ───
    private async logLedger(
        em: any, data: {
            variantId: string; branchId: string; movementType: string;
            qtyDelta: number; qtyAfter: number;
            referenceType?: string; referenceId?: string;
            unitCost?: number; note?: string; createdBy?: string;
        },
    ) {
        await em.save(StockLedger, em.create(StockLedger, data));
    }

    async createSale(dto: CreateSaleDto, cashier: User) {
        // Idempotency check
        if (dto.idempotencyKey) {
            const existing = await this.saleRepo.findOne({
                where: { idempotencyKey: dto.idempotencyKey },
                relations: ['items'],
            });
            if (existing) return existing;
        }

        // Discount validation
        const discountPercent = dto.discountPercent || 0;
        if (discountPercent > Number(cashier.maxDiscountPercent || 100)) {
            if (!dto.managerOverrideBy) {
                throw new BadRequestException(
                    `Discount ${discountPercent}% exceeds your limit of ${cashier.maxDiscountPercent}%. Manager override required.`
                );
            }
        }

        const paymentMethod = (dto.paymentMethod as PaymentMethod) || PaymentMethod.CASH;

        // Capture USD rate at time of sale (immutable snapshot)
        const usdRateAtSale = await this.getCurrentUsdRate();
        const saleDate = new Date().toISOString().slice(0, 10);

        return this.dataSource.transaction(async (em) => {
            const saleItems: Partial<SaleItem>[] = [];
            let subtotal = 0;
            let totalProfit = 0;

            for (const item of dto.items) {
                const variant = await em.findOne(ProductVariant, { where: { id: item.variantId } });
                if (!variant) throw new BadRequestException(`Variant ${item.variantId} not found`);

                // Get total available stock across all batches for this variant+branch
                const batches = await em.find(Inventory, {
                    where: { variantId: item.variantId, branchId: dto.branchId },
                    order: { createdAt: 'ASC' }, // FIFO: oldest batches first
                });
                const totalStock = batches.reduce((s, b) => s + b.quantity, 0);
                if (totalStock < item.quantity) {
                    throw new BadRequestException(`Insufficient stock for SKU ${variant.sku} (have ${totalStock}, need ${item.quantity})`);
                }

                // FIFO deduction: consume from oldest batches first
                let remaining = item.quantity;
                let totalCostConsumed = 0;
                let snapshotCostUsd: number | null = null;
                let snapshotPurchaseUsdRate: number | null = null;
                let snapshotCostLydAtPurchase: number | null = null;
                let snapshotPurchaseDate: string | null = null;

                for (const batch of batches) {
                    if (remaining <= 0) break;
                    const take = Math.min(remaining, batch.quantity);

                    // Use batch cost if available, otherwise fall back to variant costLydAtPurchase (immutable)
                    const batchUnitCost = Number(batch.costLydAtPurchase) || Number(variant.costLydAtPurchase) || 0;
                    totalCostConsumed += batchUnitCost * take;

                    // Snapshot from the first batch consumed (FIFO oldest)
                    if (snapshotCostUsd === null) {
                        snapshotCostUsd = Number(batch.costUsd) || Number(variant.costUsd) || null;
                        snapshotPurchaseUsdRate = Number(batch.purchaseUsdRate) || Number(variant.purchaseUsdRate) || null;
                        snapshotCostLydAtPurchase = batchUnitCost || null;
                        snapshotPurchaseDate = batch.purchaseDate || variant.purchaseDate || null;
                    }

                    batch.quantity -= take;
                    await em.save(Inventory, batch);
                    remaining -= take;
                }

                // Log stock movement
                const newTotalStock = totalStock - item.quantity;
                await em.save(StockMovement, em.create(StockMovement, {
                    variantId: item.variantId,
                    branchId: dto.branchId,
                    action: StockMovementAction.SALE,
                    quantityChange: -item.quantity,
                    quantityAfter: newTotalStock,
                    performedBy: cashier.id,
                }));

                // Stock ledger entry
                const weightedUnitCost = totalCostConsumed / item.quantity;
                await this.logLedger(em, {
                    variantId: item.variantId, branchId: dto.branchId,
                    movementType: 'SALE', qtyDelta: -item.quantity, qtyAfter: newTotalStock,
                    referenceType: 'sale', unitCost: weightedUnitCost,
                    createdBy: cashier.id,
                });

                // Item-level discount validation
                const lineDiscount = item.discount || 0;
                if (lineDiscount > Number(cashier.maxDiscountValue || 999999) && !dto.managerOverrideBy) {
                    throw new BadRequestException(
                        `Item discount ${lineDiscount} LYD exceeds your limit. Manager override required.`
                    );
                }

                // Calculate using weighted average cost from consumed batches
                const lineTotal = (Number(variant.salePrice) * item.quantity) - lineDiscount;
                const lineProfit = lineTotal - totalCostConsumed;

                saleItems.push({
                    variantId: item.variantId,
                    quantity: item.quantity,
                    unitPrice: variant.salePrice,
                    unitCost: weightedUnitCost,
                    discount: lineDiscount,
                    lineTotal,
                    lineProfit,
                    // ─── Immutable Historical Cost Snapshot ───
                    costUsdAtPurchase: snapshotCostUsd as any,
                    purchaseUsdRateAtPurchase: snapshotPurchaseUsdRate as any,
                    costLydAtPurchase: snapshotCostLydAtPurchase as any,
                    purchaseDateAtPurchase: snapshotPurchaseDate as any,
                    usdRateAtSale: usdRateAtSale,
                    saleDate: saleDate,
                });

                subtotal += Number(variant.salePrice) * item.quantity;
                totalProfit += lineProfit;
            }

            const discountAmount = subtotal * (discountPercent / 100);
            const total = subtotal - discountAmount;
            const profit = totalProfit - (totalProfit * (discountPercent / 100));

            // Generate invoice number
            const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const count = await em.count(Sale, { where: { branchId: dto.branchId } });
            const invoiceNumber = `OM-${today}-${String(count + 1).padStart(4, '0')}`;

            // Payment calculations
            const paidAmount = dto.paidAmount !== undefined ? dto.paidAmount : total;
            const remainingAmount = total - paidAmount;

            // Bank transfer: default to PENDING
            const isBankTransfer = paymentMethod === PaymentMethod.BANK_TRANSFER;

            const sale = em.create(Sale, {
                invoiceNumber,
                branchId: dto.branchId,
                cashierId: cashier.id,
                subtotal, discountAmount, discountPercent,
                total, profit,
                paymentMethod,
                status: SaleStatus.COMPLETED,
                paidAmount: isBankTransfer ? 0 : paidAmount,
                remainingAmount: isBankTransfer ? total : (remainingAmount > 0 ? remainingAmount : 0),
                deliveryPaidStatus: paymentMethod === PaymentMethod.DELIVERY
                    ? (paidAmount >= total ? DeliveryPaidStatus.PAID : DeliveryPaidStatus.UNPAID)
                    : null as any,
                notes: dto.notes || null as any,
                idempotencyKey: dto.idempotencyKey || undefined,
                managerOverrideBy: dto.managerOverrideBy || undefined,
                usdRateAtSale,
                // Bank transfer fields
                transferPaymentStatus: isBankTransfer ? TransferPaymentStatus.PENDING : null as any,
                transferReference: isBankTransfer ? (dto.transferReference || null) : null as any,
                transferBankName: isBankTransfer ? (dto.transferBankName || null) : null as any,
                transferAmount: isBankTransfer ? (dto.transferAmount || total) : null as any,
                transferDate: isBankTransfer && dto.transferDate ? new Date(dto.transferDate) : null as any,
                // Delivery Phase 1 fields
                customerName: dto.customerName || null as any,
                customerPhone: dto.customerPhone || null as any,
                deliveryAddress: dto.deliveryAddress || null as any,
                deliveryCity: dto.deliveryCity || null as any,
                deliveryCompany: dto.deliveryCompany as any || null as any,
                deliveryFee: dto.deliveryFee || null as any,
                // Split payment
                splitPaymentMethod: dto.splitPaymentMethod ? (dto.splitPaymentMethod as PaymentMethod) : null as any,
                splitPaymentAmount: dto.splitPaymentAmount || null as any,
            });
            const savedSale = await em.save(Sale, sale);

            for (const si of saleItems) {
                await em.save(SaleItem, em.create(SaleItem, { ...si, saleId: savedSale.id }));
            }

            // Log initial bank transfer status
            if (isBankTransfer) {
                await em.save(BankTransferLog, em.create(BankTransferLog, {
                    saleId: savedSale.id,
                    oldStatus: null as any,
                    newStatus: TransferPaymentStatus.PENDING,
                    changedBy: cashier.id,
                    note: 'Bank transfer sale created',
                }));
            }

            // Log initial delivery status
            if (paymentMethod === PaymentMethod.DELIVERY) {
                await em.save(DeliveryLog, em.create(DeliveryLog, {
                    saleId: savedSale.id,
                    oldStatus: null as any,
                    newStatus: paidAmount >= total ? DeliveryPaidStatus.PAID : DeliveryPaidStatus.UNPAID,
                    changedBy: cashier.id,
                    note: 'Initial delivery sale',
                }));
            }

            const result = await em.findOne(Sale, {
                where: { id: savedSale.id },
                relations: ['items', 'items.variant', 'items.variant.product', 'cashier', 'branch'],
            });

            // Emit realtime events
            if (result) {
                this.events.emitSaleCreated(result);
                for (const item of dto.items) {
                    const batchRows = await em.find(Inventory, {
                        where: { variantId: item.variantId, branchId: dto.branchId },
                    });
                    const totalQty = batchRows.reduce((s, b) => s + b.quantity, 0);
                    this.events.emitInventoryUpdated({
                        variantId: item.variantId,
                        branchId: dto.branchId,
                        quantity: totalQty,
                    });
                }
            }

            // Log activity
            this.activityLog.log({
                action: 'SALE',
                entityType: 'sale',
                entityId: result?.id,
                description: `بيع ${result?.invoiceNumber} — ${dto.items.length} عنصر — ${result?.total} د.ل`,
                details: { invoiceNumber: result?.invoiceNumber, total: result?.total, items: dto.items.length, paymentMethod },
                userId: cashier.id,
                branchId: dto.branchId,
            }).catch(e => console.error('Activity log failed:', e.message));

            return result;
        });
    }

    // ═══════════════════════════════════════════
    // VOID SALE — Phase 3 (reverts FIFO stock)
    // ═══════════════════════════════════════════
    async voidSale(saleId: string, user: User, reason?: string) {
        const sale = await this.saleRepo.findOne({
            where: { id: saleId },
            relations: ['items'],
        });
        if (!sale) throw new NotFoundException('Sale not found');
        if (sale.status === SaleStatus.VOIDED) {
            throw new BadRequestException('Sale is already voided');
        }
        if (sale.status !== SaleStatus.COMPLETED) {
            throw new BadRequestException(`Cannot void sale with status ${sale.status}`);
        }

        // Only OWNER/MANAGER can void, or same cashier within 24h
        if (user.role !== 'OWNER' && user.role !== 'MANAGER') {
            const hoursElapsed = (Date.now() - new Date(sale.createdAt).getTime()) / (1000 * 60 * 60);
            if (sale.cashierId !== user.id || hoursElapsed > 24) {
                throw new ForbiddenException('Only managers can void sales after 24 hours');
            }
        }

        return this.dataSource.transaction(async (em) => {
            // Revert stock for each sale item
            for (const item of sale.items) {
                // Add stock back — create a new batch row (reverse of FIFO deduction)
                // We use the sale item's recorded cost to preserve cost basis
                const existingBatch = await em.findOne(Inventory, {
                    where: { variantId: item.variantId, branchId: sale.branchId },
                    order: { createdAt: 'DESC' },
                });

                if (existingBatch) {
                    existingBatch.quantity += item.quantity;
                    await em.save(Inventory, existingBatch);
                } else {
                    await em.save(Inventory, em.create(Inventory, {
                        variantId: item.variantId,
                        branchId: sale.branchId,
                        quantity: item.quantity,
                        costLydAtPurchase: item.costLydAtPurchase,
                        costUsd: item.costUsdAtPurchase,
                        purchaseUsdRate: item.purchaseUsdRateAtPurchase,
                        purchaseDate: item.purchaseDateAtPurchase,
                    }));
                }

                // Total stock after reversal
                const allBatches = await em.find(Inventory, {
                    where: { variantId: item.variantId, branchId: sale.branchId },
                });
                const totalQty = allBatches.reduce((s, b) => s + b.quantity, 0);

                // Stock movement log
                await em.save(StockMovement, em.create(StockMovement, {
                    variantId: item.variantId,
                    branchId: sale.branchId,
                    action: StockMovementAction.SALE_VOID,
                    quantityChange: item.quantity,
                    quantityAfter: totalQty,
                    performedBy: user.id,
                    referenceId: saleId,
                    note: `Void sale ${sale.invoiceNumber}`,
                }));

                // Stock ledger entry
                await this.logLedger(em, {
                    variantId: item.variantId, branchId: sale.branchId,
                    movementType: 'SALE_VOID', qtyDelta: item.quantity, qtyAfter: totalQty,
                    referenceType: 'sale', referenceId: saleId,
                    unitCost: Number(item.unitCost),
                    note: `Void: ${reason || 'No reason'}`,
                    createdBy: user.id,
                });

                // Emit inventory update
                this.events.emitInventoryUpdated({
                    variantId: item.variantId,
                    branchId: sale.branchId,
                    quantity: totalQty,
                });
            }

            // Update sale status
            sale.status = SaleStatus.VOIDED;
            sale.notes = (sale.notes || '') + `\n[VOIDED ${new Date().toISOString()}] ${reason || 'No reason provided'}`;
            await em.save(Sale, sale);

            // Emit sale voided event
            this.events.server?.emit('sale.voided', {
                saleId: sale.id,
                invoiceNumber: sale.invoiceNumber,
                branchId: sale.branchId,
                total: sale.total,
                voidedBy: user.id,
            });

            this.activityLog.log({
                action: 'VOID',
                entityType: 'sale',
                entityId: sale.id,
                description: `إلغاء فاتورة ${sale.invoiceNumber} — ${sale.total} د.ل — ${reason || 'بدون سبب'}`,
                details: { invoiceNumber: sale.invoiceNumber, total: sale.total, reason },
                userId: user.id,
                branchId: sale.branchId,
            }).catch(e => console.error('Activity log failed:', e.message));

            return sale;
        });
    }

    // ─── Bank Transfer Status Updates (Feature A) ───
    async updateTransferPaymentStatus(saleId: string, newStatus: TransferPaymentStatus, userId: string, note?: string) {
        const sale = await this.saleRepo.findOne({ where: { id: saleId } });
        if (!sale) throw new NotFoundException('Sale not found');
        if (sale.paymentMethod !== PaymentMethod.BANK_TRANSFER) {
            throw new BadRequestException('Only bank transfer sales can have their transfer status updated');
        }

        const oldStatus = sale.transferPaymentStatus;
        sale.transferPaymentStatus = newStatus;

        // Update paid/remaining amounts based on status
        if (newStatus === TransferPaymentStatus.CONFIRMED) {
            sale.paidAmount = Number(sale.total);
            sale.remainingAmount = 0;
        } else if (newStatus === TransferPaymentStatus.REJECTED) {
            sale.paidAmount = 0;
            sale.remainingAmount = Number(sale.total);
        }

        await this.saleRepo.save(sale);

        // Audit log
        await this.bankTransferLogRepo.save(this.bankTransferLogRepo.create({
            saleId,
            oldStatus,
            newStatus,
            changedBy: userId,
            note: note || undefined,
        }));

        this.activityLog.log({
            action: 'BANK_STATUS',
            entityType: 'sale',
            entityId: saleId,
            description: `تحديث حالة التحويل البنكي: ${oldStatus} → ${newStatus}`,
            details: { oldStatus, newStatus, note },
            userId,
        }).catch(e => console.error('Activity log failed:', e.message));

        return sale;
    }

    async getBankTransferLogs(saleId: string) {
        return this.bankTransferLogRepo.find({
            where: { saleId },
            relations: ['changedByUser'],
            order: { changedAt: 'DESC' },
        });
    }

    // ─── Delivery Status Updates ───
    async updateDeliveryStatus(saleId: string, newStatus: DeliveryPaidStatus, userId: string, note?: string) {
        const sale = await this.saleRepo.findOne({ where: { id: saleId } });
        if (!sale) throw new NotFoundException('Sale not found');
        if (sale.paymentMethod !== PaymentMethod.DELIVERY) {
            throw new BadRequestException('Only delivery sales can have their paid status updated');
        }

        const oldStatus = sale.deliveryPaidStatus;
        sale.deliveryPaidStatus = newStatus;

        // Update paid/remaining amounts
        if (newStatus === DeliveryPaidStatus.PAID) {
            sale.paidAmount = Number(sale.total);
            sale.remainingAmount = 0;
        } else if (newStatus === DeliveryPaidStatus.UNPAID) {
            sale.paidAmount = 0;
            sale.remainingAmount = Number(sale.total);
        }

        await this.saleRepo.save(sale);

        // Log this change
        await this.deliveryLogRepo.save(this.deliveryLogRepo.create({
            saleId,
            oldStatus,
            newStatus,
            changedBy: userId,
            note: note || undefined,
        }));

        this.activityLog.log({
            action: 'DELIVERY_STATUS',
            entityType: 'sale',
            entityId: saleId,
            description: `تحديث حالة التوصيل: ${oldStatus} → ${newStatus}`,
            details: { oldStatus, newStatus, note },
            userId,
        }).catch(e => console.error('Activity log failed:', e.message));

        return sale;
    }

    async getDeliveryLogs(saleId: string) {
        return this.deliveryLogRepo.find({
            where: { saleId },
            relations: ['changedByUser'],
            order: { changedAt: 'DESC' },
        });
    }

    // ─── Queries (Feature F: enhanced filters + date range) ───
    async findAll(query: {
        branchId?: string;
        startDate?: string;
        endDate?: string;
        paymentMethod?: string;
        status?: string;
        cashierId?: string;
        transferPaymentStatus?: string;
        deliveryPaidStatus?: string;
        page?: number;
        limit?: number;
    }) {
        const page = Math.max(1, Number(query.page) || 1);
        const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));

        const qb = this.saleRepo.createQueryBuilder('s')
            .leftJoinAndSelect('s.items', 'i')
            .leftJoinAndSelect('i.variant', 'v')
            .leftJoinAndSelect('v.product', 'p')
            .leftJoinAndSelect('s.cashier', 'c')
            .leftJoinAndSelect('s.branch', 'b');
        if (query.branchId) qb.andWhere('s.branchId = :bid', { bid: query.branchId });
        if (query.startDate) qb.andWhere('s.createdAt >= :start', { start: query.startDate });
        if (query.endDate) {
            // Include the entire end day
            const endPlusDay = new Date(query.endDate);
            endPlusDay.setDate(endPlusDay.getDate() + 1);
            qb.andWhere('s.createdAt < :end', { end: endPlusDay.toISOString().slice(0, 10) });
        }
        if (query.paymentMethod) qb.andWhere('s.paymentMethod = :pm', { pm: query.paymentMethod });
        if (query.status) qb.andWhere('s.status = :st', { st: query.status });
        if (query.cashierId) qb.andWhere('s.cashierId = :cid', { cid: query.cashierId });
        if (query.transferPaymentStatus) qb.andWhere('s.transferPaymentStatus = :tps', { tps: query.transferPaymentStatus });
        if (query.deliveryPaidStatus) qb.andWhere('s.deliveryPaidStatus = :dps', { dps: query.deliveryPaidStatus });

        const [sales, total] = await qb.orderBy('s.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();

        return { sales, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }

    findOne(id: string) {
        return this.saleRepo.findOne({
            where: { id },
            relations: ['items', 'items.variant', 'items.variant.product', 'cashier', 'branch'],
        });
    }

    async getDailySummary(branchId: string, date?: string) {
        const d = date || new Date().toISOString().slice(0, 10);
        const start = `${d}T00:00:00`;
        const end = `${d}T23:59:59`;

        const sales = await this.saleRepo.find({
            where: { branchId, createdAt: Between(new Date(start), new Date(end)) },
        });

        // Exclude voided sales from summaries
        const activeSales = sales.filter(s => s.status !== SaleStatus.VOIDED);
        const voidedSales = sales.filter(s => s.status === SaleStatus.VOIDED);

        const byMethod: Record<string, { count: number; total: number }> = {};
        for (const s of activeSales) {
            const m = s.paymentMethod || 'CASH';
            if (!byMethod[m]) byMethod[m] = { count: 0, total: 0 };
            byMethod[m].count++;
            byMethod[m].total += Number(s.total);
        }

        return {
            date: d,
            branchId,
            totalSales: activeSales.reduce((s, x) => s + Number(x.total), 0),
            totalProfit: activeSales.reduce((s, x) => s + Number(x.profit), 0),
            transactionCount: activeSales.length,
            totalDiscount: activeSales.reduce((s, x) => s + Number(x.discountAmount), 0),
            byPaymentMethod: byMethod,
            deliveryUnpaid: activeSales.filter(s => s.paymentMethod === PaymentMethod.DELIVERY && s.deliveryPaidStatus === DeliveryPaidStatus.UNPAID).length,
            bankTransferPending: activeSales.filter(s => s.paymentMethod === PaymentMethod.BANK_TRANSFER && s.transferPaymentStatus === TransferPaymentStatus.PENDING).length,
            voidedCount: voidedSales.length,
            voidedTotal: voidedSales.reduce((s, x) => s + Number(x.total), 0),
        };
    }
}
