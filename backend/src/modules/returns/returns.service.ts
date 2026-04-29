import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Return, ReturnItem, Sale, SaleItem, Order, OrderItem, Inventory, StockMovement, ProductVariant, StockLedger } from '../../entities';
import { StockMovementAction, ReturnType, ReturnStatus, RestockPolicy } from '../../common/enums';
import { User } from '../../entities';
import { EventsGateway } from '../events/events.gateway';
import { ActivityLogService } from '../activity-log/activity-log.service';

interface CreateReturnDto {
    // POS return: provide originalSaleId
    originalSaleId?: string;
    // Order return: provide originalOrderId
    originalOrderId?: string;
    branchId: string;
    type?: ReturnType;   // POS_RETURN | ORDER_RETURN | RETURN | EXCHANGE
    restockPolicy?: RestockPolicy;
    reason?: string;
    items: { variantId: string; quantity: number; exchangeVariantId?: string }[];
}

@Injectable()
export class ReturnsService {
    constructor(
        @InjectRepository(Return) private returnRepo: Repository<Return>,
        @InjectRepository(Sale) private saleRepo: Repository<Sale>,
        @InjectRepository(Order) private orderRepo: Repository<Order>,
        @InjectRepository(Inventory) private invRepo: Repository<Inventory>,
        @InjectRepository(ProductVariant) private variantRepo: Repository<ProductVariant>,
        @InjectRepository(StockLedger) private ledgerRepo: Repository<StockLedger>,
        private dataSource: DataSource,
        private events: EventsGateway,
        private activityLog: ActivityLogService,
    ) { }

