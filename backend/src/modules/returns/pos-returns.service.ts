import {
    Injectable, BadRequestException, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
    Return, ReturnItem, Sale, SaleItem, Inventory,
    StockMovement, StockLedger, ProductVariant,
} from '../../entities';
import {
    ReturnType, ReturnStatus, RestockPolicy, RefundMethod,
    StockMovementAction, SaleStatus, UserRole,
} from '../../common/enums';
import { User } from '../../entities';
import { EventsGateway } from '../events/events.gateway';
import { CreatePosReturnDto } from './dto/create-pos-return.dto';
import { UpdateReturnStatusDto } from './dto/update-return-status.dto';

@Injectable()
export class PosReturnsService {
    constructor(
        @InjectRepository(Return) private returnRepo: Repository<Return>,
        @InjectRepository(Sale) private saleRepo: Repository<Sale>,
        @InjectRepository(SaleItem) private saleItemRepo: Repository<SaleItem>,
        @InjectRepository(Inventory) private invRepo: Repository<Inventory>,
        @InjectRepository(StockLedger) private ledgerRepo: Repository<StockLedger>,
        private dataSource: DataSource,
        private events: EventsGateway,
    ) { }

    // ═══════════════════════════════════════════════════════════
    //  PREVIEW — Search sale by invoice number
    // ═══════════════════════════════════════════════════════════
    async previewSaleByInvoice(invoiceNo: string, user: User) {
        const sale = await this.saleRepo.findOne({
            where: { invoiceNumber: invoiceNo },
            relations: ['items', 'items.variant', 'items.variant.product', 'branch', 'cashier'],
        });

        if (!sale) {
            throw new NotFoundException(`Sale with invoice ${invoiceNo} not found`);
        }

        // Branch scoping: managers can only preview their branch
        if (user.role === UserRole.MANAGER && user.branchId && sale.branchId !== user.branchId) {
            throw new ForbiddenException('You can only process returns for your branch');
        }

        if (sale.status === SaleStatus.VOIDED) {
            throw new BadRequestException('Cannot create return for a voided sale');
        }

        // Build preview with return availability
        const itemsPreview = sale.items.map(si => {
            const qtyReturned = Number(si.qtyReturned || 0);
            const qtySold = Number(si.quantity);
            return {
                saleItemId: si.id,
                variantId: si.variantId,
                sku: si.variant?.sku || '',
                productName: si.variant?.product?.name || '',
                size: si.variant?.size || '',
                color: si.variant?.color || '',
                qtySold,
                qtyReturned,
                qtyAvailableToReturn: qtySold - qtyReturned,
                unitPrice: Number(si.unitPrice),
                unitCost: Number(si.unitCost),
                lineTotal: Number(si.lineTotal),
            };
        });

        return {
            saleId: sale.id,
            invoiceNumber: sale.invoiceNumber,
            branchId: sale.branchId,
            branchName: sale.branch?.name || '',
            cashierName: sale.cashier?.fullName || '',
            status: sale.status,
            paymentMethod: sale.paymentMethod,
            subtotal: Number(sale.subtotal),
            discountAmount: Number(sale.discountAmount),
            total: Number(sale.total),
            createdAt: sale.createdAt,
            canReturn: true, // already guarded above: VOIDED throws
            items: itemsPreview,
        };
    }

