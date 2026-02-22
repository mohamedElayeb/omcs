/**
 * POS Returns — Integration Tests
 *
 * These tests validate the core business logic of the POS returns system.
 * They mock the database layer and test the service methods directly.
 *
 * Run: npx jest --testPathPattern=pos-returns
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository, EntityManager, SelectQueryBuilder } from 'typeorm';
import { PosReturnsService } from './pos-returns.service';
import { EventsGateway } from '../events/events.gateway';
import {
    Return, ReturnItem, Sale, SaleItem, Inventory,
    StockMovement, StockLedger, ProductVariant,
} from '../../entities';
import {
    ReturnType, ReturnStatus, RestockPolicy, RefundMethod,
    SaleStatus, UserRole, StockMovementAction,
} from '../../common/enums';
import { User } from '../../entities';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';

// ─── Mock Factories ───
const mockUser = (overrides?: Partial<User>): User => ({
    id: 'user-1',
    email: 'test@test.com',
    passwordHash: '',
    fullName: 'Test User',
    role: UserRole.MANAGER,
    branchId: 'branch-1',
    isActive: true,
    phone: null,
    maxDiscountPercent: 10,
    maxDiscountValue: 0,
    overridePin: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    branch: null,
    ...overrides,
} as User);

const mockSaleItem = (overrides?: Partial<SaleItem>): SaleItem => ({
    id: 'si-1',
    saleId: 'sale-1',
    variantId: 'variant-1',
    quantity: 3,
    qtyReturned: 0,
    unitPrice: 100,
    unitCost: 50,
    discount: 0,
    lineTotal: 300,
    lineProfit: 150,
    costUsdAtPurchase: null,
    purchaseUsdRateAtPurchase: null,
    costLydAtPurchase: null,
    purchaseDateAtPurchase: null,
    usdRateAtSale: null,
    saleDate: null,
    sale: null,
    variant: { id: 'variant-1', sku: 'SKU-001', product: { name: 'Test Product' } } as any,
    ...overrides,
} as SaleItem);

const mockSale = (overrides?: Partial<Sale>): Sale => ({
    id: 'sale-1',
    invoiceNumber: 'OMC-20260218-0001',
    branchId: 'branch-1',
    cashierId: 'user-1',
    subtotal: 300,
    discountAmount: 0,
    discountPercent: 0,
    total: 300,
    profit: 150,
    status: SaleStatus.COMPLETED,
    createdAt: new Date(),
    items: [mockSaleItem()],
    branch: { id: 'branch-1', name: 'Main Branch' } as any,
    cashier: { fullName: 'Test Cashier' } as any,
    ...overrides,
} as Sale);

// ─── Mock Repositories ───
const createMockRepository = () => ({
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn((data) => data),
    createQueryBuilder: jest.fn(),
});

const createMockQueryBuilder = () => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
});

describe('PosReturnsService', () => {
    let service: PosReturnsService;
    let returnRepo: any;
    let saleRepo: any;
    let saleItemRepo: any;
    let invRepo: any;
    let ledgerRepo: any;
    let dataSource: any;
    let events: any;

    // Mock EntityManager for transactions
    let mockEm: any;

    beforeEach(async () => {
        returnRepo = createMockRepository();
        saleRepo = createMockRepository();
        saleItemRepo = createMockRepository();
        invRepo = createMockRepository();
        ledgerRepo = createMockRepository();

        mockEm = {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn().mockImplementation((_, entity) => ({ ...entity, id: entity.id || 'new-id' })),
            create: jest.fn((_, data) => data),
        };

        dataSource = {
            transaction: jest.fn((cb) => cb(mockEm)),
            getRepository: jest.fn(),
        };

        events = {
            emitReturnCreated: jest.fn(),
            emitReturnCompleted: jest.fn(),
            emitInventoryUpdated: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PosReturnsService,
                { provide: getRepositoryToken(Return), useValue: returnRepo },
                { provide: getRepositoryToken(Sale), useValue: saleRepo },
                { provide: getRepositoryToken(SaleItem), useValue: saleItemRepo },
                { provide: getRepositoryToken(Inventory), useValue: invRepo },
                { provide: getRepositoryToken(StockLedger), useValue: ledgerRepo },
                { provide: DataSource, useValue: dataSource },
                { provide: EventsGateway, useValue: events },
            ],
        }).compile();

        service = module.get<PosReturnsService>(PosReturnsService);
    });

    // ═══════════════════════════════════════════════════════════
    //  TEST 1: Partial return updates qtyReturned correctly
    // ═══════════════════════════════════════════════════════════
    describe('Partial Return', () => {
        it('should create a return request for partial quantity', async () => {
            const sale = mockSale();
            saleRepo.findOne.mockResolvedValue(sale);

            // Mock receipt number generation
            const qb = createMockQueryBuilder();
            qb.getOne.mockResolvedValue(null); // no existing returns today
            returnRepo.createQueryBuilder.mockReturnValue(qb);

            // Mock transaction results
            mockEm.findOne.mockResolvedValue({
                id: 'return-1',
                returnReceiptNo: 'RET-20260218-0001',
                status: ReturnStatus.REQUESTED,
                refundAmount: 100,
                items: [{
                    saleItemId: 'si-1',
                    quantity: 1,
                    restockPolicy: RestockPolicy.RESTOCK,
                }],
            });

            const result = await service.createPosReturn({
                invoiceNo: 'OMC-20260218-0001',
                items: [{ saleItemId: 'si-1', qty: 1, restockPolicy: RestockPolicy.RESTOCK }],
                refundMethod: RefundMethod.CASH,
                reason: 'Size issue',
            }, mockUser());

            expect(result).toBeDefined();
            expect(result.status).toBe(ReturnStatus.REQUESTED);
            expect(result.refundAmount).toBe(100);
            expect(events.emitReturnCreated).toHaveBeenCalled();
        });

        it('should correctly update qtyReturned on completion', async () => {
            const saleItem = mockSaleItem({ qtyReturned: 0, quantity: 3 });
            const ret = {
                id: 'return-1',
                type: ReturnType.POS_RETURN,
                status: ReturnStatus.APPROVED,
                branchId: 'branch-1',
                returnReceiptNo: 'RET-20260218-0001',
                originalSaleId: 'sale-1',
                originalSale: { invoiceNumber: 'OMC-20260218-0001' },
                items: [{
                    saleItemId: 'si-1',
                    variantId: 'variant-1',
                    quantity: 2,
                    unitPrice: 100,
                    restockPolicy: RestockPolicy.RESTOCK,
                }],
                reason: 'Wrong size',
            };

            returnRepo.findOne.mockResolvedValueOnce(ret); // for updatePosReturnStatus
            returnRepo.findOne.mockResolvedValueOnce({ ...ret, status: ReturnStatus.COMPLETED }); // for result

            // Mock: saleItem found in transaction
            mockEm.findOne.mockImplementation((entity, opts) => {
                if (entity === SaleItem) return { ...saleItem };
                if (entity === Sale) return mockSale({ items: [saleItem] });
                if (entity === Inventory) return { variantId: 'variant-1', branchId: 'branch-1', quantity: 5 };
                return { ...ret, status: ReturnStatus.COMPLETED };
            });
            mockEm.find.mockResolvedValue([{ variantId: 'variant-1', branchId: 'branch-1', quantity: 5 }]);

            await service.updatePosReturnStatus('return-1', {
                status: ReturnStatus.COMPLETED,
                adminNotes: 'Approved and completed',
            }, mockUser());

            // Verify saleItem was saved with updated qtyReturned
            const saveCalls = mockEm.save.mock.calls;
            const saleItemSave = saveCalls.find(([entity]) => entity === SaleItem);
            expect(saleItemSave).toBeDefined();
            if (saleItemSave) {
                expect(saleItemSave[1].qtyReturned).toBe(2);
            }
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  TEST 2: Cannot return more than sold
    // ═══════════════════════════════════════════════════════════
    describe('Fraud Prevention', () => {
        it('should reject return qty > available qty', async () => {
            const saleItem = mockSaleItem({ quantity: 3, qtyReturned: 2 }); // only 1 left
            const sale = mockSale({ items: [saleItem] });
            saleRepo.findOne.mockResolvedValue(sale);

            const qb = createMockQueryBuilder();
            qb.getOne.mockResolvedValue(null);
            returnRepo.createQueryBuilder.mockReturnValue(qb);

            await expect(service.createPosReturn({
                invoiceNo: 'OMC-20260218-0001',
                items: [{ saleItemId: 'si-1', qty: 2, restockPolicy: RestockPolicy.RESTOCK }], // requesting 2, only 1 left
                refundMethod: RefundMethod.CASH,
            }, mockUser())).rejects.toThrow(BadRequestException);
        });

        it('should reject return on non-existent sale item', async () => {
            const sale = mockSale();
            saleRepo.findOne.mockResolvedValue(sale);

            const qb = createMockQueryBuilder();
            qb.getOne.mockResolvedValue(null);
            returnRepo.createQueryBuilder.mockReturnValue(qb);

            await expect(service.createPosReturn({
                invoiceNo: 'OMC-20260218-0001',
                items: [{ saleItemId: 'nonexistent', qty: 1, restockPolicy: RestockPolicy.RESTOCK }],
                refundMethod: RefundMethod.CASH,
            }, mockUser())).rejects.toThrow(BadRequestException);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  TEST 3: RESTOCK adds stock and writes ledger
    // ═══════════════════════════════════════════════════════════
    describe('Restock Policy', () => {
        it('should add stock back and log ledger on RESTOCK completion', async () => {
            const ret = {
                id: 'return-1',
                type: ReturnType.POS_RETURN,
                status: ReturnStatus.APPROVED,
                branchId: 'branch-1',
                returnReceiptNo: 'RET-20260218-0001',
                originalSaleId: 'sale-1',
                originalSale: { invoiceNumber: 'OMC-20260218-0001' },
                items: [{
                    saleItemId: 'si-1',
                    variantId: 'variant-1',
                    quantity: 1,
                    unitPrice: 100,
                    restockPolicy: RestockPolicy.RESTOCK,
                }],
                reason: 'Wrong size',
            };

            returnRepo.findOne.mockResolvedValueOnce(ret);
            returnRepo.findOne.mockResolvedValueOnce({ ...ret, status: ReturnStatus.COMPLETED });

            const invBatch = { variantId: 'variant-1', branchId: 'branch-1', quantity: 10 };
            mockEm.findOne.mockImplementation((entity) => {
                if (entity === SaleItem) return mockSaleItem();
                if (entity === Sale) return mockSale();
                if (entity === Inventory) return { ...invBatch };
                return { ...ret, status: ReturnStatus.COMPLETED };
            });
            mockEm.find.mockResolvedValue([invBatch]);

            await service.updatePosReturnStatus('return-1', {
                status: ReturnStatus.COMPLETED,
            }, mockUser());

            // Verify inventory was incremented
            const invSave = mockEm.save.mock.calls.find(
                ([entity, data]) => entity === Inventory && data.quantity === 11
            );
            expect(invSave).toBeDefined();

            // Verify StockMovement was created
            const movSave = mockEm.save.mock.calls.find(
                ([entity, data]) => entity === StockMovement && data.action === StockMovementAction.RETURN_RESTOCK
            );
            expect(movSave).toBeDefined();

            // Verify StockLedger was created with RETURN_RESTOCK
            const ledgerSave = mockEm.save.mock.calls.find(
                ([entity, data]) => entity === StockLedger && data.movementType === 'RETURN_RESTOCK'
            );
            expect(ledgerSave).toBeDefined();
            expect(ledgerSave[1].qtyDelta).toBe(1);
            expect(ledgerSave[1].qtyAfter).toBe(11);

            expect(events.emitInventoryUpdated).toHaveBeenCalledWith({
                variantId: 'variant-1',
                branchId: 'branch-1',
                quantity: 11,
            });
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  TEST 4: DAMAGED does not add stock but logs ledger
    // ═══════════════════════════════════════════════════════════
    describe('Damaged Policy', () => {
        it('should NOT add stock but still log ledger on DAMAGED completion', async () => {
            const ret = {
                id: 'return-2',
                type: ReturnType.POS_RETURN,
                status: ReturnStatus.APPROVED,
                branchId: 'branch-1',
                returnReceiptNo: 'RET-20260218-0002',
                originalSaleId: 'sale-1',
                originalSale: { invoiceNumber: 'OMC-20260218-0001' },
                items: [{
                    saleItemId: 'si-1',
                    variantId: 'variant-1',
                    quantity: 1,
                    unitPrice: 100,
                    restockPolicy: RestockPolicy.DAMAGED,
                }],
                reason: 'Broken zipper',
            };

            returnRepo.findOne.mockResolvedValueOnce(ret);
            returnRepo.findOne.mockResolvedValueOnce({ ...ret, status: ReturnStatus.COMPLETED });

            const invBatch = { variantId: 'variant-1', branchId: 'branch-1', quantity: 10 };
            mockEm.findOne.mockImplementation((entity) => {
                if (entity === SaleItem) return mockSaleItem();
                if (entity === Sale) return mockSale();
                return { ...ret, status: ReturnStatus.COMPLETED };
            });
            mockEm.find.mockResolvedValue([invBatch]);

            await service.updatePosReturnStatus('return-2', {
                status: ReturnStatus.COMPLETED,
            }, mockUser());

            // Verify inventory was NOT incremented (no Inventory save with qty > 10)
            const invSave = mockEm.save.mock.calls.find(
                ([entity, data]) => entity === Inventory && data.quantity > 10
            );
            expect(invSave).toBeUndefined();

            // Verify StockLedger was created with RETURN_DAMAGED and qtyDelta=0
            const ledgerSave = mockEm.save.mock.calls.find(
                ([entity, data]) => entity === StockLedger && data.movementType === 'RETURN_DAMAGED'
            );
            expect(ledgerSave).toBeDefined();
            expect(ledgerSave[1].qtyDelta).toBe(0);
            expect(ledgerSave[1].qtyAfter).toBe(10);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  TEST 5: Cannot return on voided sale
    // ═══════════════════════════════════════════════════════════
    describe('Voided Sale', () => {
        it('should throw when sale is voided', async () => {
            const sale = mockSale({ status: SaleStatus.VOIDED });
            saleRepo.findOne.mockResolvedValue(sale);

            const qb = createMockQueryBuilder();
            qb.getOne.mockResolvedValue(null);
            returnRepo.createQueryBuilder.mockReturnValue(qb);

            await expect(service.createPosReturn({
                invoiceNo: 'OMC-20260218-0001',
                items: [{ saleItemId: 'si-1', qty: 1, restockPolicy: RestockPolicy.RESTOCK }],
                refundMethod: RefundMethod.CASH,
            }, mockUser())).rejects.toThrow(BadRequestException);
        });

        it('should throw on preview of voided sale', async () => {
            const sale = mockSale({ status: SaleStatus.VOIDED });
            saleRepo.findOne.mockResolvedValue(sale);

            await expect(service.previewSaleByInvoice('OMC-20260218-0001', mockUser()))
                .rejects.toThrow(BadRequestException);
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  TEST 6: Status transitions
    // ═══════════════════════════════════════════════════════════
    describe('Status Transitions', () => {
        it('should reject invalid transitions', async () => {
            const ret = {
                id: 'return-1',
                type: ReturnType.POS_RETURN,
                status: ReturnStatus.REQUESTED,
                branchId: 'branch-1',
                items: [],
            };
            returnRepo.findOne.mockResolvedValue(ret);

            // REQUESTED → COMPLETED (should fail, must go through APPROVED first)
            await expect(service.updatePosReturnStatus('return-1', {
                status: ReturnStatus.COMPLETED,
            }, mockUser())).rejects.toThrow(BadRequestException);
        });

        it('should allow REQUESTED → APPROVED', async () => {
            const ret = {
                id: 'return-1',
                type: ReturnType.POS_RETURN,
                status: ReturnStatus.REQUESTED,
                branchId: 'branch-1',
                items: [],
            };
            returnRepo.findOne.mockResolvedValueOnce(ret);
            returnRepo.save.mockResolvedValue({ ...ret, status: ReturnStatus.APPROVED });
            returnRepo.findOne.mockResolvedValueOnce({ ...ret, status: ReturnStatus.APPROVED }); // for result

            const result = await service.updatePosReturnStatus('return-1', {
                status: ReturnStatus.APPROVED,
            }, mockUser());

            expect(returnRepo.save).toHaveBeenCalled();
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  TEST 7: Branch scoping
    // ═══════════════════════════════════════════════════════════
    describe('Branch Scoping', () => {
        it('should block manager from accessing other branch sales', async () => {
            const sale = mockSale({ branchId: 'branch-2' }); // different branch
            saleRepo.findOne.mockResolvedValue(sale);

            const manager = mockUser({ branchId: 'branch-1', role: UserRole.MANAGER });

            await expect(service.previewSaleByInvoice('OMC-20260218-0001', manager))
                .rejects.toThrow(ForbiddenException);
        });

        it('should allow owner to access any branch', async () => {
            const sale = mockSale({ branchId: 'branch-2' });
            saleRepo.findOne.mockResolvedValue(sale);

            const owner = mockUser({ role: UserRole.OWNER, branchId: null });

            const result = await service.previewSaleByInvoice('OMC-20260218-0001', owner);
            expect(result).toBeDefined();
            expect(result.invoiceNumber).toBe('OMC-20260218-0001');
        });
    });

    // ═══════════════════════════════════════════════════════════
    //  TEST 8: Receipt number generation
    // ═══════════════════════════════════════════════════════════
    describe('Receipt Number', () => {
        it('should generate RET-YYYYMMDD-XXXX format', async () => {
            const sale = mockSale();
            saleRepo.findOne.mockResolvedValue(sale);

            const qb = createMockQueryBuilder();
            qb.getOne.mockResolvedValue(null); // first return of the day
            returnRepo.createQueryBuilder.mockReturnValue(qb);

            mockEm.findOne.mockResolvedValue({
                id: 'return-1',
                returnReceiptNo: 'RET-20260218-0001',
                status: ReturnStatus.REQUESTED,
            });

            const result = await service.createPosReturn({
                invoiceNo: 'OMC-20260218-0001',
                items: [{ saleItemId: 'si-1', qty: 1, restockPolicy: RestockPolicy.RESTOCK }],
                refundMethod: RefundMethod.CASH,
            }, mockUser());

            // Verify the receipt number was passed to em.create
            const createCalls = mockEm.create.mock.calls;
            const returnCreate = createCalls.find(
                ([entity, data]) => entity === Return && data.returnReceiptNo
            );
            expect(returnCreate).toBeDefined();
            expect(returnCreate[1].returnReceiptNo).toMatch(/^RET-\d{8}-0001$/);
        });
    });
});