    // ═══════════════════════════════════════
    // CREATE RETURN (Phase 3 — enhanced)
    // ═══════════════════════════════════════
    async createReturn(dto: CreateReturnDto, processor: User) {
        if (!dto.originalSaleId && !dto.originalOrderId) {
            throw new BadRequestException('Either originalSaleId or originalOrderId must be provided');
        }

        const returnType = dto.type || (dto.originalOrderId ? ReturnType.ORDER_RETURN : ReturnType.POS_RETURN);
        const restockPolicy = dto.restockPolicy || RestockPolicy.RESTOCK;

        // Validate source
        let sourceItems: { variantId: string; quantity: number; unitPrice: number }[] = [];

        if (dto.originalSaleId) {
            const sale = await this.saleRepo.findOne({
                where: { id: dto.originalSaleId },
                relations: ['items'],
            });
            if (!sale) throw new NotFoundException('Original sale not found');
            sourceItems = sale.items.map(si => ({
                variantId: si.variantId,
                quantity: si.quantity,
                unitPrice: Number(si.unitPrice),
            }));
        }

        if (dto.originalOrderId) {
            const order = await this.orderRepo.findOne({
                where: { id: dto.originalOrderId },
                relations: ['items'],
            });
            if (!order) throw new NotFoundException('Original order not found');
            sourceItems = order.items.map(oi => ({
                variantId: oi.variantId,
                quantity: oi.quantity,
                unitPrice: Number(oi.unitPrice),
            }));
        }

        return this.dataSource.transaction(async (em) => {
            let refundAmount = 0;
            const returnItems: Partial<ReturnItem>[] = [];

            for (const item of dto.items) {
                // Find the original source item to get the price at time of sale/order
                const sourceItem = sourceItems.find(si => si.variantId === item.variantId);
                if (!sourceItem) {
                    throw new BadRequestException(`Variant ${item.variantId} was not in the original ${dto.originalSaleId ? 'sale' : 'order'}`);
                }

                if (item.quantity > sourceItem.quantity) {
                    throw new BadRequestException(`Return quantity exceeds original quantity`);
                }

                const unitPrice = sourceItem.unitPrice;
                const lineRefund = unitPrice * item.quantity;
                refundAmount += lineRefund;

                // Restock only if policy is RESTOCK (not DAMAGED)
                if (restockPolicy === RestockPolicy.RESTOCK) {
                    let inv = await em.findOne(Inventory, {
                        where: { variantId: item.variantId, branchId: dto.branchId },
                    });
                    if (!inv) {
                        inv = em.create(Inventory, { variantId: item.variantId, branchId: dto.branchId, quantity: 0 });
                    }
                    inv.quantity += item.quantity;
                    await em.save(Inventory, inv);

                    // Total qty across all batches
                    const allBatches = await em.find(Inventory, {
                        where: { variantId: item.variantId, branchId: dto.branchId },
                    });
                    const totalQty = allBatches.reduce((s, b) => s + b.quantity, 0);

                    // Record RETURN_RESTOCK stock movement
                    await em.save(StockMovement, em.create(StockMovement, {
                        variantId: item.variantId,
                        branchId: dto.branchId,
                        action: StockMovementAction.RETURN_RESTOCK,
                        quantityChange: item.quantity,
                        quantityAfter: totalQty,
                        performedBy: processor.id,
                    }));

                    // Stock ledger
                    await em.save(StockLedger, em.create(StockLedger, {
                        variantId: item.variantId, branchId: dto.branchId,
                        movementType: 'RETURN_RESTOCK', qtyDelta: item.quantity, qtyAfter: totalQty,
                        referenceType: dto.originalSaleId ? 'sale' : 'order',
                        referenceId: dto.originalSaleId || dto.originalOrderId,
                        createdBy: processor.id,
                    }));

                    // Emit inventory update
                    this.events.emitInventoryUpdated({
                        variantId: item.variantId,
                        branchId: dto.branchId,
                        quantity: totalQty,
                    });
                }

                // If exchange, deduct the exchange variant
                if ((returnType === ReturnType.EXCHANGE) && item.exchangeVariantId) {
                    const exchBatches = await em.find(Inventory, {
                        where: { variantId: item.exchangeVariantId, branchId: dto.branchId },
                        order: { createdAt: 'ASC' },
                    });
                    const exchTotal = exchBatches.reduce((s, b) => s + b.quantity, 0);
                    if (exchTotal < item.quantity) {
                        throw new BadRequestException('Insufficient stock for exchange variant');
                    }

                    // FIFO deduction for exchange
                    let remaining = item.quantity;
                    for (const batch of exchBatches) {
                        if (remaining <= 0) break;
                        const take = Math.min(remaining, batch.quantity);
                        batch.quantity -= take;
                        await em.save(Inventory, batch);
                        remaining -= take;
                    }

                    const exchAfter = exchTotal - item.quantity;
                    await em.save(StockMovement, em.create(StockMovement, {
                        variantId: item.exchangeVariantId,
                        branchId: dto.branchId,
                        action: StockMovementAction.SALE,
                        quantityChange: -item.quantity,
                        quantityAfter: exchAfter,
                        performedBy: processor.id,
                    }));

                    this.events.emitInventoryUpdated({
                        variantId: item.exchangeVariantId,
                        branchId: dto.branchId,
                        quantity: exchAfter,
                    });
                }

                returnItems.push({
                    variantId: item.variantId,
                    quantity: item.quantity,
                    unitPrice,
                    exchangeVariantId: item.exchangeVariantId || undefined,
                });
            }

            const ret = em.create(Return, {
                originalSaleId: dto.originalSaleId || null as any,
                originalOrderId: dto.originalOrderId || null as any,
                branchId: dto.branchId,
                processedBy: processor.id,
                type: returnType,
                status: ReturnStatus.COMPLETED, // Immediate for POS, can be REQUESTED for online
                restockPolicy,
                reason: dto.reason,
                refundAmount,
            });
            const saved = await em.save(Return, ret);

            for (const ri of returnItems) {
                await em.save(ReturnItem, em.create(ReturnItem, { ...ri, returnId: saved.id }));
            }

            const result = await em.findOne(Return, {
                where: { id: saved.id },
                relations: ['items', 'items.variant', 'items.variant.product', 'originalSale', 'originalOrder', 'processor', 'branch'],
            });

            // Emit event
            if (result) {
                this.events.emitReturnCompleted(result);
            }

            this.activityLog.log({
                action: returnType === ReturnType.EXCHANGE ? 'EXCHANGE' : 'RETURN',
                entityType: 'return',
                entityId: saved.id,
                description: `${returnType === ReturnType.EXCHANGE ? 'استبدال' : 'مرتجع'} — ${dto.items.length} عنصر — ${refundAmount} د.ل`,
                details: { type: returnType, restockPolicy, refundAmount, items: dto.items.length },
                userId: processor.id,
                branchId: dto.branchId,
            }).catch(() => {});

            return result;
        });
    }

    // ═══════════════════════════════════════
    // ORDER RETURN — with approval workflow
    // ═══════════════════════════════════════
    async requestOrderReturn(dto: CreateReturnDto, processor: User) {
        if (!dto.originalOrderId) {
            throw new BadRequestException('originalOrderId is required for order returns');
        }

        const order = await this.orderRepo.findOne({
            where: { id: dto.originalOrderId },
            relations: ['items'],
        });
        if (!order) throw new NotFoundException('Order not found');

        const restockPolicy = dto.restockPolicy || RestockPolicy.RESTOCK;

        // Create return in REQUESTED status — no stock changes yet
        let refundAmount = 0;
        const returnItems: Partial<ReturnItem>[] = [];

        for (const item of dto.items) {
            const orderItem = order.items.find(oi => oi.variantId === item.variantId);
            if (!orderItem) throw new BadRequestException(`Variant ${item.variantId} not in order`);
            if (item.quantity > orderItem.quantity) throw new BadRequestException('Exceeds order quantity');
            const unitPrice = Number(orderItem.unitPrice);
            refundAmount += unitPrice * item.quantity;
            returnItems.push({ variantId: item.variantId, quantity: item.quantity, unitPrice });
        }

        const ret = this.returnRepo.create({
            originalOrderId: dto.originalOrderId,
            branchId: dto.branchId,
            processedBy: processor.id,
            type: ReturnType.ORDER_RETURN,
            status: ReturnStatus.REQUESTED,
            restockPolicy,
            reason: dto.reason,
            refundAmount,
        });
        const saved = await this.returnRepo.save(ret);

        for (const ri of returnItems) {
            const returnItemRepo = this.dataSource.getRepository(ReturnItem);
            await returnItemRepo.save(returnItemRepo.create({ ...ri, returnId: saved.id }));
        }

        return this.findOne(saved.id);
    }