    // ═══════════════════════════════════════════════════════════
    //  CREATE POS RETURN
    // ═══════════════════════════════════════════════════════════
    async createPosReturn(dto: CreatePosReturnDto, user: User) {
        // 1) Find the sale by invoice number
        const sale = await this.saleRepo.findOne({
            where: { invoiceNumber: dto.invoiceNo },
            relations: ['items', 'items.variant'],
        });
        if (!sale) {
            throw new NotFoundException(`Sale ${dto.invoiceNo} not found`);
        }

        // 2) Block returns on voided sales
        if (sale.status === SaleStatus.VOIDED) {
            throw new BadRequestException('Cannot return items from a voided sale');
        }

        // 3) Branch scoping
        if (user.role === UserRole.MANAGER && user.branchId && sale.branchId !== user.branchId) {
            throw new ForbiddenException('You can only process returns for your branch');
        }

        // 4) Validate items and calculate refund
        const returnItems: {
            saleItemId: string;
            variantId: string;
            qty: number;
            unitPrice: number;
            unitCost: number;
            lineRefundTotal: number;
            restockPolicy: RestockPolicy;
            note?: string;
        }[] = [];

        let totalRefund = 0;

        for (const reqItem of dto.items) {
            const saleItem = sale.items.find(si => si.id === reqItem.saleItemId);
            if (!saleItem) {
                throw new BadRequestException(`Sale item ${reqItem.saleItemId} not found in sale ${dto.invoiceNo}`);
            }

            const qtySold = Number(saleItem.quantity);
            const qtyAlreadyReturned = Number(saleItem.qtyReturned || 0);
            const qtyAvailable = qtySold - qtyAlreadyReturned;

            if (reqItem.qty > qtyAvailable) {
                throw new BadRequestException(
                    `Cannot return ${reqItem.qty} of item ${saleItem.id}. ` +
                    `Sold: ${qtySold}, Already returned: ${qtyAlreadyReturned}, Available: ${qtyAvailable}`
                );
            }

            const unitPrice = Number(saleItem.unitPrice);
            const unitCost = Number(saleItem.unitCost || 0);
            const lineRefundTotal = unitPrice * reqItem.qty;
            totalRefund += lineRefundTotal;

            returnItems.push({
                saleItemId: saleItem.id,
                variantId: saleItem.variantId,
                qty: reqItem.qty,
                unitPrice,
                unitCost,
                lineRefundTotal,
                restockPolicy: reqItem.restockPolicy,
                note: reqItem.note,
            });
        }

        // 5) Generate return receipt number: RET-YYYYMMDD-XXXX
        const receiptNo = await this.generateReturnReceiptNo();

        // 6) Execute in transaction
        return this.dataSource.transaction(async (em) => {
            // Create return record
            const ret = em.create(Return, {
                returnReceiptNo: receiptNo,
                originalSaleId: sale.id,
                branchId: sale.branchId,
                processedBy: user.id,
                type: ReturnType.POS_RETURN,
                status: ReturnStatus.REQUESTED,
                refundMethod: dto.refundMethod,
                refundAmount: totalRefund,
                reason: dto.reason || undefined,
            });
            const savedReturn = await em.save(Return, ret);

            // Create return items
            for (const ri of returnItems) {
                await em.save(ReturnItem, em.create(ReturnItem, {
                    returnId: savedReturn.id,
                    saleItemId: ri.saleItemId,
                    variantId: ri.variantId,
                    quantity: ri.qty,
                    unitPrice: ri.unitPrice,
                    lineRefundTotal: ri.lineRefundTotal,
                    restockPolicy: ri.restockPolicy,
                    note: ri.note || undefined,
                }));
            }

            // Load full result with relations
            const result = await em.findOne(Return, {
                where: { id: savedReturn.id },
                relations: [
                    'items', 'items.variant', 'items.variant.product',
                    'originalSale', 'processor', 'branch',
                ],
            });

            // Emit event
            if (result) {
                this.events.emitReturnCreated(result);
            }

            return result;
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  UPDATE STATUS (with stock processing on COMPLETED)
    // ═══════════════════════════════════════════════════════════
    async updatePosReturnStatus(returnId: string, dto: UpdateReturnStatusDto, user: User) {
        const ret = await this.returnRepo.findOne({
            where: { id: returnId, type: ReturnType.POS_RETURN },
            relations: ['items', 'originalSale'],
        });
        if (!ret) throw new NotFoundException('POS Return not found');

        // Branch scoping
        if (user.role === UserRole.MANAGER && user.branchId && ret.branchId !== user.branchId) {
            throw new ForbiddenException('You can only manage returns for your branch');
        }

        // Validate state transitions
        const validTransitions: Record<string, string[]> = {
            [ReturnStatus.REQUESTED]: [ReturnStatus.APPROVED, ReturnStatus.REJECTED],
            [ReturnStatus.APPROVED]: [ReturnStatus.COMPLETED],
        };
        const allowed = validTransitions[ret.status] || [];
        if (!allowed.includes(dto.status)) {
            throw new BadRequestException(
                `Invalid transition: ${ret.status} → ${dto.status}. ` +
                `Allowed: ${allowed.join(', ') || 'none'}`
            );
        }

        // On APPROVED: record who approved
        if (dto.status === ReturnStatus.APPROVED) {
            ret.approvedBy = user.id;
        }

        // On COMPLETED: process stock changes + update saleItem.qtyReturned
        if (dto.status === ReturnStatus.COMPLETED) {
            await this.processReturnCompletion(ret, user);
        }

        // Update status and notes
        ret.status = dto.status;
        if (dto.adminNotes) {
            const timestamp = new Date().toISOString();
            ret.adminNotes = (ret.adminNotes || '') +
                `\n[${dto.status} ${timestamp} by ${user.fullName}] ${dto.adminNotes}`;
        }
        await this.returnRepo.save(ret);

        // Emit event on completion
        if (dto.status === ReturnStatus.COMPLETED) {
            const full = await this.findOnePosReturn(returnId);
            if (full) this.events.emitReturnCompleted(full);
        }

        return this.findOnePosReturn(returnId);
    }

    // ═══════════════════════════════════════════════════════════
    //  PROCESS RETURN COMPLETION (stock + ledger + saleItem)
    // ═══════════════════════════════════════════════════════════
    private async processReturnCompletion(ret: Return, user: User) {
        await this.dataSource.transaction(async (em) => {
            for (const item of ret.items) {
                // 1) Update SaleItem.qtyReturned
                const saleItem = await em.findOne(SaleItem, { where: { id: item.saleItemId } });
                if (saleItem) {
                    const newQtyReturned = (Number(saleItem.qtyReturned) || 0) + item.quantity;
                    if (newQtyReturned > saleItem.quantity) {
                        throw new BadRequestException(
                            `Return would exceed sold quantity for sale item ${saleItem.id}. ` +
                            `Sold: ${saleItem.quantity}, Would-be-returned: ${newQtyReturned}`
                        );
                    }
                    saleItem.qtyReturned = newQtyReturned;
                    await em.save(SaleItem, saleItem);
                }

                // 2) Get current total stock for this variant+branch
                const allBatches = await em.find(Inventory, {
                    where: { variantId: item.variantId, branchId: ret.branchId },
                });
                const currentTotalQty = allBatches.reduce((s, b) => s + b.quantity, 0);

                if (item.restockPolicy === RestockPolicy.RESTOCK) {
                    // 3a) RESTOCK: add stock back
                    let inv = allBatches[0]; // add to first batch
                    if (!inv) {
                        inv = em.create(Inventory, {
                            variantId: item.variantId,
                            branchId: ret.branchId,
                            quantity: 0,
                        });
                    }
                    inv.quantity += item.quantity;
                    await em.save(Inventory, inv);

                    const newTotalQty = currentTotalQty + item.quantity;

                    // StockMovement
                    await em.save(StockMovement, em.create(StockMovement, {
                        variantId: item.variantId,
                        branchId: ret.branchId,
                        action: StockMovementAction.RETURN_RESTOCK,
                        quantityChange: item.quantity,
                        quantityAfter: newTotalQty,
                        performedBy: user.id,
                        referenceId: ret.id,
                        note: `POS Return ${ret.returnReceiptNo} — RESTOCK`,
                    }));

                    // StockLedger (immutable audit)
                    await em.save(StockLedger, em.create(StockLedger, {
                        variantId: item.variantId,
                        branchId: ret.branchId,
                        movementType: 'RETURN_RESTOCK',
                        qtyDelta: item.quantity,
                        qtyAfter: newTotalQty,
                        referenceType: 'return',
                        referenceId: ret.id,
                        unitCost: saleItem ? Number(saleItem.unitCost) || 0 : 0,
                        note: `POS Return ${ret.returnReceiptNo} from invoice ${ret.originalSale?.invoiceNumber}. Reason: ${ret.reason || 'N/A'}`,
                        createdBy: user.id,
                    }));

                    // Emit inventory update
                    this.events.emitInventoryUpdated({
                        variantId: item.variantId,
                        branchId: ret.branchId,
                        quantity: newTotalQty,
                    });

                } else {
                    // 3b) DAMAGED: do NOT add stock, but still log ledger
                    await em.save(StockLedger, em.create(StockLedger, {
                        variantId: item.variantId,
                        branchId: ret.branchId,
                        movementType: 'RETURN_DAMAGED',
                        qtyDelta: 0, // no stock change
                        qtyAfter: currentTotalQty,
                        referenceType: 'return',
                        referenceId: ret.id,
                        unitCost: saleItem ? Number(saleItem.unitCost) || 0 : 0,
                        note: `POS Return ${ret.returnReceiptNo} — DAMAGED (not restocked). Invoice: ${ret.originalSale?.invoiceNumber}. Reason: ${ret.reason || 'N/A'}`,
                        createdBy: user.id,
                    }));
                }
            }

            // 4) Optionally update sale status
            if (ret.originalSaleId) {
                const sale = await em.findOne(Sale, {
                    where: { id: ret.originalSaleId },
                    relations: ['items'],
                });
                if (sale) {
                    const allFullyReturned = sale.items.every(
                        si => (Number(si.qtyReturned) || 0) >= si.quantity
                    );
                    if (allFullyReturned) {
                        sale.status = SaleStatus.REFUNDED;
                    } else {
                        const anyReturned = sale.items.some(
                            si => (Number(si.qtyReturned) || 0) > 0
                        );
                        if (anyReturned && sale.status === SaleStatus.COMPLETED) {
                            sale.status = SaleStatus.PARTIAL_RETURN;
                        }
                    }
                    await em.save(Sale, sale);
                }
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  QUERIES
    // ═══════════════════════════════════════════════════════════
    async findOnePosReturn(id: string) {
        return this.returnRepo.findOne({
            where: { id },
            relations: [
                'items', 'items.variant', 'items.variant.product',
                'items.saleItem',
                'originalSale', 'processor', 'approver', 'branch',
            ],
        });
    }

    async findAllPosReturns(query: {
        branchId?: string;
        status?: string;
        dateFrom?: string;
        dateTo?: string;
    }, user: User) {
        const qb = this.returnRepo.createQueryBuilder('r')
            .leftJoinAndSelect('r.items', 'ri')
            .leftJoinAndSelect('ri.variant', 'v')
            .leftJoinAndSelect('v.product', 'p')
            .leftJoinAndSelect('r.originalSale', 's')
            .leftJoinAndSelect('r.processor', 'proc')
            .leftJoinAndSelect('r.approver', 'approver')
            .leftJoinAndSelect('r.branch', 'b')
            .where('r.type = :type', { type: ReturnType.POS_RETURN });

        // Branch scoping
        if (user.role === UserRole.MANAGER && user.branchId) {
            qb.andWhere('r.branchId = :userBranch', { userBranch: user.branchId });
        } else if (query.branchId) {
            qb.andWhere('r.branchId = :bid', { bid: query.branchId });
        }

        if (query.status) qb.andWhere('r.status = :st', { st: query.status });
        if (query.dateFrom) qb.andWhere('r.createdAt >= :from', { from: query.dateFrom });
        if (query.dateTo) {
            const end = new Date(query.dateTo);
            end.setDate(end.getDate() + 1);
            qb.andWhere('r.createdAt < :to', { to: end.toISOString().slice(0, 10) });
        }

        return qb.orderBy('r.createdAt', 'DESC').getMany();
    }

    // ═══════════════════════════════════════════════════════════
    //  RECEIPT NUMBER GENERATOR
    // ═══════════════════════════════════════════════════════════
    private async generateReturnReceiptNo(): Promise<string> {
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
        const prefix = `RET-${dateStr}-`;

        // Find max sequence for today
        const latest = await this.returnRepo
            .createQueryBuilder('r')
            .where('r.returnReceiptNo LIKE :prefix', { prefix: `${prefix}%` })
            .orderBy('r.returnReceiptNo', 'DESC')
            .getOne();

        let seq = 1;
        if (latest?.returnReceiptNo) {
            const parts = latest.returnReceiptNo.split('-');
            const lastSeq = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(lastSeq)) seq = lastSeq + 1;
        }

        return `${prefix}${seq.toString().padStart(4, '0')}`;
    }
}