    // ─── Status transitions ───
    async updateStatus(returnId: string, newStatus: ReturnStatus, user: User, notes?: string) {
        const ret = await this.returnRepo.findOne({
            where: { id: returnId },
            relations: ['items'],
        });
        if (!ret) throw new NotFoundException('Return not found');

        // Validate transitions
        const validTransitions: Record<string, string[]> = {
            [ReturnStatus.REQUESTED]: [ReturnStatus.APPROVED, ReturnStatus.REJECTED],
            [ReturnStatus.APPROVED]: [ReturnStatus.COMPLETED, ReturnStatus.REJECTED],
        };

        const allowed = validTransitions[ret.status] || [];
        if (!allowed.includes(newStatus)) {
            throw new BadRequestException(`Cannot transition from ${ret.status} to ${newStatus}`);
        }

        // On COMPLETED: process stock changes
        if (newStatus === ReturnStatus.COMPLETED && ret.restockPolicy === RestockPolicy.RESTOCK) {
            await this.processReturnRestock(ret, user);
        }

        ret.status = newStatus;
        if (notes) ret.adminNotes = (ret.adminNotes || '') + `\n[${newStatus} ${new Date().toISOString()}] ${notes}`;
        await this.returnRepo.save(ret);

        if (newStatus === ReturnStatus.COMPLETED) {
            const full = await this.findOne(returnId);
            if (full) this.events.emitReturnCompleted(full);
        }

        return this.findOne(returnId);
    }

    private async processReturnRestock(ret: Return, user: User) {
        await this.dataSource.transaction(async (em) => {
            for (const item of ret.items) {
                let inv = await em.findOne(Inventory, {
                    where: { variantId: item.variantId, branchId: ret.branchId },
                });
                if (!inv) {
                    inv = em.create(Inventory, { variantId: item.variantId, branchId: ret.branchId, quantity: 0 });
                }
                inv.quantity += item.quantity;
                await em.save(Inventory, inv);

                const allBatches = await em.find(Inventory, {
                    where: { variantId: item.variantId, branchId: ret.branchId },
                });
                const totalQty = allBatches.reduce((s, b) => s + b.quantity, 0);

                await em.save(StockMovement, em.create(StockMovement, {
                    variantId: item.variantId,
                    branchId: ret.branchId,
                    action: StockMovementAction.RETURN_RESTOCK,
                    quantityChange: item.quantity,
                    quantityAfter: totalQty,
                    performedBy: user.id,
                    referenceId: ret.id,
                }));

                await em.save(StockLedger, em.create(StockLedger, {
                    variantId: item.variantId, branchId: ret.branchId,
                    movementType: 'RETURN_RESTOCK', qtyDelta: item.quantity, qtyAfter: totalQty,
                    referenceType: 'return', referenceId: ret.id,
                    createdBy: user.id,
                }));

                this.events.emitInventoryUpdated({
                    variantId: item.variantId,
                    branchId: ret.branchId,
                    quantity: totalQty,
                });
            }
        });
    }

    // ─── Queries ───
    findAll(query?: { branchId?: string; type?: string; status?: string; startDate?: string; endDate?: string }) {
        const qb = this.returnRepo.createQueryBuilder('r')
            .leftJoinAndSelect('r.items', 'ri')
            .leftJoinAndSelect('ri.variant', 'v')
            .leftJoinAndSelect('v.product', 'p')
            .leftJoinAndSelect('r.originalSale', 's')
            .leftJoinAndSelect('r.originalOrder', 'o')
            .leftJoinAndSelect('r.processor', 'u')
            .leftJoinAndSelect('r.branch', 'b');
        if (query?.branchId) qb.andWhere('r.branchId = :bid', { bid: query.branchId });
        if (query?.type) qb.andWhere('r.type = :t', { t: query.type });
        if (query?.status) qb.andWhere('r.status = :st', { st: query.status });
        if (query?.startDate) qb.andWhere('r.createdAt >= :start', { start: query.startDate });
        if (query?.endDate) {
            const endPlusDay = new Date(query.endDate);
            endPlusDay.setDate(endPlusDay.getDate() + 1);
            qb.andWhere('r.createdAt < :end', { end: endPlusDay.toISOString().slice(0, 10) });
        }
        return qb.orderBy('r.createdAt', 'DESC').getMany();
    }

    findOne(id: string) {
        return this.returnRepo.findOne({
            where: { id },
            relations: ['items', 'items.variant', 'items.variant.product', 'originalSale', 'originalOrder', 'processor', 'branch'],
        });
    }
}
